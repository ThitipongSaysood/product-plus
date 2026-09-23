# Apify smoke test — 2026-09-24 (user cap: $0.20 total)

Keyword `苹果手表表带` (CN platforms) · `apple watch band` region us (Temu) · 5 results each. Per-run `maxTotalChargeUsd` caps set so the sum could not exceed $0.20.
Cost = computed from the actor's live PPE prices (the Apify MCP run object did not expose `usageTotalUsd`) — check the Apify console billing to confirm.

| platform | actor | run id | items | est. cost | result |
|---|---|---|---|---|---|
| Douyin | zen-studio/douyin-product-search-scraper | GfItV4KUYkkVKe3RC | 5 | $0.0450 | ✅ monthlySold + 30-day salesTrend + 3-level category + images + detailUrl — 4/5 bands, 1 screen protector |
| 1688 | zen-studio/1688-wholesale-scraper | wg1MZWrKPfiBDvZNl | 5 | $0.0300 | ✅ categoryPath + soldDisplay/recentSoldCount (cumulative) + images + detailUrl — 5/5 bands |
| XHS | zen-studio/rednote-product-search-scraper | 5hYl39mFSmqrlFEcu | 5 | $0.0750 | ✅ units_sold (lifetime) + images + url, no category — 5/5 bands (mostly handmade beaded) |
| Temu | apivault_labs/temu-product-scraper | EQMKeVLw1qqSVBfmj | 0 | ~$0.0001 | ❌ `product_extraction_access_denied` |
| Temu | pear_fight/temu-scraper | WOJpGJcC6dhCfUbdb | 0 | ~$0.0001 | ❌ crawled 0/1 pages |
| Temu | amit123/temu-products-scraper | zICUNl2xm3zahi0mv | 0 | ~$0 | ❌ 0 items (min maxResults = 20) |
| **total** | | | **15** | **≈ $0.150** | |

Conclusions
- Douyin / 1688 / XHS actors from the handoff work as documented; real field names captured in `apps/api/test/fixtures/real/`.
- Temu: every tested actor is blocked today. Options for the user: retry another day · try `apivault_labs` with `usePaidSearchDiscovery` or `useResidentialFeedFallback` (extra cost, not priced yet) · drop Temu.
- Not run: the 50-result runs (≈ $1.11 for 4 platforms) — outside the $0.20 cap.

## Full batch (user approved, cap $1) — 2026-09-24

| platform | run id | items | est. cost | note |
|---|---|---|---|---|
| Douyin | 17eeLITRhaMyS3gcE | 30 | $0.245 | search returned only 30 (not cost-capped) |
| 1688 | RZ1IY5i0w1MsIHFxw | 50 | $0.255 | |
| XHS | OsvNwT8UErfn7dE44 | 50 | $0.300 | |
| **total** | | **130** | **≈ $0.80** | grand total today incl. smoke ≈ $0.95 |

Data: `apps/api/data/real/2026-09-24/`. Temu not run (dropped).
