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

## Temu retry (user approved, cap $0.02 then $0.12) — 2026-09-24 morning

| actor | run id | items | est. cost | result |
|---|---|---|---|---|
| apivault_labs/temu-product-scraper | UckniAngJxmY7QaAC | 0 | ~$0.0001 | ❌ still `product_extraction_access_denied` |
| pear_fight/temu-scraper | (MCP call timed out, no run id) | ? | ≤ $0.0039 (cap) | unknown — check Apify console |
| **crw/temu-products-scraper** | 8AqTxqcOQ5C40f37k | **5** | $0.05 | ✅ 5/5 Apple Watch bands, top sales, `sales_num` "100K+" (lifetime lower bound), price in cents, image, link, `opt_id` |
| scrapeunblocker/temu-search-scraper | KbSzFGBgYo54ENM5e | 5 | ~$0.01 | ⚠️ URL-only rows — no price/sold/image |
| scrapesage/temu-scraper | xfl5WuemkMRVLcuQT | 5 | ~$0.01 | ❌ 0/5 relevant (Samsung bands, men's watches), no sold count |
| **total** | | | **≈ $0.075** | within caps |

Why Temu failed before: Temu serves an anti-bot JS challenge (verified with a plain request: 2.9 KB challenge page, no products). Each actor has its own bypass; crw's works today. Temu re-enabled in `apple-watch-bands` with keyword `apple watch band` (us); crw chosen by the evaluator (only smoke-verified Temu actor).
Cost note: crw is $0.01/result → 50 results = $0.50/round, so a full 4-platform round ≈ $1.46 > the $1.00 per-round cap.
