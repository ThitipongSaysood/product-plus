import { describe, expect, it } from "vitest";
import type { Platform } from "@pp/contracts";
import { cleanLineTerms, cleanSuggestionLines, cleanTranslations, languageMismatch, planKeywordList, roundCostPerKeyword } from "../src/domain/keywords.js";

describe("languageMismatch", () => {
  it("Chinese platforms need at least one CJK character", () => {
    for (const p of ["1688", "douyin", "xhs"] as Platform[]) {
      expect(languageMismatch(p, "Tempered Glass")).toBe(true);
      expect(languageMismatch(p, "苹果手表钢化膜")).toBe(false);
      expect(languageMismatch(p, "iwatch钢化膜")).toBe(false); // Latin model names inside a Chinese term are fine
    }
  });
  it("Temu needs Latin letters and no CJK", () => {
    expect(languageMismatch("temu", "apple watch screen protector")).toBe(false);
    expect(languageMismatch("temu", "苹果手表钢化膜")).toBe(true);
    expect(languageMismatch("temu", "apple 钢化膜")).toBe(true);
    expect(languageMismatch("temu", "42")).toBe(true);
  });
});

describe("cleanLineTerms", () => {
  it("a term in the wrong language is dropped so AI refills it (the apple-watch group had `watch` on 1688, `复古手表` on Temu)", () => {
    expect(cleanLineTerms({ keyword: "watch", zh: "watch", en: "watch" })).toEqual({ keyword: "watch", zh: null, en: "watch" });
    expect(cleanLineTerms({ keyword: "复古手表", zh: "复古手表", en: "复古手表" })).toEqual({ keyword: "复古手表", zh: "复古手表", en: null });
    expect(cleanLineTerms({ keyword: "k", zh: " iwatch钢化膜 ", en: " apple watch band " })).toEqual({ keyword: "k", zh: "iwatch钢化膜", en: "apple watch band" });
  });
});

describe("cleanTranslations (one AI call for every line)", () => {
  it("maps each requested keyword to its terms, dropping wrong-language and unrequested ones", () => {
    const got = cleanTranslations(
      [
        { keyword: "สายหนัง", zh: "苹果手表皮表带", en: "apple watch leather band" },
        { keyword: "สายโลหะ", zh: "metal band", en: "apple watch metal band" }, // zh in the wrong language
        { keyword: "not asked", zh: "手表", en: "watch" },
        null,
      ],
      ["สายหนัง", "สายโลหะ", "สายไนลอน"],
    );
    expect(Object.fromEntries(got)).toEqual({
      สายหนัง: { zh: "苹果手表皮表带", en: "apple watch leather band" },
      สายโลหะ: { zh: null, en: "apple watch metal band" },
    });
  });
});

describe("cleanSuggestionLines", () => {
  it("whole lines (keyword + both terms), valid languages, new labels only, at most 8", () => {
    const out = cleanSuggestionLines(
      [
        { keyword: "ฟิล์มกระจก Apple Watch", zh: "苹果手表钢化膜", en: "apple watch tempered glass", glossTh: "ฟิล์มกระจกนิรภัย" },
        { keyword: "สายนาฬิกา Apple Watch", zh: "苹果手表表带", en: "apple watch band", glossTh: "มีแล้ว" }, // already a Keyword
        { keyword: "bad", zh: "tempered glass", en: "钢化膜", glossTh: "" }, // both wrong language
        { keyword: "", zh: "手表膜", en: "watch film", glossTh: "" },
      ],
      ["สายนาฬิกา Apple Watch"],
    );
    expect(out).toEqual([{ keyword: "ฟิล์มกระจก Apple Watch", zh: "苹果手表钢化膜", en: "apple watch tempered glass", glossTh: "ฟิล์มกระจกนิรภัย" }]);
    const many = Array.from({ length: 12 }, (_, i) => ({ keyword: `k${i}`, zh: `手表膜${i}`, en: `watch film ${i}`, glossTh: "" }));
    expect(cleanSuggestionLines(many, [])).toHaveLength(8);
  });
});

describe("roundCostPerKeyword", () => {
  it("sums each watched platform's chosen actor at the group's result limit; unknown price → null", () => {
    const actors = { douyin: { startFee: 0.005, pricePerResult: 0.008 }, temu: { startFee: 0, pricePerResult: 0.01 } };
    expect(roundCostPerKeyword(actors, ["douyin", "temu"], 50)).toBeCloseTo(0.005 + 0.4 + 0.5, 6);
    expect(roundCostPerKeyword(actors, ["douyin", "xhs"], 50)).toBeNull();
  });
});

describe("planKeywordList", () => {
  const P = ["douyin", "1688", "xhs", "temu"] as Platform[];
  const row = (id: string, platform: Platform, keyword: string, concept: string | null = null) => ({ id, platform, keyword, concept });
  it("keeps, updates, inserts and deletes to match the saved lines", () => {
    const existing = [
      row("a", "douyin", "苹果手表表带", "สายนาฬิกา Apple Watch"),
      row("b", "temu", "apple watch band", "สายนาฬิกา Apple Watch"),
      row("c", "1688", "苹果手表表带", "สายนาฬิกา Apple Watch"),
      row("x", "douyin", "模块"),
    ];
    const plan = planKeywordList(existing, [{ keyword: "สายนาฬิกา Apple Watch", zh: "苹果手表表带", en: "apple watch strap" }], P);
    expect(plan.updates).toEqual([{ id: "b", keyword: "apple watch strap", concept: "สายนาฬิกา Apple Watch" }]);
    expect(plan.inserts).toEqual([{ platform: "xhs", keyword: "苹果手表表带", concept: "สายนาฬิกา Apple Watch" }]);
    expect(plan.deletes).toEqual(["x"]);
    expect(plan.skipped).toEqual([]);
  });
  it("a legacy row keyed by its own text is matched by that text", () => {
    const plan = planKeywordList([row("l", "douyin", "硅胶表带")], [{ keyword: "硅胶表带", zh: "硅胶表带", en: null }], ["douyin"]);
    expect(plan).toMatchObject({ updates: [{ id: "l", keyword: "硅胶表带", concept: "硅胶表带" }], inserts: [], deletes: [] });
  });
  it("reports missing terms and duplicate terms (case-insensitive) instead of writing them", () => {
    const plan = planKeywordList(
      [],
      [{ keyword: "A", zh: "手表带", en: null }, { keyword: "B", zh: "手表带", en: "Watch Band" }, { keyword: "C", zh: "表带", en: "watch band" }],
      ["douyin", "temu"],
    );
    expect(plan.skipped).toEqual([
      { keyword: "A", platform: "temu", reason: "keywords.skip.noTerm" },
      { keyword: "B", platform: "douyin", reason: "keywords.skip.duplicate" },
      { keyword: "C", platform: "temu", reason: "keywords.skip.duplicate" },
    ]);
    expect(plan.inserts.map((i) => `${i.platform}:${i.keyword}`)).toEqual(["douyin:手表带", "temu:Watch Band", "douyin:表带"]);
  });
  it("leaves rows of unwatched platforms for Keywords that stay", () => {
    const plan = planKeywordList([row("t", "temu", "apple watch band", "K")], [{ keyword: "K", zh: "苹果手表表带", en: null }], ["douyin"]);
    expect(plan.deletes).toEqual([]);
  });
});
