import type { Keyword, KeywordListItem, Platform } from "@pp/contracts";
import { PLATFORM_LIST } from "@/lib/platform";

// Keyword editor format, one Keyword per line (CONTEXT.md):
//   keyword | Chinese term (Douyin · 1688 · XHS) | English term (Temu)
// Either term may be left empty — the api fills it with AI when the list is saved.
const byPlatform = (a: Keyword, b: Keyword) => PLATFORM_LIST.indexOf(a.platform) - PLATFORM_LIST.indexOf(b.platform);

export function keywordsToText(keywords: Keyword[], platforms: Platform[]): string {
  const rows = new Map<string, Keyword[]>();
  for (const k of [...keywords].sort(byPlatform)) {
    if (!platforms.includes(k.platform)) continue;
    const label = k.concept ?? k.keyword;
    rows.set(label, [...(rows.get(label) ?? []), k]);
  }
  return [...rows.entries()]
    .map(([label, ks]) => {
      const zh = ks.find((k) => k.platform !== "temu")?.keyword ?? "";
      const en = ks.find((k) => k.platform === "temu")?.keyword ?? "";
      return [label, zh, en].join(" | ");
    })
    .join("\n");
}

export type KeywordListError = { line: number; reason: "columns" | "duplicate" | "tooLong" };

export function parseKeywordList(text: string): { items: KeywordListItem[]; errors: KeywordListError[] } {
  const items: KeywordListItem[] = [];
  const errors: KeywordListError[] = [];
  const seen = new Set<string>();
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cols = line.split("|").map((c) => c.trim());
    if (cols.length > 3 || !cols[0]) return errors.push({ line: i + 1, reason: "columns" });
    if (cols.some((c) => c.length > 100)) return errors.push({ line: i + 1, reason: "tooLong" });
    if (seen.has(cols[0])) return errors.push({ line: i + 1, reason: "duplicate" });
    seen.add(cols[0]);
    items.push({ keyword: cols[0], zh: cols[1] || null, en: cols[2] || null });
  });
  return { items, errors };
}

/** Lines the api will send to AI because a term this group needs is empty. */
export function needsTranslation(items: KeywordListItem[], platforms: Platform[]): number {
  const needZh = platforms.some((p) => p !== "temu");
  const needEn = platforms.includes("temu");
  return items.filter((i) => (needZh && !i.zh) || (needEn && !i.en)).length;
}
