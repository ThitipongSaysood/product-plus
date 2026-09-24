# Active Task

_Last updated: 2026-09-24 09:52_

## Project type (auto-detected)

Next.js + NestJS (pnpm monorepo)

## Current goal

ผู้ใช้กำลังดู UI บนเครื่อง dev ก่อนตัดสินใจเรื่อง deploy + Apify token

## What just happened

เพิ่มสร้าง/เปลี่ยนชื่อ/ลบกลุ่มสินค้า · แก้ช่องกรอกที่สูงต่ำไม่ตรงกันทุกฟอร์ม · เพิ่มการแปลชื่อสินค้าจีนเป็นไทย (Haiku 4.5, กดปุ่มเอง)
ก่อนหน้านั้น: รันแอปขึ้นแล้ว — api 4010 + web 3020 ตอบปกติ ข้อมูลจริง 135 สินค้า ใช้ไป $0.85/$10
ไล่ดูครบทุกหน้า: overview / products / categories / trends / actors / settings / product detail
รายละเอียด + สิ่งที่เจอ: .agents/sessions/2026-09-24-0917-run-ui-review.md

แทรกงานสั้น ๆ คั่น (ไม่กระทบ UI review): ติดตั้ง 5 skills ระดับเครื่อง + เขียนกฏบังคับ skill
ลง root `AGENTS.md` แล้ว → .agents/sessions/2026-09-24-0952-force-project-skills.md

## Blockers

- **รูปแคชไม่ครบ** — 42/48 ที่ตรวจเป็น pending (ยัง retry ได้) → feed "ความเคลื่อนไหว" เป็นกรอบเปล่า, Temu/XHS เสี่ยง URL หมดอายุ ต้องหยุด dev แล้วรัน postProcess ซ้ำ (ฟรี)
- **/actors ว่าง** — ยังไม่เคยรัน `pnpm --filter @pp/api evaluate` บน DB นี้ (ฟรี ไม่เรียก actor) + UI ขึ้นแบนเนอร์แดงผิดบริบทเมื่อยังไม่มีผลประเมิน
- รอบ 4 แพลตฟอร์ม ≈ $1.46 > เพดานต่อรอบ $1.00 → ต้องขยับเพดานหรือลดจำนวนผล ก่อนใส่ APIFY_TOKEN
- Railway deploy ต้องใช้ผู้ใช้ (CLI login + APP_PASSWORD, CRON_SECRET, SETTINGS_SECRET, APIFY_TOKEN)
- CI ต้อง `gh auth refresh -s workflow` แล้วย้าย deploy/ci.yml เข้าที่

## Next step

ใส่ `ANTHROPIC_API_KEY` ที่หน้า ตั้งค่า › ระบบ แล้วกดปุ่ม "แปลชื่อสินค้าเป็นไทย" ที่หน้าสินค้า (≈ $0.04 ต่อ 135 ชื่อ) — โค้ดพร้อมแล้วแต่ยังไม่เคยเรียก API จริง
ค้างอยู่: รูปแคชไม่ครบ · /actors ว่าง (ต้องรัน `pnpm --filter @pp/api evaluate`) — ทั้งคู่ต้องหยุด dev ก่อน
