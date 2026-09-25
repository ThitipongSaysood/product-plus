// API contract between apps/api (NestJS) and apps/web (Next.js).
// TYPES ONLY — both sides must use `import type` so nothing needs building.
// Every error response is `{ error: "<i18n dict key>" }` (e.g. "errors.validation").

export type Platform = "douyin" | "1688" | "temu" | "xhs";
export const PLATFORMS: readonly Platform[] = ["douyin", "1688", "temu", "xhs"] as const;

export type SoldPeriod = "30d" | "lifetime" | "unknown";
export type TrendLabel = "rising" | "falling" | "flat" | "insufficient_history";
export type CategorySource = "platform" | "rules" | "llm" | "manual";
export type RunStatus = "running" | "succeeded" | "failed" | "suspect";
export type RunKind = "scrape" | "categorize" | "media" | "trend" | "evaluate" | "smoke" | "pipeline" | "translate" | "brand";
export type EventKind = "new" | "gone" | "price_drop" | "sales_surge" | "rank_up";
export type SourceMode = "mock" | "apify";
/** The three languages the interface ships in; AI prose is written in whichever one the reader is using. */
export type Locale = "th" | "en" | "zh";
export type Schedule = "weekly" | "daily" | "manual";
export type Currency = "CNY" | "USD";

export type Localized = { th: string; en: string; zh: string };

export type TaxonomyEntry = Localized & { key: string; keywords: string[]; addedBy?: "ai" }; // addedBy: a line "Let AI sort everything" added

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
  /** Asia/Bangkok hour the scheduled round fires. Hour only — the scheduler ticks hourly. */
  scheduleHour: number;
  /** 0=Sunday. Weekly groups only; ignored for daily and manual. */
  scheduleWeekday: number;
  taxonomy: TaxonomyEntry[];
  productCount?: number; // GET /groups only — what a delete would take with it
};

// POST /groups. A new group starts with spending paused (budget 0) and no taxonomy unless one is copied.
export type GroupCreate = {
  name: string;
  slug?: string; // omitted → derived from name; required when the name has no ASCII (Thai/Chinese)
  platforms: Platform[];
  schedule?: Schedule;
  scheduleHour?: number;
  scheduleWeekday?: number;
  resultLimit?: number;
  monthlyBudgetUsd?: number; // default 0 = spending paused
  runCapUsd?: number;
  sourceMode?: SourceMode; // pins the group; "mock" never spends
  copyTaxonomyFrom?: string; // slug of an existing group
};

// PATCH /groups/:slug. The slug itself is immutable so shared links keep working.
export type GroupPatch = {
  name?: string;
  monthlyBudgetUsd?: number;
  resultLimit?: number;
  runCapUsd?: number;
  schedule?: Schedule;
  scheduleHour?: number;
  scheduleWeekday?: number;
  platforms?: Platform[];
};

export type Keyword = {
  id: string;
  platform: Platform;
  keyword: string; // the Platform term actually searched (CONTEXT.md)
  concept: string | null; // the Keyword the merchant typed; rows sharing it are one Keyword
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
  titleTh: string | null; // Thai translation when the translate job has run; original title is never overwritten
  productUrl: string | null;
  imageId: string | null; // cached media → GET /api/media/:id
  imageSourceUrl: string | null; // fallback when not cached yet
  imageLost: boolean; // cache failed and source expired → UI must say so
  price: number | null; // the CHEAPEST rung of any wholesale ladder — not always purchasable
  /** What one minimum order costs per unit, when the listing has a ladder. Prefer this for display. */
  entryPrice: number | null;
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

export type FxRate = { rate: number; updatedAt: string };

/** GET /products — a page of cards plus what the list needs around them. */
export type ProductList = Paged<ProductCard> & {
  /** Products in the group with no Thai title yet — the translate button only shows when this is > 0. */
  untranslated: number;
  /** Hand-set THB rates by currency (CNY, USD); a currency is absent when no rate is set. */
  fxThb: Partial<Record<"CNY" | "USD", FxRate>>;
};

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
    /** Apparel/luxury marks the seller's own title claims (not device names it merely fits). Usually []. */
    brandMarks: string[];
    supply: SupplyTerms | null; // 1688 only — the retail platforms have no minimum order or price ladder
  };
  /** Manually-entered THB rate for this product's currency, so the page can price in the money the
   *  buyer actually spends. Null when no rate is set. `updatedAt` is shown — a hand-set rate goes stale
   *  and must never read as a live quote. */
  fxThb: FxRate | null;
  snapshots: Snapshot[];
  salesTrend: { date: string; units: number }[] | null; // Douyin only
  trendDetail: TrendDetail;
  events: ChangeEvent[];
};

/** One rung of a wholesale price ladder: "1~499条 ¥6". `maxQty` null means the rung is open-ended. */
export type PriceTier = { minQty: number; maxQty: number | null; price: number };

/** How a listing is actually bought. `ProductCard.price` is the CHEAPEST rung, which on 1688 is often a
 *  bulk price the buyer cannot reach — `entryPrice` is what one minimum order costs per unit. */
export type SupplyTerms = {
  moq: number | null;
  unit: string | null; // the platform's own unit word, still in Chinese
  tiers: PriceTier[]; // ascending by minQty; empty when the listing has no ladder
  entryPrice: number | null;
  orderCount: number | null; // distinct orders, NOT units sold, and with no time window
  videoUrl: string | null;
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
  sourceMode: SourceMode; // what the GROUP is configured to use
  /** Whether a real scrape could actually run right now: configured for apify AND a token is present.
   *  Configuration alone was showing a reassuring "real data" badge on a system that could fetch nothing. */
  canFetchReal: boolean;
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
  group: "apify" | "ai" | "app" | "money";
  secret: boolean;
  value: string | null; // masked to last 4 when secret
  source: "db" | "env" | "fallback" | "unset";
};

/** What the brand scout produced. Stored on its own scrape_runs row; ids are always candidates that
 *  existed in the brief, never ones the model invented. */
export type BrandReport = {
  summary: string;
  picks: { id: string; why: string; pros: string[]; cons: string[]; confidence: "high" | "medium" | "low" }[];
  avoid: { id: string; reason: string }[];
  generatedAt: string;
  model: string;
  /** Which language the prose is in. A report is not re-translated when the ui language changes. */
  lang: Locale;
  candidateCount: number;
  /** Listings the brief could not weigh — unmeasured, not rejected. */
  excluded: { noSoldCount: number; noPrice: number; total: number };
  /** What this data cannot support, shown to the reader as well as to the model. */
  limits: string[];
  /** Two measured 0–100 positions per candidate id — demand inside its own platform+period bucket, and
   *  buy price against its category's median. Frozen with the report because the prose was written
   *  against this snapshot; recomputing at read time would drift away from what the words describe.
   *  Optional: reports generated before scoring existed have none, and those picks render without a
   *  meter rather than with a zero. */
  scores?: Record<string, { demand: number; cost: number; total: number }>;
};

/** Everything the page needs to show a pick as a product rather than an id: picture, name, link and the
 *  figures themselves. Resolved server-side for exactly the ids a report references, so the page never
 *  pages through the whole catalogue — and so the numbers on screen come from the database, not from
 *  the model's prose. */
export type BrandItem = {
  id: string;
  title: string;
  titleLang: "th" | "zh";
  platform: Platform;
  imageId: string | null;
  imageSourceUrl: string | null;
  imageLost: boolean;
  productUrl: string | null;
  /** What one unit costs at the minimum order, when a ladder says so; else the listed price. */
  buyPrice: number | null;
  currency: Currency | null;
  sold: SoldInfo;
  moq: number | null;
  unit: string | null;
  categoryKey: string;
  /** Shown as a fact beside the score, never folded into it — only douyin reports one, so a scored
   *  trend would rank the platforms rather than the products. */
  trend: TrendLabel;
};

export type BrandResponse = { report: BrandReport | null; items: Record<string, BrandItem> };

export type UnmappedCategory = { platform: Platform; path: string; count: number };

// ---------- category suggestions (AI proposes new taxonomy lines for listings no rule caught) ----------
// POST /groups/:slug/category-suggestions — nothing is saved; a picked line is added to the taxonomy text.
// `matches` = unclassified listings this line's keywords would sort into it, counted by the same rules.
export type CategorySuggestion = TaxonomyEntry & { matches: number; examples: string[] };
export type CategorySuggestionsResponse = { suggestions: CategorySuggestion[]; unclassified: number; costUsd: number | null };

// POST /category-map/auto {pg} — AI decides each unmapped platform path and the decision is saved at once.
// categoryKey null = "too broad": the path leaves the queue and its listings stay with the keyword rules.
// GET /category-map/broad?pg= lists those paths; DELETE /category-map?platform=&path= undoes any decision.
export type PathDecision = { platform: Platform; path: string; count: number; categoryKey: string | null; reasonTh: string };
export type AutoMapResponse = { decisions: PathDecision[]; costUsd: number | null };

// ---------- keyword suggestions (CONTEXT.md "Keyword suggestion") ----------
export type KeywordSuggestion = { keyword: string; zh: string | null; en: string | null; glossTh: string }; // one whole line of the keyword list
// POST /groups/:slug/keyword-suggestions {productName}
export type KeywordSuggestionsResponse = { suggestions: KeywordSuggestion[]; costUsd: number | null };
// PUT /groups/:slug/keyword-list — the whole list, one Keyword per line: keyword | zh term | en term.
// A missing term is filled by AI before saving; a Keyword left out of the list is deleted.
export type KeywordListItem = { keyword: string; zh: string | null; en: string | null };
export type KeywordListResponse = {
  keywords: Keyword[];
  translated: string[]; // Keywords whose missing terms AI filled in
  skipped: { keyword: string; platform: Platform; reason: string }[]; // reason = dict key
  costUsd: number | null;
};
// GET /groups/:slug/round-estimate — what one Keyword costs per Round (all watched platforms, chosen actors)
export type RoundEstimate = { perKeywordUsd: number | null; runCapUsd: number; mode: SourceMode };
