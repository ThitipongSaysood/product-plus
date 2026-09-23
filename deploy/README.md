# Deploy — Railway (workspace `np-nineplus`)

Not deployed yet. Two services from this one repo + one Postgres. Nothing here needs code changes.

## 1. Postgres
Add a PostgreSQL service. The api creates schema `scout` and runs migrations at boot (`DB_AUTO_MIGRATE=true`).

## 2. Service `api` (NestJS)
| setting | value |
|---|---|
| build | `pnpm install --frozen-lockfile && pnpm --filter @pp/api build` |
| start | `pnpm --filter @pp/api start` |
| replicas | **1** (the weekly scheduler runs in-process; 2 replicas = 2 rounds = double spend) |
| env | `DATABASE_URL=${{Postgres.DATABASE_URL}}` · `APP_PASSWORD` · `CRON_SECRET` · `SETTINGS_SECRET` (32+ random chars, encrypts secrets saved from the web) · `NODE_ENV=production` |
| optional env | `APIFY_TOKEN` (or set it later on Settings → System) · `PUBLIC_URL=https://<api domain>` + `APIFY_WEBHOOK_SECRET` (webhooks; without them runs finish by polling) · `ANTHROPIC_API_KEY` (LLM category layer) |

First data: `railway run pnpm --filter @pp/api seed` — creates `apple-watch-bands` with the real 2026-09-24 Apify rows (`apps/api/data/real/…`, no Apify cost) and `demo-mock`.

## 3. Service `web` (Next.js)
| setting | value |
|---|---|
| build | `pnpm install --frozen-lockfile && pnpm --filter @pp/web build` |
| start | `pnpm --filter @pp/web start` (listens on `$PORT`) |
| env | `API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}` · `APP_PASSWORD` (same value as api — the login cookie is checked on both) |

`API_URL` must exist at **build** time too (Next bakes rewrites into the build) — Railway passes service variables to builds, so just set it before the first deploy.

Only `web` needs a public domain; the browser reaches the api through the web's `/api/*` rewrite.

## 4. Money guards to set before adding `APIFY_TOKEN`
- Apify console → Billing → **monthly spending limit** (second layer under the app's own budget).
- In the app: Settings → Keywords & Taxonomy → group budget ($10/month default) and **per-round cap** ($1.00 default; each actor run gets its share as `maxTotalChargeUsd`).
- A weekly round of 3 platforms × 50 ≈ $0.96 at FREE-tier prices (≈ $4/month).

## CI
`deploy/ci.yml` is a ready GitHub Actions workflow (install → typecheck → test). It is not in `.github/workflows/` because the token used to push lacked the `workflow` scope. Enable it with:
```bash
gh auth refresh -s workflow && mkdir -p .github/workflows && git mv deploy/ci.yml .github/workflows/ci.yml && git commit -m "Add CI" && git push
```
