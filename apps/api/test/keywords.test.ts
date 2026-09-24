import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Platform } from "@pp/contracts";
import {
  cleanSuggestions,
  frequentTerms,
  languageMismatch,
  parseRelatedKeywords,
  planTrials,
  rankRelated,
  TRIAL_MAX_ITEMS,
} from "../src/domain/keywords.js";
import { smokeCap } from "../src/domain/guards.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const titles = (p: string) =>
  (JSON.parse(readFileSync(path.join(here, `../data/real/2026-09-24/${p}.json`), "utf8")) as { items: { title: string | null }[] }).items.map((r) => r.title);

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

describe("planTrials", () => {
  const priced = () => ({ startFee: 0.01, pricePerResult: 0.005 });
  const base = { mock: false, pricing: priced, budgetUsd: 10, spentUsd: 0, inFlightUsd: 0, slots: 5 };
  const it2 = (platform: Platform, keyword = "k") => ({ platform, keyword });

  it("caps each trial like a smoke test and dedupes", () => {
    const r = planTrials({ ...base, items: [it2("1688"), it2("1688"), it2("xhs")] });
    expect(r.targets.map((t) => t.capUsd)).toEqual([smokeCap(0.01, 0.005), smokeCap(0.01, 0.005)]);
    expect(r.skipped).toEqual([]);
  });
  it("skips a platform without a chosen actor", () => {
    const r = planTrials({ ...base, pricing: (p) => (p === "temu" ? null : priced()), items: [it2("temu"), it2("1688")] });
    expect(r.skipped).toEqual([{ platform: "temu", keyword: "k", reason: "skip.noActor" }]);
    expect(r.targets).toHaveLength(1);
  });
  it("counts against the monthly budget: spent + in-flight + all caps must fit; 0 blocks", () => {
    const cap = smokeCap(0.01, 0.005);
    expect(planTrials({ ...base, budgetUsd: 0, items: [it2("1688")] }).skipped[0].reason).toBe("skip.budget");
    expect(planTrials({ ...base, budgetUsd: 1, spentUsd: 1 - cap * 1.5, items: [it2("1688"), it2("xhs")] }).targets).toEqual([]);
    expect(planTrials({ ...base, budgetUsd: 1, spentUsd: 0.5, inFlightUsd: 0.5, items: [it2("1688")] }).targets).toEqual([]);
    expect(planTrials({ ...base, budgetUsd: 1, spentUsd: 1 - cap * 2.1, items: [it2("1688"), it2("xhs")] }).targets).toHaveLength(2);
  });
  it("the per-round cap does not apply", () => {
    // 8 trials × cap well above a $0.10 round cap would be refused by a Round; a trial only sees the budget
    const items = (["1688", "xhs", "douyin", "temu"] as Platform[]).flatMap((p) => [it2(p, "a"), it2(p, "b")]);
    const r = planTrials({ ...base, slots: 10, pricing: () => ({ startFee: 0.05, pricePerResult: 0.01 }), items });
    expect(r.targets).toHaveLength(TRIAL_MAX_ITEMS);
  });
  it("respects Apify concurrency", () => {
    const r = planTrials({ ...base, slots: 1, items: [it2("1688"), it2("xhs")] });
    expect(r.targets).toHaveLength(1);
    expect(r.skipped[0].reason).toBe("skip.concurrency");
  });
  it("mock groups cost 0 and ignore budget", () => {
    const r = planTrials({ ...base, mock: true, budgetUsd: 0, slots: 0, pricing: () => ({ startFee: 0, pricePerResult: 0 }), items: [it2("1688")] });
    expect(r.targets).toEqual([{ platform: "1688", keyword: "k", capUsd: 0 }]);
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

describe("frequentTerms on the real 2026-09-24 titles", () => {
  it("1688: materials and styles, no cross-word fragments, generic words last", () => {
    const got = frequentTerms("1688", titles("1688")).map((t) => t.term);
    expect(got.slice(0, 5)).toEqual(["不锈钢", "三珠", "硅胶", "磁吸", "金属"]);
    expect(got).toContain("蝴蝶扣");
    for (const bad of ["用苹果手", "果手表带", "三珠不锈", "手表表"]) expect(got).not.toContain(bad);
  });
  it("douyin finds the style names sellers use", () => {
    const got = frequentTerms("douyin", titles("douyin")).map((t) => t.term);
    expect(got).toEqual(expect.arrayContaining(["硅胶", "小蛮腰", "米兰尼斯", "磁吸", "小波点"]));
    expect(got).not.toContain("小蛮"); // folded into 小蛮腰
  });
  it("temu: words and bigrams, no sizes, generic brand words ranked last", () => {
    const got = frequentTerms("temu", titles("temu"));
    expect(got.some((t) => /\d|mm/.test(t.term))).toBe(false);
    expect(got[0].term).toBe("soft");
    expect(got.findIndex((t) => t.term === "apple watch")).toBeGreaterThan(got.findIndex((t) => t.term === "sport"));
  });
  it("excludes saved keywords and is deterministic", () => {
    const a = frequentTerms("xhs", titles("xhs"), ["水晶"]);
    expect(a.map((t) => t.term)).not.toContain("水晶");
    expect(frequentTerms("xhs", titles("xhs"), ["水晶"])).toEqual(a);
  });
});

describe("parseRelatedKeywords", () => {
  it("accepts strings, objects with a text-ish field, wrappers and JSON text", () => {
    expect(parseRelatedKeywords(["表带", " 表带 ", "手链"])).toEqual(["表带", "手链"]);
    expect(parseRelatedKeywords([{ keyword: "a" }, { text: "b" }, { word: "c" }, { query: "d" }, { n: 1 }])).toEqual(["a", "b", "c", "d"]);
    expect(parseRelatedKeywords({ items: [{ name: "x" }] })).toEqual(["x"]);
    expect(parseRelatedKeywords('["y"]')).toEqual(["y"]);
  });
  it("anything else is empty, never a throw", () => {
    for (const v of [null, undefined, 3, "not json", { foo: 1 }, [1, 2], true]) expect(parseRelatedKeywords(v)).toEqual([]);
  });
  it("rankRelated counts across runs and drops saved keywords", () => {
    expect(rankRelated([["a", "b"], [{ keyword: "b" }], null, ["c"]], ["c"])).toEqual([
      { term: "b", count: 2 },
      { term: "a", count: 1 },
    ]);
  });
});
