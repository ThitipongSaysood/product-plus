# Product Plus — China Marketplace Scout · SPEC

> Source of truth: `docs/04-handoff-china-marketplace-scout.md` (logic, actors, DB) and `docs/design-system.md` (UI).
> This file records **what we build** and the **decisions taken where the handoff said "ask the user"** (user was away overnight, 2026-09-24).

## 1. Goal
Watch "Apple Watch band" products on Chinese marketplaces — **active: Douyin 抖音商城 · 1688 · Xiaohongshu shop**. Temu dropped for now (user, 2026-09-24: all 3 Temu actors blocked in the smoke test); code keeps Temu support and it can be re-enabled per group in Settings. Answer:
which category, how well it sells, rising or falling. **E-commerce data only** (user instruction) — no XHS notes, no Douyin hot-search, no social buzz layer.

Per product: auto category · 30-day sold (Douyin) else latest sold with its `period` · image + link · trend.
Hard cap: **50 results per platform per keyword per run** (actor input AND cut at ingest).

## 2. Stack (user CLAUDE.md overrides handoff where they differ)
| layer | choice | note |
|---|---|---|
| repo | pnpm monorepo `apps/api` `apps/web` `packages/contracts` | GitHub org **OMNIX-9Plus** (private) |
| backend | **NestJS 12** · TypeScript strict · Drizzle ORM · zod | handoff used Next route handlers; CLAUDE.md mandates NestJS |
| DB | PostgreSQL (Railway, workspace np-nineplus) · schema `scout` · dev = **PGlite** (no install) | `DATABASE_URL` unset → PGlite at `.pglite/` |
| frontend | **Next.js 16** App Router · Tailwind 4 · OMNIX tokens (design-system.md §1) · Recharts | no other UI lib |
| tests | vitest (domain pure functions, normalizers, contrast, rwd audit, dictionary) | |
| scraping | apify-client · `SOURCE_MODE=mock|apify` | mock is free and default when no token |
| AI (category layer 3) | Anthropic API (`claude-haiku-4-5`) only if `ANTHROPIC_API_KEY` set | rules-only otherwise |

Ports (dev): api **4010**, web **3020** (never 3010). Web rewrites `/api/*` → api, so the browser sees one origin.

## 3. Decisions taken by default (confirm with user — §14 of handoff)
| # | question | default taken |
|---|---|---|
| 1 | where | local dev now; deploy target Railway (np-nineplus) — **not deployed yet** |
| 2 | Apify account | whatever `APIFY_TOKEN` is set in Settings/env; none set → mock mode |
| 3 | Apify plan | detected from `GET /v2/users/me` when token exists; else price at **FREE** tier (most expensive, safe) |
| 4 | keywords | `苹果手表表带` (douyin/1688/xhs) — 1 per platform · Temu keyword removed with Temu |
| 5 | XHS cookie | **no** → zhorex actor marked `needsCookie` and not chosen |
| 6 | frequency | **weekly** (Mon 05:00 Asia/Bangkok) via in-process scheduler + `GET /api/cron/weekly` |
| 7 | UI languages | th (default) · zh · en |
| 8 | email summary | no |
| — | budget | `monthly_budget_usd = 10` |
| — | paid Apify runs | user capped test spend at **$0.20** → smoke test 5 results × 4 platforms done (≈ $0.15, see SMOKE-TEST-2026-09-24.md). 50-result runs NOT done. |

## 4. Actor selection ("AI finds the cheapest, most complete actor before scraping")
Done in code (`apps/api/src/modules/actors`), free, re-runnable from the Actor Evaluation page:
1. For each platform, search the Apify Store (`GET /v2/store?search=…`) with several queries + the known candidates from handoff §6 (`config/actor-candidates.json`, with `_source` + `_fetchedAt`).
2. Filter to e-commerce product actors (title/description keyword filter; drop video/comment/profile/transcript/notes actors).
3. For each: `GET /v2/acts/<id>` (pricing, 30-day run stats) and `/builds/default` (input schema + README).
4. **cost per result** = `(startFee + 50 × perResultEvents) / 50` at the account's tier (add-on events that are off by default excluded; classification from candidate config, heuristic for unknown actors).
5. **completeness** (0–5) from README/schema evidence: sold 30d · category · image · link · trend. (`hasSold` any sold count tracked separately.)
6. Exclude: fail rate > 10% · needs cookie · no image or no link · no sold count at all.
7. Choose per platform: highest completeness → then lowest cost per result. Reason written as a fixed EN note, translated in UI.
8. Result rows → `actor_evaluations`; chosen actor feeds the scrape input template.
Smoke test (5 results, paid) fills `smoke_*` columns — only when the user presses it.

## 5. Pages (design-system.md §14)
Overview · Products (wall, filters in URL) · Product detail · Categories (lanes) · Trends · Actor Evaluation · Settings: Keywords & Taxonomy · Settings: System · Login.
Mock data is always labelled (badge "ข้อมูลจำลอง / mock data") so nobody mistakes it for real market data.

## 6. Out of scope (add when asked)
Social buzz (XHS notes, Douyin hot search) · email · LLM strategy writing · Temu category trend report ($1/category) · multi-user accounts.
