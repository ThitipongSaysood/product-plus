// Pure guards used by the HTTP layer and jobs (unit-tested; no Nest / DB here).
import { isIP } from "node:net";
import type { Schedule, SourceMode } from "@pp/contracts";

/** CSRF: cross-site forms/img/navigation cannot send application/json, so every mutating request must
 *  (any path, any case — Express routing is case-insensitive). Only the Apify webhook is exempt. */
export function needsJson415(method: string, path: string, contentType: string | undefined): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return false;
  if (path.toLowerCase().replace(/\/+$/, "") === "/api/webhooks/apify") return false;
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

/** Bangkok is UTC+7 the whole year, so shifting and reading the UTC parts is exact — no DST table. */
export function bangkok(now: Date): { hour: number; weekday: number; dayStart: Date } {
  const d = new Date(now.getTime() + 7 * 3_600_000);
  const midnightBkk = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 7 * 3_600_000;
  return { hour: d.getUTCHours(), weekday: d.getUTCDay(), dayStart: new Date(midnightBkk) };
}

export type ScheduleSlot = { schedule: Schedule; scheduleHour: number; scheduleWeekday: number };

/** Is this the group's slot right now? Exact hour, no catch-up: a catch-up would start a paid actor
 *  round at an hour nobody chose, which is worse than missing one round if the process was down. */
export function isScheduleSlot(g: ScheduleSlot, now: Date): boolean {
  if (g.schedule !== "daily" && g.schedule !== "weekly") return false;
  const { hour, weekday } = bangkok(now);
  if (hour !== g.scheduleHour) return false;
  return g.schedule === "daily" || weekday === g.scheduleWeekday;
}

/**
 * Earliest start time that still counts as "already ran", so the slot is not taken twice.
 *
 * A rolling 12h window was enough while every group fired at the same 05:00 tick, but once the hour is
 * user-editable it both double-charges and silently skips: moving a daily group from 05:00 to 22:00 at
 * midday leaves 17h between the two, so it runs twice the same day; moving it back leaves 7h, so the
 * next morning is skipped. Anchor on the Bangkok day instead.
 */
export function repeatWindowStart(schedule: Schedule, now: Date): Date {
  return schedule === "weekly" ? new Date(now.getTime() - 6 * 24 * 3_600_000) : bangkok(now).dayStart;
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

function privateV4(addr: string): boolean {
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

/** "::ffff:7f00:1" / "::127.0.0.1" / "[fe80::1%en0]" → 8 hextets (null if unparsable). */
function v6Groups(addr: string): number[] | null {
  let s = addr.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const dotted = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted[1].split(".").map(Number);
    s = s.slice(0, -dotted[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const fill = s.includes("::") ? 8 - h.length - t.length : 0;
  const parts = [...h, ...Array(Math.max(fill, 0)).fill("0"), ...t];
  if (parts.length !== 8 || parts.some((p) => !/^[0-9a-f]{1,4}$/.test(p))) return null;
  return parts.map((p) => parseInt(p, 16));
}

/** SSRF: loopback, private, link-local, CGNAT, unique-local, unspecified, multicast — for IPv4, and for
 *  IPv6 including v4-mapped (::ffff:0:0/96), v4-compatible (::/96), NAT64 and 6to4 embeddings. */
export function isPrivateIp(addr: string): boolean {
  const host = addr.replace(/^\[|\]$/g, "").split("%")[0];
  const v = isIP(host);
  if (v === 4) return privateV4(host);
  if (v !== 6) return true; // not an IP → unsafe
  const g = v6Groups(host);
  if (!g) return true;
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  const zero = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zero(5) && (g[5] === 0xffff || g[5] === 0)) return privateV4(v4(g[6], g[7])); // mapped / compat / :: / ::1
  if (g[0] === 0x64 && g[1] === 0xff9b) return true; // NAT64
  if (g[0] === 0x2002) return privateV4(v4(g[1], g[2])); // 6to4
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00;
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

/** URL slug from a display name. Thai/Chinese names keep no ASCII at all, so "" is a normal result —
 *  the caller then has to ask for an explicit slug instead of inventing one. */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // "Café" → "Cafe"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
}

/** Client IP for rate limiting behind the web proxy: trust X-Forwarded-For only when the direct peer is a
 *  loopback/private hop, then take the right-most address that is not itself such a hop. */
export function clientIp(remote: string | undefined, xff: string | string[] | undefined): string {
  const peer = (remote ?? "").replace(/^::ffff:/, "");
  if (!peer || !isPrivateIp(peer) || !xff) return peer || "?";
  const hops = (Array.isArray(xff) ? xff.join(",") : xff).split(",").map((x) => x.trim()).filter(Boolean);
  for (let i = hops.length - 1; i >= 0; i--) if (!isPrivateIp(hops[i]) || i === 0) return hops[i];
  return peer;
}
