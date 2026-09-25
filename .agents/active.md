# Active Task

## Last Updated
2026-09-24 evening (Asia/Bangkok) — Postgres setup on the shared server

## Last Agent
Claude Opus 5.5 (1M context) — Claude Code desktop, session "keywords: AI translate, textarea, cleanup"

## Project type
Next.js 16 (apps/web :3020) + NestJS (apps/api :4010) · pnpm monorepo · **Postgres on the shared server** since
2026-09-24 evening (server `virtualmin`, user `product`): `apps/api/.env` → `119.10.137.90:6432` (PgBouncer → PostgreSQL
**17.11**), db `omnix_marketing`, user `dev_omnix_marketing`, schema `product_plus`.
⚠️ The same db holds **Ads Plus** (schema `adsplus` + its drizzle journal in schema `drizzle`) — never touch those.
Our migration journal is `product_plus.__drizzle_migrations` (`migrationsSchema` in `src/db/client.ts`).

## Current Task
Keyword settings for a Group — type a Keyword once in any language, AI makes the Chinese term (Douyin · 1688 · XHS)
and the English term (Temu); the whole list is edited as text like the taxonomy.

## Status
✅ Done and pushed (`main` = `904f244` + this checkpoint). typecheck clean · tests api 154 · web 111.
⚠️ Both real groups are still **over their per-round cap**, so no scheduled round would run (and there is no
`APIFY_TOKEN` yet, so nothing paid can run anyway).

## What's Done (this session — details in sessions/2026-09-24-2310-keywords-ai-textarea.md)
- Keyword card is a textarea: `keyword | Chinese term | English term`, one Keyword per line; empty or wrong-language
  terms are filled by AI in **one** call on save; deleting a line deletes the Keyword (`PUT /groups/:slug/keyword-list`).
- AI suggestions (product name → whole lines) in a disclosure under the box; tap adds a line.
- Live cost line: "N คีย์เวิร์ด ≈ $X ต่อรอบ · เพดาน $Y" + warning when over (`GET /groups/:slug/round-estimate`).
- Fixed "เซิร์ฟเวอร์ตอบกลับผิดพลาด" on save: the /api proxy gave up at 30 s while AI ran per line
  → batched AI, `experimental.proxyTimeout: 180_000`, keyword AI jobs stop at 150 s.
- Removed at the user's request: keyword trial (5-result), language-guard checkbox, frequent-term chips, platform chips.
- Cleaned data (user OK; backups in `.agents/private/keywords-before-cleanup-*.json`):
  `apple-watch-bands` → 1 Keyword · `apple-watch` → 9 Keywords with fixed languages.
- Glossary `CONTEXT.md`: Group · Keyword · Platform term · Round · Smoke test · Keyword suggestion.

## Postgres setup (2026-09-24 evening, uncommitted until the user says)
- Seeded with the free `pnpm seed`: groups `apple-watch-bands` + `demo-mock`, 299 products, 288 images, 42 MB; `/api/health`
  → `{"ok":true,"db":true}`. `apple-watch` (9 Keywords) and the keyword cleanup were NOT carried over — they live in
  `.pglite` on the desktop machine (this clone has no `.pglite` and no `.agents/private/`).
- Code: journal moved to schema `product_plus` (the default `drizzle` schema is Ads Plus's; no USAGE for our user) and
  `0000_init.sql` now `CREATE SCHEMA IF NOT EXISTS` (drizzle's pg migrator compares timestamps, not hashes, so already
  migrated stores skip it). PGlite path unchanged.
- pnpm 10.34.5 installed in `~/.local/bin` (no sudo, no docker group for `product`).

## Blockers
- **Per-round cap vs cost** (user decides, money setting — never change it without asking):
  `apple-watch-bands` ≈ $1.46/round vs cap $1.00 · `apple-watch` ≈ $13.14/round (9 Keywords) vs cap $4.90.
- `FX_CNY_THB` = 4.85 is a placeholder — needs the real rate (ตั้งค่า › ระบบ).
- No `APIFY_TOKEN` in the app; paid runs need the user's explicit OK and a $ cap every time.
- CI: `gh auth refresh -s workflow`, then move `deploy/ci.yml` into `.github/workflows/`.

## Next Steps
1. Ask the user how to fit the cap: raise `apple-watch-bands` to ≥ $1.50 / turn Temu off / result limit 30;
   trim `apple-watch` to ≤ 3 Keywords or raise its cap.
2. Group `apple-watch` holds generic watches (wristwatch, quartz, vintage…) under the name "Apple Watch" — confirm intent.
3. Re-create `apple-watch` on the new Postgres (web UI) or copy it from the desktop `.pglite` with `migrate-store`
   (target is already migrated). Run `pnpm --filter @pp/api evaluate` (free) — not run yet.
4. Re-create a screen-protector group if still wanted (Keyword e.g. `ฟิล์มกระจก Apple Watch`).
5. Left over: estimated time for running jobs (`progressOf()` returns `pct: null`, `apps/api/src/jobs/runs.ts`);
   delete branch `feat/buying-terms-and-detail-page`; `.pglite` stays while PGlite is in use.
