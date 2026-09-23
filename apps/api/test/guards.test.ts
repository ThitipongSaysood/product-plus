import { describe, expect, it } from "vitest";
import { cronAuthorized } from "../src/common/http.js";
import { planRound } from "../src/domain/budget.js";
import { costFromEvents } from "../src/domain/cost.js";
import { diffRun } from "../src/domain/diff.js";
import {
  bootError,
  capsValid,
  choosable,
  confirmMissing,
  fillEligible,
  isPrivateIp,
  isUniqueViolation,
  needsJson415,
  normalizeImageType,
  RateLimiter,
  schedulesDue,
  smokeCap,
} from "../src/domain/guards.js";
import { computeTrend } from "../src/domain/trend.js";
import type { SnapshotLike } from "../src/domain/types.js";

describe("CSRF / auth guards", () => {
  it("mutating /api calls must be JSON; GET and the Apify webhook are exempt", () => {
    expect(needsJson415("POST", "/api/jobs/pipeline", "application/x-www-form-urlencoded")).toBe(true);
    expect(needsJson415("DELETE", "/api/keywords/x", undefined)).toBe(true);
    expect(needsJson415("POST", "/api/jobs/pipeline", "application/json; charset=utf-8")).toBe(false);
    expect(needsJson415("GET", "/api/products", undefined)).toBe(false);
    expect(needsJson415("POST", "/api/webhooks/apify", "text/plain")).toBe(false);
  });
  it("cron needs the Bearer secret and fails closed when it is unset", () => {
    expect(cronAuthorized({ headers: { authorization: "Bearer s3cret" } }, "s3cret")).toBe(true);
    expect(cronAuthorized({ headers: { authorization: "Bearer nope" } }, "s3cret")).toBe(false);
    expect(cronAuthorized({ headers: {} }, undefined)).toBe(false);
    expect(cronAuthorized({ headers: { authorization: "Bearer x" } }, "")).toBe(false);
  });
  it("paid pipelines need confirm; mock groups don't", () => {
    expect(confirmMissing("apify", undefined)).toBe(true);
    expect(confirmMissing("apify", "true")).toBe(true);
    expect(confirmMissing("apify", true)).toBe(false);
    expect(confirmMissing("mock", undefined)).toBe(false);
  });
  it("production refuses to boot without APP_PASSWORD", () => {
    expect(bootError({ NODE_ENV: "production" })).toMatch(/APP_PASSWORD/);
    expect(bootError({ NODE_ENV: "production", APP_PASSWORD: "x" })).toBeNull();
    expect(bootError({})).toBeNull();
  });
  it("rate limiter: 10 per window per key", () => {
    const rl = new RateLimiter(10, 60_000);
    for (let i = 0; i < 10; i++) expect(rl.allow("ip", 1000)).toBe(true);
    expect(rl.allow("ip", 1000)).toBe(false);
    expect(rl.allow("other", 1000)).toBe(true);
    expect(rl.allow("ip", 61_000)).toBe(true);
  });
});

describe("budget + caps", () => {
  const base = { budgetUsd: 10, spentUsd: 0, inFlightUsd: 0, capUsd: 1, estimates: [0.4, 0.25, 0.3] };
  it("skips on budget when spent + in-flight + estimate exceeds it, or budget is 0 (paused)", () => {
    expect(planRound({ ...base, spentUsd: 9, inFlightUsd: 0.2 })).toMatchObject({ ok: false, reason: "skip.budget" });
    expect(planRound({ ...base, budgetUsd: 0 })).toMatchObject({ ok: false, reason: "skip.budget" });
    expect(planRound({ ...base, budgetUsd: 0, estimates: [0] })).toMatchObject({ ok: false, reason: "skip.budget" });
    expect(planRound({ ...base, capUsd: 0.5 })).toMatchObject({ ok: false, reason: "skip.runCap" });
  });
  it("each share = min(cap share, remaining budget)", () => {
    const r = planRound({ ...base, spentUsd: 8.7, inFlightUsd: 0.3 }); // remaining 1.0, round 0.95
    expect(r.ok).toBe(true);
    r.shares.forEach((s) => expect(s).toBeLessThanOrEqual(1));
    const tight = planRound({ budgetUsd: 10, spentUsd: 9.5, inFlightUsd: 0, capUsd: 1, estimates: [0.4] }); // remaining 0.5, cap share 1
    expect(tight.shares).toEqual([0.5]);
  });
  it("run cap may not exceed a set monthly budget", () => {
    expect(capsValid(10, 1)).toBe(true);
    expect(capsValid(0.5, 1)).toBe(false);
    expect(capsValid(0, 1)).toBe(true); // paused budget: cap irrelevant
  });
  it("smoke cap = start + 5 × per-result × 1.2, at least $0.02", () => {
    expect(smokeCap(0.005, 0.008)).toBe(0.053);
    expect(smokeCap(0.00005, 0.001)).toBe(0.02);
  });
  it("manual choice only for non-excluded, priced, pay-per-event actors", () => {
    const ok = { excluded: null, pricePerResult: 0.005, raw: { pricingModel: "PAY_PER_EVENT" } };
    expect(choosable(ok)).toBe(true);
    expect(choosable({ ...ok, excluded: "actors.excluded.failRate" })).toBe(false);
    expect(choosable({ ...ok, pricePerResult: 0 })).toBe(false);
    expect(choosable({ ...ok, raw: { pricingModel: "FLAT_PRICE_PER_MONTH" } })).toBe(false);
  });
  it("actual cost from charged events × evaluated prices; unknown event → null", () => {
    const prices = [{ name: "apify-actor-start", priceUsd: 0.005 }, { name: "product-result", priceUsd: 0.008 }];
    expect(costFromEvents({ "apify-actor-start": 1, "product-result": 30 }, prices)).toBe(0.245);
    expect(costFromEvents({ "mystery": 3 }, prices)).toBeNull();
    expect(costFromEvents(null, prices)).toBeNull();
  });
});

describe("concurrency / schedules", () => {
  it("detects unique violations wrapped by drizzle", () => {
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation(new Error("x"))).toBe(false);
  });
  it("daily every day, weekly only on Bangkok Mondays", () => {
    expect(schedulesDue(new Date("2026-09-27T22:00:00Z"))).toEqual(["daily", "weekly"]); // Mon 05:00 BKK
    expect(schedulesDue(new Date("2026-09-28T22:00:00Z"))).toEqual(["daily"]); // Tue 05:00 BKK
  });
});

describe("media safety", () => {
  it("only raster image types, normalized", () => {
    expect(normalizeImageType("IMAGE/JPEG; charset=binary")).toBe("image/jpeg");
    expect(normalizeImageType("image/webp")).toBe("image/webp");
    expect(normalizeImageType("image/svg+xml")).toBeNull();
    expect(normalizeImageType("text/html")).toBeNull();
    expect(normalizeImageType(null)).toBeNull();
  });
  it("blocks private / loopback / link-local / CGNAT / ULA addresses", () => {
    for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "nothost"])
      expect(isPrivateIp(a), a).toBe(true);
    for (const a of ["8.8.8.8", "47.246.1.1", "2606:4700::1111"]) expect(isPrivateIp(a), a).toBe(false);
  });
});

describe("diff across keywords / trend / fill", () => {
  it("a product seen by another keyword's run after this keyword's last ingest is not absent", () => {
    const prev = new Date("2026-09-10T00:00:00Z");
    const ex = [
      { id: "1", externalId: "a", missedRuns: 1, lastSeenAt: new Date("2026-09-12T00:00:00Z") }, // seen elsewhere
      { id: "2", externalId: "b", missedRuns: 1, lastSeenAt: prev }, // only our previous run saw it
    ];
    const d = diffRun(ex, [], true, prev);
    expect(d.gone.map((e) => e.id)).toEqual(["2"]);
    expect(d.missing).toEqual([]);
  });
  it("without comparable sold, only a rank move ≥ 10 is a trend", () => {
    const s = (day: number, rank: number, period: SnapshotLike["soldPeriod"]): SnapshotLike => ({
      takenAt: new Date(Date.UTC(2026, 8, day)), rank, price: 1, soldCount: 5, soldPeriod: period, soldLowerBound: false,
    });
    expect(computeTrend([s(1, 20, "lifetime"), s(8, 15, "30d")]).label).toBe("flat");
    expect(computeTrend([s(1, 20, "lifetime"), s(8, 9, "30d")]).label).toBe("rising");
    expect(computeTrend([s(1, 5, "lifetime"), s(8, 16, "30d")]).label).toBe("falling");
  });
  it("fill retries undecided products only after 7 days", () => {
    const now = new Date("2026-09-24T00:00:00Z");
    expect(fillEligible({ categorySource: null, categoryTaggedAt: null }, now)).toBe(true);
    expect(fillEligible({ categorySource: null, categoryTaggedAt: new Date("2026-09-20T00:00:00Z") }, now)).toBe(false);
    expect(fillEligible({ categorySource: null, categoryTaggedAt: new Date("2026-09-16T00:00:00Z") }, now)).toBe(true);
    expect(fillEligible({ categorySource: "rules", categoryTaggedAt: null }, now)).toBe(false);
  });
});
