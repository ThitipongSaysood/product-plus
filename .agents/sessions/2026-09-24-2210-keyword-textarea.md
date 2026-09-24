# 2026-09-24 22:10 — Keywords edited as text, like the taxonomy

User: "รวมคีย์เวิร์ดแบบรูปนี้เลย" (screenshot of the taxonomy textarea). Earlier the same evening: one Keyword for every
platform (21:45), table without platform chips (22:00).

## Done
- Format `keyword | Chinese term (Douyin · 1688 · XHS) | English term (Temu)`; the keyword alone is enough.
- api: `PUT /api/groups/:slug/keyword-list` — fills empty terms with `translateKeyword` (AI), then applies
  `planKeywordList()` (pure, 4 tests) in one transaction: deletes first, then updates, then inserts. A Keyword left out
  of the list loses its rows; rows of platforms the group doesn't watch are kept for Keywords that stay.
  The one-keyword `POST keyword-concepts` endpoint and `KeywordAddResponse` were removed (nothing used them any more).
- web: `components/settings/keyword-list.ts` (keywordsToText / parseKeywordList / needsTranslation, tested);
  KeywordsEditor is now the textarea + save + result line; AI suggestion chips (in a <details>) append lines.
- Verified: typecheck clean · api 155 · web 110 tests. Real group: saving the unchanged list kept every row id, no AI call.
  demo-mock: a keyword-only line got 苹果手表尼龙表带 on 3 platforms ($0.02 AI, claude.ai quota), then removing the line
  deleted those rows. Side effect: demo-mock's legacy rows now carry `concept` = their own text.

## Known limit
The three Chinese platforms share one term in this format; a per-platform Chinese variant saved earlier collapses to the
first platform's term the next time the list is saved.
