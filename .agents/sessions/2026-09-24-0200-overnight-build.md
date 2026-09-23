# 2026-09-24 overnight build — spec → plan → build → test → review

## Goal
Build the whole China Marketplace Scout (Apple Watch bands) from docs/04-handoff… + docs/design-system.md, frontend + backend, while the user slept.

## Done
- docs/SPEC.md (decisions taken by default), docs/PLAN.md (API + layout), packages/contracts (shared types).
- apps/api (NestJS 12, Drizzle, PGlite dev / Postgres prod, schema `scout`): adapters mock+apify, 3 real normalizers (+Temu kept), gate/diff/trend/categorize/budget/cost domain, pipeline, reconcile, webhook, weekly+daily schedule, actor evaluation from the free Apify API, settings (AES-GCM), auth, media cache. 81 tests.
- apps/web (Next 16, OMNIX tokens): Overview, Products, Product detail, Categories, Trends, Actor Evaluation, Settings (Keywords & Taxonomy, System), Login; th/en/zh. 105 tests (dictionary, contrast, RWD audit, notes, proxy…).
- Apify (user-approved): smoke 5×4 ≈ $0.15 (Temu blocked by all 3 actors → user dropped Temu), full batch Douyin 30 / 1688 50 / XHS 50 ≈ $0.80. Logged in docs/SMOKE-TEST-2026-09-24.md; data in apps/api/data/real/2026-09-24/.
- Seed: group `apple-watch-bands` = real data (130 products, 130/130 images, 115 categorized by rules, 15 unclassified); group `demo-mock` = mock with 3 rounds for trends.
- Changes after seeing real data: Overview chart = Douyin daily units (only real time series; don't mix lifetime totals); Douyin products get trend from their own 30-day salesTrend on the first snapshot; Trends chart uses changePct.
- Two independent review rounds (17 + 4 new findings) — money safety (CSRF, confirm, budget incl. in-flight, provisional cost, caps everywhere, one running pipeline/smoke per group), SSRF (IPv6-mapped, DNS pinning), media XSS, keyword-aware diff, session expiry. All fixed; re-verified by curl.
- Repo: https://github.com/OMNIX-9Plus/product-plus (private), 3 commits on main.

## State at end
All green: typecheck, 186 tests, api + web builds, fresh-DB seed. Dev servers left running (api 4010, web 3020) via .claude/launch.json.

## Not done / open
- Not deployed to Railway (no CLI/secrets here) — deploy/README.md has the steps.
- CI workflow sits in deploy/ci.yml (push token lacked `workflow` scope).
- No APIFY_TOKEN in the app → the pipeline for the real group skips with skip.noToken; the real data came in via import:dataset.
- LLM category layer untested (no ANTHROPIC_API_KEY).
- Trend from our own snapshots needs a 2nd real round (≥ 3 days later).
- Known limits: session cookie is stateless (logout doesn't revoke other copies); generic platform category paths ("智能手表表带") stay in the unmapped queue on purpose.

## Next step
User reviews the UI; then decide: add APIFY_TOKEN + deploy to Railway, run 2nd weekly round for trends, re-enable Temu later if actors recover.
