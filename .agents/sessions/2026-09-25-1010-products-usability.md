# 2026-09-25 09:40–10:10 — /products usability review and fixes

## Goal
Nielsen heuristic review of http://product-plus.nineplus.co.th/products, then fix all 9 findings (user: "แก้ไข 1-9").

## Findings → fixes
1. Thai search found nothing ("ซิลิโคน" 0, "硅胶" 33) → `listProducts` searches `title` OR `title_th`
   (now "ซิลิโคน" 34). Placeholder says Thai / Chinese / English; empty search result suggests the Chinese term.
2. Sold sort ranked 30-day, all-time and unknown-period numbers together → ordered by period block first
   (30d, lifetime, unknown), then count. The count line explains the order. Price sort now compares in baht
   when both FX rates are set (else each currency is its own block); it used to compare ¥ with $ raw.
3. Page subtitle said titles were Chinese while cards showed Thai → new subtitle; translate button only when
   `untranslated > 0`, labelled "แปลชื่อที่เหลือ (N)".
4. Sold badge "ไม่ระบุช่วงเวลา 783,670" in warning orange → "ขาย 783,670 · ไม่ระบุช่วง", neutral; only 30 days is
   tinted. Tooltip explains the period. No unit ("ชิ้น"): platforms count pieces, orders or payers.
5. Dashed "ย้อนหลังไม่พอ" tile on every card, filled purple "ขาขึ้น" tile looked like a button → removed
   `TrendTile` + `.ap-longevity*`; the card shows a `TrendBadge` chip with an arrow, and nothing when there is no history.
6. ¥ and $ mixed → card shows "≈ ฿…" from the hand-set FX rates (`ProductList.fxThb`).
7. Phone: filters took half the screen → `.ap-filters__toggle` "ตัวกรองและการเรียง (n)" folds the dropdowns (<768px).
8. Temu titles stayed English: translate skill rule 7 said "English → unchanged" → rule changed; the job and the
   count treat a `title_th` with no Thai letter as untranslated (`notTranslated` in `jobs/translate.ts`).
9. "ประเมิน Actor" → "ทดสอบแหล่งข้อมูล" (nav + page title); "ข้อมูลจริง" badge has a tooltip.

## Files
contracts `ProductList`, `FxRate` · api `modules/queries.ts`, `jobs/translate.ts`,
`claude-plugin/skills/translate-listing-titles/SKILL.md` · web `products/page.tsx`, `ProductCardView.tsx`,
`ProductFilters.tsx`, `bits.tsx`, `shell/Sidebar.tsx`, `globals.css`, `i18n/dictionary.ts`.

## Learned
- Postgres types `case … then $1 … else 1 end` as integer when the params are untyped → `33.48` fails.
  Cast the params (`::numeric`).
- Old Temu `title_th` values are English, lightly tidied (not equal to `title`), so "equals original" misses them.
- A second api instance would run the hourly `WeeklyCron` too and could race the live one into a paid round:
  preview web changes with `next dev -p 3120` against the live api (dev writes `.next/dev`, `next start` uses the build).
- Clearing `title_th` in the DB was refused by the permission classifier; the code-side `notTranslated` does the job
  without deleting anything.

## State at end
typecheck clean (api, web) · tests api 154 · web 111 · not committed, not built, live not restarted.
Another session edited `claude-cli.ts` / `llm.ts` / `brand.ts` / `suggest.ts` / `translate.ts` (AI effort) at the same time.

## Next step
Build and restart (`deploy/README.md` §14), then press "แปลชื่อที่เหลือ (5)" on /products.
User (2026-09-25): no AI cost wording in the UI — removed from `translate.confirm`, `kwsug.aiCost`, `catsug.aiCost`.
