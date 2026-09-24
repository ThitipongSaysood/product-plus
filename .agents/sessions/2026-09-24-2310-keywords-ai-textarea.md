# 2026-09-24 20:30–23:10 — keyword settings: AI translation, textarea editor, cleanup

Earlier pieces of this same session have their own notes: `2026-09-24-2105-keyword-revert-ai-suggest.md`,
`2026-09-24-2145-one-keyword-all-platforms.md`, `2026-09-24-2210-keyword-textarea.md`,
`2026-09-24-2240-keyword-save-timeout.md`. This file is the wrap-up.

## Goal
Make keywords easy for a merchant who cannot read Chinese, without the wrong-language mistake that cost ≈ $2 earlier
(`Tempered Glass` on Chinese platforms → 0 of 150 listings were watch products).

## How it went (user decisions in order)
1. Built keyword trial + AI suggestions + language guard + frequent-term chips (agent) → user: "ใช้ยาก".
2. Reverted to the 17:11 form, kept AI suggestions → then one row per word with platform chips.
3. "Use one keyword for all platforms" → Keyword typed once, AI makes each platform's term (`keywords.concept`).
4. "Show the keyword only, platforms are chosen in the group" → chips removed.
5. "Like the taxonomy textarea" → `keyword | Chinese | English`, whole-list save.
6. Save showed "เซิร์ฟเวอร์ตอบกลับผิดพลาด" → root cause: 30 s /api proxy vs one AI call per line (~10 s each);
   fixed with one batched call + proxyTimeout 180 s + 150 s AI stop. 12 lines: 21.5 s, $0.028 (was ≈ 120 s, ≈ $0.24).
7. Logic review fixes: wrong-language terms refilled by AI, whole-line AI suggestions, live round cost vs cap,
   case-insensitive duplicate terms.
8. Cleanup (user OK): apple-watch-bands 12 → 1 Keyword; apple-watch 14 wrong-language rows → 9 clean Keywords.

## Files touched (main ones)
- api: `src/domain/keywords.ts` (languageMismatch, cleanLineTerms, cleanTranslations, cleanSuggestionLines,
  roundCostPerKeyword, planKeywordList) · `src/jobs/suggest.ts` (askSkill, suggestKeywords, translateKeywords) ·
  `src/jobs/claude-cli.ts` (timeout param) · `src/modules/groups.controller.ts` (PUT keyword-list, GET round-estimate,
  POST keyword-suggestions) · `src/db/schema.ts` + `drizzle/0001_worried_harrier.sql` (keywords.concept) ·
  `claude-plugin/skills/{translate-keyword,suggest-keywords}/SKILL.md` · `test/keywords.test.ts`
- web: `components/settings/KeywordsSettings.tsx` · `keyword-list.ts` (+test) · `keyword-suggest.tsx` ·
  `app/(shell)/settings/keywords/page.tsx` · `next.config.ts` · `i18n/dictionary.ts` · `app/globals.css`
- contracts: Keyword.concept · KeywordListItem/Response · KeywordSuggestion (whole line) · RoundEstimate
- docs: `CONTEXT.md` (glossary)

## Learned
- The Next rewrite proxy defaults to 30 s (`next/dist/server/lib/router-utils/proxy-request.js`); a slow api call
  looks failed in the browser while the api finishes the work — check the DB before assuming a save failed.
- The claude CLI's cost/latency depends on its cache: cold 53–92 s / $0.045–0.066, warm 14 s / $0.009 per call.
  The $ it reports is API-equivalent; with the claude.ai login it counts against the plan quota, not a bill.
- Per-platform AI chips turned each tap into its own Keyword (12 taps ≈ $17.5/round) — suggestions must be whole lines.
- `grill-with-docs` does load now (it did not in an earlier session).

## State at end
Pushed to `main`; tests api 154 · web 111; typecheck clean. The user's own staged `.gitignore` change and `text.txt`
were left untouched.

## Next step
Ask the user how to bring both groups under their per-round caps (see `.agents/active.md` → Next Steps).
