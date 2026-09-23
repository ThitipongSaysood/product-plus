# Active Task

_Last updated: 2026-09-24_

## Project type (auto-detected)

Next.js + NestJS (pnpm monorepo)

## Current goal

System is built and reviewed; waiting for the user to look at it and decide on deploy + Apify token.

## What just happened

Overnight build finished — see .agents/sessions/2026-09-24-0200-overnight-build.md. Real data for Douyin/1688/XHS loaded (130 products, ≈ $0.95 Apify total incl. smoke). Temu dropped (blocked). Two review rounds fixed.

## Blockers

- Railway deploy needs the user (CLI login + secrets: APP_PASSWORD, CRON_SECRET, SETTINGS_SECRET, APIFY_TOKEN).
- CI needs `gh auth refresh -s workflow` (file in deploy/ci.yml).

## Next step

Walk the user through the UI (pnpm dev → http://localhost:3020), then deploy per deploy/README.md.
