import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeRows } from "../src/domain/normalize/index.js";
import { parseCountText, pick } from "../src/domain/normalize/pick.js";

const fx = (p: string) => JSON.parse(readFileSync(new URL(`./fixtures/${p}`, import.meta.url), "utf8")) as { items: unknown[]; _unconfirmed?: string };

describe("pick", () => {
  it("walks dotted paths, array indexes and flattened keys; skips empty", () => {
    const row = { a: { b: "" }, images: [{ url: "x" }], "supplier.companyName": "flat" };
    expect(pick(row, "a.b", "images.0.url")).toBe("x");
    expect(pick(row, "supplier.companyName")).toBe("flat");
    expect(pick(null, "a")).toBeNull();
  });
  it("parses count texts with 万/K and + as lower bound", () => {
    expect(parseCountText("全网10万+件")).toEqual({ count: 100000, lowerBound: true });
    expect(parseCountText("已售1.6万+件")).toEqual({ count: 16000, lowerBound: true });
    expect(parseCountText("3.2K+ sold")).toEqual({ count: 3200, lowerBound: true });
    expect(parseCountText("31 sold")).toEqual({ count: 31, lowerBound: false });
    expect(parseCountText("no number")).toBeNull();
  });
});

describe("README fixtures (unconfirmed)", () => {
  it("are labelled unconfirmed", () => {
    for (const f of ["douyin", "1688", "temu", "xhs"]) expect(fx(`${f}-readme.json`)._unconfirmed).toMatch(/not a real run/);
  });
  it("douyin: 30d sold, ISO salesTrend, empty category level dropped, unreadable row → null", () => {
    const { items, itemsIn } = normalizeRows("douyin", fx("douyin-readme.json").items, "kw");
    expect(itemsIn).toBe(2);
    expect(items).toHaveLength(1);
    const p = items[0];
    expect(p.soldPeriod).toBe("30d");
    expect(p.soldCount).toBe(1162);
    expect(p.salesTrend?.[0]).toEqual({ date: "2026-06-07", units: 67 });
    expect(p.platformCategoryPath).toEqual(["3C数码及配件", "智能设备", "智能设备配件"]);
    expect(p.price).toBe(59);
    expect(p.rank).toBe(1);
  });
  it("1688: price.min, period unknown, categoryPath split, text-only sold parsed as lower bound", () => {
    const { items } = normalizeRows("1688", fx("1688-readme.json").items, "kw");
    expect(items[0].price).toBe(7.58);
    expect(items[0].soldPeriod).toBe("unknown");
    expect(items[0].soldText).toBe("全网10万+件");
    expect(items[0].platformCategoryPath).toEqual(["数码、电脑", "手机配件", "手机保护套"]);
    expect(items[0].shopName).toBe("深圳某某科技");
    expect(items[1]).toMatchObject({ soldCount: 50000, soldIsLowerBound: true, rank: 2 });
  });
  it("temu: lifetime lower bound, USD, category string split, platform signals kept separate", () => {
    const [p] = normalizeRows("temu", fx("temu-readme.json").items, "apple watch band").items;
    expect(p).toMatchObject({ soldCount: 10000, soldPeriod: "lifetime", soldIsLowerBound: true, currency: "USD", price: 5.89 });
    expect(p.platformCategoryPath).toEqual(["Cell Phones & Accessories", "Smart Watch Bands"]);
    expect(p.platformSignals).toEqual({ isTrending: true, demandScore: 78 });
  });
  it("xhs: lifetime units_sold (never shop_sold), deep links are not URLs", () => {
    const [p] = normalizeRows("xhs", fx("xhs-readme.json").items, "kw").items;
    expect(p.soldCount).toBe(31);
    expect(p.soldPeriod).toBe("lifetime");
    expect(p.shopUrl).toBeNull();
    expect(p.productUrl).toMatch(/^https:\/\/www.xiaohongshu.com/);
    expect(p.platformCategoryPath).toBeNull();
  });
});

describe("REAL smoke-run fixtures (2026-09-24)", () => {
  for (const [platform, file] of [
    ["douyin", "real/douyin-zen-studio.json"],
    ["1688", "real/1688-zen-studio.json"],
    ["xhs", "real/xhs-zen-studio.json"],
  ] as const) {
    it(`${platform}: itemsOut == itemsIn == 5 with id, title, url, image, sold`, () => {
      const { items, itemsIn } = normalizeRows(platform, fx(file).items, "苹果手表表带");
      expect(itemsIn).toBe(5);
      expect(items).toHaveLength(5);
      for (const p of items) {
        expect(p.externalId).toBeTruthy();
        expect(p.title).toBeTruthy();
        expect(p.productUrl).toMatch(/^https?:\/\//);
        expect(p.imageUrl).toMatch(/^https?:\/\//);
        expect(p.soldCount).not.toBeNull();
        expect(p.price).not.toBeNull();
      }
    });
  }
  it("douyin real: rank = searchPosition, 30 trend points, 30d period", () => {
    const { items } = normalizeRows("douyin", fx("real/douyin-zen-studio.json").items, "kw");
    expect(items.map((p) => p.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(items[0].salesTrend).toHaveLength(30);
    expect(items[0].salesTrend?.[0].date).toBe("2026-08-25");
    expect(items[0].soldPeriod).toBe("30d");
    expect(items[0].platformCategoryPath).toEqual(["3C数码及配件", "智能设备", "智能设备配件"]);
  });
  it("1688 real: period unknown, nested supplier", () => {
    const [p] = normalizeRows("1688", fx("real/1688-zen-studio.json").items, "kw").items;
    expect(p.soldPeriod).toBe("unknown");
    expect(p.soldText).toBe("已售1.6万+件");
    expect(p.shopName).toBe("深圳市翼氪科技有限公司");
  });
});

describe("normalizeRows", () => {
  it("dedupes by externalId and cuts at 50 even if the limit asks for more", () => {
    const rows = Array.from({ length: 70 }, (_, i) => ({ id: `x${i % 60}`, title: "t" }));
    const { items, itemsIn, readable } = normalizeRows("xhs", rows, "kw", 80);
    expect(itemsIn).toBe(70);
    expect(readable).toBe(60);
    expect(items).toHaveLength(50);
  });
  it("never throws on garbage rows", () => {
    const { items } = normalizeRows("temu", [null, 5, "x", { productId: { weird: true } }], "kw");
    expect(items).toHaveLength(0);
  });
});

describe("REAL 50-result batch (data/real/2026-09-24)", () => {
  const data = (p: string) => JSON.parse(readFileSync(new URL(`../data/real/2026-09-24/${p}.json`, import.meta.url), "utf8")).items as unknown[];
  for (const [platform, n] of [["douyin", 30], ["1688", 50], ["xhs", 50]] as const) {
    it(`${platform}: every row readable (${n})`, () => {
      const { items, itemsIn } = normalizeRows(platform, data(platform), "苹果手表表带");
      expect(itemsIn).toBe(n);
      expect(items).toHaveLength(n);
      expect(items.every((p) => p.productUrl && p.imageUrl)).toBe(true);
    });
  }
  it("xhs: empty metrics → count null (never 0), period still lifetime; near-duplicates kept", () => {
    const items = normalizeRows("xhs", data("xhs"), "k").items;
    const empty = items.filter((p) => p.soldCount === null);
    expect(empty.length).toBeGreaterThan(0);
    expect(items.every((p) => p.soldPeriod === "lifetime")).toBe(true);
    for (const p of items) if ((p.raw as { metrics?: { units_sold?: number } }).metrics?.units_sold === undefined) expect(p.soldCount).toBeNull();
  });
  it("1688: count = saledCount, text = soldDisplay, period unknown", () => {
    const rows = data("1688") as { saledCount?: number; soldDisplay?: string }[];
    const items = normalizeRows("1688", rows, "k").items;
    items.forEach((p, i) => {
      if (typeof rows[i].saledCount === "number") expect(p.soldCount).toBe(rows[i].saledCount);
      expect(p.soldPeriod).toBe("unknown");
    });
  });
});
