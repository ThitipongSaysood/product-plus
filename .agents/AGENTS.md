# AGENTS.md — product-plus

> Read this first. It explains how the `.agents/` directory works and how
> AI assistants should record progress so the next session can resume.

## Project

- **Name**: product-plus (China Marketplace Scout — Apple Watch bands)
- **Type**: Next.js (apps/web) · NestJS (apps/api) · pnpm monorepo
- **Git remote**: — (target: GitHub org OMNIX-9Plus, private)
- **Branch**: main
- **Bootstrapped**: 2026-09-24

## Rules for AI assistants

1. **Before starting work** — read `.agents/active.md` for the current goal,
   blockers, and next step. If empty, ask the user what they want to do.
2. **While working** — keep `.agents/active.md` up to date when the situation
   changes (new blocker, decision made, scope shift). One short sentence per
   update is enough.
3. **When ending a work session** — append a checkpoint at
   `.agents/sessions/YYYY-MM-DD-HHMM-<slug>.md` with:
   - Goal of the session
   - What was actually done (files touched, decisions)
   - State at end (passing? blocked? half-done?)
   - Next step for whoever picks this up
4. **Cross-task knowledge** (architecture notes, API quirks, gotchas) goes in
   `.agents/topics/<slug>.md` — not in session checkpoints.
5. **Private / scratch / sensitive notes** go in `.agents/private/` — this
   subfolder is `.gitignore`d and never pushed.
6. **Re-generate** `.agents/index/repo-tree.md` if the directory structure
   changes significantly.

## Project rules

- Source of truth: `docs/04-handoff-china-marketplace-scout.md` (logic) · `docs/design-system.md` (UI) · `docs/SPEC.md` (decisions) · `docs/PLAN.md` (API + layout) · `packages/contracts/src/index.ts` (API types, `import type` only).
- **Never start a paid Apify actor run without the user's explicit OK and a stated $ cap.** Reading store/act/build endpoints is free.
- Never guess actor field names — normalizers are tested on REAL rows in `apps/api/test/fixtures/real/`.
- Sold numbers always carry `period` (30d | lifetime | unknown); never convert lifetime to "30 days".
- 50 results max per platform per keyword per run (actor input AND cut at ingest).
- UI: OMNIX tokens only (no hex in components), every string via `t()` in th/en/zh, tables in `TableScroll`.
- Errors from the API are i18n keys (`{error:"errors.x"}`).
- Temu actors break when Temu updates its anti-bot: only `crw/temu-products-scraper` worked on 2026-09-24 (3 others blocked). A 0-row run is `suspect`, never a reason to mark products gone.
- Ports: api 4010, web 3020. Never 3010. Never touch the Ads Plus system.
