import { describe, expect, it } from "vitest";
import type { Platform } from "@pp/contracts";
import { cleanSuggestions, cleanTerms, languageMismatch } from "../src/domain/keywords.js";

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
