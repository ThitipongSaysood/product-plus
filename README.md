# Product Plus — China Marketplace Scout

ระบบเฝ้าดูสินค้า **สายนาฬิกา Apple Watch** บนแพลตฟอร์มอีคอมเมิร์ซจีน — **Douyin 抖音商城 · 1688 · Temu · Xiaohongshu 小红书** — แล้วบอกว่า **หมวดไหน ขายดีแค่ไหน กำลังขึ้นหรือลง** ดึงข้อมูลผ่าน Apify (จำกัด 50 ผลต่อแพลตฟอร์มต่อคีย์เวิร์ดต่อรอบ)

ต่อสินค้าหนึ่งชิ้นได้: หมวดหมู่ (จัดอัตโนมัติ) · ยอดขาย **พร้อมช่วงเวลากำกับเสมอ** (30 วัน / สะสม / ไม่ทราบช่วง) · รูป + ลิงก์ · เทรนด์

> สถานะ 2026-09-24: ใช้งานได้บนเครื่อง dev มีข้อมูลจริง 135 สินค้า (Douyin 30 · 1688 50 · XHS 50 · Temu 5) — **ยังไม่ deploy** (ดู [deploy/README.md](deploy/README.md))

---

## เริ่มใช้งาน (dev)

ต้องมี Node ≥ 22 และ pnpm 10 — ไม่ต้องติดตั้ง Postgres (dev ใช้ PGlite เก็บที่ `.pglite/`)

```bash
pnpm install
```

```bash
pnpm seed
```

```bash
pnpm dev
```

เปิด http://localhost:3020 (เว็บ) · API อยู่ที่ http://localhost:4010/api

`pnpm seed` สร้าง 2 กลุ่มสินค้า (สลับได้มุมบนซ้ายของเว็บ):

| กลุ่ม | ข้อมูล |
|---|---|
| `apple-watch-bands` | **ข้อมูลจริง** จาก Apify วันที่ 2026-09-24 (`apps/api/data/real/`) — seed ไม่เรียก Apify ไม่เสียเงิน |
| `demo-mock` | **ข้อมูลจำลอง** 3 รอบย้อนหลัง ไว้ดูหน้าตาเทรนด์ มีป้าย "ข้อมูลจำลอง" ทุกหน้า |

PGlite ใช้ได้ทีละโปรเซส — สคริปต์ที่แตะฐานข้อมูล (`seed` `evaluate` `import:dataset` `refresh:trends`) ต้องหยุด api ก่อน

---

## หน้าเว็บ

| หน้า | ใช้ทำอะไร |
|---|---|
| ภาพรวม `/overview` | สรุปรอบล่าสุด (ใหม่/หาย/พุ่ง/ราคาลด) · KPI · ยอดขายรายวัน Douyin 30 วัน · ความเคลื่อนไหว · ประวัติการดึง |
| สินค้า `/products` | การ์ดสินค้า กรองแพลตฟอร์ม/หมวด/เทรนด์/ช่วงยอดขาย เรียงได้ — ตัวกรองทั้งหมดอยู่ใน URL |
| รายละเอียด `/products/[id]` | รูป ข้อมูล หมวด (บอกที่มา) กราฟ snapshot กราฟยอดรายวัน (Douyin) ลิงก์ออกไปร้าน |
| หมวดหมู่ `/categories` | เลนต่อหมวด เรียงตามยอดขาย |
| เทรนด์ `/trends` | สินค้าขาขึ้น/ขาลง + กราฟ 10 อันดับ |
| ประเมิน Actor `/actors` | ตารางเปรียบเทียบ actor ทุกตัว: ราคา/ผล · ข้อมูลครบแค่ไหน · อัตราล้ม · ผลทดสอบจริง · ตัวที่เลือกและเหตุผล |
| ตั้งค่า › คีย์เวิร์ดและหมวดหมู่ | คีย์เวิร์ดต่อแพลตฟอร์ม · หมวดหมู่ (taxonomy) · จับคู่หมวดของแพลตฟอร์ม · งบ/เพดานต่อรอบ/ความถี่ |
| ตั้งค่า › ระบบ | ค่าตั้ง/คีย์ลับ (ซ่อนค่า) + ปุ่มทดสอบการเชื่อมต่อ |

ภาษา: ไทย · English · 中文 · ธีมสว่าง/มืด · รองรับมือถือ (เมนูล่าง) — UI ใช้ OMNIX Design System ([docs/design-system.md](docs/design-system.md))

---

## Actor ที่ใช้ (เลือกโดยระบบประเมิน)

| แพลตฟอร์ม | actor | $/ผล* | ยอดขาย | หมวดจากแพลตฟอร์ม |
|---|---|---|---|---|
| Douyin | `zen-studio/douyin-product-search-scraper` | 0.0081 | **30 วันจริง** + รายวัน 30 จุด | ✅ |
| 1688 | `zen-studio/1688-wholesale-scraper` | 0.0051 | สะสม (ไม่ทราบช่วง) | ✅ |
| Temu | `crw/temu-products-scraper` | 0.0100 | สะสมแบบช่วง เช่น "100K+" | ❌ (จัดเอง) |
| XHS | `zen-studio/rednote-product-search-scraper` | 0.0060 | สะสม | ❌ (จัดเอง) |

\* ราคา tier FREE ณ 2026-09-24 — ระบบดึงราคาใหม่จาก Apify ทุกครั้งที่กด "ประเมินใหม่" (ฟรี ไม่เรียก actor)

วิธีเลือก: ค้น Apify Store → อ่านราคา/สถิติ/README → คำนวณ cost per result = `(ค่าเริ่ม + 50 × ราคาต่อผล) / 50` → ตัดตัวที่ล้ม > 10%, ต้องใช้ cookie, ไม่มีรูป/ลิงก์/ยอดขาย หรือทดสอบจริงได้ 0 ผล → ตัวที่ผ่านทดสอบจริงก่อน → ข้อมูลครบกว่า → ถูกกว่า
Temu: 3 actor แรกโดน Temu บล็อก (anti-bot challenge) — `crw` ผ่านได้ ณ วันที่ทดสอบ อาจพังได้เมื่อ Temu อัปเดตระบบกันบอท (รอบที่ได้ 0 ผลจะถูกติดป้าย suspect ไม่ mark สินค้าว่าหาย)

ผลทดสอบและค่าใช้จ่ายจริงทุกรอบ: [docs/SMOKE-TEST-2026-09-24.md](docs/SMOKE-TEST-2026-09-24.md)

---

## เงิน — ตัวกันไม่ให้ใช้เกิน

- ไม่มี `APIFY_TOKEN` = ไม่มีการเรียก Apify เลย (ปุ่มดึงข้อมูลจะข้ามพร้อมเหตุผล)
- **งบรายเดือน** ต่อกลุ่ม ($10) — นับรวมรันที่กำลังวิ่งและค่าประมาณของรอบถัดไป · งบ = 0 คือหยุดใช้จ่าย
- **เพดานต่อรอบ** ($1.00) — ส่งให้ Apify เป็น `maxTotalChargeUsd` ทุกรัน · รอบที่ประมาณการเกินเพดานจะถูกข้ามทั้งรอบ
  ⚠️ ครบ 4 แพลตฟอร์ม × 50 ผล ≈ **$1.46** > $1.00 → ต้องขยายเพดานเป็น ~$1.50 หรือลดจำนวนผล ก่อนใส่ token
- ปุ่มดึงข้อมูลจริงต้องกดยืนยันทุกครั้ง · cron ต้องมี `CRON_SECRET` · request ที่แก้ข้อมูลต้องเป็น JSON (กัน CSRF)
- ตั้ง spending limit ใน Apify console อีกชั้น

---

## โครงสร้าง

```
apps/
  api/   NestJS 12 · Drizzle ORM · Postgres (prod) / PGlite (dev) · schema "scout" — port 4010
         src/domain/     logic ล้วน ทดสอบได้: normalizer ต่อแพลตฟอร์ม · gate · diff · trend · categorize · budget · cost
         src/jobs/       pipeline · ingest · reconcile · media cache · categorize
         src/actors/     ประเมิน actor จาก Apify public API
         config/actor-candidates.json   actor ที่รู้จัก + ผลทดสอบจริง (มี _source/_fetchedAt)
         data/real/      ข้อมูลจริงที่ดึงมาแล้ว (seed ใช้)
  web/   Next.js 16 (App Router) · Tailwind 4 · OMNIX tokens · Recharts — port 3020 (rewrite /api/* → api)
packages/
  contracts/   type ของ request/response ใช้ร่วมกันสองฝั่ง (import type เท่านั้น)
docs/          SPEC · PLAN · handoff · design system · ผลทดสอบ Apify
deploy/        วิธี deploy Railway + ไฟล์ CI
.agents/       บันทึก context ให้ AI รอบถัดไป (อ่าน .agents/AGENTS.md ก่อน)
```

เส้นทางข้อมูล: `ปุ่ม/cron → budget + เพดานต่อรอบ → เริ่ม actor (≤ 50 ผล) → webhook หรือ poll → normalize → quality gate → diff (หาย 2 รอบติดถึงถือว่าหาย) → snapshot → จัดหมวด (หมวดแพลตฟอร์ม → กฎคีย์เวิร์ด → AI) → cache รูป → เทรนด์ + change events`

---

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `pnpm dev` | รัน api + web |
| `pnpm test` · `pnpm typecheck` | เทสต์ทั้งหมด (api 82 · web 105) · ตรวจ type |
| `pnpm build` | build ทั้งสองฝั่ง |
| `pnpm seed` | สร้างกลุ่ม + ข้อมูลจริง + ข้อมูลจำลอง (รันซ้ำได้ ไม่ซ้ำ) |
| `pnpm --filter @pp/api evaluate [-- temu douyin]` | ประเมิน actor ใหม่ (ฟรี) |
| `pnpm --filter @pp/api import:dataset -- --group … --platform … --file … --run-id … --actor … --cost …` | นำเข้า dataset ที่ดึงนอกระบบ (Apify console/MCP) ผ่านเส้นทางปกติ |
| `pnpm --filter @pp/api refresh:trends` | คำนวณเทรนด์ใหม่ทุกกลุ่ม |
| `pnpm --filter @pp/api db:generate` | สร้าง migration จาก schema (ห้ามเขียนมือ) |

ค่าตั้ง/ตัวแปรแวดล้อมทั้งหมด: [apps/api/README.md](apps/api/README.md) · ที่สำคัญ: `APIFY_TOKEN` · `APP_PASSWORD` (production บังคับ) · `CRON_SECRET` · `SETTINGS_SECRET` · `DATABASE_URL` · `ANTHROPIC_API_KEY` (ไม่บังคับ — จัดหมวดชั้น AI)

---

## เอกสาร

| ไฟล์ | เนื้อหา |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | ขอบเขตและการตัดสินใจทั้งหมด |
| [docs/PLAN.md](docs/PLAN.md) | API ทุก endpoint + โครงโค้ด |
| [docs/04-handoff-china-marketplace-scout.md](docs/04-handoff-china-marketplace-scout.md) | โจทย์ต้นฉบับ + หลักการจาก Ads Plus |
| [docs/design-system.md](docs/design-system.md) | กติกา UI (OMNIX) |
| [docs/SMOKE-TEST-2026-09-24.md](docs/SMOKE-TEST-2026-09-24.md) | ผลทดสอบ Apify + ค่าใช้จ่ายจริง |
| [deploy/README.md](deploy/README.md) | deploy Railway + เปิด CI |

## ข้อจำกัดที่รู้อยู่

- เทรนด์ของ 1688 / Temu / XHS ต้องมีข้อมูล ≥ 2 รอบ (Douyin ใช้ยอดรายวันของแพลตฟอร์มได้ตั้งแต่รอบแรก)
- รูป XHS หมดอายุเร็ว — ระบบ cache ทันทีหลังดึง ถ้า cache ไม่ทันจะแสดงว่า "รูปหาย" ไม่ใช่กล่องว่าง
- จัดหมวดชั้น AI เขียนไว้แล้วแต่ยังไม่ได้ทดสอบ (ยังไม่มี `ANTHROPIC_API_KEY`)
- session cookie หมดอายุ 30 วัน แต่ logout ไม่เพิกถอน cookie ที่ถูกคัดลอกไป
- CI อยู่ที่ `deploy/ci.yml` (token ที่ push ไม่มีสิทธิ์ `workflow`)
