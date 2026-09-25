// groups · keywords · taxonomy · category map
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { and, eq, inArray, isNotNull, notExists, sql } from "drizzle-orm";
import { z } from "zod";
import type { AutoMapResponse, CategorySuggestionsResponse, KeywordListResponse, RoundEstimate, KeywordSuggestionsResponse, Platform, TaxonomyEntry } from "@pp/contracts";
import { getDb } from "../db/client.js";
import { keywords, media, productGroups, products, scrapeRuns } from "../db/schema.js";
import { AppError, notFound } from "../common/errors.js";
import { ZodPipe } from "../common/http.js";
import { BROAD_PATH, pathKey, UNCLASSIFIED, type PathBrief } from "../domain/categorize.js";
import { capsValid, isUniqueViolation, slugify } from "../domain/guards.js";
import { cleanLineTerms, planKeywordList, roundCostPerKeyword } from "../domain/keywords.js";
import { PLATFORM_LIST } from "../domain/types.js";
import { claudeCliVersion, skillPresent, SKILLS } from "../jobs/claude-cli.js";
import { aiBackend } from "../jobs/llm.js";
import { matchPlatformPaths, suggestCategories, suggestKeywords, translateKeywords } from "../jobs/suggest.js";
import { chosenActor, groupMode } from "../jobs/scrape.js";
import { getSetting } from "../settings/settings.js";
import { applyCategoryMap, applyRules, removeCategoryMap } from "../jobs/categorize.js";
import { groupBySlug } from "../jobs/runs.js";
import { broadPaths, toGroup, toKeyword, unmapped } from "./queries.js";

const platform = z.enum(PLATFORM_LIST as ["douyin", "1688", "temu", "xhs"]);
const slugIn = z.string().trim().regex(/^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$/);
const groupPatch = z.object({
  name: z.string().trim().min(1).max(80).optional(), // display name only — the slug is immutable
  monthlyBudgetUsd: z.number().min(0).max(10000).optional(),
  resultLimit: z.number().int().min(1).max(50).optional(),
  runCapUsd: z.number().min(0.1).max(1000).optional(),
  schedule: z.enum(["weekly", "daily", "manual"]).optional(),
  scheduleHour: z.number().int().min(0).max(23).optional(),
  scheduleWeekday: z.number().int().min(0).max(6).optional(),
  platforms: z.array(platform).min(1).max(4).optional(),
});
// A new group starts with spending paused ($0) so creating one can never begin an Apify charge.
const groupCreate = z.object({
  name: z.string().trim().min(1).max(80),
  slug: slugIn.optional(),
  platforms: z.array(platform).min(1).max(4),
  schedule: z.enum(["weekly", "daily", "manual"]).default("weekly"),
  // 05:00 Monday keeps every group that existed before this was configurable on its old slot.
  scheduleHour: z.number().int().min(0).max(23).default(5),
  scheduleWeekday: z.number().int().min(0).max(6).default(1),
  resultLimit: z.number().int().min(1).max(50).default(50),
  monthlyBudgetUsd: z.number().min(0).max(10000).default(0),
  runCapUsd: z.number().min(0.1).max(1000).default(1),
  sourceMode: z.enum(["mock", "apify"]).default("apify"),
  copyTaxonomyFrom: z.string().trim().min(1).max(60).optional(),
});
const keywordIn = z.object({
  platform,
  keyword: z.string().trim().min(1).max(100),
  region: z.string().trim().max(10).nullable().optional(),
  enabled: z.boolean().optional(),
});
const keywordPatch = keywordIn.partial().omit({ platform: true }).extend({ concept: z.string().trim().min(1).max(100).nullable().optional() });
const suggestIn = z.object({ productName: z.string().trim().min(1).max(120) });
const termIn = z.string().trim().max(100).nullable().optional().transform((v) => v || null);
const keywordListIn = z.object({
  items: z.array(z.object({ keyword: z.string().trim().min(1).max(100), zh: termIn, en: termIn })).max(50),
});
/** Enough titles for patterns to show, few enough for one call to answer inside the web's proxy timeout. */
const CATEGORY_SUGGEST_TITLES = 80;
/** One AI call decides at most this many paths; a longer queue is finished by pressing the button again. */
const AUTO_MAP_PATHS = 30;

const taxonomyIn = z
  .array(
    z.object({
      key: z.string().regex(/^[a-z0-9_]{1,40}$/).refine((k) => k !== UNCLASSIFIED && !k.startsWith("_")), // "_" = BROAD_PATH
      th: z.string().trim().min(1).max(80),
      en: z.string().trim().min(1).max(80),
      zh: z.string().trim().min(1).max(80),
      keywords: z.array(z.string().trim().min(1).max(40)).max(50),
    }),
  )
  .max(40)
  .refine((xs) => new Set(xs.map((x) => x.key)).size === xs.length);
const mapIn = z.object({ platform, path: z.string().trim().min(1).max(300), categoryKey: z.string().regex(/^[a-z0-9_]{1,40}$/) });
const pathIn = z.object({ platform, path: z.string().trim().min(1).max(300) });

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/** Both AI keyword jobs need the skill file and a working backend (api key or local claude CLI). */
async function assertAiReady(skill: (typeof SKILLS)[keyof typeof SKILLS]) {
  if (!skillPresent(skill)) throw new AppError(500, "errors.suggest.noSkill");
  if ((await aiBackend()) === "cli") {
    await claudeCliVersion((await getSetting("CLAUDE_CLI_PATH")) ?? "claude").catch(() => {
      throw new AppError(400, "errors.suggest.noCli");
    });
  } else if (!(await getSetting("ANTHROPIC_API_KEY"))) {
    throw new AppError(400, "errors.suggest.needsKey");
  }
}

@Controller()
export class GroupsController {
  @Get("groups")
  async groups() {
    const db = await getDb();
    // productCount rides along so the delete dialog can say what is about to be lost.
    const counts = new Map(
      (await db.select({ id: products.productGroupId, n: sql<number>`count(*)::int` }).from(products).groupBy(products.productGroupId)).map((r) => [r.id, r.n]),
    );
    return (await db.select().from(productGroups).orderBy(productGroups.createdAt)).map((g) => ({ ...toGroup(g), productCount: counts.get(g.id) ?? 0 }));
  }

  @Post("groups")
  async createGroup(@Body(new ZodPipe(groupCreate)) body: z.infer<typeof groupCreate>) {
    const slug = body.slug ?? slugify(body.name);
    // Thai/Chinese names leave nothing to slugify — ask for one rather than inventing an opaque id.
    if (!slugIn.safeParse(slug).success) throw new AppError(400, "errors.group.slugRequired");
    if (!capsValid(body.monthlyBudgetUsd, body.runCapUsd)) throw new AppError(400, "errors.validation");
    const taxonomy = body.copyTaxonomyFrom ? (await groupBySlug(body.copyTaxonomyFrom)).taxonomy : [];
    const db = await getDb();
    try {
      const [row] = await db
        .insert(productGroups)
        .values({
          slug,
          name: body.name,
          platforms: [...new Set(body.platforms)],
          monthlyBudgetUsd: body.monthlyBudgetUsd,
          resultLimit: body.resultLimit,
          runCapUsd: body.runCapUsd,
          schedule: body.schedule,
          scheduleHour: body.scheduleHour,
          scheduleWeekday: body.scheduleWeekday,
          sourceMode: body.sourceMode,
          taxonomy,
        })
        .returning();
      return toGroup(row);
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppError(409, "errors.group.slugTaken");
      throw e;
    }
  }

  @Patch("groups/:slug")
  async patchGroup(@Param("slug") slug: string, @Body(new ZodPipe(groupPatch)) body: z.infer<typeof groupPatch>) {
    const g = await groupBySlug(slug);
    if (!capsValid(body.monthlyBudgetUsd ?? g.monthlyBudgetUsd, body.runCapUsd ?? g.runCapUsd)) throw new AppError(400, "errors.validation");
    const db = await getDb();
    const [row] = await db
      .update(productGroups)
      .set({ ...body, ...(body.platforms && { platforms: [...new Set(body.platforms)] }), updatedAt: new Date() })
      .where(eq(productGroups.id, g.id))
      .returning();
    return toGroup(row);
  }

  /** Destructive: products, snapshots, runs, keywords and change events all cascade from the group row. */
  @Delete("groups/:slug")
  async deleteGroup(@Param("slug") slug: string, @Body(new ZodPipe(z.object({ confirm: z.literal(true) }))) _body: { confirm: true }) {
    const g = await groupBySlug(slug);
    const db = await getDb();
    const [{ n: total }] = await db.select({ n: sql<number>`count(*)::int` }).from(productGroups);
    if (total <= 1) throw new AppError(400, "errors.group.lastOne"); // the app always needs one group to show
    const running = await db
      .select({ id: scrapeRuns.id })
      .from(scrapeRuns)
      .where(and(eq(scrapeRuns.productGroupId, g.id), eq(scrapeRuns.status, "running")))
      .limit(1);
    if (running.length) throw new AppError(400, "errors.job.alreadyRunning");
    // Read the blobs this group points at BEFORE the cascade clears the references, so the sweep below
    // can be limited to them.
    const owned = await db
      .select({ id: products.imageMediaId })
      .from(products)
      .where(and(eq(products.productGroupId, g.id), isNotNull(products.imageMediaId)));
    const ownedIds = [...new Set(owned.map((r) => r.id!))];
    await db.delete(productGroups).where(eq(productGroups.id, g.id));
    // products are gone, but media rows only lost their reference (set null) — drop the now-unreachable
    // blobs. Restricted to the ids this group actually pointed at: an unrestricted sweep also deletes a
    // row another group's media job inserted seconds ago but has not yet linked (jobs/media.ts inserts
    // the row before it sets products.imageMediaId), which then fails that job on a foreign key.
    const orphans = ownedIds.length
      ? await db
          .delete(media)
          .where(
            and(
              inArray(media.id, ownedIds),
              notExists(db.select({ x: sql`1` }).from(products).where(eq(products.imageMediaId, media.id))),
            ),
          )
          .returning({ id: media.id })
      : [];
    return { ok: true, mediaRemoved: orphans.length };
  }

  @Get("groups/:slug/keywords")
  async keywords(@Param("slug") slug: string) {
    const g = await groupBySlug(slug);
    const db = await getDb();
    return (await db.select().from(keywords).where(eq(keywords.productGroupId, g.id)).orderBy(keywords.platform, keywords.createdAt)).map(toKeyword);
  }

  @Post("groups/:slug/keywords")
  async addKeyword(@Param("slug") slug: string, @Body(new ZodPipe(keywordIn)) body: z.infer<typeof keywordIn>) {
    const g = await groupBySlug(slug);
    const db = await getDb();
    const dup = await db
      .select({ id: keywords.id })
      .from(keywords)
      .where(and(eq(keywords.productGroupId, g.id), eq(keywords.platform, body.platform), eq(keywords.keyword, body.keyword)));
    if (dup.length) throw new AppError(409, "errors.keyword.duplicate");
    const [row] = await db
      .insert(keywords)
      .values({ productGroupId: g.id, platform: body.platform, keyword: body.keyword, region: body.region ?? null, enabled: body.enabled ?? true })
      .returning();
    return toKeyword(row);
  }

  /** Replace the whole Keyword list (the textarea editor). Lines missing a term get it from AI first. */
  @Put("groups/:slug/keyword-list")
  async putKeywordList(@Param("slug") slug: string, @Body(new ZodPipe(keywordListIn)) body: z.infer<typeof keywordListIn>): Promise<KeywordListResponse> {
    const g = await groupBySlug(slug);
    const platforms = g.platforms as Platform[];
    const needZh = platforms.some((p) => p !== "temu");
    const needEn = platforms.includes("temu");
    const seen = new Set<string>();
    // A term in the wrong language counts as missing (cleanLineTerms) so AI replaces it instead of it being saved.
    const items = body.items.filter((i) => !seen.has(i.keyword) && seen.add(i.keyword)).map(cleanLineTerms);
    const missing = items.filter((i) => (needZh && !i.zh) || (needEn && !i.en));
    const translated: string[] = [];
    let costUsd: number | null = null;
    if (missing.length) {
      await assertAiReady(SKILLS.translateKeyword);
      try {
        const r = await translateKeywords(missing.map((i) => i.keyword));
        costUsd = r.costUsd;
        for (const i of missing) {
          const got = r.terms.get(i.keyword);
          if (!got) continue; // left empty: the plan reports it as skipped instead of failing the whole save
          i.zh ??= got.zh;
          i.en ??= got.en;
          translated.push(i.keyword);
        }
      } catch {
        // AI down: save what the merchant typed; lines without a term are reported as skipped
      }
    }
    const db = await getDb();
    const existing = (await db.select().from(keywords).where(eq(keywords.productGroupId, g.id))).map((k) => ({ ...k, platform: k.platform as Platform }));
    const plan = planKeywordList(existing, items, platforms);
    try {
      await db.transaction(async (tx) => {
        if (plan.deletes.length) await tx.delete(keywords).where(inArray(keywords.id, plan.deletes));
        for (const u of plan.updates) await tx.update(keywords).set({ keyword: u.keyword, concept: u.concept }).where(eq(keywords.id, u.id));
        if (plan.inserts.length)
          await tx.insert(keywords).values(plan.inserts.map((i) => ({ productGroupId: g.id, ...i, region: i.platform === "temu" ? "us" : null, enabled: true })));
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppError(409, "errors.keyword.duplicate");
      throw e;
    }
    const rows = await db.select().from(keywords).where(eq(keywords.productGroupId, g.id)).orderBy(keywords.createdAt);
    return { keywords: rows.map(toKeyword), translated, skipped: plan.skipped, costUsd };
  }

  /** Free: what one Keyword costs per Round with this group's platforms and result limit, next to the cap. */
  @Get("groups/:slug/round-estimate")
  async roundEstimate(@Param("slug") slug: string): Promise<RoundEstimate> {
    const g = await groupBySlug(slug);
    const platforms = g.platforms as Platform[];
    const actors: Partial<Record<Platform, { startFee: number; pricePerResult: number }>> = {};
    for (const p of platforms) {
      const a = await chosenActor(p);
      if (a) actors[p] = { startFee: a.startFee, pricePerResult: a.pricePerResult };
    }
    return { perKeywordUsd: roundCostPerKeyword(actors, platforms, Math.min(g.resultLimit, 50)), runCapUsd: g.runCapUsd, mode: await groupMode(g) };
  }

  /** AI keyword suggestion — spends a little on Anthropic (or the local cli). Nothing is saved. */
  @Post("groups/:slug/keyword-suggestions")
  @HttpCode(200)
  async suggest(@Param("slug") slug: string, @Body(new ZodPipe(suggestIn)) body: z.infer<typeof suggestIn>): Promise<KeywordSuggestionsResponse> {
    const g = await groupBySlug(slug);
    await assertAiReady(SKILLS.suggest);
    const db = await getDb();
    const rows = await db.select({ keyword: keywords.keyword, concept: keywords.concept }).from(keywords).where(eq(keywords.productGroupId, g.id));
    try {
      return await suggestKeywords(body.productName, [...new Set(rows.map((r) => r.concept ?? r.keyword))]);
    } catch {
      throw new AppError(502, "errors.suggest.failed");
    }
  }

  @Patch("keywords/:id")
  async patchKeyword(@Param("id") id: string, @Body(new ZodPipe(keywordPatch)) body: z.infer<typeof keywordPatch>) {
    if (!isUuid(id)) throw notFound("errors.keyword.notFound");
    const db = await getDb();
    try {
      const [row] = await db.update(keywords).set(body).where(eq(keywords.id, id)).returning();
      if (!row) throw notFound("errors.keyword.notFound");
      return toKeyword(row);
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError(409, "errors.keyword.duplicate");
    }
  }

  @Delete("keywords/:id")
  async deleteKeyword(@Param("id") id: string) {
    if (!isUuid(id)) throw notFound("errors.keyword.notFound");
    const db = await getDb();
    const rows = await db.delete(keywords).where(eq(keywords.id, id)).returning({ id: keywords.id });
    if (!rows.length) throw notFound("errors.keyword.notFound");
    return { ok: true };
  }

  @Get("groups/:slug/taxonomy")
  async taxonomy(@Param("slug") slug: string) {
    return (await groupBySlug(slug)).taxonomy;
  }

  @Put("groups/:slug/taxonomy")
  async putTaxonomy(@Param("slug") slug: string, @Body(new ZodPipe(taxonomyIn)) body: TaxonomyEntry[]) {
    const g = await groupBySlug(slug);
    const db = await getDb();
    const [row] = await db.update(productGroups).set({ taxonomy: body, updatedAt: new Date() }).where(eq(productGroups.id, g.id)).returning();
    await applyRules(g.id); // free: a new line sorts the still-unclassified listings it was written for now
    return row.taxonomy;
  }

  /** AI proposes new taxonomy lines for the listings no category caught. Spends a little on Anthropic (or
   *  the local cli) and saves nothing; with nothing unclassified it answers without calling AI at all. */
  @Post("groups/:slug/category-suggestions")
  @HttpCode(200)
  async suggestCategories(@Param("slug") slug: string): Promise<CategorySuggestionsResponse> {
    const g = await groupBySlug(slug);
    const db = await getDb();
    const rows = await db
      .select({ title: products.title })
      .from(products)
      .where(and(eq(products.productGroupId, g.id), sql`${products.categorySource} is null`, isNotNull(products.title)))
      .orderBy(sql`${products.latestSoldCount} desc nulls last`)
      .limit(CATEGORY_SUGGEST_TITLES);
    const titles = rows.map((r) => r.title!.replace(/\s+/g, " ").trim().slice(0, 200)).filter(Boolean);
    if (!titles.length) return { suggestions: [], unclassified: 0, costUsd: null };
    await assertAiReady(SKILLS.suggestCategories);
    try {
      return { ...(await suggestCategories(g.taxonomy as TaxonomyEntry[], titles)), unclassified: titles.length };
    } catch {
      throw new AppError(502, "errors.catsug.failed");
    }
  }

  @Get("category-map/unmapped")
  async unmapped(@Query("pg") pg?: string) {
    return unmapped(await groupBySlug(pg));
  }

  @Put("category-map")
  async putMap(@Body(new ZodPipe(mapIn)) body: z.infer<typeof mapIn>) {
    const updated = await applyCategoryMap(body.platform, body.path, body.categoryKey);
    return { ok: true, updated };
  }

  @Get("category-map/broad")
  async broad(@Query("pg") pg?: string) {
    return broadPaths(await groupBySlug(pg));
  }

  @Delete("category-map")
  async deleteMap(@Query(new ZodPipe(pathIn)) q: z.infer<typeof pathIn>) {
    return { ok: true, released: await removeCategoryMap(q.platform, q.path) };
  }

  /** AI decides every unmapped path of this group — one key, or too broad — and each decision is saved as
   *  it would be from the queue by hand. Spends a little on Anthropic (or the local cli); no Apify charge. */
  @Post("category-map/auto")
  @HttpCode(200)
  async autoMap(@Body(new ZodPipe(z.object({ pg: z.string().optional() }))) body: { pg?: string }): Promise<AutoMapResponse> {
    const g = await groupBySlug(body.pg);
    const queue = await unmapped(g);
    if (!queue.length) return { decisions: [], costUsd: null };
    await assertAiReady(SKILLS.matchPaths);
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
    let res: AutoMapResponse;
    try {
      res = await matchPlatformPaths(g.taxonomy as TaxonomyEntry[], briefs);
    } catch {
      throw new AppError(502, "errors.catmap.failed");
    }
    for (const d of res.decisions) await applyCategoryMap(d.platform, d.path, d.categoryKey ?? BROAD_PATH);
    return res;
  }
}
