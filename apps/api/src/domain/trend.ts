// Trend from our own snapshots (handoff §10.3) + change-event thresholds (§10.4). Pure.
import type { EventKind, TrendDetail } from "@pp/contracts";
import type { SnapshotLike } from "./types.js";

const DAY = 86_400_000;
export const RANK_UP_MIN = 10;
export const PRICE_DROP_MIN = 0.15;
// ponytail: fixed surge thresholds; make them per-group settings if users ask.
export const SURGE_MIN_UNITS = 50;
export const SURGE_MIN_RATIO = 0.25;

/** Units of the 7 days before the last full day vs the 7 days before that. The last salesTrend point is
 *  today's partial day (always ~0 in real Douyin rows) so it is excluded. */
export function douyinRatio(trend: { date: string; units: number }[] | null | undefined): number | null {
  if (!trend || trend.length < 15) return null;
  const full = [...trend].sort((a, b) => a.date.localeCompare(b.date)).slice(0, -1);
  const sum = (xs: { units: number }[]) => xs.reduce((s, p) => s + p.units, 0);
  const last7 = sum(full.slice(-7));
  const prev7 = sum(full.slice(-14, -7));
  return prev7 > 0 ? Math.round((last7 / prev7) * 1000) / 1000 : null;
}

/** Sold values are comparable only with the same period and the same lower-bound flag. */
function comparable(a: SnapshotLike, b: SnapshotLike) {
  return a.soldCount !== null && b.soldCount !== null && a.soldPeriod === b.soldPeriod && a.soldLowerBound === b.soldLowerBound;
}

// ponytail: fixed ±20% band and 14-unit floor; tune per group if the labels feel noisy.
export const DOUYIN_RATIO_BAND = 0.2;
export const DOUYIN_MIN_UNITS = 14;

/** Trend label from Douyin's own 30-day daily series (real platform data, usable from the first snapshot).
 *  Too few units in the 14 compared days → insufficient_history, not "flat". */
export function douyinLabel(trend: { date: string; units: number }[] | null | undefined): TrendDetail["label"] {
  const ratio = douyinRatio(trend);
  if (ratio === null || !trend) return "insufficient_history";
  const full = [...trend].sort((a, b) => a.date.localeCompare(b.date)).slice(0, -1).slice(-14);
  if (full.reduce((s, p) => s + p.units, 0) < DOUYIN_MIN_UNITS) return "insufficient_history";
  return ratio >= 1 + DOUYIN_RATIO_BAND ? "rising" : ratio <= 1 - DOUYIN_RATIO_BAND ? "falling" : "flat";
}

export function computeTrend(snapshots: SnapshotLike[]): TrendDetail {
  const snaps = [...snapshots].sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());
  const n = snaps.length;
  if (n < 2)
    return { label: douyinLabel(snaps[0]?.salesTrend), deltaSold: null, deltaRank: null, douyinRatio: douyinRatio(snaps[0]?.salesTrend), snapshotCount: n };
  const latest = snaps[n - 1];
  const target = latest.takenAt.getTime() - 7 * DAY;
  let base = snaps[0];
  for (const s of snaps.slice(0, -1))
    if (Math.abs(s.takenAt.getTime() - target) < Math.abs(base.takenAt.getTime() - target)) base = s;
  const deltaSold = comparable(latest, base) ? latest.soldCount! - base.soldCount! : null;
  const deltaRank = latest.rank !== null && base.rank !== null ? base.rank - latest.rank : null; // + = climbed
  const ratio = douyinRatio(latest.salesTrend);

  let label: TrendDetail["label"] = "flat";
  if (deltaSold !== null && deltaSold !== 0) {
    if (deltaSold > 0 && (deltaRank ?? 0) >= 0) label = "rising";
    else if (deltaSold < 0 && (deltaRank ?? 0) <= 0) label = "falling";
  } else if (deltaSold === null && deltaRank !== null && Math.abs(deltaRank) >= RANK_UP_MIN) {
    label = deltaRank > 0 ? "rising" : "falling"; // without comparable sold, only a big rank move counts
  }
  return { label, deltaSold, deltaRank, douyinRatio: ratio, snapshotCount: n };
}

export type DetectedEvent = { kind: EventKind; detail: Record<string, unknown> };

/** Events between the previous snapshot and the new one (new/gone come from the diff engine). */
export function detectEvents(prev: SnapshotLike | null, cur: SnapshotLike): DetectedEvent[] {
  if (!prev) return [];
  const out: DetectedEvent[] = [];
  if (comparable(prev, cur)) {
    const delta = cur.soldCount! - prev.soldCount!;
    if (delta >= SURGE_MIN_UNITS && prev.soldCount! > 0 && delta / prev.soldCount! >= SURGE_MIN_RATIO)
      out.push({ kind: "sales_surge", detail: { from: prev.soldCount, to: cur.soldCount, period: cur.soldPeriod } });
  }
  if (prev.rank !== null && cur.rank !== null && prev.rank - cur.rank >= RANK_UP_MIN)
    out.push({ kind: "rank_up", detail: { from: prev.rank, to: cur.rank } });
  if (prev.price !== null && cur.price !== null && prev.price > 0 && (prev.price - cur.price) / prev.price >= PRICE_DROP_MIN)
    out.push({ kind: "price_drop", detail: { from: prev.price, to: cur.price } });
  return out;
}
