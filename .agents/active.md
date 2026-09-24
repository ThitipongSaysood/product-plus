# Active Task

_Last updated: 2026-09-24 12:25_

## Project type (auto-detected)

Next.js + NestJS (pnpm monorepo)

## Current goal

ทำให้หน้ารายละเอียดสินค้าบอก "ต้นทุนจริงของการสั่งซื้อ" ให้ครบ ก่อนตัดสินใจ deploy + ใส่ APIFY_TOKEN

## What just happened

**เจอบั๊กราคาที่สำคัญ:** `normalize1688` ใช้ `price.min` ซึ่งเป็นรุ่นถูกสุดของบันไดราคา ไม่ใช่ราคาที่ซื้อได้จริง
— **16 จาก 30 แถวที่มีบันได แสดงราคาที่ซื้อไม่ได้** (โชว์ ¥17 แต่สั่ง 1 เส้นจ่าย ¥22) แก้ที่การแสดงผล
ไม่แตะ `products.price` เพราะ trend.ts เทียบ snapshot หา price_drop

เพิ่ม: เงื่อนไขการซื้อ 1688 (ขั้นต่ำ · บันไดราคา · ยอดสั่งขั้นต่ำ · จำนวนออเดอร์ · วิดีโอ) อ่านจาก
`products.raw` ตรง ๆ ไม่ต้อง migration · ราคาเป็นบาท (เรตตั้งเอง) · ธงแบรนด์ (ติด 1/135) ·
ป้าย "ดึงใหม่ไม่ได้" เมื่อตั้ง apify แต่ไม่มีโทเคน · แปลชื่อใหม่ 135 รายการด้วย skill ($0.3479)

commit `5c2029d` บนสาขา **`feat/buying-terms-and-detail-page`** (ยังไม่ merge เข้า main ยังไม่ push)
รายละเอียด: `.agents/sessions/2026-09-24-0917-run-ui-review.md`

## Blockers

- **`APIFY_TOKEN` ยังไม่ตั้ง** → ดึงข้อมูลจริงรอบใหม่ไม่ได้ · ปุ่มสโมกเทสต์ปิด (ข้อมูลที่มีคือรอบ 24 ก.ย. เช้า)
- **`FX_CNY_THB` = 4.85 เป็นค่าตัวอย่างที่ผมใส่ไว้** ผู้ใช้ต้องแก้เป็นเรตจริง (ตั้งค่า › ระบบ)
- **`grill-with-docs` ใช้ไม่ได้** — SKILL.md ชี้ไปสกิลย่อย `grilling` + `domain-modeling` ที่ไม่ได้ติดตั้ง
  กติกาใน `.agents/AGENTS.md` ที่บังคับ grill ก่อนแตะ contracts/ingest จึงบังคับจริงไม่ได้ (ใช้ `scrutinize` แทน)
- รอบ 4 แพลตฟอร์ม ≈ $1.46 > เพดานต่อรอบ $1.00 → ต้องขยับเพดานหรือลดจำนวนผล ก่อนใส่ APIFY_TOKEN
- Railway deploy ต้องใช้ผู้ใช้ (CLI login + APP_PASSWORD, CRON_SECRET, SETTINGS_SECRET, APIFY_TOKEN)
- CI ต้อง `gh auth refresh -s workflow` แล้วย้าย deploy/ci.yml เข้าที่

## Next step

ตัดสินใจเรื่องสาขา: merge `feat/buying-terms-and-detail-page` เข้า main แล้ว push (skill แปลภาษา
ต้องผ่าน git ถึงจะขึ้น server) · ตั้งเรตบาทจริง · แล้วค่อยเรื่อง APIFY_TOKEN + เพดานต่อรอบ
