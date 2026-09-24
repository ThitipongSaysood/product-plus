// Keyword suggestion by AI (CONTEXT.md: Keyword suggestion). Pure — unit-tested in test/keywords.test.ts.
import type { KeywordListItem, KeywordSuggestion, Platform } from "@pp/contracts";

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

const normTerm = (s: string) => s.trim().replace(/\s+/g, " ").slice(0, 100);
const zhOk = (s: string) => !languageMismatch("douyin", s);
const enOk = (s: string) => !languageMismatch("temu", s);
/** A term in the platform's language, trimmed, or null. */
const term = (v: unknown, ok: (s: string) => boolean): string | null => {
  const s = typeof v === "string" ? normTerm(v) : "";
  return s && ok(s) ? s : null;
};

/** One saved line: a term in the wrong language is dropped so AI refills it on save — measured
 *  2026-09-24: `watch` saved on 1688 and `复古手表` on Temu searched the wrong thing every round. */
export function cleanLineTerms(item: KeywordListItem): KeywordListItem {
  return { keyword: item.keyword, zh: term(item.zh, zhOk), en: term(item.en, enOk) };
}

/** The AI's batched answer ({keyword, zh, en} per line) → terms per requested keyword, validated. */
export function cleanTranslations(raw: unknown[], asked: string[]): Map<string, { zh: string | null; en: string | null }> {
  const out = new Map<string, { zh: string | null; en: string | null }>();
  for (const r of raw) {
    const x = r as { keyword?: unknown; zh?: unknown; en?: unknown } | null;
    const k = typeof x?.keyword === "string" ? x.keyword.trim() : "";
    if (!asked.includes(k) || out.has(k)) continue;
    out.set(k, { zh: term(x?.zh, zhOk), en: term(x?.en, enOk) });
  }
  return out;
}

export const SUGGEST_MAX = 8;

/** AI Keyword suggestions are whole lines — a Thai keyword with its Chinese and English term — so one
 *  tap adds one Keyword; per-platform chips made each word its own Keyword and multiplied the round. */
export function cleanSuggestionLines(raw: unknown[], existingLabels: string[]): KeywordSuggestion[] {
  const have = new Set(existingLabels.map((l) => l.trim().toLowerCase()));
  const out: KeywordSuggestion[] = [];
  for (const r of raw) {
    const x = r as { keyword?: unknown; zh?: unknown; en?: unknown; glossTh?: unknown } | null;
    const keyword = typeof x?.keyword === "string" ? normTerm(x.keyword) : "";
    const zh = term(x?.zh, zhOk);
    const en = term(x?.en, enOk);
    if (!keyword || (!zh && !en) || have.has(keyword.toLowerCase()) || out.length >= SUGGEST_MAX) continue;
    have.add(keyword.toLowerCase());
    out.push({ keyword, zh, en, glossTh: typeof x?.glossTh === "string" ? x.glossTh.trim().slice(0, 120) : "" });
  }
  return out;
}

/** What one Keyword costs per Round: every watched platform's chosen actor at the group's result limit.
 *  null when a platform has no priced actor — an estimate that silently leaves one out would read low. */
export function roundCostPerKeyword(actors: Partial<Record<Platform, { startFee: number; pricePerResult: number }>>, platforms: Platform[], limit: number): number | null {
  let sum = 0;
  for (const p of platforms) {
    const a = actors[p];
    if (!a) return null;
    sum += a.startFee + limit * a.pricePerResult;
  }
  return Math.round(sum * 10000) / 10000;
}

// ---------- Keyword list (the textarea editor: one line = one Keyword) ----------
type ExistingRow = { id: string; platform: Platform; keyword: string; concept: string | null };
export type KeywordListPlan = {
  inserts: { platform: Platform; keyword: string; concept: string }[];
  updates: { id: string; keyword: string; concept: string }[];
  deletes: string[];
  skipped: { keyword: string; platform: Platform; reason: "keywords.skip.noTerm" | "keywords.skip.duplicate" }[];
};

const isCjkPlatform = (p: Platform) => CJK_PLATFORMS.includes(p);

/** Replace a Group's Keywords with the list the merchant saved. The Chinese term goes to every Chinese
 *  platform and the English term to Temu; a Keyword removed from the list loses all its rows. Rows of
 *  platforms the group does not watch are left alone for Keywords that stay. Pure — the controller
 *  fills missing terms with AI first and then applies this in one transaction. */
export function planKeywordList(existing: ExistingRow[], items: KeywordListItem[], platforms: Platform[]): KeywordListPlan {
  const plan: KeywordListPlan = { inserts: [], updates: [], deletes: [], skipped: [] };
  const labelOf = (r: ExistingRow) => r.concept ?? r.keyword;
  const wanted = new Set(items.map((i) => i.keyword));
  const taken = new Set<string>(); // platform|term already claimed in the new list
  const kept = new Set<string>(); // existing row ids that stay
  for (const item of items) {
    for (const p of platforms) {
      const term = (isCjkPlatform(p) ? item.zh : item.en)?.trim() || "";
      if (!term) {
        plan.skipped.push({ keyword: item.keyword, platform: p, reason: "keywords.skip.noTerm" });
        continue;
      }
      if (taken.has(`${p}|${term.toLowerCase()}`)) {
        plan.skipped.push({ keyword: item.keyword, platform: p, reason: "keywords.skip.duplicate" });
        continue;
      }
      taken.add(`${p}|${term.toLowerCase()}`);
      const row = existing.find((r) => r.platform === p && labelOf(r) === item.keyword && !kept.has(r.id));
      if (row) {
        kept.add(row.id);
        if (row.keyword !== term || row.concept !== item.keyword) plan.updates.push({ id: row.id, keyword: term, concept: item.keyword });
      } else plan.inserts.push({ platform: p, keyword: term, concept: item.keyword });
    }
  }
  for (const r of existing) {
    if (kept.has(r.id)) continue;
    if (platforms.includes(r.platform) || !wanted.has(labelOf(r))) plan.deletes.push(r.id);
  }
  return plan;
}
