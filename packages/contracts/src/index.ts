// API contract between apps/api (NestJS) and apps/web (Next.js).
// TYPES ONLY — both sides must use `import type` so nothing needs building.
// Every error response is `{ error: "<i18n dict key>" }` (e.g. "errors.validation").

export type Platform = "douyin" | "1688" | "temu" | "xhs";
export const PLATFORMS: readonly Platform[] = ["douyin", "1688", "temu", "xhs"] as const;

export type SoldPeriod = "30d" | "lifetime" | "unknown";
export type TrendLabel = "rising" | "falling" | "flat" | "insufficient_history";
export type CategorySource = "platform" | "rules" | "llm" | "manual";
export type RunStatus = "running" | "succeeded" | "failed" | "suspect";
export type RunKind = "scrape" | "categorize" | "media" | "trend" | "evaluate" | "smoke" | "pipeline";
export type EventKind = "new" | "gone" | "price_drop" | "sales_surge" | "rank_up";
export type SourceMode = "mock" | "apify";
export type Schedule = "weekly" | "daily" | "manual";
export type Currency = "CNY" | "USD";

export type Localized = { th: string; en: string; zh: string };

export type TaxonomyEntry = Localized & { key: string; keywords: string[] };

export type ApiError = { error: string };

// ---------- groups / keywords ----------
export type Group = {
  id: string;
  slug: string;
  name: string;
  platforms: Platform[];
  monthlyBudgetUsd: number;
  resultLimit: number; // default 50 — also enforced at ingest
  runCapUsd: number; // max Apify spend per pipeline round (default 1.00); passed to actors as maxTotalChargeUsd
  schedule: Schedule;
  taxonomy: TaxonomyEntry[];
};

export type Keyword = {
  id: string;
  platform: Platform;
  keyword: string;
  region: string | null;
  enabled: boolean;
};

// ---------- products ----------
export type SoldInfo = {
  count: number | null; // null = platform gave nothing → UI shows "—"
  period: SoldPeriod; // never guessed
  lowerBound: boolean; // Temu "10K+" → true
  text: string | null; // raw display text e.g. "全网10万+件"
};

export type ProductCard = {
  id: string;
  platform: Platform;
  title: string | null;
  productUrl: string | null;
  imageId: string | null; // cached media → GET /api/media/:id
  imageSourceUrl: string | null; // fallback when not cached yet
  imageLost: boolean; // cache failed and source expired → UI must say so
  price: number | null;
  currency: Currency | null;
  sold: SoldInfo;
  categoryKey: string; // "unclassified" when unknown
  categorySource: CategorySource | null;
  trend: TrendLabel;
  rank: number | null;
  isActive: boolean;
  firstSeenAt: string; // ISO
  lastSeenAt: string;
};

export type ProductSort = "sold" | "rank" | "price" | "new";

export type ProductsQuery = {
  pg?: string;
  platform?: string; // csv
  category?: string; // csv
  trend?: TrendLabel;
  period?: SoldPeriod;
  sort?: ProductSort;
  q?: string;
  page?: number;
  active?: "1" | "0" | "all";
};

export type Paged<T> = { items: T[]; page: number; pageSize: number; total: number };

export type Snapshot = {
  takenAt: string;
  rank: number | null;
  price: number | null;
  soldCount: number | null;
  soldPeriod: SoldPeriod;
  soldLowerBound: boolean;
};

export type ProductDetail = {
  product: ProductCard & {
    originalPrice: number | null;
    imageUrls: string[];
    shopName: string | null;
    shopUrl: string | null;
    platformCategoryPath: string[] | null;
    attrs: { sizes?: string[]; models?: string[] };
    keyword: string | null;
    platformSignals: { isTrending?: boolean; demandScore?: number } | null; // Temu only, kept separate from our trend
  };
  snapshots: Snapshot[];
  salesTrend: { date: string; units: number }[] | null; // Douyin only
  trendDetail: TrendDetail;
  events: ChangeEvent[];
};

export type TrendDetail = {
  label: TrendLabel;
  deltaSold: number | null;
  deltaRank: number | null;
  douyinRatio: number | null;
  snapshotCount: number;
};

// ---------- events / runs ----------
export type ChangeEvent = {
  id: string;
  kind: EventKind;
  occurredAt: string;
  productId: string;
  productTitle: string | null;
  platform: Platform;
  imageId: string | null;
  detail: Record<string, unknown> | null;
};

export type RunRow = {
  id: string;
  kind: RunKind;
  platform: Platform | null;
  keyword: string | null;
  actorId: string | null;
  status: RunStatus;
  step: string | null;
  itemsIn: number | null;
  itemsOut: number | null;
  costUsd: number | null;
  note: string | null; // fixed EN pattern → translated in UI
  startedAt: string;
  finishedAt: string | null;
};

// ---------- overview ----------
export type Overview = {
  sourceMode: SourceMode;
  summary: { newCount: number; goneCount: number; surgeCount: number; priceDropCount: number; lastRunAt: string | null };
  alerts: RunRow[]; // latest suspect/failed per platform×keyword
  kpis: {
    tracked: number;
    sold30dTotal: number | null; // only products with period 30d; null if none
    rising: number;
    spendMonthUsd: number;
    budgetUsd: number;
  };
  series: { platform: Platform; points: { date: string; sold: number }[] }[]; // Douyin daily units (platform salesTrend, partial day dropped) — the only real time series
  events: ChangeEvent[];
  runs: RunRow[];
};

// ---------- categories / trends ----------
export type CategoryLane = {
  key: string;
  label: Localized;
  count: number;
  soldTotal: number | null; // sum of 30d sold only
  share: number | null; // 0..1 of soldTotal
  products: ProductCard[]; // sorted by sold desc, max 30
};

export type CategoriesResponse = { lanes: CategoryLane[]; unmappedCount: number };

export type TrendRow = ProductCard & {
  deltaSold: number | null;
  deltaRank: number | null;
  douyinRatio: number | null; // Douyin only: last 7 full days / 7 days before (platform salesTrend)
  changePct: number | null; // one comparable metric for charts: deltaSold / previous sold, else douyinRatio − 1
};
export type TrendsResponse = { rising: TrendRow[]; falling: TrendRow[]; insufficient: number };

// ---------- actor evaluation ----------
export type ActorEvaluation = {
  id: string;
  platform: Platform;
  actorId: string; // "owner/name"
  title: string | null;
  evaluatedAt: string;
  planTier: string;
  startFee: number;
  pricePerResult: number; // per-row events summed (add-ons off)
  estCost50: number;
  costPerResult50: number; // (start + 50×per) / 50
  hasSold30d: boolean;
  hasSold: boolean;
  hasCategory: boolean;
  hasImage: boolean;
  hasLink: boolean;
  hasTrend: boolean;
  needsCookie: boolean;
  completeness: number; // 0..5
  failRate30d: number | null; // 0..1
  runs30d: number | null;
  smokeItemsIn: number | null;
  smokeItemsOut: number | null;
  smokeCostUsd: number | null;
  chosen: boolean;
  excluded: string | null; // reason key when disqualified e.g. "actors.excluded.failRate"
  reason: string | null; // EN note pattern → translated
};

export type ActorsResponse = { evaluations: ActorEvaluation[]; evaluatedAt: string | null; planTier: string };

// ---------- jobs ----------
export type JobProgress =
  | { shape: "count"; done: number; total: number; label: string }
  | { shape: "steps"; done: number; total: number; step: string }
  | { shape: "time"; pct: number | null; startedAt: string };

export type JobStatus = {
  running: (JobProgress & { runId: string }) | null;
  last: { runId: string; status: RunStatus; finishedAt: string | null; note: string | null } | null;
};

export type TriggerResult = {
  runId: string | null;
  started: { platform: Platform; keyword: string }[];
  skipped: { platform: Platform; keyword: string; reason: string }[]; // reason = dict key
};

// ---------- settings ----------
export type SettingRow = {
  key: string;
  group: "apify" | "ai" | "app";
  secret: boolean;
  value: string | null; // masked to last 4 when secret
  source: "db" | "env" | "fallback" | "unset";
};

export type UnmappedCategory = { platform: Platform; path: string; count: number };
