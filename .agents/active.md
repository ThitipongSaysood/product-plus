# Active Task

## Last Updated
2026-09-25 morning (Asia/Bangkok) — deployed at http://product-plus.nineplus.co.th

## Last Agent
Claude Opus 5.5 (1M context) — Claude Code VS Code (remote ssh), session "run app + deploy on nineplus"

## Deploy on nineplus (2026-09-25) — details in deploy/README.md §14
- DNS `product-plus.nineplus.co.th` → 119.10.140.196 (user added the A record). Apache vhost (Virtualmin) → web :3020.
- Production web (`next start`) + api from `dist/` via `deploy/start-nineplus.sh` (logs `~/logs/product-plus/`).
  api deliberately WITHOUT `NODE_ENV=production` — secure cookie would break login over http.
- `~/.local/bin/claude` installed (official installer), logged in with claude.ai **Max** (no API key) → brand +
  translate jobs ran OK. User wants the subscription, not the API: keep `AI_BACKEND=cli`.
- FX set from ECB via frankfurter.app, rate date 2026-09-24: `FX_CNY_THB=4.9877`, `FX_USD_THB=33.48`.
- favicon `apps/web/app/icon.svg` (P+ brand mark).
- 🔴 **Left for the user** (auto-mode refused the agent): `APP_PASSWORD` + `CRON_SECRET` in `apps/api/.env` and
  `APP_PASSWORD` in `apps/web/.env.local`, then `deploy/start-nineplus.sh` — the site is public with no password
  and `APIFY_TOKEN` is set; `@reboot` crontab line (README §14). HTTPS cert needs a Virtualmin admin.

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

## AI model (2026-09-25, uncommitted)
All 5 AI skills now run on `claude-sonnet-5` (user's call). Speed via effort: `LLM_EFFORT` low (translate,
categorize, keyword AI) · `BRAND_EFFORT` medium — `--effort` on the cli, `output_config.effort` on the sdk
(`apps/api/src/jobs/llm.ts`). Categorize batches now run concurrently (`pooled`, moved to `claude-cli.ts`).
Live server is `AI_BACKEND=cli`, no API key. Built + restarted 2026-09-25, committed 90aa37a.
Measured 2026-09-25 (cli, translate-keyword, 3 Thai keywords): Haiku 8.5 s / 11.4 s ($0.019, ~1,000 thinking tokens)
· Sonnet 5 low 5.4 s cold / 2.8 s warm ($0.197 cold / $0.064 warm, 0 thinking) · Sonnet 5 default 6.6 s ($0.066).
Each cli call sends ~49K input tokens of Claude Code's own prompt — that, not the model, is the cost.

## Products page usability fixes (2026-09-25, uncommitted) — details in sessions/2026-09-25-1010-products-usability.md
Review #1–9 fixed: Thai search, sold sort by period block, THB line + price sort in baht, neutral sold chip,
no "no history" tile, translate button only when titles are left, mobile filter toggle, Temu titles now
translated (skill rule 7 changed), "ประเมิน Actor" → "ทดสอบแหล่งข้อมูล". Not built/restarted — the live site
still runs the old code. 5 Temu titles wait for the user to press "แปลชื่อที่เหลือ (5)".

## AI category suggestion (2026-09-25, committed 90aa37a, live)
6th AI skill `suggest-categories`: reads unclassified titles (≤ 80) and proposes new taxonomy lines; the server keeps
only keywords literally in a title and lines that catch ≥ 2 distinct titles (`cleanCategorySuggestions`,
`domain/categorize.ts`). UI: "ให้ AI เสนอหมวดใหม่" under the taxonomy editor; tap adds a line, save re-runs the free
rules (`applyRules`). Tried on the 15 real unclassified listings: 14 s, $0.078 → wool 毛昵 · top-hat horse 礼帽马 · resin 树脂.

## AI platform-category matching (2026-09-25, live)
7th skill `match-platform-categories` (`POST /category-map/auto`): each unmapped path → one key or `_broad`
(`BROAD_PATH`, stops layer 1, leaves listings to the rules, leaves the queue; undo = `DELETE /category-map`).
Server guard `mappingSafe`: refuse a map when > 20 % of rule-sorted listings under the path went elsewhere.
Dry run on the 5 real paths: all broad (after the skill was told to judge the path name, not the samples —
the first try mapped 腕表配件 to silicone because both samples were silicone) · control 智能手表保护壳 → case. $0.08.
Also: taxonomy card "ให้ AI จัดสินค้าที่ยังไม่มีหมวด" = `jobs/categorize` mode `pending` (fill without the 7-day wait).
Live 2026-09-25 after the user ran both buttons: 12 categories, 5 paths broad, 6 unclassified (lace, leopard,
jade, 蓝猩 no material: 1 each; wool ×2 now proposed after 7c829a6 — counts listings, not distinct titles).
Category gaps found, not fixed: no manual category pick anywhere; taxonomy edits don't re-sort already-sorted
products (retag has no button); category_map is global while taxonomies are per group.

## Blockers
- ⚠️ The api answers without login from the internet (checked 2026-09-25: POST category-suggestions returned 200
  with no cookie) — anyone can start AI jobs. Set `APP_PASSWORD` (and `NODE_ENV=production` now that https is up).
- **Per-round cap vs cost** (user decides, money setting — never change it without asking):
  `apple-watch-bands` ≈ $1.46/round vs cap $1.00 · `apple-watch` ≈ $13.14/round (9 Keywords) vs cap $4.90.
- `APIFY_TOKEN` is now set (DB); paid runs still need the user's explicit OK and a $ cap every time.
- CI: `gh auth refresh -s workflow`, then move `deploy/ci.yml` into `.github/workflows/` (not before — pushes
  would be refused for the whole repo). `gh` is not installed on the nineplus server.

## Next Steps
1. Ask the user how to fit the cap: raise `apple-watch-bands` to ≥ $1.50 / turn Temu off / result limit 30;
   trim `apple-watch` to ≤ 3 Keywords or raise its cap.
2. Group `apple-watch` holds generic watches (wristwatch, quartz, vintage…) under the name "Apple Watch" — confirm intent.
3. Re-create `apple-watch` on the new Postgres (web UI) or copy it from the desktop `.pglite` with `migrate-store`
   (target is already migrated). Run `pnpm --filter @pp/api evaluate` (free) — not run yet.
4. Re-create a screen-protector group if still wanted (Keyword e.g. `ฟิล์มกระจก Apple Watch`).
5. Left over: estimated time for running jobs (`progressOf()` returns `pct: null`, `apps/api/src/jobs/runs.ts`);
   delete branch `feat/buying-terms-and-detail-page`; `.pglite` stays while PGlite is in use.
