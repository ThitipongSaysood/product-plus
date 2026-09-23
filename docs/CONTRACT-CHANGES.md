# Contract changes / notes from the backend (apps/api)

No breaking change to `packages/contracts` is required. Notes for the web side:

1. `Group.runCapUsd` — already added to the contract by the lead; the api returns it and `PATCH /api/groups/:slug` accepts `runCapUsd` (≥ 0.10) and `platforms` (1–4 of the Platform union).
2. Source mode is **per group** (`product_groups.source_mode`: `demo-mock` → `mock`, `apple-watch-bands` → `apify`). `Overview.sourceMode` is that group's mode; `/api/health.sourceMode` is the global setting. *Proposal (optional):* add `sourceMode: SourceMode` to `Group` so the sidebar/group switcher can show the mock badge without fetching the overview. Not implemented on the api until the contract has it.
3. `GET /api/cron/weekly` returns `{ ok, started: {platform, keyword, group}[], skipped: {platform, keyword, reason, group}[] }`.
4. `GET /api/jobs/status?kind=evaluate` ignores `pg` (evaluation is global).
5. New dict keys the web should translate — full list in `apps/api/README.md` ("Keys returned to the web"): skip reasons `skip.noToken` `skip.runCap` `skip.recentRun` `skip.startFailed`, exclusion `actors.excluded.smokeEmpty` `actors.excluded.noKeywordSearch` `actors.excluded.pricingUnknown`, note pattern `Verified by smoke test; completeness <c>/5 at $<x> per result.`
6. Actor chooser rule (deviation from SPEC §4.7, documented): smoke-verified actors rank first, then completeness, then cost — README keyword evidence is a heuristic and several unverified actors scored higher on false positives (e.g. a "Category" table header). An actor whose smoke test returned 0 rows is excluded (`actors.excluded.smokeEmpty`).
