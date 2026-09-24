# 2026-09-24 22:40 — "เซิร์ฟเวอร์ตอบกลับผิดพลาด" on saving keywords + keyword logic review

## Root cause (systematic-debugging)
- The save DID complete (rows were in the DB) — the browser got `errors.http` because the Next `/api` rewrite gives up after
  **30 s** (`next/dist/server/lib/router-utils/proxy-request.js:37`, default `proxyTimeout || 30000`) while the api called AI
  **once per line**: measured 2 lines = 19.5 s → 12 lines ≈ 120 s.

## Fixes
1. `translateKeywords()` — every line needing a term in ONE AI call (skill translate-keyword now takes a list, returns
   `{results:[{keyword,zh,en}]}`). Measured: 12 lines through the proxy = 21.5 s, HTTP 200, $0.028 (was ≈ $0.24).
2. Defense in depth: `experimental.proxyTimeout: 180_000` (next.config.ts); keyword AI jobs stop at 150 s
   (`KEYWORD_AI_TIMEOUT_MS`) so the api's own error key reaches the browser first. Cold cli cache: 14–92 s per call.
3. Wrong-language terms: `cleanLineTerms()` drops a zh term without CJK / an en term with CJK or no Latin, so AI refills it
   (group `apple-watch` had `watch` on 1688 and `复古手表` on Temu). The textarea lists those lines ("AI จะแปลใหม่").
4. AI suggestions are whole lines `{keyword (Thai), zh, en, glossTh}` (skill suggest-keywords) — one tap = one Keyword.
   Per-platform chips had turned 12 taps into 12 Keywords (≈ $17.5/round).
5. `GET /api/groups/:slug/round-estimate` + live line under the textarea: "N คีย์เวิร์ด ≈ $X ต่อรอบ · เพดาน $Y", warning when over.
6. Duplicate Platform terms compared case-insensitively in `planKeywordList`.

Tests: api 154 · web 111 (new: cleanLineTerms, cleanTranslations, cleanSuggestionLines, roundCostPerKeyword, wrongLanguage).

## Open — user's data, not changed
- apple-watch-bands: 12 Keywords from the chip taps ≈ $17.52/round vs cap $1.00.
- apple-watch (user-made): 14 legacy rows with wrong-language terms ≈ $20.44/round vs cap $4.90.
