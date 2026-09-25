import { describe, expect, it } from "vitest";
import { cleanCategorySuggestions, DEFAULT_TAXONOMY } from "../src/domain/categorize.js";

// Real unclassified XHS titles from apple-watch-bands, 2026-09-25.
const TITLES = [
  "AUDOBIBI气质美神蕾丝手表带iwatch手表链小众复古巴洛克高级感",
  "蕾丝花边适用苹果applewatch手表iwatch表带s11手表带",
  "咖棕色豹纹表带适用苹果applewatch手表iwatch表带s11手表带",
  "黑色豹纹表带适用苹果applewatch手表iwatch表带",
  "天然树脂适用s1112苹果appleiwatch345678910三株ultra透明表带",
];

const line = (over: Record<string, unknown>) => ({ key: "material_lace", en: "Lace", th: "สายลูกไม้", zh: "蕾丝表带", keywords: ["蕾丝"], ...over });

describe("cleanCategorySuggestions", () => {
  it("keeps a line whose keywords catch ≥ 2 titles, with the count and examples", () => {
    const [s] = cleanCategorySuggestions([line({})], DEFAULT_TAXONOMY, TITLES);
    expect(s).toMatchObject({ key: "material_lace", keywords: ["蕾丝"], matches: 2 });
    expect(s.examples).toHaveLength(2);
  });

  it("drops keywords that are not literally in a title — the rules would never match them", () => {
    const [s] = cleanCategorySuggestions([line({ keywords: ["lace", "蕾丝", "蕾絲"] })], DEFAULT_TAXONOMY, TITLES);
    expect(s.keywords).toEqual(["蕾丝"]);
  });

  it("needs 2 different titles — the same listing relisted twice is not a pattern", () => {
    const wool = "Teng`冬季新款毛昵iwatch表带，适配苹果S7/8/9/10/11，适合通勤";
    expect(cleanCategorySuggestions([line({ key: "material_wool", keywords: ["毛昵"] })], DEFAULT_TAXONOMY, [wool, wool])).toEqual([]);
  });

  it("drops a line that catches fewer than 2 titles", () => {
    expect(cleanCategorySuggestions([line({ key: "material_resin", keywords: ["树脂"] })], DEFAULT_TAXONOMY, TITLES)).toEqual([]);
  });

  it("does not count a title an existing category already wins", () => {
    // fromRules decides with the whole taxonomy: a title an existing line also claims is a tie, not a match.
    const taxonomy = [...DEFAULT_TAXONOMY, { key: "pattern_leopard", en: "Leopard", th: "ลายเสือดาว", zh: "豹纹", keywords: ["豹纹"] }];
    expect(cleanCategorySuggestions([line({ key: "pattern_leopard2", keywords: ["豹纹"] })], taxonomy, TITLES)).toEqual([]);
  });

  it("rejects taken or malformed keys and missing names", () => {
    const raw = [line({ key: "material_leather" }), line({ key: "unclassified" }), line({ key: "Bad Key" }), line({ th: "" })];
    expect(cleanCategorySuggestions(raw, DEFAULT_TAXONOMY, TITLES)).toEqual([]);
  });

  it("keeps the first of two lines with the same key and sorts by matches", () => {
    const raw = [line({}), line({ key: "pattern_leopard", en: "Leopard", keywords: ["豹纹"] }), line({ en: "Lace again" })];
    const out = cleanCategorySuggestions(raw, DEFAULT_TAXONOMY, [...TITLES, "红色豹纹表带适用苹果"]);
    expect(out.map((s) => [s.key, s.matches])).toEqual([["pattern_leopard", 3], ["material_lace", 2]]);
    expect(out[1].en).toBe("Lace");
  });
});
