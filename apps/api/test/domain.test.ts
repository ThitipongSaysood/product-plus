import { describe, expect, it } from "vitest";
import { extractAttrs } from "../src/domain/attrs.js";
import { budgetState, monthStartBangkok, splitRunCap } from "../src/domain/budget.js";
import { categorize, DEFAULT_TAXONOMY, fromRules } from "../src/domain/categorize.js";
import { chooseActor, classifyEvent, completeness, costPerResult, eventPrice, exclusionReason, parsePricing, scanEvidence, type Candidate } from "../src/domain/cost.js";
import { diffRun } from "../src/domain/diff.js";
import { fill } from "../src/domain/fill.js";
import { assessRun } from "../src/domain/gate.js";
import { NOTE } from "../src/domain/notes.js";
import { computeTrend, detectEvents, douyinLabel, douyinRatio } from "../src/domain/trend.js";
import type { SnapshotLike } from "../src/domain/types.js";

describe("gate", () => {
  const g = { platform: "douyin", itemsIn: 50, itemsOut: 50, prevSuccessfulCount: 50 };
  it("actor failure → failed, no retirements", () => {
    expect(assessRun({ ...g, actorFailedStatus: "FAILED" })).toEqual({ status: "failed", note: "Apify reported FAILED.", processRetirements: false });
  });
  it("0 rows (Temu blocked) → suspect even on the first run", () => {
    const r = assessRun({ ...g, platform: "temu", itemsIn: 0, itemsOut: 0, prevSuccessfulCount: null });
    expect(r).toMatchObject({ status: "suspect", processRetirements: false });
    expect(r.note).toBe(NOTE.noRows("temu"));
  });
  it("rows but none readable → suspect", () => {
    expect(assessRun({ ...g, itemsOut: 0 }).status).toBe("suspect");
  });
  it("below 40% of the previous successful run → suspect; exactly 40% passes", () => {
    expect(assessRun({ ...g, itemsIn: 19, itemsOut: 19 })).toMatchObject({ status: "suspect", note: NOTE.belowFloor(19, 50) });
    expect(assessRun({ ...g, itemsIn: 20, itemsOut: 20 }).status).toBe("succeeded");
  });
  it("partial read keeps succeeded with a drift note", () => {
    expect(assessRun({ ...g, itemsOut: 48 })).toEqual({ status: "succeeded", note: "Read 48 of 50 rows.", processRetirements: true });
  });
});

describe("diff", () => {
  const ex = [
    { id: "1", externalId: "a", missedRuns: 0 },
    { id: "2", externalId: "b", missedRuns: 1 },
    { id: "3", externalId: "c", missedRuns: 0 },
  ];
  it("new / kept / missing / gone after 2 misses", () => {
    const d = diffRun(ex, ["a", "z", "z"], true);
    expect(d.newIds).toEqual(["z"]);
    expect(d.kept.map((e) => e.id)).toEqual(["1"]);
    expect(d.missing.map((e) => e.id)).toEqual(["3"]);
    expect(d.gone.map((e) => e.id)).toEqual(["2"]);
  });
  it("nothing goes missing when the gate did not pass", () => {
    const d = diffRun(ex, ["a"], false);
    expect(d.missing).toEqual([]);
    expect(d.gone).toEqual([]);
  });
});

const snap = (day: number, sold: number | null, rank: number | null, extra: Partial<SnapshotLike> = {}): SnapshotLike => ({
  takenAt: new Date(Date.UTC(2026, 8, day)),
  rank,
  price: 10,
  soldCount: sold,
  soldPeriod: "lifetime",
  soldLowerBound: false,
  ...extra,
});

describe("trend", () => {
  it("fewer than 2 snapshots → insufficient_history (never flat/0)", () => {
    expect(computeTrend([snap(1, 5, 1)])).toMatchObject({ label: "insufficient_history", deltaSold: null, snapshotCount: 1 });
    expect(computeTrend([]).label).toBe("insufficient_history");
  });
  it("single Douyin snapshot → label from its own 30-day salesTrend (partial last day ignored)", () => {
    const series = (prev: number, last: number) =>
      [...Array(22).fill(prev), ...Array(7).fill(last), 0].map((units, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, units }));
    expect(douyinLabel(series(10, 20))).toBe("rising");
    expect(douyinLabel(series(20, 10))).toBe("falling");
    expect(douyinLabel(series(10, 11))).toBe("flat");
    expect(douyinLabel(series(0.5, 0.5))).toBe("insufficient_history"); // too few units to call it
    expect(computeTrend([snap(1, 500, 1, { soldPeriod: "30d", salesTrend: series(10, 20) })]).label).toBe("rising");
  });
  it("sold up and rank not worse → rising; compares with the snapshot nearest to 7 days ago", () => {
    const t = computeTrend([snap(1, 100, 10), snap(9, 150, 8), snap(16, 200, 5)]);
    expect(t).toMatchObject({ label: "rising", deltaSold: 50, deltaRank: 3, snapshotCount: 3 });
  });
  it("sold down and rank down → falling", () => {
    expect(computeTrend([snap(1, 300, 2, { soldPeriod: "30d" }), snap(8, 200, 9, { soldPeriod: "30d" })]).label).toBe("falling");
  });
  it("no delta across different periods or lower-bound flags", () => {
    expect(computeTrend([snap(1, 100, null), snap(8, 200, null, { soldPeriod: "30d" })])).toMatchObject({ deltaSold: null, label: "flat" });
    expect(computeTrend([snap(1, 1000, 3, { soldLowerBound: true }), snap(8, 2000, 3)]).deltaSold).toBeNull();
  });
  it("douyin ratio excludes the partial last day", () => {
    const pts = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, units: i < 22 ? 10 : 20 }));
    pts[29].units = 0; // today, partial
    expect(douyinRatio(pts)).toBe(2);
    expect(douyinRatio(pts.slice(0, 5))).toBeNull();
  });
  it("events: sales_surge, rank_up ≥ 10, price_drop ≥ 15%", () => {
    const kinds = detectEvents(snap(1, 100, 25, { price: 20 }), snap(8, 160, 15, { price: 17 })).map((e) => e.kind);
    expect(kinds.sort()).toEqual(["price_drop", "rank_up", "sales_surge"]);
    expect(detectEvents(snap(1, 100, 25, { price: 20 }), snap(8, 120, 16, { price: 17.2 }))).toEqual([]);
    expect(detectEvents(null, snap(8, 1, 1))).toEqual([]);
  });
});

describe("categorize", () => {
  const map = new Map([["1688|数码、电脑 > 智能设备 > 智能手表保护壳", "accessory_case"]]);
  it("platform map wins over rules (longest prefix)", () => {
    expect(categorize({ platform: "1688", title: "硅胶", platformCategoryPath: ["数码、电脑", "智能设备", "智能手表保护壳", "x"] }, map, DEFAULT_TAXONOMY)).toEqual({ key: "accessory_case", source: "platform" });
  });
  it("earliest keyword in the title wins", () => {
    expect(fromRules("适用苹果手表表带applewatch s11/10/9米兰尼斯表带", DEFAULT_TAXONOMY)).toBe("material_metal");
    expect(fromRules("磨砂透明膜S11背膜全苹果手表保护膜", DEFAULT_TAXONOMY)).toBe("accessory_case");
    expect(fromRules("海盐奶冻·珍珠蓝玉髓白水晶表带 手工串珠定制", DEFAULT_TAXONOMY)).toBe("style_beaded");
  });
  it("a tie at the same position is undecided → null (unclassified)", () => {
    expect(fromRules("Solo Loop band", DEFAULT_TAXONOMY)).toBeNull();
    expect(categorize({ platform: "xhs", title: "小蛮腰表带", platformCategoryPath: null }, map, DEFAULT_TAXONOMY)).toBeNull();
  });
});

describe("attrs", () => {
  it("sizes 38–49mm only", () => {
    expect(extractAttrs("表带 41/45mm 49毫米 14mm")).toEqual({ sizes: ["41mm", "45mm", "49mm"] });
  });
  it("Ultra / SE / Series N from real titles", () => {
    expect(extractAttrs("适用苹果手表表带applewatch s11/10/9米兰尼斯表带iwatch ultra2").models).toEqual(["Series 10", "Series 11", "Series 9", "Ultra 2"]);
    expect(extractAttrs("粉色大小星星适用Apple苹果iwatchS12/11/10小蛮腰S9/8手表表带SE").models).toEqual(["SE", "Series 10", "Series 11", "Series 12", "Series 8", "Series 9"]);
    expect(extractAttrs("Band for Apple Watch Series 9 Ultra")).toEqual({ models: ["Series 9", "Ultra"] });
    expect(extractAttrs(null)).toEqual({});
  });
});

describe("budget", () => {
  it("month starts at 00:00 Bangkok (17:00 UTC the day before)", () => {
    expect(monthStartBangkok(new Date("2026-09-30T18:00:00Z")).toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(monthStartBangkok(new Date("2026-09-30T16:59:00Z")).toISOString()).toBe("2026-08-31T17:00:00.000Z");
  });
  it("warn at 80%, over when spent ≥ budget, no cap when budget ≤ 0", () => {
    expect(budgetState(7.99, 10)).toMatchObject({ warn: false, over: false });
    expect(budgetState(8, 10)).toMatchObject({ warn: true, over: false });
    expect(budgetState(10, 10).over).toBe(true);
    expect(budgetState(100, 0)).toEqual({ over: false, warn: false, pct: null });
  });
});

describe("run cap", () => {
  it("skips the whole round when the estimate exceeds the cap", () => {
    const r = splitRunCap(1, [0.405, 0.255, 0.3, 0.15]);
    expect(r.ok).toBe(false);
    expect(r.total).toBeCloseTo(1.11, 6);
  });
  it("splits the cap proportionally as maxTotalChargeUsd, never below each estimate", () => {
    const r = splitRunCap(1, [0.4, 0.25, 0.3]);
    expect(r.ok).toBe(true);
    expect(r.shares.map((x) => Math.round(x * 1000) / 1000)).toEqual([0.421, 0.263, 0.316]);
    r.shares.forEach((s, i) => expect(s).toBeGreaterThanOrEqual([0.4, 0.25, 0.3][i]));
    expect(r.shares.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1);
  });
  it("mock (zero estimates) passes with zero shares", () => {
    expect(splitRunCap(1, [0, 0])).toEqual({ ok: true, total: 0, shares: [0, 0] });
  });
});

describe("cost", () => {
  const zenDouyin = [
    {
      pricingModel: "PAY_PER_EVENT",
      pricingPerEvent: {
        actorChargeEvents: {
          "apify-actor-start": { eventPriceUsd: 0.005 },
          "apify-default-dataset-item": { eventPriceUsd: 0.00001 },
          "product-result": { eventTieredPricingUsd: { FREE: { tieredEventPriceUsd: 0.00799 }, GOLD: { tieredEventPriceUsd: 0.00699 } } },
          "product-detail": { eventPriceUsd: 0.029 },
        },
      },
    },
  ];
  it("classifies unknown events by name", () => {
    expect(classifyEvent("apify-actor-start")).toBe("start");
    expect(classifyEvent("item-detail-result")).toBe("addon");
    expect(classifyEvent("supplier-intelligence")).toBe("addon");
    expect(classifyEvent("product-scraped")).toBe("per_result");
    expect(classifyEvent("item-comments-result", { "item-comments-result": "addon" })).toBe("addon");
  });
  it("prices per tier with FREE fallback and flat shapes", () => {
    expect(eventPrice({ eventTieredPricingUsd: { FREE: { tieredEventPriceUsd: 0.1 } } }, "GOLD")).toBe(0.1);
    expect(eventPrice({ tieredEventPriceUsd: 0.2 }, "FREE")).toBe(0.2);
    expect(eventPrice({ eventPriceUsd: 0.3 }, "FREE")).toBe(0.3);
  });
  it("cost per result = (start + 50 × per-result) / 50, add-ons excluded (handoff: zen douyin ≈ $0.0081)", () => {
    const p = parsePricing(zenDouyin, "FREE")!;
    expect(p.startFee).toBe(0.005);
    expect(p.pricePerResult).toBeCloseTo(0.008, 6);
    expect(costPerResult(p.startFee, p.pricePerResult)).toBeCloseTo(0.0081, 6);
    expect(parsePricing(zenDouyin, "GOLD")!.pricePerResult).toBeCloseTo(0.007, 6);
    expect(parsePricing([{ pricingModel: "FLAT_PRICE_PER_MONTH" }], "FREE")).toBeNull();
  });
  it("evidence scan + completeness 0..5", () => {
    const e = scanEvidence("monthlySold salesTrend category mainImage detailUrl");
    expect(completeness(e)).toBe(5);
    expect(completeness(scanEvidence("nothing here"))).toBe(0);
    expect(scanEvidence("x", ["cookies"]).needsCookie).toBe(true);
    expect(scanEvidence("Do I need a Xiaohongshu account or cookies? No.", ["keywords"]).needsCookie).toBe(false);
  });
  const cand = (over: Partial<Candidate>): Candidate => ({
    actorId: "a/b",
    hasSold30d: true, hasSold: true, hasCategory: true, hasImage: true, hasLink: true, hasTrend: true, needsCookie: false,
    completeness: 5, costPerResult50: 0.01, failRate30d: 0, priced: true, smokeItemsOut: null,
    ...over,
  });
  it("excludes fail rate > 10%, cookie, no image/link/sold, empty smoke", () => {
    expect(exclusionReason(cand({ failRate30d: 0.29 }))).toBe("actors.excluded.failRate");
    expect(exclusionReason(cand({ failRate30d: 0.1 }))).toBeNull();
    expect(exclusionReason(cand({ needsCookie: true }))).toBe("actors.excluded.needsCookie");
    expect(exclusionReason(cand({ hasImage: false }))).toBe("actors.excluded.noImage");
    expect(exclusionReason(cand({ hasLink: false }))).toBe("actors.excluded.noLink");
    expect(exclusionReason(cand({ hasSold: false }))).toBe("actors.excluded.noSold");
    expect(exclusionReason(cand({ smokeItemsOut: 0 }))).toBe("actors.excluded.smokeEmpty");
  });
  it("chooses max completeness, then min cost; null when none qualifies", () => {
    const a = cand({ actorId: "cheap-incomplete", completeness: 3, costPerResult50: 0.001 });
    const b = cand({ actorId: "complete-pricey", completeness: 5, costPerResult50: 0.02 });
    const c = cand({ actorId: "complete-cheap", completeness: 5, costPerResult50: 0.01 });
    expect(chooseActor([a, b, c])?.actorId).toBe("complete-cheap");
    expect(chooseActor([cand({ smokeItemsOut: 0 })])).toBeNull();
    // a smoke-verified actor beats a README-only one with a higher score
    const readmeOnly = cand({ actorId: "readme-only", completeness: 4, costPerResult50: 0.004 });
    const tested = cand({ actorId: "tested", completeness: 3, costPerResult50: 0.0051, smokeItemsOut: 5 });
    expect(chooseActor([readmeOnly, tested])?.actorId).toBe("tested");
  });
});

describe("fill", () => {
  it("fills placeholders, keeps number type, drops empty keys", () => {
    const t = { keywords: ["{{keyword}}"], maxResults: "{{limit}}", region: "{{region}}", sortBy: "top_sales", note: "kw={{keyword}}" };
    expect(fill(t, { keyword: "苹果手表表带", limit: 50, region: null })).toEqual({
      keywords: ["苹果手表表带"],
      maxResults: 50,
      sortBy: "top_sales",
      note: "kw=苹果手表表带",
    });
    expect(fill(JSON.stringify({ a: ["{{x}}"] }), {})).toEqual({});
  });
});

describe("notes", () => {
  it("are fixed English patterns", () => {
    expect(NOTE.belowFloor(10, 50)).toBe("Run returned 10 products against 50 last time (below the 40% floor).");
    expect(NOTE.chosenAuto(5, 0.0081)).toBe("Highest completeness 5/5 at $0.0081 per result.");
    expect(NOTE.categorized(10, 1, 7, 0, 2)).toBe("Categorized 10 products: 1 by platform map, 7 by rules, 0 by AI, 2 unclassified.");
  });
});
