import { describe, expect, it } from "vitest";
import type { Keyword } from "@pp/contracts";
import { keywordsToText, needsTranslation, parseKeywordList } from "./keyword-list";

const kw = (platform: Keyword["platform"], keyword: string, concept: string | null = null): Keyword => ({ id: platform + keyword, platform, keyword, concept, region: null, enabled: true });

describe("keyword list text", () => {
  it("one line per Keyword: keyword | Chinese term | English term", () => {
    const c = "สายนาฬิกา Apple Watch";
    const text = keywordsToText([kw("temu", "apple watch band", c), kw("xhs", "苹果手表表带", c), kw("douyin", "苹果手表表带", c), kw("1688", "硅胶表带")], ["douyin", "1688", "xhs", "temu"]);
    expect(text).toBe("สายนาฬิกา Apple Watch | 苹果手表表带 | apple watch band\n硅胶表带 | 硅胶表带 | ");
  });
  it("parses lines, keeps empty terms for AI, reports bad lines", () => {
    const { items, errors } = parseKeywordList("สายหนัง\n# note\n\nสายโลหะ | 金属表带 |\nสายหนัง | x\na | b | c | d");
    expect(items).toEqual([
      { keyword: "สายหนัง", zh: null, en: null },
      { keyword: "สายโลหะ", zh: "金属表带", en: null },
    ]);
    expect(errors).toEqual([{ line: 5, reason: "duplicate" }, { line: 6, reason: "columns" }]);
    expect(needsTranslation(items, ["douyin", "temu"])).toBe(2);
    expect(needsTranslation(items, ["douyin"])).toBe(1);
  });
});
