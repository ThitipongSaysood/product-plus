import { describe, expect, it } from "vitest";
import { dict } from "./dictionary";
import { formatMoney, formatNumber, formatPercent, LOCALES, makeT, translateOr } from "./index";

describe("dictionary", () => {
  const entries = Object.entries(dict) as [string, Record<string, string>][];
  it("has keys", () => expect(entries.length).toBeGreaterThan(300));
  it.each(LOCALES)("every key has a non-empty %s", (l) => {
    const missing = entries.filter(([, v]) => typeof v[l] !== "string" || v[l].trim() === "").map(([k]) => k);
    expect(missing).toEqual([]);
  });
  it("uses the same {vars} in every language", () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    const bad = entries.filter(([, v]) => vars(v.th) !== vars(v.en) || vars(v.th) !== vars(v.zh)).map(([k]) => k);
    expect(bad).toEqual([]);
  });
  it("null sold is 'no data', not zero sales", () => {
    expect(dict["sold.none"]).toEqual({ th: "ไม่มีข้อมูลยอดขาย", en: "No sales data", zh: "无销量数据" });
  });
  it("keeps the keys the backend sends", () => {
    for (const k of [
      "skip.noActor", "skip.runCap", "skip.pricingUnknown", "actors.reason.noneWorking", "errors.actors.needsToken", "errors.job.alreadyRunning", "errors.validation",
      "job.unit.fill", "job.unit.retag", "job.unit.evaluate", "common.forbidden", "errors.contentType", "errors.confirmRequired",
      "errors.actors.mockGroup", "errors.actors.notChoosable", "errors.auth.rateLimited", "notes.chosenVerified", "budget.paused", "system.envSet",
    ]) expect(k in dict).toBe(true);
  });
});

describe("translate / format", () => {
  it("fills vars and falls back for unknown keys", () => {
    const t = makeT("en");
    expect(t("pager.of", { page: 2, pages: 5 })).toBe("Page 2 of 5");
    expect(translateOr("th", "no.such.key", "raw")).toBe("raw");
  });
  it("shows — for missing numbers, never 0", () => {
    expect(formatNumber("th", null)).toBe("—");
    expect(formatPercent("en", undefined)).toBe("—");
    expect(formatMoney("en", null)).toBe("—");
  });
  it("money has no decimals from 1,000", () => {
    expect(formatMoney("en", 12500, "USD")).toBe("$12,500");
    expect(formatMoney("en", 845.5, "USD")).toBe("$845.50");
    expect(formatPercent("en", 0.124)).toBe("12.4%");
  });
});
