# 2026-09-24 21:05 — keyword form back to the 17:11 version, AI suggestions kept

## Goal
User found the new keyword tools hard to use ("มันดูใช้ยาก" — 20-row table, 4 Chinese title fragments
模块/原创/硅胶/透气 saved on every platform incl. Temu) and asked: revert the keyword code to how it was
before today's changes, but keep "AI proposes keywords to choose from".

## Done
- `git revert` of d03a616 + f118b21 (keyword trial, language guard, frequent-term / XHS-related chips, trial
  columns) in one commit; then re-added only the AI suggestion:
  - api: `claude-plugin/skills/suggest-keywords/SKILL.md`, `jobs/suggest.ts`, `SKILLS.suggest`,
    `POST /api/groups/:slug/keyword-suggestions`, `domain/keywords.ts` (languageMismatch is now only used to
    drop wrong-language AI output — saving a keyword is unrestricted again, as before).
  - web: new `components/settings/keyword-suggest.tsx` above the old form. Picks are word × platform
    pairs exactly as the AI proposed them; they are NOT pushed through the old textarea, whose
    every-word × every-ticked-platform cross product is what put Chinese on Temu.
- Migration `0001_same_the_stranger` removed from the repo. The running PGlite already applied it, so it
  keeps two unused columns (`scrape_runs.trial_items`, `related_keywords`) — harmless; fresh DBs won't have them.
- Skills used in order: grill-with-docs (earlier), omnix-design-system, frontend-design, ui-ux-pro-max,
  web-design-guidelines (3 fixes: translate="no" on keywords, "…" placeholder, aria-busy).
- Verified: real AI call via the web proxy ("ฟิล์มกระจก Apple Watch", cli backend, $0.024) → 16 words,
  Chinese for douyin/1688/xhs, English for temu, Thai glosses; `/settings/keywords` renders the panel.
  typecheck clean · 256 tests (api 148 · web 108).

## Not done / open
- The 16 junk keyword rows (模块 原创 硅胶 透气 × 4 platforms) are still in `apple-watch-bands`; the user was
  asked whether to delete them and has not answered. Until then a round ≈ $7.30 > $1 cap → skipped.
- "Add selected" was not clicked end to end in a browser (no browser tools this session); it posts the same
  body as the old form.
