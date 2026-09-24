# Active Task

_Last updated: 2026-09-24 15:25_

## Project type (auto-detected)

Next.js + NestJS (pnpm monorepo) · PostgreSQL 18

## Current goal

งานพัฒนาปิดรอบแล้ว ทุกอย่างอยู่บน `main` บน GitHub — ขั้นถัดไปคือ **deploy จริง**

## What just happened

เซสชัน 24 ก.ย. 2026 ปิดที่ `30f7243` — 16 commit บน main และ push ครบแล้ว

งานหลัก:
- **แก้บั๊กราคา** — `price.min` คือรุ่นถูกสุดของบันไดราคา ไม่ใช่ราคาที่ซื้อได้ 16/30 แถวแสดงราคาที่ซื้อไม่ได้
- เงื่อนไขการซื้อ 1688 (ขั้นต่ำ · บันไดราคา · ยอดสั่งขั้นต่ำ · จำนวนออเดอร์ · วิดีโอ) อ่านจาก `products.raw`
- ราคาเป็นบาท · ธงเครื่องหมายการค้า · ป้าย "ไม่สามารถดึงข้อมูลใหม่ได้"
- ตั้งวัน+ชั่วโมงดึงข้อมูลเองได้ต่อกลุ่ม
- **agent ตัวที่สาม**: คัดเลือกผลิตภัณฑ์แบรนด์ของตนเอง (Sonnet 5) · ชั้น AI จัดหมวดใช้ claude CLI ได้
- **ย้าย PGlite → PostgreSQL** `omnix_marketing` / schema `product_plus`
- แก้ 13 ข้อจาก `/code-review` · `deploy/README.md` 462 บรรทัด · ยกภาษาในระบบเป็นทางการ 40 คีย์

รายละเอียดทั้งหมด: `.agents/sessions/2026-09-24-0917-run-ui-review.md`

## Blockers

- **`APIFY_TOKEN` ยังไม่ตั้ง** → ดึงข้อมูลจริงรอบใหม่ไม่ได้ (ข้อมูลที่มีคือรอบ 24 ก.ย. เช้า)
- **เพดานต่อรอบ $1.00 < ค่าจริง $1.46** → เลือก: ขยับเพดาน / ลดจำนวนผล / ตัดแพลตฟอร์ม
  **ก่อน**ใส่ token (`deploy/README.md` §6.2)
- **`FX_CNY_THB` = 4.85 เป็นค่าตัวอย่าง** ต้องแก้เป็นอัตราจริง (ตั้งค่า › ระบบ)
- **`grill-with-docs` ใช้ไม่ได้** — สกิลย่อย `grilling` + `domain-modeling` ไม่ได้ติดตั้ง ใช้ `scrutinize` แทน
- CI ต้อง `gh auth refresh -s workflow` แล้วย้าย `deploy/ci.yml` เข้า `.github/workflows/`

## Next step

deploy ตาม `deploy/README.md` — ตัดสินใจเพดานต่อรอบก่อน แล้วค่อยใส่ `APIFY_TOKEN`

งานเก็บกวาดที่เหลือ:
- สาขา `feat/buying-terms-and-detail-page` (local + remote ที่ `942fe49`) รวมเข้า main หมดแล้ว ลบได้
- รายงาน brand ในฐานข้อมูลยังเป็นข้อความโทนเดิม (เขียนก่อนแก้ skill) — กดวิเคราะห์ใหม่ ≈$0.46 ถึงจะเปลี่ยน
- `.pglite` 133MB ยังอยู่เป็นทางถอย ลบได้เมื่อมั่นใจ Postgres แล้ว
