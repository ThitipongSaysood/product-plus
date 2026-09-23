# Apify actors — what is known (2026-09-24)

Real smoke-test results: `docs/SMOKE-TEST-2026-09-24.md`. Real rows: `apps/api/test/fixtures/real/`.

| platform | actor | $/result (FREE tier, 50 results) | status |
|---|---|---|---|
| Douyin | zen-studio/douyin-product-search-scraper | ≈ $0.0081 | works · 30d sold + salesTrend (last point = today partial, 0) |
| 1688 | zen-studio/1688-wholesale-scraper | ≈ $0.0051 | works · sold is cumulative-looking → period unknown |
| XHS | zen-studio/rednote-product-search-scraper (includeProductDetails:false) | ≈ $0.0060 | works · lifetime units_sold · no category · images expire → cache now |
| Temu | apivault_labs / pear_fight / amit123 | — | all returned 0 on 2026-09-24 (`product_extraction_access_denied`) → Temu disabled |

Gotchas
- Pricing JSON: `pricingInfos[-1].pricingPerEvent.actorChargeEvents.<event>` → `eventPriceUsd` | `eventTieredPricingUsd.{FREE..}` | `tieredEventPriceUsd`.
- Fail rate = (FAILED + TIMED-OUT) / TOTAL of `stats.publicActorRunStats30Days`.
- `maxTotalChargeUsd` on a run caps billing even when the actor's own minimum results is higher (amit123 min 20).
- The Apify MCP run object doesn't expose `usageTotalUsd`; the app's own apify-client path records it.
