# 2026-09-24 21:45 — one Keyword for every platform

## Goal
User: "คีย์เวิร์ดใช้รวมทุกแพลตฟอร์มได้มั้ย ไม่ต้องแยก" → agreed design: type once, AI translates per platform.

## Done
- Glossary: **Keyword** = what the merchant types once; **Platform term** = the per-platform search text (CONTEXT.md).
- api: `keywords.concept` (migration 0001_worried_harrier), skill `translate-keyword`, `POST /api/groups/:slug/keyword-concepts`
  (inserts one row per platform, `onConflictDoNothing` → skipped "duplicate"; missing platform → skipped "noTerm"),
  PATCH keywords accepts `concept`. `jobs/suggest.ts` now has one `askSkill()` shared by suggest + translate;
  cli answers are parsed tolerantly (first list, `keyword` alias) and translate retries once when nothing usable came back
  — the first real tmp-group call returned 0 terms, the second returned all 4.
- web: KeywordsSettings — add box (one field + "เพิ่มคีย์เวิร์ด"), result message lists the terms made; table row per Keyword,
  one line per distinct term with platform chips (tap = on/off); pencil opens a Modal to correct terms; trash deletes all.
  Old platform dropdown form removed. AI suggestion panel kept inside a <details>.
- Existing 4 rows linked as "สายนาฬิกา Apple Watch". Test rows removed; leftover group `tmp-kw-ui` (from the stopped
  redesign agent) deleted. Group `apple-watch` (runCap 4.9, 0 products) is not ours — left alone.
- Verified: typecheck clean, tests api 151 · web 110; real AI calls (~$0.02 each) for demo-mock (3 CN platforms) and a 4-platform
  group (temu → "apple watch leather band"); the user added "Apple Watch" through the UI and got all 4 terms.
