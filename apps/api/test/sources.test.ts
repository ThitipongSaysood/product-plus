import { describe, expect, it } from "vitest";
import { guessTemplate, relevant } from "../src/actors/evaluate.js";
import { normalizeRows } from "../src/domain/normalize/index.js";
import { mockRows, mockSvg } from "../src/sources/mock.js";

const day = (d: string) => new Date(`${d}T03:00:00Z`);

describe("mock source", () => {
  it("is deterministic per (platform, keyword, date) and every row normalizes", () => {
    const a = mockRows("douyin", "苹果手表表带", day("2026-09-10"), 50);
    expect(mockRows("douyin", "苹果手表表带", day("2026-09-10"), 50)).toEqual(a);
    expect(normalizeRows("douyin", a, "kw").items).toHaveLength(a.length);
    for (const p of ["1688", "temu", "xhs"] as const) {
      const rows = mockRows(p, "k", day("2026-09-10"), 50);
      expect(normalizeRows(p, rows, "k").items).toHaveLength(rows.length);
    }
  });
  it("drifts week to week (some products appear/disappear)", () => {
    const ids = (d: string) => new Set(normalizeRows("xhs", mockRows("xhs", "k", day(d), 50), "k").items.map((i) => i.externalId));
    const w1 = ids("2026-09-09");
    const w2 = ids("2026-09-23");
    expect([...w2].some((id) => !w1.has(id))).toBe(true);
    expect([...w2].some((id) => w1.has(id))).toBe(true);
  });
  it("serves placeholder SVGs locally; 'expired' ones are gone", () => {
    expect(mockSvg("douyin-3-silicone.svg")).toMatch(/^<svg/);
    expect(mockSvg("expired-xhs-3-silicone.svg")).toBeNull();
    expect(mockSvg("../etc/passwd")).toBeNull();
  });
});

describe("actor discovery helpers", () => {
  it("keeps product actors of the platform, drops video/comment/notes actors", () => {
    expect(relevant({ username: "a", name: "douyin-product-search", title: "Douyin products" }, "douyin")).toBe(true);
    expect(relevant({ username: "a", name: "douyin-video-downloader", title: "Douyin video product" }, "douyin")).toBe(false);
    expect(relevant({ username: "a", name: "rednote-notes", title: "RedNote notes search" }, "xhs")).toBe(false);
    expect(relevant({ username: "a", name: "temu-scraper", title: "Temu products" }, "douyin")).toBe(false);
  });
  it("guesses an input template from the schema", () => {
    expect(guessTemplate({ properties: { searchKeywords: { type: "array" }, maxItems: { type: "integer" }, region: { type: "string" } } })).toEqual({
      searchKeywords: ["{{keyword}}"],
      maxItems: "{{limit}}",
      region: "{{region}}",
    });
    expect(guessTemplate({ properties: { url: { type: "string" } } })).toBeNull();
  });
});
