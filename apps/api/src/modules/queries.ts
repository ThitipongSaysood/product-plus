// Read-side queries → contract shapes.
import { and, asc, desc, eq, gte, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type {
  CategoriesResponse,
  CategoryLane,
  ChangeEvent,
  Group,
  Keyword,
  Overview,
  Paged,
  Platform,
  ProductCard,
  ProductDetail,
  ProductsQuery,
  SoldPeriod,
  TaxonomyEntry,
  TrendRow,
  TrendsResponse,
  UnmappedCategory,
} from "@pp/contracts";
import { getDb } from "../db/client.js";
import { changeEvents, keywords, productGroups, products, productSnapshots, scrapeRuns } from "../db/schema.js";
import { fromPlatformMap, pathKey, UNCLASSIFIED, UNCLASSIFIED_LABEL } from "../domain/categorize.js";
import { computeTrend } from "../domain/trend.js";
import { loadCategoryMap } from "../jobs/categorize.js";
import { toRunRow, type GroupRecord } from "../jobs/runs.js";
import { groupMode, monthSpend } from "../jobs/scrape.js";
import { toSnapshotLike } from "../jobs/trend.js";
import { notFound } from "../common/errors.js";

type ProductRecord = typeof products.$inferSelect;
export const PAGE_SIZE = 48;

export const toGroup = (g: GroupRecord): Group => ({
  id: g.id,
  slug: g.slug,
  name: g.name,
  platforms: g.platforms as Platform[],
  monthlyBudgetUsd: g.monthlyBudgetUsd,
  resultLimit: g.resultLimit,
  runCapUsd: g.runCapUsd,
  schedule: g.schedule as Group["schedule"],
  taxonomy: g.taxonomy,
});

export const toKeyword = (k: typeof keywords.$inferSelect): Keyword => ({
  id: k.id,
  platform: k.platform as Platform,
  keyword: k.keyword,
  region: k.region,
  enabled: k.enabled,
});

export const toCard = (p: ProductRecord): ProductCard => ({
  id: p.id,
  platform: p.platform as Platform,
  title: p.title,
  productUrl: p.productUrl,
  imageId: p.imageMediaId,
  imageSourceUrl: p.imageSourceUrl,
  imageLost: p.imageLost,
  price: p.price,
  currency: (p.currency as ProductCard["currency"]) ?? null,
  sold: { count: p.latestSoldCount, period: p.latestSoldPeriod as SoldPeriod, lowerBound: p.latestSoldLowerBound, text: p.latestSoldText },
  categoryKey: p.categoryKey ?? UNCLASSIFIED,
  categorySource: (p.categorySource as ProductCard["categorySource"]) ?? null,
  trend: p.trendLabel as ProductCard["trend"],
  rank: p.latestRank,
  isActive: p.isActive,
  firstSeenAt: p.firstSeenAt.toISOString(),
  lastSeenAt: p.lastSeenAt.toISOString(),
});

const csv = (s?: string) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []);
const inGroupPlatforms = (g: GroupRecord, platform?: string) => {
  const wanted = csv(platform).filter((p) => g.platforms.includes(p));
  return inArray(products.platform, wanted.length ? wanted : g.platforms);
};
const soldDesc = sql`${products.latestSoldCount} desc nulls last`;

export async function listProducts(g: GroupRecord, q: ProductsQuery): Promise<Paged<ProductCard>> {
  const db = await getDb();
  const conds: (SQL | undefined)[] = [eq(products.productGroupId, g.id), inGroupPlatforms(g, q.platform)];
  const cats = csv(q.category);
  if (cats.length)
    conds.push(cats.includes(UNCLASSIFIED) ? or(inArray(products.categoryKey, cats), isNull(products.categoryKey)) : inArray(products.categoryKey, cats));
  if (q.trend) conds.push(eq(products.trendLabel, q.trend));
  if (q.period) conds.push(eq(products.latestSoldPeriod, q.period));
  if (q.q) conds.push(ilike(products.title, `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`));
  const active = q.active ?? "1";
  if (active !== "all") conds.push(eq(products.isActive, active === "1"));
  const where = and(...conds);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(where);
  const pages = Math.max(1, Math.ceil(n / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(Number(q.page) || 1)), pages);
  const order =
    q.sort === "rank" ? [sql`${products.latestRank} asc nulls last`]
    : q.sort === "price" ? [sql`${products.price} asc nulls last`]
    : q.sort === "new" ? [desc(products.firstSeenAt)]
    : [soldDesc];
  const rows = await db
    .select()
    .from(products)
    .where(where)
    .orderBy(...order, asc(products.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  return { items: rows.map(toCard), page, pageSize: PAGE_SIZE, total: n };
}

async function eventsFor(where: SQL | undefined, limit: number): Promise<ChangeEvent[]> {
  const db = await getDb();
  const rows = await db
    .select({ e: changeEvents, title: products.title, platform: products.platform, imageId: products.imageMediaId })
    .from(changeEvents)
    .innerJoin(products, eq(products.id, changeEvents.productId))
    .where(where)
    .orderBy(desc(changeEvents.occurredAt), desc(changeEvents.id))
    .limit(limit);
  return rows.map((r) => ({
    id: String(r.e.id),
    kind: r.e.kind as ChangeEvent["kind"],
    occurredAt: r.e.occurredAt.toISOString(),
    productId: r.e.productId,
    productTitle: r.title,
    platform: r.platform as Platform,
    imageId: r.imageId,
    detail: r.e.detail ?? null,
  }));
}

export async function productDetail(id: string): Promise<ProductDetail> {
  const db = await getDb();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("errors.product.notFound");
  const [p] = await db.select().from(products).where(eq(products.id, id));
  if (!p) throw notFound("errors.product.notFound");
  const snaps = await db.select().from(productSnapshots).where(eq(productSnapshots.productId, id)).orderBy(asc(productSnapshots.takenAt));
  const latestTrend = [...snaps].reverse().find((s) => s.salesTrend)?.salesTrend ?? null;
  return {
    product: {
      ...toCard(p),
      originalPrice: p.originalPrice,
      imageUrls: p.imageUrls,
      shopName: p.shopName,
      shopUrl: p.shopUrl,
      platformCategoryPath: p.platformCategoryPath,
      attrs: p.attrs,
      keyword: p.keyword,
      platformSignals: p.platformSignals ?? null,
    },
    snapshots: snaps.map((s) => ({
      takenAt: s.takenAt.toISOString(),
      rank: s.rank,
      price: s.price,
      soldCount: s.soldCount,
      soldPeriod: s.soldPeriod as SoldPeriod,
      soldLowerBound: s.soldLowerBound,
    })),
    salesTrend: p.platform === "douyin" ? latestTrend : null,
    trendDetail: computeTrend(snaps.map(toSnapshotLike)),
    events: await eventsFor(eq(changeEvents.productId, id), 50),
  };
}

export async function overview(g: GroupRecord): Promise<Overview> {
  const db = await getDb();
  const scrapes = await db
    .select()
    .from(scrapeRuns)
    .where(and(eq(scrapeRuns.productGroupId, g.id), eq(scrapeRuns.kind, "scrape")))
    .orderBy(desc(scrapeRuns.startedAt));
  const finished = scrapes.filter((r) => r.finishedAt && r.status !== "running" && r.status !== "failed");
  const lastRunAt = finished.length ? new Date(Math.max(...finished.map((r) => r.finishedAt!.getTime()))) : null;

  const since = lastRunAt ? new Date(lastRunAt.getTime() - 24 * 3_600_000) : null;
  const counts = since
    ? await db
        .select({ kind: changeEvents.kind, n: sql<number>`count(*)::int` })
        .from(changeEvents)
        .where(and(eq(changeEvents.productGroupId, g.id), gte(changeEvents.occurredAt, since)))
        .groupBy(changeEvents.kind)
    : [];
  const c = (k: string) => counts.find((x) => x.kind === k)?.n ?? 0;

  // latest run per platform×keyword; alert when it is suspect/failed
  const latest = new Map<string, (typeof scrapes)[number]>();
  for (const r of scrapes) if (!latest.has(`${r.platform}|${r.keyword}`)) latest.set(`${r.platform}|${r.keyword}`, r);
  const alerts = [...latest.values()].filter((r) => r.status === "suspect" || r.status === "failed").map(toRunRow);

  const act = and(eq(products.productGroupId, g.id), eq(products.isActive, true), inArray(products.platform, g.platforms));
  const [k] = await db
    .select({
      tracked: sql<number>`count(*)::int`,
      sold30: sql<number | null>`sum(${products.latestSoldCount}) filter (where ${products.latestSoldPeriod} = '30d')`,
      rising: sql<number>`count(*) filter (where ${products.trendLabel} = 'rising')::int`,
    })
    .from(products)
    .where(act);

  // Main chart = Douyin's own daily units (30-day salesTrend of each active product's latest snapshot), summed.
  // It is the only real time series we have; summing lifetime/unknown counts of other platforms would mix periods.
  const trendRows = g.platforms.includes("douyin")
    ? await db
        .select({ productId: productSnapshots.productId, takenAt: productSnapshots.takenAt, salesTrend: productSnapshots.salesTrend })
        .from(productSnapshots)
        .innerJoin(products, eq(products.id, productSnapshots.productId))
        .where(and(act, eq(products.platform, "douyin")))
        .orderBy(desc(productSnapshots.takenAt))
    : [];
  const seen = new Set<string>();
  const daily = new Map<string, number>();
  for (const r of trendRows) {
    if (seen.has(r.productId) || !r.salesTrend?.length) continue;
    seen.add(r.productId);
    const pts = [...r.salesTrend].sort((a, b) => a.date.localeCompare(b.date)).slice(0, -1); // last point = partial day
    for (const p of pts) daily.set(p.date, (daily.get(p.date) ?? 0) + p.units);
  }
  const douyinSeries = [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, sold]) => ({ date, sold }));

  return {
    sourceMode: await groupMode(g),
    summary: { newCount: c("new"), goneCount: c("gone"), surgeCount: c("sales_surge"), priceDropCount: c("price_drop"), lastRunAt: lastRunAt?.toISOString() ?? null },
    alerts,
    kpis: {
      tracked: k.tracked,
      sold30dTotal: k.sold30 === null ? null : Number(k.sold30),
      rising: k.rising,
      spendMonthUsd: Math.round((await monthSpend(g.id)) * 10000) / 10000,
      budgetUsd: g.monthlyBudgetUsd,
    },
    series: douyinSeries.length ? [{ platform: "douyin" as Platform, points: douyinSeries }] : [],
    events: await eventsFor(eq(changeEvents.productGroupId, g.id), 20),
    runs: (
      await db.select().from(scrapeRuns).where(eq(scrapeRuns.productGroupId, g.id)).orderBy(desc(scrapeRuns.startedAt)).limit(10)
    ).map(toRunRow),
  };
}

export async function categories(g: GroupRecord, platform?: string): Promise<CategoriesResponse> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.productGroupId, g.id), eq(products.isActive, true), inGroupPlatforms(g, platform)))
    .orderBy(soldDesc);
  const tax = g.taxonomy as TaxonomyEntry[];
  const lanesDef = [...tax.map((t) => ({ key: t.key, label: { th: t.th, en: t.en, zh: t.zh } })), { key: UNCLASSIFIED, label: UNCLASSIFIED_LABEL }];
  const known = new Set(tax.map((t) => t.key));
  const keyOf = (p: ProductRecord) => (p.categoryKey && known.has(p.categoryKey) ? p.categoryKey : UNCLASSIFIED);
  const sold30 = (ps: ProductRecord[]) => {
    const xs = ps.filter((p) => p.latestSoldPeriod === "30d" && p.latestSoldCount !== null);
    return xs.length ? xs.reduce((s, p) => s + p.latestSoldCount!, 0) : null;
  };
  const lanes: CategoryLane[] = lanesDef.map((l) => {
    const ps = rows.filter((p) => keyOf(p) === l.key);
    return { key: l.key, label: l.label, count: ps.length, soldTotal: sold30(ps), share: null, products: ps.slice(0, 30).map(toCard) };
  });
  const all = lanes.reduce((s, l) => s + (l.soldTotal ?? 0), 0);
  for (const l of lanes) l.share = all > 0 && l.soldTotal !== null ? l.soldTotal / all : null;
  return { lanes, unmappedCount: (await unmapped(g)).length };
}

export async function unmapped(g: GroupRecord): Promise<UnmappedCategory[]> {
  const db = await getDb();
  const map = await loadCategoryMap();
  const rows = await db
    .select({ platform: products.platform, path: products.platformCategoryPath, n: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.productGroupId, g.id), inArray(products.platform, g.platforms), sql`${products.platformCategoryPath} is not null`))
    .groupBy(products.platform, products.platformCategoryPath);
  return rows
    .filter((r) => r.path?.length && !fromPlatformMap(r.platform, r.path, map))
    .map((r) => ({ platform: r.platform as Platform, path: pathKey(r.path!), count: r.n }))
    .sort((a, b) => b.count - a.count);
}

export async function trends(g: GroupRecord, platform?: string): Promise<TrendsResponse> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.productGroupId, g.id), eq(products.isActive, true), inGroupPlatforms(g, platform)));
  const changePct = (p: ProductRecord): number | null => {
    const base = p.trendDeltaSold !== null && p.latestSoldCount !== null ? p.latestSoldCount - p.trendDeltaSold : null;
    if (base !== null && base > 0) return p.trendDeltaSold! / base;
    return p.trendDouyinRatio !== null ? p.trendDouyinRatio - 1 : null;
  };
  const row = (p: ProductRecord): TrendRow => ({
    ...toCard(p),
    deltaSold: p.trendDeltaSold,
    deltaRank: p.trendDeltaRank,
    douyinRatio: p.trendDouyinRatio,
    changePct: changePct(p),
  });
  const score = (p: ProductRecord) => (changePct(p) ?? 0) * 1e6 + (p.trendDeltaRank ?? 0);
  return {
    rising: rows.filter((p) => p.trendLabel === "rising").sort((a, b) => score(b) - score(a)).slice(0, 50).map(row),
    falling: rows.filter((p) => p.trendLabel === "falling").sort((a, b) => score(a) - score(b)).slice(0, 50).map(row),
    insufficient: rows.filter((p) => p.trendLabel === "insufficient_history").length,
  };
}
