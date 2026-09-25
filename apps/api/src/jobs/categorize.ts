import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { TaxonomyEntry } from "@pp/contracts";
import { getDb } from "../db/client.js";
import { categoryMap, productGroups, products } from "../db/schema.js";
import { BROAD_PATH, categorize, pathKey, UNCLASSIFIED } from "../domain/categorize.js";
import { NOTE } from "../domain/notes.js";
import { fillEligible } from "../domain/guards.js";
import { getSetting } from "../settings/settings.js";
import { aiBackend, llmCategorize } from "./llm.js";
import { claudeCliVersion, skillPresent, SKILLS } from "./claude-cli.js";

export async function loadCategoryMap() {
  const db = await getDb();
  const rows = await db.select().from(categoryMap);
  return new Map(rows.map((r) => [`${r.platform}|${r.platformPath}`, r.categoryKey]));
}

/** fill = only products never decided (category_source null), each retried at most once a week; pending = the
 *  same products at once, on the merchant's request; retag = everything except manual picks. */
export async function runCategorize(groupId: string, mode: "fill" | "pending" | "retag", onProgress?: (done: number, total: number) => Promise<void>) {
  const db = await getDb();
  const [group] = await db.select().from(productGroups).where(eq(productGroups.id, groupId));
  const taxonomy = group.taxonomy as TaxonomyEntry[];
  const map = await loadCategoryMap();
  const rows = await db
    .select({
      id: products.id,
      platform: products.platform,
      title: products.title,
      path: products.platformCategoryPath,
      categorySource: products.categorySource,
      categoryTaggedAt: products.categoryTaggedAt,
    })
    .from(products)
    .where(
      and(
        eq(products.productGroupId, groupId),
        mode === "retag" ? or(isNull(products.categorySource), ne(products.categorySource, "manual")) : isNull(products.categorySource),
      ),
    )
    .then((rs) => (mode === "fill" ? rs.filter((r) => fillEligible(r, new Date())) : rs)); // fill: skip tries < 7 days old
  const decided = new Map<string, { key: string; source: string }>();
  const undecided: { id: string; title: string | null }[] = [];
  for (const r of rows) {
    const c = categorize({ platform: r.platform, title: r.title, platformCategoryPath: r.path }, map, taxonomy);
    if (c) decided.set(r.id, c);
    else undecided.push(r);
  }
  await onProgress?.(decided.size, rows.length);

  let llmCount = 0;
  let llmCostUsd: number | null = null;
  let llmError: string | null = null;
  const forLlm = undecided.filter((u): u is { id: string; title: string } => Boolean(u.title));
  // Layer 3 is optional: without a key or a usable cli the first two layers still stand, and whatever
  // they could not decide stays unclassified for the next run rather than failing the job.
  const backend = await aiCategorizeBackend();
  if (backend && forLlm.length) {
    try {
      const r = await llmCategorize(backend, forLlm, taxonomy);
      for (const [id, key] of r.got) decided.set(id, { key, source: "llm" });
      llmCount = r.got.size;
      llmCostUsd = r.costUsd;
    } catch (e) {
      llmError = (e as Error).message.slice(0, 200);
    }
  }

  const now = new Date();
  const groups = new Map<string, string[]>();
  for (const [id, c] of decided) groups.set(`${c.key}|${c.source}`, [...(groups.get(`${c.key}|${c.source}`) ?? []), id]);
  const leftover = rows.filter((r) => !decided.has(r.id)).map((r) => r.id);
  await db.transaction(async (tx) => {
    for (const [k, ids] of groups) {
      const [key, source] = k.split("|");
      await tx.update(products).set({ categoryKey: key, categorySource: source, categoryTaggedAt: now }).where(inArray(products.id, ids));
    }
    if (leftover.length)
      await tx.update(products).set({ categoryKey: UNCLASSIFIED, categorySource: null, categoryTaggedAt: now }).where(inArray(products.id, leftover));
  });
  await onProgress?.(rows.length, rows.length);
  const count = (s: string) => [...decided.values()].filter((c) => c.source === s).length;
  return {
    total: rows.length,
    costUsd: llmCostUsd,
    note: llmError ? NOTE.llmFailed(llmError) : NOTE.categorized(rows.length, count("platform"), count("rules"), llmCount, leftover.length),
    failed: Boolean(llmError),
  };
}

/** Layers 1–2 only, on products nothing has decided yet — free, so it runs whenever the taxonomy is saved
 *  and a line the merchant just added sorts the listings it was written for without waiting for a round. */
export async function applyRules(groupId: string): Promise<number> {
  const db = await getDb();
  const [group] = await db.select().from(productGroups).where(eq(productGroups.id, groupId));
  const taxonomy = group.taxonomy as TaxonomyEntry[];
  const map = await loadCategoryMap();
  const rows = await db
    .select({ id: products.id, platform: products.platform, title: products.title, path: products.platformCategoryPath })
    .from(products)
    .where(and(eq(products.productGroupId, groupId), isNull(products.categorySource)));
  const groups = new Map<string, string[]>();
  for (const r of rows) {
    const c = categorize({ platform: r.platform, title: r.title, platformCategoryPath: r.path }, map, taxonomy);
    if (c) groups.set(`${c.key}|${c.source}`, [...(groups.get(`${c.key}|${c.source}`) ?? []), r.id]);
  }
  const now = new Date();
  let n = 0;
  await db.transaction(async (tx) => {
    for (const [k, ids] of groups) {
      const [key, source] = k.split("|");
      await tx.update(products).set({ categoryKey: key, categorySource: source, categoryTaggedAt: now }).where(inArray(products.id, ids));
      n += ids.length;
    }
  });
  return n;
}

/**
 * Which backend layer 3 may use, or null when it cannot run at all. The cli needs both the skill file
 * (it lives outside dist/, so a partial deploy loses it) and a binary that answers --version; checking
 * here keeps a broken host from turning every categorize run red.
 */
async function aiCategorizeBackend(): Promise<{ kind: "sdk"; apiKey: string } | { kind: "cli"; bin: string } | null> {
  if ((await aiBackend()) === "cli") {
    if (!skillPresent(SKILLS.categorize)) return null;
    const bin = (await getSetting("CLAUDE_CLI_PATH")) ?? "claude";
    return (await claudeCliVersion(bin).then(() => true).catch(() => false)) ? { kind: "cli", bin } : null;
  }
  const apiKey = await getSetting("ANTHROPIC_API_KEY");
  return apiKey ? { kind: "sdk", apiKey } : null;
}

/** Non-manual products of `platform` whose path starts with `path` — the ones a category_map row governs. */
async function productsUnder(platform: string, path: string) {
  const db = await getDb();
  const segs = path.split(" > ");
  const cands = await db
    .select({ id: products.id, groupId: products.productGroupId, path: products.platformCategoryPath, source: products.categorySource })
    .from(products)
    .where(eq(products.platform, platform));
  return cands.filter((c) => c.source !== "manual" && c.path && pathKey(c.path.slice(0, segs.length)) === path);
}

/** Products a mapping had sorted go back to the keyword rules (free), group by group. */
async function releaseToRules(under: Awaited<ReturnType<typeof productsUnder>>) {
  const mapped = under.filter((c) => c.source === "platform");
  if (!mapped.length) return 0;
  const db = await getDb();
  await db
    .update(products)
    .set({ categoryKey: UNCLASSIFIED, categorySource: null, categoryTaggedAt: null })
    .where(inArray(products.id, mapped.map((c) => c.id)));
  for (const g of new Set(mapped.map((c) => c.groupId))) await applyRules(g);
  return mapped.length;
}

/** PUT /api/category-map: remember the mapping and re-apply it to every non-manual product with that path.
 *  BROAD_PATH records "too broad to map": nothing is forced, and listings a mapping had sorted return to the rules. */
export async function applyCategoryMap(platform: string, path: string, categoryKey: string) {
  const db = await getDb();
  await db
    .insert(categoryMap)
    .values({ platform, platformPath: path, categoryKey })
    .onConflictDoUpdate({ target: [categoryMap.platform, categoryMap.platformPath], set: { categoryKey } });
  const under = await productsUnder(platform, path);
  if (categoryKey === BROAD_PATH) return releaseToRules(under);
  const ids = under.map((c) => c.id);
  if (ids.length) await db.update(products).set({ categoryKey, categorySource: "platform", categoryTaggedAt: new Date() }).where(inArray(products.id, ids));
  return ids.length;
}

/** DELETE /api/category-map: forget a decision; the path goes back to the unmapped queue. */
export async function removeCategoryMap(platform: string, path: string) {
  const db = await getDb();
  await db.delete(categoryMap).where(and(eq(categoryMap.platform, platform), eq(categoryMap.platformPath, path)));
  return releaseToRules(await productsUnder(platform, path));
}
