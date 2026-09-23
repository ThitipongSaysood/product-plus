// Actor cost + completeness + chooser (SPEC §4, handoff §6.2). Pure.
export type EventClass = "start" | "per_result" | "addon";
export const N_RESULTS = 50;
export const MAX_FAIL_RATE = 0.1;

/** Unknown events: /start/ = start fee; detail/add-on/intelligence/sku/review/comment/vendor = add-on (off
 *  by default, excluded); anything else (result-like, dataset-item) = charged per result. */
export function classifyEvent(name: string, known?: Record<string, EventClass>): EventClass {
  if (known?.[name]) return known[name];
  const n = name.toLowerCase();
  if (/start/.test(n)) return "start";
  if (/detail|add-?on|intelligence|sku|review|comment|vendor/.test(n)) return "addon";
  return "per_result";
}

type EventPrice = { eventPriceUsd?: unknown; eventTieredPricingUsd?: unknown; tieredEventPriceUsd?: unknown };

const asNum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Price of one event at `tier`: tiered map → tier (FREE fallback) · flat tieredEventPriceUsd · eventPriceUsd. */
export function eventPrice(ev: EventPrice, tier: string): number | null {
  const tiered = ev.eventTieredPricingUsd as Record<string, unknown> | undefined;
  if (tiered && typeof tiered === "object") {
    const pick = (t: string) => {
      const v = tiered[t];
      return asNum(v) ?? asNum((v as { tieredEventPriceUsd?: unknown } | undefined)?.tieredEventPriceUsd);
    };
    const p = pick(tier) ?? pick("FREE");
    if (p !== null) return p;
  }
  const flat = ev.tieredEventPriceUsd;
  if (flat !== undefined) {
    const p = asNum(flat) ?? (flat && typeof flat === "object" ? asNum((flat as Record<string, unknown>)[tier] ?? (flat as Record<string, unknown>).FREE) : null);
    if (p !== null) return p;
  }
  return asNum(ev.eventPriceUsd);
}

export type Pricing = {
  startFee: number;
  pricePerResult: number;
  events: { name: string; cls: EventClass; priceUsd: number | null }[];
};

/** Current pricing (pricingInfos[-1]). Only PAY_PER_EVENT can be priced per result; else null. */
export function parsePricing(pricingInfos: unknown, tier: string, known?: Record<string, EventClass>): Pricing | null {
  const list = Array.isArray(pricingInfos) ? pricingInfos : [];
  const cur = list[list.length - 1] as { pricingModel?: string; pricingPerEvent?: { actorChargeEvents?: Record<string, EventPrice> } } | undefined;
  if (!cur || cur.pricingModel !== "PAY_PER_EVENT") return null;
  const evs = cur.pricingPerEvent?.actorChargeEvents ?? {};
  const events = Object.entries(evs).map(([name, ev]) => ({ name, cls: classifyEvent(name, known), priceUsd: eventPrice(ev, tier) }));
  const sum = (cls: EventClass) => events.filter((e) => e.cls === cls).reduce((s, e) => s + (e.priceUsd ?? 0), 0);
  return { startFee: sum("start"), pricePerResult: sum("per_result"), events };
}

export const costPerResult = (startFee: number, perResult: number, n = N_RESULTS) => (startFee + n * perResult) / n;
export const estCost = (startFee: number, perResult: number, n = N_RESULTS) => startFee + n * perResult;

export type Evidence = {
  hasSold30d: boolean;
  hasSold: boolean;
  hasCategory: boolean;
  hasImage: boolean;
  hasLink: boolean;
  hasTrend: boolean;
  needsCookie: boolean;
};

/** Evidence from README + input-schema text. Heuristic by design; config overrides for known facts. */
export function scanEvidence(text: string, requiredInputs: string[] = []): Evidence {
  return {
    hasSold30d: /monthlySold|30天|30-day|30 days|月销|salesTrend/i.test(text),
    hasSold: /sold|销量|已售|月销|sales_?num|bookedCount|units_sold|salesCount|salesVolume/i.test(text),
    hasCategory: /categor|类目|分类|breadcrumb/i.test(text),
    hasImage: /image|img|图片|thumbnail|thumb_url|photo/i.test(text),
    hasLink: /\burl\b|link|链接|productUrl|detailUrl|_url/i.test(text),
    hasTrend: /salesTrend|sales[ _-]?trend|isTrending|销量趋势|销售趋势/i.test(text),
    // README prose is too noisy ("Do I need cookies? No.") — only a REQUIRED cookie input counts;
    // known cases (zhorex product_search) come from the candidate config.
    needsCookie: requiredInputs.some((k) => /cookie/i.test(k)),
  };
}

export const completeness = (e: Evidence) =>
  [e.hasSold30d, e.hasCategory, e.hasImage, e.hasLink, e.hasTrend].filter(Boolean).length;

export type Candidate = Evidence & {
  actorId: string;
  completeness: number;
  costPerResult50: number;
  failRate30d: number | null;
  priced: boolean;
  smokeItemsOut: number | null;
  configExcluded?: string | null;
};

/** Reason key when an actor is disqualified, else null (SPEC §4.6 + smoke evidence). */
export function exclusionReason(c: Candidate): string | null {
  if (c.configExcluded) return c.configExcluded;
  if (c.needsCookie) return "actors.excluded.needsCookie";
  if (c.failRate30d !== null && c.failRate30d > MAX_FAIL_RATE) return "actors.excluded.failRate";
  if (!c.priced) return "actors.excluded.pricingUnknown";
  if (!c.hasImage) return "actors.excluded.noImage";
  if (!c.hasLink) return "actors.excluded.noLink";
  if (!c.hasSold) return "actors.excluded.noSold";
  if (c.smokeItemsOut === 0) return "actors.excluded.smokeEmpty";
  return null;
}

export const verified = (c: Candidate) => (c.smokeItemsOut ?? 0) > 0;

/** Smoke-verified actors first (README evidence is a keyword heuristic; a real run is proof), then highest
 *  completeness, then lowest cost per result. null when nobody qualifies. */
export function chooseActor<T extends Candidate>(cands: T[]): T | null {
  const ok = cands.filter((c) => exclusionReason(c) === null);
  ok.sort((a, b) => Number(verified(b)) - Number(verified(a)) || b.completeness - a.completeness || a.costPerResult50 - b.costPerResult50);
  return ok[0] ?? null;
}
