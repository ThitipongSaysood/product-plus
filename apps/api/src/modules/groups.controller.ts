// groups · keywords · taxonomy · category map
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { TaxonomyEntry } from "@pp/contracts";
import { getDb } from "../db/client.js";
import { keywords, productGroups } from "../db/schema.js";
import { AppError, notFound } from "../common/errors.js";
import { ZodPipe } from "../common/http.js";
import { UNCLASSIFIED } from "../domain/categorize.js";
import { PLATFORM_LIST } from "../domain/types.js";
import { applyCategoryMap } from "../jobs/categorize.js";
import { groupBySlug } from "../jobs/runs.js";
import { toGroup, toKeyword, unmapped } from "./queries.js";

const platform = z.enum(PLATFORM_LIST as ["douyin", "1688", "temu", "xhs"]);
const groupPatch = z.object({
  monthlyBudgetUsd: z.number().min(0).max(10000).optional(),
  resultLimit: z.number().int().min(1).max(50).optional(),
  runCapUsd: z.number().min(0.1).max(1000).optional(),
  schedule: z.enum(["weekly", "daily", "manual"]).optional(),
  platforms: z.array(platform).min(1).max(4).optional(),
});
const keywordIn = z.object({
  platform,
  keyword: z.string().trim().min(1).max(100),
  region: z.string().trim().max(10).nullable().optional(),
  enabled: z.boolean().optional(),
});
const keywordPatch = keywordIn.partial().omit({ platform: true });
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
    return (await db.select().from(productGroups).orderBy(productGroups.createdAt)).map(toGroup);
  }

  @Patch("groups/:slug")
  async patchGroup(@Param("slug") slug: string, @Body(new ZodPipe(groupPatch)) body: z.infer<typeof groupPatch>) {
    const g = await groupBySlug(slug);
    const db = await getDb();
    const [row] = await db
      .update(productGroups)
      .set({ ...body, ...(body.platforms && { platforms: [...new Set(body.platforms)] }), updatedAt: new Date() })
      .where(eq(productGroups.id, g.id))
      .returning();
    return toGroup(row);
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
