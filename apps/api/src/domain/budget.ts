// Monthly spend guard. The month is the Asia/Bangkok calendar month (UTC+7, no DST).
const BKK_MS = 7 * 3_600_000;
export const WARN_AT = 0.8;

/** UTC instant of 00:00 on the 1st of the current Bangkok month. */
export function monthStartBangkok(now: Date): Date {
  const local = new Date(now.getTime() + BKK_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - BKK_MS);
}

/** over is EXACTLY the condition the trigger uses to skip (spent ≥ budget). Budget ≤ 0 = spending paused. */
export function budgetState(spent: number, budget: number) {
  if (!(budget > 0)) return { over: true, warn: true, pct: null as number | null };
  return { over: spent >= budget, warn: spent >= WARN_AT * budget, pct: spent / budget };
}

/** Whole-round guard: monthly budget (spent + in-flight provisional costs + this round's estimate) first,
 *  then the per-round cap. Each actor's maxTotalChargeUsd = min(its cap share, remaining budget). */
export function planRound(i: { budgetUsd: number; spentUsd: number; inFlightUsd: number; capUsd: number; estimates: number[] }) {
  const total = i.estimates.reduce((s, e) => s + e, 0);
  const committed = i.spentUsd + i.inFlightUsd;
  if (!(i.budgetUsd > 0) || committed >= i.budgetUsd || committed + total > i.budgetUsd)
    return { ok: false as const, reason: "skip.budget", total, shares: [] as number[] };
  const split = splitRunCap(i.capUsd, i.estimates);
  if (!split.ok) return { ok: false as const, reason: "skip.runCap", total, shares: [] as number[] };
  const remaining = Math.floor((i.budgetUsd - committed) * 10000) / 10000;
  return { ok: true as const, reason: null, total, shares: split.shares.map((s) => Math.min(s, remaining)) };
}

/** Per-round cap: the round is skipped when the estimate exceeds the cap; otherwise each actor gets
 *  cap × its share of the estimate as Apify's maxTotalChargeUsd (never below its own estimate). */
export function splitRunCap(capUsd: number, estimates: number[]) {
  const total = estimates.reduce((s, e) => s + e, 0);
  if (total > capUsd) return { ok: false as const, total, shares: [] as number[] };
  const shares = estimates.map((e) => (total > 0 ? Math.max(e, Math.floor((capUsd * e * 10000) / total) / 10000) : 0));
  return { ok: true as const, total, shares };
}
