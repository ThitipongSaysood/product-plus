// Idempotent seed (re-running never duplicates):
//  1. apple-watch-bands — REAL data: the user-approved Apify batch of 2026-09-24 imported through the
//     normal ingest path (run ids + costs recorded), then categorize → image cache → trend.
//  2. demo-mock — clearly-labelled MOCK data, pipeline run for 3 simulated dates so trends/events exist.
// Stop the api first: PGlite allows one process at a time.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import type { Platform } from "@pp/contracts";
import { closeDb, getDb } from "../db/client.js";
import { categoryMap, keywords, productGroups, scrapeRuns } from "../db/schema.js";
import { DEFAULT_TAXONOMY } from "../domain/categorize.js";
import { triggerPipeline } from "../jobs/pipeline.js";
import { groupBySlug } from "../jobs/runs.js";
import { importDataset, postProcess } from "./import-dataset.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const REAL_DIR = path.resolve(here, "../../data/real/2026-09-24");
// Temu came back 2026-09-24 via crw/temu-products-scraper (the first 3 Temu actors were blocked); demo keeps 3.
const REAL_PLATFORMS: Platform[] = ["douyin", "1688", "temu", "xhs"];
const DEMO_PLATFORMS: Platform[] = ["douyin", "1688", "xhs"];
const KEYWORD = "苹果手表表带"; // SPEC §3 #4
const KEYWORD_FOR: Partial<Record<Platform, { keyword: string; region: string }>> = { temu: { keyword: "apple watch band", region: "us" } };

const REAL_RUNS = [
  { platform: "douyin", runId: "17eeLITRhaMyS3gcE", actor: "zen-studio/douyin-product-search-scraper", cost: 0.245 },
  { platform: "1688", runId: "RZ1IY5i0w1MsIHFxw", actor: "zen-studio/1688-wholesale-scraper", cost: 0.255 },
  { platform: "xhs", runId: "OsvNwT8UErfn7dE44", actor: "zen-studio/rednote-product-search-scraper", cost: 0.3 },
  { platform: "temu", runId: "8AqTxqcOQ5C40f37k", actor: "crw/temu-products-scraper", cost: 0.05 }, // 5-row smoke
] as const;

// platform category paths that obviously map to our taxonomy (layer 1)
const CATEGORY_MAP = [
  { platform: "douyin", platformPath: "3C数码及配件 > 智能设备 > 智能设备配件 > 智能手表保护壳", categoryKey: "accessory_case" },
  { platform: "1688", platformPath: "数码、电脑 > 智能设备 > 智能手表保护壳", categoryKey: "accessory_case" },
  { platform: "temu", platformPath: "Cell Phones & Accessories > Smart Watch Cases", categoryKey: "accessory_case" },
];

async function upsertGroup(slug: string, name: string, sourceMode: "apify" | "mock", schedule: "weekly" | "manual", PLATFORMS: Platform[]) {
  const db = await getDb();
  await db
    .insert(productGroups)
    .values({ slug, name, platforms: PLATFORMS, monthlyBudgetUsd: 10, resultLimit: 50, runCapUsd: 1, schedule, sourceMode, taxonomy: DEFAULT_TAXONOMY })
    .onConflictDoNothing({ target: productGroups.slug });
  const g = await groupBySlug(slug);
  await db
    .insert(keywords)
    .values(PLATFORMS.map((platform) => ({ productGroupId: g.id, platform, keyword: KEYWORD_FOR[platform]?.keyword ?? KEYWORD, region: KEYWORD_FOR[platform]?.region ?? null })))
    .onConflictDoNothing();
  return g;
}

async function waitFor(files: string[], maxMs: number) {
  const until = Date.now() + maxMs;
  while (!files.every((f) => existsSync(f))) {
    if (Date.now() > until) return false;
    console.log(`[seed] waiting for ${files.filter((f) => !existsSync(f)).join(", ")}`);
    await new Promise((r) => setTimeout(r, 20_000));
  }
  return true;
}

async function main() {
  const db = await getDb();
  await db.insert(categoryMap).values(CATEGORY_MAP).onConflictDoNothing();

  // 1. real group
  await upsertGroup("apple-watch-bands", "Apple Watch bands", "apify", "weekly", REAL_PLATFORMS);
  const files = REAL_RUNS.map((r) => path.join(REAL_DIR, `${r.platform}.json`));
  if (await waitFor(files, Number(process.env.SEED_WAIT_MS ?? 15 * 60_000))) {
    for (const r of REAL_RUNS) {
      const res = await importDataset({
        group: "apple-watch-bands",
        platform: r.platform,
        file: path.join(REAL_DIR, `${r.platform}.json`),
        runId: r.runId,
        actor: r.actor,
        cost: r.cost,
      });
      console.log(`[seed] real ${r.platform}:`, JSON.stringify(res));
    }
    console.log("[seed] real post-process:", JSON.stringify(await postProcess("apple-watch-bands")));
  } else console.warn("[seed] real datasets not found — the real group stays empty");

  // 2. mock demo group: 3 simulated weekly rounds
  const demo = await upsertGroup("demo-mock", "Demo · mock data", "mock", "manual", DEMO_PLATFORMS);
  const already = await db.select({ id: scrapeRuns.id }).from(scrapeRuns).where(eq(scrapeRuns.productGroupId, demo.id)).limit(1);
  if (already.length) console.log("[seed] demo-mock already has runs — skipped");
  else {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    for (const back of [14, 7, 0]) {
      const now = new Date(Math.min(Date.now() - 60_000, today.getTime() - back * 86_400_000 + 3 * 3_600_000));
      const r = await triggerPipeline(demo, { now, wait: true });
      console.log(`[seed] mock round ${now.toISOString().slice(0, 10)}: started ${r.started.length}, skipped ${r.skipped.length}`);
    }
  }
  await closeDb();
}

void main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
