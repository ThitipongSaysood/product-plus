// groups · keywords · taxonomy · category map
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { and, eq, gte, inArray, isNotNull, notExists, sql } from "drizzle-orm";
import { z } from "zod";
import type { FrequentTermsResponse, KeywordSuggestionsResponse, KeywordTrialResult, KeywordTrialsResponse, Platform, TaxonomyEntry } from "@pp/contracts";
import { getDb } from "../db/client.js";
import { keywords, media, productGroups, products, scrapeRuns } from "../db/schema.js";
import { AppError, notFound } from "../common/errors.js";
import { ZodPipe } from "../common/http.js";
import { UNCLASSIFIED } from "../domain/categorize.js";
import { capsValid, isUniqueViolation, slugify } from "../domain/guards.js";
import { frequentTerms, languageMismatch, rankRelated, TRIAL_MAX_ITEMS } from "../domain/keywords.js";
import { PLATFORM_LIST } from "../domain/types.js";
import { aiBackend } from "../jobs/llm.js";
import { claudeCliVersion, skillPresent, SKILLS } from "../jobs/claude-cli.js";
import { groupMode } from "../jobs/scrape.js";
import { suggestKeywords } from "../jobs/suggest.js";
import { listTrials, startTrials, trialEstimates } from "../jobs/trials.js";
import { reconcile } from "../jobs/reconcile.js";
import { getSetting } from "../settings/settings.js";
import { applyCategoryMap } from "../jobs/categorize.js";
import { groupBySlug } from "../jobs/runs.js";
import { toGroup, toKeyword, unmapped } from "./queries.js";

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
  allowLanguageMismatch: z.boolean().optional(),
});
const keywordPatch = keywordIn.partial().omit({ platform: true, allowLanguageMismatch: true });
const trialIn = z.object({
  items: z.array(z.object({ platform, keyword: z.string().trim().min(1).max(100), region: z.string().trim().max(10).nullable().optional() })).min(1).max(100),
  confirm: z.boolean().optional(),
});
const suggestIn = z.object({ productName: z.string().trim().min(1).max(120) });
const taxonomyIn = z
  .array(
    z.object({
      key: z.string().regex(/^[a-z0-9_]{1,40}$/).refine((k) => k !== UNCLASSIFIED),
      th: z.string().trim().min(1).max(80),
      en: z.string().trim().min(1).max(80),
      zh: z.string().trim().min(1).max(80),
      keywords: z.array(z.string().trim().min(1).max(40)).max(50),
    }),
  )
  .max(40)
  .refine((xs) => new Set(xs.map((x) => x.key)).size === xs.length);
const mapIn = z.object({ platform, path: z.string().trim().min(1).max(300), categoryKey: z.string().regex(/^[a-z0-9_]{1,40}$/) });

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

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
    // A wrong-language keyword "works" — rows come back — and is still useless (CONTEXT.md: Language mismatch).
    if (!body.allowLanguageMismatch && languageMismatch(body.platform, body.keyword)) throw new AppError(400, "errors.keyword.languageMismatch");
    const [row] = await db
      .insert(keywords)
      .values({ productGroupId: g.id, platform: body.platform, keyword: body.keyword, region: body.region ?? null, enabled: body.enabled ?? true })
      .returning();
    return toKeyword(row);
  }

  /** Keyword trial — PAID in an apify group (each item capped like a smoke test, all of them within the
   *  monthly budget), free and inline in a mock group. Listings never enter the Group. */
  @Post("groups/:slug/keyword-trials")
  @HttpCode(200)
  async startTrials(@Param("slug") slug: string, @Body(new ZodPipe(trialIn)) body: z.infer<typeof trialIn>): Promise<KeywordTrialResult> {
    const g = await groupBySlug(slug);
    if (body.items.length > TRIAL_MAX_ITEMS) throw new AppError(400, "errors.keyword.trialTooMany");
    if (body.items.some((i) => !g.platforms.includes(i.platform))) throw new AppError(400, "errors.validation");
    if (body.confirm !== true) throw new AppError(400, "errors.confirmRequired"); // mock too: the dialog is the same
    if ((await groupMode(g)) === "apify" && !(await getSetting("APIFY_TOKEN"))) throw new AppError(400, "errors.actors.needsToken");
    return startTrials(g, body.items);
  }

  @Get("groups/:slug/keyword-trials")
  async trials(@Param("slug") slug: string, @Query("since") since?: string): Promise<KeywordTrialsResponse> {
    void reconcile().catch(() => 0); // apify trials finish here when no webhook reaches this host
    const g = await groupBySlug(slug);
    const from = since && !Number.isNaN(Date.parse(since)) ? new Date(since) : null;
    return { mode: await groupMode(g), estimates: await trialEstimates(g), trials: await listTrials(g, from) };
  }

  /** AI keyword suggestion — spends a little on Anthropic (or the local cli). Nothing is saved. */
  @Post("groups/:slug/keyword-suggestions")
  @HttpCode(200)
  async suggest(@Param("slug") slug: string, @Body(new ZodPipe(suggestIn)) body: z.infer<typeof suggestIn>): Promise<KeywordSuggestionsResponse> {
    const g = await groupBySlug(slug);
    if (!skillPresent(SKILLS.suggest)) throw new AppError(500, "errors.suggest.noSkill");
    if ((await aiBackend()) === "cli") {
      await claudeCliVersion((await getSetting("CLAUDE_CLI_PATH")) ?? "claude").catch(() => {
        throw new AppError(400, "errors.suggest.noCli");
      });
    } else if (!(await getSetting("ANTHROPIC_API_KEY"))) {
      throw new AppError(400, "errors.suggest.needsKey");
    }
    const db = await getDb();
    const existing = await db.select({ platform: keywords.platform, keyword: keywords.keyword }).from(keywords).where(eq(keywords.productGroupId, g.id));
    try {
      return await suggestKeywords(body.productName, g.platforms as Platform[], existing);
    } catch {
      throw new AppError(502, "errors.suggest.failed");
    }
  }

  /** Free: terms frequent in the Group's own titles, plus XHS related searches from finished runs. */
  @Get("groups/:slug/keyword-suggestions/frequent")
  async frequent(@Param("slug") slug: string): Promise<FrequentTermsResponse> {
    const g = await groupBySlug(slug);
    const db = await getDb();
    const saved = await db.select({ platform: keywords.platform, keyword: keywords.keyword }).from(keywords).where(eq(keywords.productGroupId, g.id));
    const titles = await db.select({ platform: products.platform, title: products.title }).from(products).where(eq(products.productGroupId, g.id));
    const frequent: FrequentTermsResponse["frequent"] = {};
    for (const p of g.platforms as Platform[]) {
      const own = titles.filter((r) => r.platform === p).map((r) => r.title);
      const terms = own.length ? frequentTerms(p, own, saved.filter((k) => k.platform === p).map((k) => k.keyword)) : [];
      if (terms.length) frequent[p] = terms;
    }
    const lists = await db
      .select({ r: scrapeRuns.relatedKeywords })
      .from(scrapeRuns)
      .where(and(eq(scrapeRuns.productGroupId, g.id), eq(scrapeRuns.platform, "xhs"), isNotNull(scrapeRuns.relatedKeywords), gte(scrapeRuns.startedAt, new Date(Date.now() - 30 * 86_400_000))));
    return { frequent, related: rankRelated(lists.map((l) => l.r), saved.filter((k) => k.platform === "xhs").map((k) => k.keyword)) };
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
    return row.taxonomy;
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
}
