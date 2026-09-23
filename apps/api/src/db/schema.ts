// Postgres schema "scout" (handoff §8). Every table is declared through pgSchema so queries
// always use fully-qualified names — never rely on search_path.
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const scout = pgSchema("scout");

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const money = (name: string, precision = 12, scale = 2) => numeric(name, { precision, scale, mode: "number" });

// ponytail: images live in Postgres (bytea); move to object storage once media grows past a few GB.
const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (v) => (Buffer.isBuffer(v) ? v : Buffer.from(v)),
});

export type TaxonomyJson = { key: string; en: string; th: string; zh: string; keywords: string[] }[];

export const appSettings = scout.table("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const productGroups = scout.table("product_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  country: text("country").notNull().default("CN"),
  platforms: text("platforms").array().notNull().default(sql`'{}'::text[]`),
  monthlyBudgetUsd: numeric("monthly_budget_usd", { precision: 8, scale: 2, mode: "number" }).notNull().default(10),
  resultLimit: integer("result_limit").notNull().default(50),
  // max Apify spend per pipeline round; each actor gets maxTotalChargeUsd = its share of this cap
  runCapUsd: numeric("run_cap_usd", { precision: 8, scale: 2, mode: "number" }).notNull().default(1),
  schedule: text("schedule").notNull().default("weekly"),
  // null = follow the SOURCE_MODE setting; "mock" pins a demo group, "apify" pins a real-data group
  // (a real group never receives mock rows, even when the app runs in mock mode).
  sourceMode: text("source_mode"),
  taxonomy: jsonb("taxonomy").$type<TaxonomyJson>().notNull().default([]),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const keywords = scout.table(
  "keywords",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productGroupId: uuid("product_group_id")
      .notNull()
      .references(() => productGroups.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    keyword: text("keyword").notNull(),
    region: text("region"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("keywords_group_platform_keyword_uq").on(t.productGroupId, t.platform, t.keyword)],
);

export const media = scout.table(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceUrl: text("source_url").notNull(),
    storageKey: text("storage_key").notNull(), // sha1 of bytes
    contentType: text("content_type").notNull(),
    bytes: bytea("bytes").notNull(),
    size: integer("size").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("media_storage_key_uq").on(t.storageKey)],
);

export const products = scout.table(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productGroupId: uuid("product_group_id")
      .notNull()
      .references(() => productGroups.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    externalId: text("external_id").notNull(),
    keyword: text("keyword"),
    title: text("title"),
    productUrl: text("product_url"),
    imageMediaId: uuid("image_media_id").references(() => media.id, { onDelete: "set null" }),
    imageSourceUrl: text("image_source_url"),
    imageUrls: jsonb("image_urls").$type<string[]>().notNull().default([]),
    imageLost: boolean("image_lost").notNull().default(false),
    currency: text("currency"),
    price: money("price"),
    originalPrice: money("original_price"),
    shopName: text("shop_name"),
    shopUrl: text("shop_url"),
    platformCategoryPath: text("platform_category_path").array(),
    categoryKey: text("category_key"),
    categorySource: text("category_source"),
    categoryTaggedAt: ts("category_tagged_at"),
    attrs: jsonb("attrs").$type<{ sizes?: string[]; models?: string[] }>().notNull().default({}),
    platformSignals: jsonb("platform_signals").$type<{ isTrending?: boolean; demandScore?: number } | null>(),
    firstSeenAt: ts("first_seen_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    missedRuns: integer("missed_runs").notNull().default(0),
    goneAt: ts("gone_at"),
    latestSoldCount: integer("latest_sold_count"),
    latestSoldPeriod: text("latest_sold_period").notNull().default("unknown"),
    latestSoldLowerBound: boolean("latest_sold_lower_bound").notNull().default(false),
    latestSoldText: text("latest_sold_text"),
    latestRank: integer("latest_rank"),
    latestSnapshotAt: ts("latest_snapshot_at"),
    // computed from product_snapshots by domain/trend.ts (kept as columns so the wall can filter/sort)
    trendLabel: text("trend_label").notNull().default("insufficient_history"),
    trendDeltaSold: integer("trend_delta_sold"),
    trendDeltaRank: integer("trend_delta_rank"),
    trendDouyinRatio: real("trend_douyin_ratio"),
    raw: jsonb("raw"),
  },
  (t) => [
    uniqueIndex("products_group_platform_ext_uq").on(t.productGroupId, t.platform, t.externalId),
    index("products_group_platform_active_idx").on(t.productGroupId, t.platform, t.isActive),
    index("products_group_category_idx").on(t.productGroupId, t.categoryKey),
  ],
);

export const scrapeRuns = scout.table(
  "scrape_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productGroupId: uuid("product_group_id").references(() => productGroups.id, { onDelete: "cascade" }),
    keywordId: uuid("keyword_id").references(() => keywords.id, { onDelete: "set null" }),
    keyword: text("keyword"),
    platform: text("platform"),
    actorId: text("actor_id"),
    kind: text("kind").notNull(),
    parentRunId: uuid("parent_run_id"),
    step: text("step"),
    status: text("status").notNull().default("running"),
    apifyRunId: text("apify_run_id"),
    progressDone: integer("progress_done"),
    progressTotal: integer("progress_total"),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    itemsIn: integer("items_in"),
    itemsOut: integer("items_out"),
    costUsd: numeric("cost_usd", { precision: 10, scale: 4, mode: "number" }),
    note: text("note"),
  },
  (t) => [
    index("scrape_runs_group_kind_idx").on(t.productGroupId, t.kind, t.startedAt),
    index("scrape_runs_status_idx").on(t.status),
    index("scrape_runs_apify_idx").on(t.apifyRunId),
  ],
);

export const productSnapshots = scout.table(
  "product_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    productGroupId: uuid("product_group_id").notNull(),
    scrapeRunId: uuid("scrape_run_id").notNull(),
    takenAt: ts("taken_at").notNull(),
    rank: integer("rank"),
    price: money("price"),
    soldCount: integer("sold_count"),
    soldPeriod: text("sold_period").notNull(),
    soldLowerBound: boolean("sold_lower_bound").notNull().default(false),
    salesTrend: jsonb("sales_trend").$type<{ date: string; units: number }[] | null>(),
    raw: jsonb("raw"),
  },
  (t) => [
    index("snapshots_product_taken_idx").on(t.productId, t.takenAt),
    uniqueIndex("snapshots_product_run_uq").on(t.productId, t.scrapeRunId),
  ],
);

export const changeEvents = scout.table(
  "change_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    productGroupId: uuid("product_group_id")
      .notNull()
      .references(() => productGroups.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    occurredAt: ts("occurred_at").notNull(),
    scrapeRunId: uuid("scrape_run_id"),
    detail: jsonb("detail").$type<Record<string, unknown> | null>(),
  },
  (t) => [
    index("events_group_occurred_idx").on(t.productGroupId, t.occurredAt),
    uniqueIndex("events_product_kind_run_uq").on(t.productId, t.kind, t.scrapeRunId),
  ],
);

export const categoryMap = scout.table(
  "category_map",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: text("platform").notNull(),
    platformPath: text("platform_path").notNull(), // joined with " > "
    categoryKey: text("category_key").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("category_map_platform_path_uq").on(t.platform, t.platformPath)],
);

export const actorEvaluations = scout.table(
  "actor_evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evaluationRunId: uuid("evaluation_run_id"),
    platform: text("platform").notNull(),
    actorId: text("actor_id").notNull(),
    title: text("title"),
    evaluatedAt: ts("evaluated_at").notNull(),
    planTier: text("plan_tier").notNull(),
    startFee: numeric("start_fee", { precision: 10, scale: 6, mode: "number" }).notNull(),
    pricePerResult: numeric("price_per_result", { precision: 10, scale: 6, mode: "number" }).notNull(),
    estCost50: numeric("est_cost_50", { precision: 10, scale: 6, mode: "number" }).notNull(),
    costPerResult50: numeric("cost_per_result_50", { precision: 10, scale: 6, mode: "number" }).notNull(),
    hasSold30d: boolean("has_sold_30d").notNull(),
    hasSold: boolean("has_sold").notNull(),
    hasCategory: boolean("has_category").notNull(),
    hasImage: boolean("has_image").notNull(),
    hasLink: boolean("has_link").notNull(),
    hasTrend: boolean("has_trend").notNull(),
    needsCookie: boolean("needs_cookie").notNull(),
    completeness: integer("completeness").notNull(),
    failRate30d: real("fail_rate_30d"),
    runs30d: integer("runs_30d"),
    smokeItemsIn: integer("smoke_items_in"),
    smokeItemsOut: integer("smoke_items_out"),
    smokeCostUsd: numeric("smoke_cost_usd", { precision: 10, scale: 4, mode: "number" }),
    chosen: boolean("chosen").notNull().default(false),
    excluded: text("excluded"),
    reason: text("reason"),
    raw: jsonb("raw"),
  },
  (t) => [index("actor_eval_platform_idx").on(t.platform, t.evaluatedAt)],
);
