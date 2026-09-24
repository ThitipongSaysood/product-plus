import { describe, expect, it } from "vitest";
import { buildBrief, type BriefInput, scoreCandidates } from "../src/domain/brand-brief.js";
import type { TaxonomyEntry } from "@pp/contracts";

const TAX: TaxonomyEntry[] = [
  { key: "material_metal", en: "Metal", th: "โลหะ", zh: "金属", keywords: [] },
  { key: "material_silicone", en: "Silicone", th: "ซิลิโคน", zh: "硅胶", keywords: [] },
];

const row = (o: Partial<BriefInput> & { id: string }): BriefInput => ({
  platform: "1688",
  title: "表带",
  titleTh: "สายนาฬิกา",
  price: 10,
  entryPrice: null,
  currency: "CNY",
  moq: null,
  unit: null,
  soldCount: 100,
  soldPeriod: "unknown",
  soldLowerBound: false,
  trend: "insufficient_history",
  categoryKey: "material_metal",
  shopName: null,
  orderCount: null,
  ...o,
});

describe("buildBrief — sold numbers never share a scale", () => {
  // The real group has 1688 at 783,670 (unknown), douyin at 5,371 (30d) and xhs at 1,098 (lifetime).
  // One ranked list over those three would be decided entirely by which platform prints bigger numbers.
  const rows = [
    row({ id: "a", platform: "1688", soldPeriod: "unknown", soldCount: 783_670 }),
    row({ id: "b", platform: "1688", soldPeriod: "unknown", soldCount: 12 }),
    row({ id: "c", platform: "douyin", soldPeriod: "30d", soldCount: 5_371, trend: "rising" }),
    row({ id: "d", platform: "douyin", soldPeriod: "30d", soldCount: 40, trend: "falling" }),
    row({ id: "e", platform: "xhs", soldPeriod: "lifetime", soldCount: 1_098 }),
  ];
  const brief = buildBrief(rows, TAX, "Apple Watch bands");

  it("ranks each listing only inside its own platform and period", () => {
    const by = Object.fromEntries(brief.candidates.map((c) => [c.id, c]));
    expect(by.a.soldRankInBucket).toBe(1); // top of 1688/unknown, not top of everything
    expect(by.b.soldRankInBucket).toBe(2);
    expect(by.c.soldRankInBucket).toBe(1); // top of douyin/30d despite being 145x smaller than "a"
    expect(by.e.soldRankInBucket).toBe(1); // a bucket of one is still rank 1
    expect(by.a.bucketSize).toBe(2);
    expect(by.e.bucketSize).toBe(1);
  });

  it("keeps every candidate's period attached to it", () => {
    for (const c of brief.candidates) expect(["30d", "lifetime", "unknown"]).toContain(c.soldPeriod);
    expect(brief.candidates.find((c) => c.id === "c")!.soldPeriod).toBe("30d");
    expect(brief.candidates.find((c) => c.id === "e")!.soldPeriod).toBe("lifetime");
  });

  it("describes each bucket's range so the reader can see the scales differ", () => {
    const b1688 = brief.buckets.find((b) => b.platform === "1688")!;
    expect(b1688).toMatchObject({ soldPeriod: "unknown", count: 2, soldMax: 783_670, soldMin: 12 });
    expect(brief.buckets.find((b) => b.platform === "douyin")!.trendKnown).toBe(true);
    expect(b1688.trendKnown).toBe(false);
  });

  it("states the no-cross-platform rule in the limits the model is shown", () => {
    expect(brief.limits.join(" ")).toMatch(/NOT comparable across platforms/i);
    expect(brief.limits.join(" ")).toMatch(/never restate a lifetime figure/i);
  });
});

describe("buildBrief — unknowns are declared, not omitted", () => {
  it("marks trend as unknown rather than leaving the field out", () => {
    const b = buildBrief([row({ id: "a" }), row({ id: "b", platform: "douyin", soldPeriod: "30d", trend: "rising" })], TAX, "g");
    const a = b.candidates.find((c) => c.id === "a")!;
    expect(a.trendKnown).toBe(false);
    expect(a.trend).toBeNull();
    const d = b.candidates.find((c) => c.id === "b")!;
    expect(d.trendKnown).toBe(true);
    expect(d.trend).toBe("rising");
  });

  it("counts how many listings it dropped and why", () => {
    const b = buildBrief(
      [
        row({ id: "ok" }),
        row({ id: "nosold", soldCount: null }),
        row({ id: "nosold2", soldCount: null }),
        row({ id: "noprice", price: null, entryPrice: null }),
      ],
      TAX,
      "g",
    );
    expect(b.excluded).toEqual({ noSoldCount: 2, noPrice: 1, total: 3 });
    expect(b.candidates.map((c) => c.id)).toEqual(["ok"]);
    expect(b.limits.join(" ")).toMatch(/not weak candidates; they are unmeasured/i);
  });

  it("carries the floor flag so a \"100K+\" figure is not treated as exact", () => {
    const b = buildBrief([row({ id: "a", soldCount: 100_000, soldLowerBound: true })], TAX, "g");
    expect(b.candidates[0].soldIsFloor).toBe(true);
    expect(b.limits.join(" ")).toMatch(/soldIsFloor/);
  });
});

describe("buildBrief — computed signals the model should not have to guess", () => {
  it("prices a candidate at what one minimum order costs, not the bulk rung", () => {
    const b = buildBrief([row({ id: "a", price: 17, entryPrice: 22, moq: 1, unit: "条" })], TAX, "g");
    expect(b.candidates[0].buyPrice).toBe(22);
    expect(b.candidates[0].moq).toBe(1);
  });

  it("runs the trademark check in code instead of asking the model to spot it", () => {
    const b = buildBrief(
      [
        row({ id: "nike", title: "适用苹果Watch Ultra 耐克Nike编织纯色手表带硅胶" }),
        row({ id: "plain", title: "适用苹果手表硅胶表带" }),
      ],
      TAX,
      "g",
    );
    expect(b.candidates.find((c) => c.id === "nike")!.brandMarks).toEqual(["Nike"]);
    expect(b.candidates.find((c) => c.id === "plain")!.brandMarks).toEqual([]);
  });

  it("reports category crowding and a median price per category", () => {
    const b = buildBrief(
      [
        row({ id: "m1", categoryKey: "material_metal", price: 10 }),
        row({ id: "m2", categoryKey: "material_metal", price: 20 }),
        row({ id: "m3", categoryKey: "material_metal", price: 30 }),
        row({ id: "s1", categoryKey: "material_silicone", price: 5 }),
      ],
      TAX,
      "g",
    );
    const metal = b.categories.find((c) => c.key === "material_metal")!;
    expect(metal).toMatchObject({ count: 3, medianBuyPrice: 20, label: "Metal" });
    expect(b.categories[0].key).toBe("material_metal"); // crowded first
  });

  it("takes the strongest from every bucket rather than the biggest raw numbers overall", () => {
    // Without per-bucket selection, 1688's numbers would fill the whole shortlist.
    const many = [
      ...Array.from({ length: 30 }, (_, i) => row({ id: `cn${i}`, platform: "1688", soldCount: 100_000 + i })),
      ...Array.from({ length: 5 }, (_, i) => row({ id: `dy${i}`, platform: "douyin", soldPeriod: "30d", soldCount: 10 + i })),
    ];
    const b = buildBrief(many, TAX, "g", "th", 10);
    expect(b.candidates.some((c) => c.platform === "douyin")).toBe(true);
    expect(b.candidates.filter((c) => c.platform === "1688").length).toBeLessThanOrEqual(5);
  });

  it("survives an empty group", () => {
    const b = buildBrief([], TAX, "g");
    expect(b.candidates).toEqual([]);
    expect(b.buckets).toEqual([]);
    expect(b.excluded.total).toBe(0);
  });
});

describe("scoreCandidates — only what every candidate has", () => {
  it("demand is a percentile inside the bucket, not across platforms", () => {
    // 1688's raw figures dwarf douyin's by a factor of ~150. Top of each bucket must still score 100,
    // or the score would rank the platforms rather than the products.
    const rows = [
      row({ id: "a", soldCount: 783_670 }),
      row({ id: "b", soldCount: 400 }),
      row({ id: "c", platform: "douyin", soldPeriod: "30d", soldCount: 5_371 }),
      row({ id: "d", platform: "douyin", soldPeriod: "30d", soldCount: 20 }),
    ];
    const s = scoreCandidates(buildBrief(rows, TAX, "g"));
    expect(s.a.demand).toBe(100);
    expect(s.c.demand).toBe(100);
    expect(s.b.demand).toBeLessThan(s.a.demand);
    expect(s.d.demand).toBeLessThan(s.c.demand);
  });

  it("cost puts the category median at 50 and rewards going under it", () => {
    // Medians here: metal 20, from the three metal rows below.
    const rows = [
      row({ id: "cheap", price: 10 }),
      row({ id: "mid", price: 20 }),
      row({ id: "dear", price: 40 }),
    ];
    const s = scoreCandidates(buildBrief(rows, TAX, "g"));
    expect(s.mid.cost).toBe(50);
    expect(s.cheap.cost).toBe(75);
    expect(s.dear.cost).toBe(0);
  });

  it("uses the price a buyer can actually pay, not the cheapest rung", () => {
    const rows = [row({ id: "ladder", price: 10, entryPrice: 30 }), row({ id: "plain", price: 10 })];
    const s = scoreCandidates(buildBrief(rows, TAX, "g"));
    expect(s.ladder.cost).toBeLessThan(s.plain.cost);
  });

  it("compares against its own category's median, not the catalogue's", () => {
    // ¥30 is dear among metal (median 10) and cheap among silicone (median 100).
    const rows = [
      row({ id: "m1", price: 10 }),
      row({ id: "m2", price: 30 }),
      row({ id: "s1", price: 100, categoryKey: "material_silicone" }),
      row({ id: "s2", price: 30, categoryKey: "material_silicone" }),
    ];
    const s = scoreCandidates(buildBrief(rows, TAX, "g"));
    expect(s.m2.cost).toBeLessThan(50);
    expect(s.s2.cost).toBeGreaterThan(50);
  });

  it("weights the two equally and stays inside 0–100", () => {
    const rows = [row({ id: "a", price: 1 }), row({ id: "b", price: 1000 })];
    const s = scoreCandidates(buildBrief(rows, TAX, "g"));
    for (const v of Object.values(s)) {
      expect(v.total).toBe(Math.round((v.demand + v.cost) / 2));
      for (const n of [v.demand, v.cost, v.total]) expect(n).toBeGreaterThanOrEqual(0);
      for (const n of [v.demand, v.cost, v.total]) expect(n).toBeLessThanOrEqual(100);
    }
  });

  it("a trend or an MOQ never moves the score — they are facts, not dimensions", () => {
    // Not one listing of the real 135 has both, so scoring either would score half a shortlist on
    // something the other half cannot have.
    const base = [row({ id: "x", platform: "douyin", soldPeriod: "30d" }), row({ id: "y", platform: "douyin", soldPeriod: "30d", soldCount: 50 })];
    const plain = scoreCandidates(buildBrief(base, TAX, "g"));
    const withExtras = scoreCandidates(
      buildBrief([{ ...base[0], trend: "rising", moq: 500 }, base[1]], TAX, "g"),
    );
    expect(withExtras.x).toEqual(plain.x);
  });

  it("scores on both measures or not at all", () => {
    // No price means no cost measure; a total that quietly meant demand alone would be the same lie
    // as averaging in a missing trend.
    const s = scoreCandidates(buildBrief([row({ id: "a" }), row({ id: "b", price: null })], TAX, "g"));
    expect(s.a).toBeDefined();
    expect(s.b).toBeUndefined();
  });
});
