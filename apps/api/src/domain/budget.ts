// Monthly spend guard. The month is the Asia/Bangkok calendar month (UTC+7, no DST).
const BKK_MS = 7 * 3_600_000;
export const WARN_AT = 0.8;

/** UTC instant of 00:00 on the 1st of the current Bangkok month. */
export function monthStartBangkok(now: Date): Date {
  const local = new Date(now.getTime() + BKK_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - BKK_MS);
}

/** over is EXACTLY the condition the trigger uses to skip (spent ≥ budget). Budget ≤ 0 = no cap. */
export function budgetState(spent: number, budget: number) {
  if (!(budget > 0)) return { over: false, warn: false, pct: null as number | null };
  return { over: spent >= budget, warn: spent >= WARN_AT * budget, pct: spent / budget };
}

/** Per-round cap: the round is skipped when the estimate exceeds the cap; otherwise each actor gets
 *  cap × its share of the estimate as Apify's maxTotalChargeUsd (never below its own estimate). */
export function splitRunCap(capUsd: number, estimates: number[]) {
  const total = estimates.reduce((s, e) => s + e, 0);
  if (total > capUsd) return { ok: false as const, total, shares: [] as number[] };
  const shares = estimates.map((e) => (total > 0 ? Math.max(e, Math.floor((capUsd * e * 10000) / total) / 10000) : 0));
  return { ok: true as const, total, shares };
}
