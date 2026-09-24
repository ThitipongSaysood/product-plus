# Active Task

_Last updated: 2026-09-24 15:05_

## Project type (auto-detected)

Next.js + NestJS (pnpm monorepo) · PostgreSQL 18

## Current goal

งานพัฒนารอบนี้ปิดแล้วและอยู่บน `main` บน GitHub — ขั้นถัดไปคือ deploy จริง

## What just happened

**14 commit merge เข้า `main` แบบ fast-forward และ push ขึ้น GitHub แล้ว** (`ce15ec6`)

งานหลักที่ลงไปรอบนี้:
- **แก้บั๊กราคา** — `price.min` เป็นรุ่นถูกสุดของบันไดราคา ไม่ใช่ราคาที่ซื้อได้ 16/30 แถวแสดงราคาที่ซื้อไม่ได้
- เงื่อนไขการซื้อ 1688 (ขั้นต่ำ · บันไดราคา · ยอดสั่งขั้นต่ำ · จำนวนออเดอร์ · วิดีโอ) จาก `products.raw`
- ราคาเป็นบาท (เรตตั้งเอง) · ธงแบรนด์ · ป้าย "ดึงใหม่ไม่ได้"
- ตั้งวัน+ชั่วโมงดึงข้อมูลเองได้ต่อกลุ่ม
- **agent ที่สาม**: เสนอสินค้าน่าทำแบรนด์ (Sonnet 5) · ชั้น AI จัดหมวดใช้ claude CLI ได้
- **ย้าย PGlite → PostgreSQL** `omnix_marketing` / schema `product_plus` (1,595 แถว · รูป 294 ใบผ่าน sha1)
- แก้ 13 ข้อที่ `/code-review` เจอ · เขียน `deploy/README.md` ใหม่ 462 บรรทัด

รายละเอียดทั้งหมด: `.agents/sessions/2026-09-24-0917-run-ui-review.md`

## Blockers

- **`APIFY_TOKEN` ยังไม่ตั้ง** → ดึงข้อมูลจริงรอบใหม่ไม่ได้ (ข้อมูลที่มีคือรอบ 24 ก.ย. เช้า)
- **เพดานต่อรอบ $1.00 < ค่าจริง $1.46** → ต้องเลือก: ขยับเพดาน / ลดจำนวนผล / ตัดแพลตฟอร์ม
  **ก่อน**ใส่ token ไม่งั้นรอบแรกโดนกั้น (ดู `deploy/README.md` §6.2)
- **`FX_CNY_THB` = 4.85 เป็นค่าตัวอย่าง** ต้องแก้เป็นเรตจริง (ตั้งค่า › ระบบ)
- **`grill-with-docs` ใช้ไม่ได้** — สกิลย่อย `grilling` + `domain-modeling` ไม่ได้ติดตั้ง ใช้ `scrutinize` แทน
- CI ต้อง `gh auth refresh -s workflow` แล้วย้าย `deploy/ci.yml` เข้า `.github/workflows/`

## Next step

deploy ตาม `deploy/README.md` — ตัดสินใจเพดานต่อรอบก่อน แล้วค่อยใส่ `APIFY_TOKEN`

เก็บกวาดเล็กน้อยที่ยังค้าง: สาขา `feat/buying-terms-and-detail-page` (local + remote ที่ `942fe49`)
รวมเข้า main หมดแล้ว ลบทิ้งได้
