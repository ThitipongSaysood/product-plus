# @pp/api — China Marketplace Scout backend

NestJS 12 · Drizzle (`scout` schema) · PGlite in dev · zod · vitest. Port **4010**, prefix `/api`.

## Scripts
| | |
|---|---|
| `pnpm --filter @pp/api dev` | `tsx watch` (no constructor DI anywhere, so no decorator metadata is needed) |
| `build` / `start` | `tsc` → `node dist/main.js` |
| `typecheck` · `test` | tsc · vitest (domain, normalizers incl. REAL smoke rows, mock source) |
| `seed` | groups + keywords + taxonomy; imports the real 2026-09-24 Apify batch into `apple-watch-bands`; runs the mock pipeline for 3 dates into `demo-mock`. Idempotent. |
| `evaluate [-- douyin xhs]` | actor evaluation against the **free public** Apify API (never starts an actor) and prints the table |
| `import:dataset -- --group <slug> --platform <p> --file <json> --run-id <apifyRunId> --actor <owner/name> --cost <usd> [--at <iso>] [--no-post]` | ingest a dataset pulled outside the app (console/MCP) through the normal ingest path; idempotent per run id |
| `db:generate` | drizzle-kit → `drizzle/` (applied at boot) |

PGlite is single-process: stop the api before `seed`, `evaluate` or `import:dataset`.

## Env / settings
Resolution order: `app_settings` (DB) → env → fallback → unset. Secrets are AES-GCM encrypted in the DB when `SETTINGS_SECRET` is set; the settings API only returns the last 4 characters.

| key | where | note |
|---|---|---|
| `APIFY_TOKEN` | DB/env, secret | enables apify mode, plan tier from `/v2/users/me` |
| `APIFY_WEBHOOK_SECRET` | DB/env, secret | `/api/webhooks/apify?secret=`; webhooks are registered only when `PUBLIC_URL` is set too |
| `SOURCE_MODE` | DB/env | `mock` \| `apify`; fallback = `apify` if a token exists, else `mock` |
| `ANTHROPIC_API_KEY` | DB/env, secret | enables categorization layer 3 (`claude-haiku-4-5`, batches of 25) |
| `APP_PASSWORD` · `CRON_SECRET` · `SETTINGS_SECRET` · `DATABASE_URL` | env only, never returned (value null) | unset password = open app in dev; **production refuses to boot without it**. Unset cron secret = cron endpoints closed (401). |
| `PORT` (4010) · `DB_AUTO_MIGRATE` (true) · `PGLITE_DIR` (`<repo>/.pglite`) · `PUBLIC_URL` | env | |

## Mock vs apify
- A group may pin its source (`product_groups.source_mode`): `demo-mock` = `mock`, `apple-watch-bands` = `apify` (never receives mock rows). Unpinned groups follow `SOURCE_MODE`. `Overview.sourceMode` is the group's mode.
- **mock**: deterministic per (platform, keyword, date), rows in each actor's real output shape (so normalizers run for real), products drift week to week; images are local SVG placeholders at `/api/media/mock/*.svg` (a few XHS ones "expire" to demo `imageLost`). Cost 0, finishes inline.
- **apify**: the chosen actor per platform (latest evaluation, `PUT /api/actors/choose` overrides) is started with its input template (`{{keyword}} {{limit}} {{region}}`, empty keys dropped), `maxItems` = limit and `maxTotalChargeUsd` = its share of the group's `runCapUsd`. Rounds whose estimate exceeds the cap are skipped (`skip.runCap`). Runs finish via webhook or reconcile polling (START-LOST 10 min, TIMED-OUT 60 min); `usageTotalUsd` → `cost_usd`.
- Budget: a round is skipped (`skip.budget`) when month spend + in-flight provisional costs + the round estimate exceed `monthlyBudgetUsd`; **budget 0 = spending paused** (everything skipped). `runCapUsd` must be ≤ the budget. Each actor's `maxTotalChargeUsd` = min(its share of the cap, remaining budget). An actor with no positive estimate is skipped (`skip.pricingUnknown`).
- Cost: a started run gets a provisional `cost_usd` = its `maxTotalChargeUsd`; the actual (`usageTotalUsd`, else charged events × evaluated prices) replaces it when known — also later, as a cost-only update on a run already closed as TIMED-OUT.
- Paid calls happen only from: `POST /api/jobs/pipeline {pg, confirm: true}` on an apify group with a token, the 05:00 Asia/Bangkok tick (every day for `daily` groups, Mondays for `weekly`; also `GET /api/cron/{daily,weekly}` with `Authorization: Bearer $CRON_SECRET`), and `POST /api/actors/smoke` (`confirm: true` + token, capped, never on a mock group). No token is configured today.
- Every non-GET `/api` request (except the Apify webhook) must be `content-type: application/json` (CSRF) → else 415 `errors.contentType`. `POST /api/auth` is limited to 10/min per IP.

## Keys returned to the web
Errors `{ error }`: `errors.validation` `errors.notFound` `errors.internal` `common.unauthorized` `errors.auth.wrongPassword` `errors.group.notFound` `errors.product.notFound` `errors.keyword.notFound` `errors.keyword.duplicate` `errors.media.notFound` `errors.job.alreadyRunning` (+ `progress`) `errors.settings.envOnly` `errors.actors.needsToken` `errors.actors.noTemplate` `errors.actors.noKeyword` `errors.actors.notFound` `errors.contentType` `errors.confirmRequired` `errors.actors.mockGroup` `errors.actors.notChoosable` `errors.auth.rateLimited` `errors.tooLarge` `common.forbidden`.
Skip reasons: `skip.noToken` `skip.noActor` `skip.budget` `skip.runCap` `skip.pricingUnknown` `skip.alreadyRunning` `skip.concurrency` `skip.recentRun` `skip.startFailed`.
Progress step labels (`JobStatus.running.step`/`label`): pipeline `scrape` `categorize` `media` `trend`; categorize `fill` `retag`; evaluate `evaluate`.
Actor exclusions: `actors.excluded.{needsCookie,failRate,pricingUnknown,noImage,noLink,noSold,smokeEmpty,noKeywordSearch}`.
Settings test detail when no key: `settings.test.noKey`.

Run note patterns (`src/domain/notes.ts`, EN, translate with regex):
```
Apify reported <STATUS>.
The <platform> actor could not read this target: <detail>
The <platform> actor returned no rows for this keyword.
The <platform> actor returned <n> rows and none could be read.
Run returned <x> products against <y> last time (below the 40% floor).
Read <out> of <in> rows.
Start lost: no Apify run id after 10 minutes.
Timed out: still running after 60 minutes.
Server restarted while this job was running.
Could not start the actor: <detail>
Categorized <n> products: <p> by platform map, <r> by rules, <l> by AI, <u> unclassified.
AI categorization failed: <detail>
Pipeline finished: <ok> of <total> scrapes succeeded, <skipped> skipped.
Step <step> failed: <detail>
Evaluated <n> actors; chosen: <platform>=<actor|none>, ….
Highest completeness <c>/5 at $<x.xxxx> per result.
Verified by smoke test; completeness <c>/5 at $<x.xxxx> per result.
Chosen manually.
Smoke test read <out> of <in> rows[ for $<x.xxxx>].
```
