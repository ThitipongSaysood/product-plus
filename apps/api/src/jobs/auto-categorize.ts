// "Let AI sort everything" (settings › our categories): one button, three AI steps, each saved as it lands.
//   1. platform paths — map each unmapped path to one key, or mark it too broad (match-platform-categories)
//   2. new categories — from the listings no line catches, lines that catch ≥ 2 are ADDED to the taxonomy
//      marked addedBy "ai", so the merchant can see and delete them (suggest-categories)
//   3. the rest — layer-3 AI picks an existing key for what is still unclassified (categorize-listings)
// A step that fails is noted and the next one still runs. No Apify charge; each step is one or a few AI calls.
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { AutoMapResponse, TaxonomyEntry } from "@pp/contracts";
import { getDb } from "../db/client.js";
import { productGroups, products } from "../db/schema.js";
import { BROAD_PATH, pathKey, UNCLASSIFIED, type PathBrief } from "../domain/categorize.js";
import { NOTE } from "../domain/notes.js";
import { unmapped } from "../modules/queries.js";
import { applyCategoryMap, applyRules, runCategorize } from "./categorize.js";
import type { GroupRecord } from "./runs.js";
import { matchPlatformPaths, suggestCategories } from "./suggest.js";

/** One AI call decides at most this many paths; a longer queue is finished by pressing the button again. */
const AUTO_MAP_PATHS = 30;
/** Enough titles for patterns to show, few enough for one call to answer quickly. */
export const SUGGEST_TITLES = 80;
/** The taxonomy editor's own cap (groups.controller taxonomyIn). */
const TAXONOMY_MAX = 40;

/** Step 1, also behind POST /category-map/auto. */
export async function autoMapPaths(g: GroupRecord): Promise<AutoMapResponse> {
  const queue = await unmapped(g);
  if (!queue.length) return { decisions: [], costUsd: null };
  const db = await getDb();
  const rows = await db
    .select({ platform: products.platform, path: products.platformCategoryPath, title: products.title, key: products.categoryKey, source: products.categorySource })
    .from(products)
    .where(and(eq(products.productGroupId, g.id), isNotNull(products.platformCategoryPath)));
  const briefs: PathBrief[] = queue.slice(0, AUTO_MAP_PATHS).map((u) => {
    const under = rows.filter((r) => r.platform === u.platform && r.path && pathKey(r.path) === u.path);
    const ruleSplit: Record<string, number> = {};
    for (const r of under) if (r.source === "rules" || r.source === "llm") ruleSplit[r.key ?? UNCLASSIFIED] = (ruleSplit[r.key ?? UNCLASSIFIED] ?? 0) + 1;
    const titles = [...new Set(under.map((r) => (r.title ?? "").replace(/\s+/g, " ").trim().slice(0, 120)).filter(Boolean))].slice(0, 6);
    return { ...u, titles, ruleSplit };
  });
  const res = await matchPlatformPaths(g.taxonomy as TaxonomyEntry[], briefs);
  for (const d of res.decisions) await applyCategoryMap(d.platform, d.path, d.categoryKey ?? BROAD_PATH);
  return res;
}

/** Titles of this group's listings nothing has sorted yet, best sellers first — one entry per listing. */
export async function unclassifiedTitles(groupId: string, limit = SUGGEST_TITLES): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ title: products.title })
    .from(products)
    .where(and(eq(products.productGroupId, groupId), isNull(products.categorySource), isNotNull(products.title)))
    .orderBy(sql`${products.latestSoldCount} desc nulls last`)
    .limit(limit);
  return rows.map((r) => r.title!.replace(/\s+/g, " ").trim().slice(0, 200)).filter(Boolean);
}

async function countUnclassified(groupId: string) {
  const db = await getDb();
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.productGroupId, groupId), isNull(products.categorySource)));
  return r.n;
}

async function groupOf(groupId: string) {
  const db = await getDb();
  const [g] = await db.select().from(productGroups).where(eq(productGroups.id, groupId));
  return g;
}

export const AUTO_STEPS = 3;

export async function runAutoCategorize(groupId: string, onProgress?: (done: number, total: number) => Promise<void>) {
  const before = await countUnclassified(groupId);
  let costUsd: number | null = null;
  const addCost = (c: number | null) => {
    if (c !== null) costUsd = (costUsd ?? 0) + c;
  };
  const failed: string[] = [];
  let mapped = 0;
  let broad = 0;
  let added: string[] = [];

  await onProgress?.(0, AUTO_STEPS);
  try {
    const r = await autoMapPaths(await groupOf(groupId));
    mapped = r.decisions.filter((d) => d.categoryKey).length;
    broad = r.decisions.length - mapped;
    addCost(r.costUsd);
  } catch (e) {
    failed.push(`paths: ${(e as Error).message.slice(0, 80)}`);
  }

  await onProgress?.(1, AUTO_STEPS);
  try {
    const g = await groupOf(groupId);
    const taxonomy = g.taxonomy as TaxonomyEntry[];
    const titles = await unclassifiedTitles(groupId);
    if (titles.length >= 2 && taxonomy.length < TAXONOMY_MAX) {
      const r = await suggestCategories(taxonomy, titles);
      addCost(r.costUsd);
      const lines: TaxonomyEntry[] = r.suggestions
        .slice(0, TAXONOMY_MAX - taxonomy.length)
        .map(({ key, en, th, zh, keywords }) => ({ key, en, th, zh, keywords, addedBy: "ai" }));
      if (lines.length) {
        const db = await getDb();
        await db.update(productGroups).set({ taxonomy: [...taxonomy, ...lines], updatedAt: new Date() }).where(eq(productGroups.id, groupId));
        await applyRules(groupId);
        added = lines.map((l) => l.key);
      }
    }
  } catch (e) {
    failed.push(`new categories: ${(e as Error).message.slice(0, 80)}`);
  }

  await onProgress?.(2, AUTO_STEPS);
  const r = await runCategorize(groupId, "pending");
  addCost(r.costUsd);
  if (r.failed) failed.push("sorting: AI failed");

  await onProgress?.(AUTO_STEPS, AUTO_STEPS);
  const left = await countUnclassified(groupId);
  return {
    costUsd,
    failed: failed.length > 0,
    note: failed.length
      ? NOTE.stepFailed("auto", failed.join("; ").slice(0, 200))
      : NOTE.autoCategorized(added.length, mapped, broad, Math.max(0, before - left), left),
  };
}
