// Keyword suggestion by AI (CONTEXT.md: Keyword suggestion). Pure — unit-tested in test/keywords.test.ts.
import type { KeywordSuggestion, Platform } from "@pp/contracts";

const CJK = /[㐀-鿿豈-﫿]/;
const LATIN = /[A-Za-z]/;
const CJK_PLATFORMS: readonly Platform[] = ["douyin", "1688", "xhs"];

/** 1688, Douyin and XHS match an English term against any text that contains it (2026-09-24:
 *  `Tempered Glass` returned 150 rows, 0 of them watch products), so they need Chinese; Temu is English.
 *  Used only to drop wrong-language AI suggestions — saving a keyword is not restricted. */
export function languageMismatch(platform: Platform, keyword: string): boolean {
  if (CJK_PLATFORMS.includes(platform)) return !CJK.test(keyword);
  return !LATIN.test(keyword) || CJK.test(keyword);
}

export const SUGGEST_PER_PLATFORM = 6;
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** The model is asked for the right language and to skip saved keywords; this makes sure of both. */
export function cleanSuggestions(raw: unknown[], platforms: Platform[], existing: { platform: string; keyword: string }[]): KeywordSuggestion[] {
  const have = new Set(existing.map((e) => `${e.platform}|${norm(e.keyword)}`));
  const per = new Map<Platform, number>();
  const out: KeywordSuggestion[] = [];
  for (const r of raw) {
    const x = r as { platform?: unknown; keyword?: unknown; glossTh?: unknown } | null;
    const platform = x?.platform as Platform;
    const keyword = typeof x?.keyword === "string" ? x.keyword.trim().replace(/\s+/g, " ").slice(0, 100) : "";
    if (!platforms.includes(platform) || !keyword || languageMismatch(platform, keyword)) continue;
    const k = `${platform}|${norm(keyword)}`;
    if (have.has(k) || (per.get(platform) ?? 0) >= SUGGEST_PER_PLATFORM) continue;
    have.add(k);
    per.set(platform, (per.get(platform) ?? 0) + 1);
    out.push({ platform, keyword, glossTh: typeof x?.glossTh === "string" ? x.glossTh.trim().slice(0, 120) : "" });
  }
  return out;
}
