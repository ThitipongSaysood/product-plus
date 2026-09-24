// Driven by the REAL actor payload in fixtures/real/1688-zen-studio.json — the repo rule is that
// normalizers are never tested against invented rows, because invented rows agree with whatever the
// code happens to do.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { supplyTerms } from "../src/domain/normalize/supply.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(path.join(here, "fixtures/real/1688-zen-studio.json"), "utf8")) as {
  items: Record<string, unknown>[];
};
const rows = fixture.items;
const byId = (id: string) => rows.find((r) => r.offerId === id)!;

describe("supplyTerms — real 1688 rows", () => {
  it("reads the minimum order, its unit and the ladder off the row on screen", () => {
    // 适用苹果Watch Ultra…Nike编织纯色手表带硅胶 — the ¥1.35 listing the product page shows
    const t = supplyTerms("1688", byId("642742537878"))!;
    expect(t.moq).toBe(100);
    expect(t.unit).toBe("条");
    expect(t.orderCount).toBe(2604);
    expect(t.tiers).toEqual([{ minQty: 100, maxQty: null, price: 1.35 }]);
    expect(t.entryPrice).toBe(1.35);
    expect(t.videoUrl).toMatch(/^https:\/\/cloud\.video\.taobao\.com\//);
  });

  it("keeps a listing that can be bought one at a time distinct from one that cannot", () => {
    expect(supplyTerms("1688", byId("1064504913238"))!.moq).toBe(1); // ≥1条
    expect(supplyTerms("1688", byId("988711880619"))!.moq).toBe(100); // no ladder, declared MOQ only
  });

  it("falls back to the ladder's first rung when the row declares no minimum", () => {
    const row = { quantityPrices: [{ quantityMin: 5, quantityMax: 499, price: 2 }] };
    expect(supplyTerms("1688", row)!.moq).toBe(5);
  });

  it("returns null for the platforms that have no wholesale terms", () => {
    for (const p of ["temu", "xhs", "douyin"] as const) expect(supplyTerms(p, byId("642742537878"))).toBeNull();
  });

  it("returns null rather than an empty shell when the row carries nothing", () => {
    expect(supplyTerms("1688", { title: "x" })).toBeNull();
    expect(supplyTerms("1688", null)).toBeNull();
  });
});

describe("supplyTerms — ladders are untrusted input", () => {
  it("sorts by quantity instead of trusting the array order, and never assumes cheapest-last", () => {
    // A real row runs the other way: 1~1个 ¥4 rising to ¥10.
    const row = {
      quantityPrices: [
        { quantityMin: 500, quantityMax: null, price: 5.5 },
        { quantityMin: 1, quantityMax: 499, price: 6 },
      ],
    };
    const t = supplyTerms("1688", row)!;
    expect(t.tiers.map((x) => x.minQty)).toEqual([1, 500]);
    expect(t.entryPrice).toBe(6); // what you pay for one

    const rising = supplyTerms("1688", {
      quantityPrices: [
        { quantityMin: 1, quantityMax: 1, price: 4 },
        { quantityMin: 2, quantityMax: null, price: 10 },
      ],
    })!;
    expect(rising.entryPrice).toBe(4); // the rung for one unit, not the last one
  });

  it("drops malformed rungs, dedupes, and caps the ladder", () => {
    const t = supplyTerms("1688", {
      quantityPrices: [
        { quantityMin: 1, price: 6 },
        { quantityMin: 1, price: 99 }, // duplicate rung
        { quantityMin: "x", price: 7 }, // unparseable
        { quantityMin: 10, price: null }, // no price
        { quantityMin: -5, price: 3 }, // negative
        { quantityMin: 20, quantityMax: 5, price: 4 }, // max below min → treat as open-ended
      ],
    })!;
    expect(t.tiers).toEqual([
      { minQty: 1, maxQty: null, price: 6 },
      { minQty: 20, maxQty: null, price: 4 },
    ]);
  });

  it("ignores a ladder long enough to be a malformed payload", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ quantityMin: i + 1, price: 1 }));
    expect(supplyTerms("1688", { quantityPrices: many })!.tiers.length).toBe(12);
  });

  it("rejects a videoUrl that is not an absolute http(s) url", () => {
    expect(supplyTerms("1688", { unit: "条", videoUrl: "javascript:alert(1)" })!.videoUrl).toBeNull();
    expect(supplyTerms("1688", { unit: "条", videoUrl: "taobao://play/1" })!.videoUrl).toBeNull();
  });
});

describe("supplyTerms — the rung you actually land on", () => {
  it("prices at the declared minimum order, not at the ladder's first rung", () => {
    // The case that made this wrong: MOQ 100 with a 1-99 rung above it. You cannot buy 1, so the
    // 1-99 price is unreachable and one order costs 100 x 9.00, not 100 x 13.50.
    const t = supplyTerms("1688", {
      minOrderQuantity: 100,
      quantityPrices: [
        { quantityMin: 1, quantityMax: 99, price: 13.5 },
        { quantityMin: 100, quantityMax: null, price: 9 },
      ],
    })!;
    expect(t.moq).toBe(100);
    expect(t.entryPrice).toBe(9);
  });

  it("stays on the first rung when the minimum order sits inside it", () => {
    const t = supplyTerms("1688", {
      minOrderQuantity: 1,
      quantityPrices: [
        { quantityMin: 1, quantityMax: 9, price: 22 },
        { quantityMin: 10, quantityMax: null, price: 18 },
      ],
    })!;
    expect(t.entryPrice).toBe(22);
  });

  it("falls back to the first rung when a declared minimum is below every rung", () => {
    const t = supplyTerms("1688", { minOrderQuantity: 1, quantityPrices: [{ quantityMin: 50, price: 4 }] })!;
    expect(t.entryPrice).toBe(4);
  });
});
