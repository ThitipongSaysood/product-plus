# Deploy — Railway (workspace `np-nineplus`)

Not deployed yet. Two services from this one repo + one Postgres. Nothing here needs code changes.

## 1. Postgres
Add a PostgreSQL service (18 to match development). The api creates schema `product_plus` inside the
database `DATABASE_URL` points at, and runs migrations at boot (`DB_AUTO_MIGRATE=true`). One database
per business area, one schema per app, so other services can share the server later.

## 2. Service `api` (NestJS)
| setting | value |
|---|---|
| build | `pnpm install --frozen-lockfile && pnpm --filter @pp/api build` |
| start | `pnpm --filter @pp/api start` |
| replicas | **1** (the scheduler runs in-process; 2 replicas = 2 rounds = double spend) |
| schedule | Each group picks its own day and hour (Asia/Bangkok) under Settings › Product groups. The in-process tick runs hourly and starts only the groups whose slot is that hour; a group runs at most once per Bangkok day (once per 6 days when weekly). If the process is down at a group's hour, that round is skipped rather than fired later at an hour nobody chose. |
| claude CLI (AI jobs) | `AI_BACKEND=cli` runs translation and categorisation through the logged-in `claude` on the server, so no ANTHROPIC_API_KEY is needed. `--plugin-dir` **adds** this repo's plugin to whatever that account already has rather than replacing it, so keep the server's claude account free of unrelated skills — anything installed there is loaded into every job, costs tokens on every invocation and can change the output. The skills live outside `dist/`, so deploy the repo, not just the build. |
| external timer (optional) | `GET /api/cron/tick` with `CRON_SECRET`, called hourly, does exactly what the in-process tick does. `GET /api/cron/{daily,weekly}` still force-run a whole schedule and ignore the configured hour — keep them for manual recovery, not for a timer. |
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
- Title translation (§5) is **not** covered by these guards — it bills Anthropic, not Apify.

## 5. Title translation — API key or the `claude` CLI

Chinese titles are translated to Thai by the **Translate titles** button on the Products page. Two backends;
pick one with `TRANSLATE_BACKEND` (Settings → System, or an env var):

| `TRANSLATE_BACKEND` | Needs | Notes |
|---|---|---|
| `sdk` (default when a key exists) | `ANTHROPIC_API_KEY` | Direct call to api.anthropic.com. Batches of 25. |
| `cli` | a logged-in `claude` on the same host | No key. `CLAUDE_CLI_PATH` defaults to `claude`. Batches of 40, 3 at a time. |

Leave it unset and the app picks `sdk` when `ANTHROPIC_API_KEY` is set, `cli` otherwise.

### Running the `cli` backend on a VPS

The api shells out to `claude -p --output-format json --allowed-tools "" --strict-mcp-config --plugin-dir …`, so the
binary has to be on the box **and logged in as the same OS user the api runs as** — credentials live in
that user's `~/.claude`, and systemd units often run as a different user with a different `HOME`.

```bash
# as the user that will run the api (e.g. `deploy`), not root
curl -fsSL https://claude.ai/install.sh | bash     # or npm i -g @anthropic-ai/claude-code
claude                                             # log in once, interactively
claude -p --output-format json --allowed-tools "" 'say ok'   # must print JSON, not a login prompt
```

Then point the app at it if the binary is not on the service's `PATH`:
`CLAUDE_CLI_PATH=/home/deploy/.local/bin/claude` (absolute path or a bare command name only — anything a
shell could reinterpret is rejected).

**How to translate lives in a skill, not in the code.**
`apps/api/claude-plugin/skills/translate-listing-titles/SKILL.md` holds the rules, the Chinese→Thai
vocabulary table and the JSON output shape. The `cli` backend loads it with `--plugin-dir` and calls
`/product-plus:translate-listing-titles`; the `sdk` backend reads the same file as its system prompt.
Edit the skill to change how titles read — no TypeScript change, no redeploy of logic.
The plugin dir is loaded explicitly, so nothing the host user has installed leaks into the session.

⚠️ **`claude-plugin/` must be deployed.** It sits next to `dist/`, not inside it — `tsc` does not copy
`.md` files. Deploying the repo and building on the box (the build/start commands in §2) ships it
automatically; a deploy that uploads only `apps/api/dist` does not. The api checks for it before every
translate run and refuses with `errors.translate.noSkill` rather than failing mid-job.

```bash
# quick check on the server, as the user that runs the api
ls apps/api/claude-plugin/skills/translate-listing-titles/SKILL.md
```

**Cost and speed, measured on 2026-09-24 (not estimates).**

| what | titles | cost | wall clock |
|---|---|---|---|
| no skill, batch 120, sequential | 135 | $0.2124 | 5m27s |
| with the skill, batch 10 | 10 | $0.0289 | 19s |

Cost is dominated by the **per-invocation** overhead — every `claude -p` re-sends Claude Code's own
context and thinks before answering (~80-90% of output tokens are thinking, and `--effort low` barely
moves it). That argues for big batches, but quality collapses past ~50 titles per call, so the job uses
`CLI_BATCH = 40` and runs `CLI_CONCURRENCY = 3` batches at once; concurrency, not batch size, is what
fixes the wall clock. Each run records what the CLI reported in `scrape_runs.cost_usd`, so the real
number shows in the UI.

The `sdk` backend has none of this overhead (no Claude Code context, no forced thinking) and is both
cheaper and faster. If the only reason to avoid it is not wanting to manage an API key, `ant auth login`
on the box stores an OAuth profile the SDK picks up with no key set.

Not suitable for Railway or any ephemeral container: there is no persistent `~/.claude` to log into.
Use `sdk` with `ANTHROPIC_API_KEY` there.

## CI
`deploy/ci.yml` is a ready GitHub Actions workflow (install → typecheck → test). It is not in `.github/workflows/` because the token used to push lacked the `workflow` scope. Enable it with:
```bash
gh auth refresh -s workflow && mkdir -p .github/workflows && git mv deploy/ci.yml .github/workflows/ci.yml && git commit -m "Add CI" && git push
```
