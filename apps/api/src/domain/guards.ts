// Pure guards used by the HTTP layer and jobs (unit-tested; no Nest / DB here).
import { isIP } from "node:net";
import type { Schedule, SourceMode } from "@pp/contracts";

/** CSRF: cross-site forms/img/navigation cannot send application/json, so every mutating /api call must. */
export function needsJson415(method: string, path: string, contentType: string | undefined): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return false;
  if (!path.startsWith("/api/") || path === "/api/webhooks/apify") return false;
  return !/^application\/json\b/i.test(contentType ?? "");
}

/** Paid pipeline rounds need an explicit confirm; mock groups may omit it. */
export const confirmMissing = (mode: SourceMode, confirm: unknown) => mode === "apify" && confirm !== true;

/** Refuse to boot an unprotected production api. */
export function bootError(env: Record<string, string | undefined>): string | null {
  return env.NODE_ENV === "production" && !env.APP_PASSWORD ? "APP_PASSWORD must be set when NODE_ENV=production — refusing to start." : null;
}

/** Fixed-window per-key limiter (in memory; ponytail: per-process only — move to Redis if the api is scaled out). */
export class RateLimiter {
  private hits = new Map<string, { start: number; n: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}
  allow(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h || now - h.start >= this.windowMs) {
      this.hits.set(key, { start: now, n: 1 });
      if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (now - v.start >= this.windowMs) this.hits.delete(k);
      return true;
    }
    h.n++;
    return h.n <= this.limit;
  }
}

/** Schedules due at the 05:00 Asia/Bangkok tick: daily always, weekly on Bangkok Mondays. */
export function schedulesDue(now: Date): Schedule[] {
  const bkkDay = new Date(now.getTime() + 7 * 3_600_000).getUTCDay();
  return bkkDay === 1 ? ["daily", "weekly"] : ["daily"];
}

/** Postgres unique violation (drizzle wraps the driver error in `cause`). */
export function isUniqueViolation(e: unknown): boolean {
  const x = e as { code?: string; cause?: { code?: string } } | null;
  return x?.code === "23505" || x?.cause?.code === "23505";
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
/** Remote images only: raster types we can serve safely (never SVG/HTML). */
export function normalizeImageType(ct: string | null | undefined): string | null {
  const t = (ct ?? "").split(";")[0].trim().toLowerCase();
  const fixed = t === "image/jpg" ? "image/jpeg" : t;
  return IMAGE_TYPES.has(fixed) ? fixed : null;
}

/** SSRF: loopback, private, link-local, CGNAT, unique-local, unspecified, multicast, mapped v4. */
export function isPrivateIp(addr: string): boolean {
  const v = isIP(addr);
  if (v === 4) {
    const [a, b] = addr.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (v === 6) {
    const s = addr.toLowerCase();
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return s === "::" || s === "::1" || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || s.startsWith("64:ff9b:");
  }
  return true; // not an IP → treat as unsafe
}

/** "fill" retries a product only if it was never tried or its last try is older than 7 days. */
export const FILL_RETRY_MS = 7 * 86_400_000;
export const fillEligible = (p: { categorySource: string | null; categoryTaggedAt: Date | null }, now: Date) =>
  p.categorySource === null && (p.categoryTaggedAt === null || now.getTime() - p.categoryTaggedAt.getTime() >= FILL_RETRY_MS);

/** Actor may be chosen manually only if it was not excluded and has per-event pricing. */
export const choosable = (r: { excluded: string | null; pricePerResult: number; raw: unknown }) =>
  r.excluded === null && r.pricePerResult > 0 && (r.raw as { pricingModel?: string } | null)?.pricingModel === "PAY_PER_EVENT";

/** Smoke-test cap: start + 5 results with 20% headroom, never below $0.02. */
export const smokeCap = (startFee: number, perResult: number) => Math.max(0.02, Math.round((startFee + 5 * perResult * 1.2) * 10000) / 10000);

/** Group caps: while a budget is set, a single round may not be allowed to spend more than the month. */
export const capsValid = (budgetUsd: number, runCapUsd: number) => !(budgetUsd > 0) || runCapUsd <= budgetUsd;
