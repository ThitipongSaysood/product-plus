// Ingest a dataset that was pulled OUTSIDE this app (Apify console / MCP / manual download) through the
// normal path: a succeeded scrape_run with the real Apify run id + cost → ingestRun (gate, diff,
// snapshots, events). Idempotent per Apify run id. Does NOT call Apify.
//
//   pnpm --filter @pp/api import:dataset -- --group apple-watch-bands --platform douyin \
//     --file data/real/2026-09-24/douyin.json --run-id 17eeLITRhaMyS3gcE \
//     --actor zen-studio/douyin-product-search-scraper --cost 0.245 [--at 2026-09-24T01:00:00Z] [--no-post]
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import type { Platform } from "@pp/contracts";
import { closeDb, getDb } from "../db/client.js";
import { keywords, scrapeRuns } from "../db/schema.js";
import { PLATFORM_LIST } from "../domain/types.js";
import { runCategorize } from "../jobs/categorize.js";
import { ingestRun } from "../jobs/ingest.js";
import { cacheMedia } from "../jobs/media.js";
import { createRun, groupBySlug } from "../jobs/runs.js";
import { refreshTrends } from "../jobs/trend.js";

export type ImportArgs = { group: string; platform: Platform; file: string; runId: string; actor: string; cost: number | null; at?: Date };

export async function importDataset(a: ImportArgs) {
  const g = await groupBySlug(a.group);
  const db = await getDb();
  const [dup] = await db.select().from(scrapeRuns).where(eq(scrapeRuns.apifyRunId, a.runId));
  if (dup) return { skipped: true as const, runId: dup.id, status: dup.status };
  const json = JSON.parse(readFileSync(a.file, "utf8")) as unknown;
  const rows = Array.isArray(json) ? json : ((json as { items?: unknown[] }).items ?? []);
  const [kw] = await db.select().from(keywords).where(and(eq(keywords.productGroupId, g.id), eq(keywords.platform, a.platform))).limit(1);
  const keyword = kw?.keyword ?? String((rows[0] as { keyword?: string } | undefined)?.keyword ?? "");
  const at = a.at ?? new Date();
  const runId = await createRun(db, {
    productGroupId: g.id,
    keywordId: kw?.id ?? null,
    keyword,
    platform: a.platform,
    actorId: a.actor,
    kind: "scrape",
    status: "running",
    apifyRunId: a.runId,
    startedAt: at,
  });
  const r = await ingestRun(runId, { rows, costUsd: a.cost, apifyStatus: "SUCCEEDED" }, at);
  return { skipped: false as const, runId, ...r };
}

/** categorize (fill) → image cache → trend, as the pipeline does after a scrape. */
export async function postProcess(groupSlug: string) {
  const g = await groupBySlug(groupSlug);
  const c = await runCategorize(g.id, "fill");
  const m = await cacheMedia(g.id);
  await refreshTrends(g.id);
  return { categorize: c.note, media: m };
}

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function cli() {
  const platform = arg("platform") as Platform;
  const req = { group: arg("group"), file: arg("file"), runId: arg("run-id"), actor: arg("actor") };
  if (!PLATFORM_LIST.includes(platform) || Object.values(req).some((v) => !v)) {
    console.error("usage: import:dataset -- --group <slug> --platform <douyin|1688|temu|xhs> --file <path> --run-id <apifyRunId> --actor <owner/name> --cost <usd> [--at <iso>] [--no-post]");
    process.exit(2);
  }
  const cost = arg("cost");
  const r = await importDataset({
    group: req.group!,
    platform,
    file: [process.cwd(), process.env.INIT_CWD ?? ""].map((d) => path.resolve(d, req.file!)).find(existsSync) ?? req.file!,
    runId: req.runId!,
    actor: req.actor!,
    cost: cost === undefined ? null : Number(cost),
    at: arg("at") ? new Date(arg("at")!) : undefined,
  });
  console.log(JSON.stringify(r));
  if (!process.argv.includes("--no-post")) console.log(JSON.stringify(await postProcess(req.group!)));
  await closeDb();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void cli();
