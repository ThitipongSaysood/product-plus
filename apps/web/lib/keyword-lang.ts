import type { Platform } from "@pp/contracts";

// Mirror of languageMismatch() in apps/api/src/domain/keywords.ts — change both together, or the form
// warns about one rule while the api enforces another.
const CJK = /[㐀-鿿豈-﫿]/;
const LATIN = /[A-Za-z]/;
const CJK_PLATFORMS: readonly Platform[] = ["douyin", "1688", "xhs"];

/** 1688, Douyin and XHS need Chinese; Temu needs English and no Chinese (CONTEXT.md: Language mismatch). */
export function languageMismatch(platform: Platform, keyword: string): boolean {
  if (CJK_PLATFORMS.includes(platform)) return !CJK.test(keyword);
  return !LATIN.test(keyword) || CJK.test(keyword);
}
