import { describe, expect, it } from "vitest";
import type { Keyword } from "@pp/contracts";
import { groupKeywordRows } from "./KeywordsSettings";

const kw = (id: string, platform: Keyword["platform"], keyword: string, concept: string | null = null): Keyword => ({ id, platform, keyword, concept, region: null, enabled: true });

describe("groupKeywordRows", () => {
  it("one row per Keyword, one line per distinct Platform term, platforms in app order", () => {
    const c = "สายนาฬิกา Apple Watch";
    const rows = groupKeywordRows(
      [kw("1", "xhs", "苹果手表表带", c), kw("2", "temu", "apple watch band", c), kw("3", "douyin", "苹果手表表带", c), kw("4", "1688", "苹果手表表带", c), kw("5", "douyin", "硅胶表带")],
      ["douyin", "1688", "xhs", "temu"],
    );
    expect(rows.map((r) => r.label)).toEqual([c, "硅胶表带"]);
    expect(rows[0].terms.map((g) => [g.term, g.items.map((k) => k.platform)])).toEqual([
      ["苹果手表表带", ["douyin", "1688", "xhs"]],
      ["apple watch band", ["temu"]],
    ]);
  });
  it("hides platforms the group no longer watches", () => {
    expect(groupKeywordRows([kw("1", "temu", "apple watch band")], ["douyin"])).toEqual([]);
  });
});
