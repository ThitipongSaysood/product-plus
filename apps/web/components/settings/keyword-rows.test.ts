import { describe, expect, it } from "vitest";
import type { Keyword } from "@pp/contracts";
import { groupKeywordRows } from "./KeywordsSettings";

const kw = (id: string, platform: Keyword["platform"], keyword: string): Keyword => ({ id, platform, keyword, region: null, enabled: true });

describe("groupKeywordRows", () => {
  it("one row per word, platforms in the app's order, only the group's platforms", () => {
    const rows = groupKeywordRows(
      [kw("1", "xhs", "苹果手表表带"), kw("2", "douyin", "苹果手表表带"), kw("3", "temu", "apple watch band"), kw("4", "1688", "苹果手表表带"), kw("5", "temu", "苹果手表表带")],
      ["douyin", "1688", "xhs", "temu"].filter((p) => p !== "temu") as Keyword["platform"][],
    );
    expect(rows.map((r) => r.keyword)).toEqual(["苹果手表表带"]);
    expect(rows[0].items.map((k) => k.platform)).toEqual(["douyin", "1688", "xhs"]);
  });
});
