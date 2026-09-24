import { describe, expect, it } from "vitest";
import type { Platform } from "@pp/contracts";
import { cleanSuggestions, cleanTerms, languageMismatch, planKeywordList } from "../src/domain/keywords.js";

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

describe("cleanSuggestions", () => {
  it("keeps only the platform's language, the group's platforms, and new keywords", () => {
    const out = cleanSuggestions(
      [
        { platform: "1688", keyword: "苹果手表钢化膜", glossTh: "ฟิล์ม" },
        { platform: "1688", keyword: "apple watch film", glossTh: "x" }, // wrong language
        { platform: "temu", keyword: "苹果手表钢化膜", glossTh: "x" }, // wrong language
        { platform: "temu", keyword: "Apple Watch  Screen Protector", glossTh: "ฟิล์ม" },
        { platform: "temu", keyword: "apple watch screen protector", glossTh: "dup" }, // dup after normalizing
        { platform: "xhs", keyword: "苹果手表保护膜", glossTh: "มีแล้ว" }, // already saved
        { platform: "douyin", keyword: "苹果手表膜", glossTh: "x" }, // platform not in group
        { platform: "1688", keyword: "", glossTh: "x" },
        null,
      ],
      ["1688", "temu", "xhs"],
      [{ platform: "xhs", keyword: "苹果手表保护膜" }],
    );
    expect(out).toEqual([
      { platform: "1688", keyword: "苹果手表钢化膜", glossTh: "ฟิล์ม" },
      { platform: "temu", keyword: "Apple Watch Screen Protector", glossTh: "ฟิล์ม" },
    ]);
  });
  it("caps each platform at 6", () => {
    const raw = Array.from({ length: 9 }, (_, i) => ({ platform: "1688", keyword: `苹果手表膜${i}`, glossTh: "" }));
    expect(cleanSuggestions(raw, ["1688"], [])).toHaveLength(6);
  });
});

describe("cleanTerms", () => {
  it("one term per platform in its language; Chinese platforms share a term when one is missing or wrong", () => {
    const { terms, missing } = cleanTerms(
      [
        { platform: "douyin", term: " 苹果手表表带 " },
        { platform: "1688", term: "apple watch band" }, // wrong language → falls back to the Chinese term
        { platform: "temu", term: "apple watch band" },
        { platform: "temu", term: "second answer ignored" },
      ],
      ["douyin", "1688", "xhs", "temu"],
    );
    expect(Object.fromEntries(terms)).toEqual({ douyin: "苹果手表表带", "1688": "苹果手表表带", xhs: "苹果手表表带", temu: "apple watch band" });
    expect(missing).toEqual([]);
  });
  it("accepts `keyword` as the field name", () => {
    expect(cleanTerms([{ platform: "temu", keyword: "apple watch band" }], ["temu"]).terms.get("temu")).toBe("apple watch band");
  });
  it("reports a platform it cannot fill instead of guessing", () => {
    const { terms, missing } = cleanTerms([{ platform: "temu", term: "苹果手表表带" }, null], ["temu", "douyin"]);
    expect(terms.size).toBe(0);
    expect(missing).toEqual(["temu", "douyin"]);
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
      row("x", "douyin", "模块"), // legacy row, not in the list → deleted
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
  it("reports missing terms and duplicate terms instead of writing them", () => {
    const plan = planKeywordList([], [{ keyword: "A", zh: "手表带", en: null }, { keyword: "B", zh: "手表带", en: "watch band" }], ["douyin", "temu"]);
    expect(plan.skipped).toEqual([
      { keyword: "A", platform: "temu", reason: "keywords.skip.noTerm" },
      { keyword: "B", platform: "douyin", reason: "keywords.skip.duplicate" },
    ]);
    expect(plan.inserts.map((i) => `${i.platform}:${i.keyword}`)).toEqual(["douyin:手表带", "temu:watch band"]);
  });
  it("leaves rows of unwatched platforms for Keywords that stay", () => {
    const plan = planKeywordList([row("t", "temu", "apple watch band", "K")], [{ keyword: "K", zh: "苹果手表表带", en: null }], ["douyin"]);
    expect(plan.deletes).toEqual([]);
  });
});
