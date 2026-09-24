// The brief handed to the brand-scout model: everything that can be computed is computed here, so the
// model is left with the judgements a number cannot make.
//
// The reason this split matters is in the data. Measured on the real group of 135 listings:
//   • sold counts arrive in four units that cannot be compared — 1688 "unknown" (looks cumulative),
//     douyin 30d, xhs/temu lifetime — and 26 listings carry no sold number at all
//   • 118 of 135 have no trend, and that is structural: only the douyin actor ships a daily series,
//     the other platforms need a second snapshot of our own
// A single ranked list over that would imply a common scale that does not exist. So sold is ranked
// only inside one (platform, period) bucket, every candidate states its period, and anything unknown
// is said out loud rather than omitted — an absent field reads as "neutral" to a model, which is how
// "no data" turns into "trending well".
import type { Locale, Platform, SoldPeriod, TaxonomyEntry, TrendLabel } from "@pp/contracts";
import { brandMarks } from "./brand.js";
import { UNCLASSIFIED } from "./categorize.js";

export type BriefInput = {
  id: string;
  platform: Platform;
  title: string | null;
  titleTh: string | null;
  price: number | null;
  entryPrice: number | null;
  currency: string | null;
  moq: number | null;
  unit: string | null;
  soldCount: number | null;
  soldPeriod: SoldPeriod;
  soldLowerBound: boolean;
  trend: TrendLabel;
  categoryKey: string;
  shopName: string | null;
  orderCount: number | null;
};

export type Candidate = {
  id: string;
  platform: Platform;
  title: string;
  categoryKey: string;
  /** What one unit costs at the seller's minimum order, when a ladder says so; else the listed price. */
  buyPrice: number | null;
  currency: string;
  moq: number | null;
  unit: string | null;
  soldCount: number;
  soldPeriod: SoldPeriod;
  /** True when the platform only says "10万+" — the real figure is higher by an unknown amount. */
  soldIsFloor: boolean;
  /** Rank of soldCount inside this candidate's own (platform, period) bucket, 1 = highest. */
  soldRankInBucket: number;
  bucketSize: number;
  /** False for everything but douyin right now; the model must not claim momentum when false. */
  trendKnown: boolean;
  trend: TrendLabel | null;
  /** Trademarks the seller's own title claims. Computed, not left to the model to spot. */
  brandMarks: string[];
  shopName: string | null;
  orderCount: number | null;
};

export type Bucket = {
  platform: Platform;
  soldPeriod: SoldPeriod;
  count: number;
  /** Sold numbers are only comparable inside one bucket — this is what makes that legible. */
  soldMin: number;
  soldMax: number;
  trendKnown: boolean;
};

export type Brief = {
  groupName: string;
  /** The language the reader has the app in — the model answers in this one. */
  lang: Locale;
  candidates: Candidate[];
  buckets: Bucket[];
  categories: { key: string; label: string; count: number; medianBuyPrice: number | null; currency: string }[];
  excluded: { noSoldCount: number; noPrice: number; total: number };
  /** Plain statements of what this data cannot support, repeated to the model verbatim. */
  limits: string[];
};

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 100) / 100;
};

/** What a buyer actually pays per unit: the ladder's first rung when there is one, else the listing price. */
const buyPriceOf = (p: BriefInput) => p.entryPrice ?? p.price;

export const bucketKey = (platform: Platform, period: SoldPeriod) => `${platform}|${period}`;

export function buildBrief(rows: BriefInput[], taxonomy: TaxonomyEntry[], groupName: string, lang: Locale = "th", limit = 60): Brief {
  // A listing with no sold figure gives the model nothing to weigh; a listing with no price cannot be
  // costed. Both are dropped, and the count is reported so the omission is visible rather than silent.
  const noSold = rows.filter((r) => r.soldCount === null).length;
  const noPrice = rows.filter((r) => r.soldCount !== null && buyPriceOf(r) === null).length;
  const usable = rows.filter((r) => r.soldCount !== null && buyPriceOf(r) !== null);

  const byBucket = new Map<string, BriefInput[]>();
  for (const r of usable) {
    const k = bucketKey(r.platform, r.soldPeriod);
    byBucket.set(k, [...(byBucket.get(k) ?? []), r]);
  }

  const buckets: Bucket[] = [];
  const ranked = new Map<string, { rank: number; size: number }>();
  for (const [, rs] of byBucket) {
    const sorted = [...rs].sort((a, b) => b.soldCount! - a.soldCount!);
    sorted.forEach((r, i) => ranked.set(r.id, { rank: i + 1, size: sorted.length }));
    buckets.push({
      platform: sorted[0].platform,
      soldPeriod: sorted[0].soldPeriod,
      count: sorted.length,
      soldMin: sorted[sorted.length - 1].soldCount!,
      soldMax: sorted[0].soldCount!,
      trendKnown: sorted.some((r) => r.trend !== "insufficient_history"),
    });
  }
  buckets.sort((a, b) => b.count - a.count);

  // Take the strongest few from every bucket rather than the strongest overall: an overall cut would be
  // decided by whichever platform happens to report the biggest raw numbers, which is 1688 by a factor
  // of 700 and means nothing.
  const perBucket = Math.max(1, Math.floor(limit / Math.max(1, byBucket.size)));
  const candidates: Candidate[] = [];
  for (const [, rs] of byBucket) {
    const top = [...rs].sort((a, b) => b.soldCount! - a.soldCount!).slice(0, perBucket);
    for (const r of top) {
      const rk = ranked.get(r.id)!;
      candidates.push({
        id: r.id,
        platform: r.platform,
        title: r.titleTh?.trim() || r.title?.trim() || "",
        categoryKey: r.categoryKey,
        buyPrice: buyPriceOf(r),
        currency: r.currency ?? "CNY",
        moq: r.moq,
        unit: r.unit,
        soldCount: r.soldCount!,
        soldPeriod: r.soldPeriod,
        soldIsFloor: r.soldLowerBound,
        soldRankInBucket: rk.rank,
        bucketSize: rk.size,
        trendKnown: r.trend !== "insufficient_history",
        trend: r.trend === "insufficient_history" ? null : r.trend,
        brandMarks: brandMarks(r.title),
        shopName: r.shopName,
        orderCount: r.orderCount,
      });
    }
  }

  const labelOf = (key: string) => taxonomy.find((t) => t.key === key)?.en ?? key;
  const catKeys = [...new Set(rows.map((r) => r.categoryKey))];
  const categories = catKeys
    .map((key) => {
      const rs = rows.filter((r) => r.categoryKey === key);
      return {
        key,
        label: key === UNCLASSIFIED ? "unclassified" : labelOf(key),
        count: rs.length,
        medianBuyPrice: median(rs.map(buyPriceOf).filter((x): x is number => x !== null)),
        currency: rs.find((r) => r.currency)?.currency ?? "CNY",
      };
    })
    .sort((a, b) => b.count - a.count);

  const trendable = usable.filter((r) => r.trend !== "insufficient_history").length;
  const limits = [
    "Sold counts are NOT comparable across platforms or periods. Each candidate carries its own period " +
      "(30d / lifetime / unknown) and a rank that is only valid inside its own platform+period bucket. " +
      "Never place a 30d figure and a lifetime figure on one scale, and never restate a lifetime figure " +
      "as a monthly one.",
    `Trend is unknown for most listings: ${trendable} of ${usable.length} have one. Only the douyin ` +
      "actor reports a daily series; the other platforms need a second collection round. Where " +
      "trendKnown is false there is no momentum information at all — say so rather than guessing.",
    `${noSold} listings were left out because the platform gave no sold figure, and ${noPrice} because ` +
      "they had no usable price. They are not weak candidates; they are unmeasured ones.",
    "soldIsFloor means the platform published a floor such as \"100K+\". The true figure is higher by an " +
      "unknown amount, so such a listing cannot be ranked precisely against an exact one.",
  ];

  return {
    groupName,
    lang,
    candidates,
    buckets,
    categories,
    excluded: { noSoldCount: noSold, noPrice, total: noSold + noPrice },
    limits,
  };
}
