# Active Task

_Last updated: 2026-09-24 20:24_

## Project type (auto-detected)

Next.js + NestJS (pnpm monorepo) · PostgreSQL 18

## Current goal

กลุ่มที่สอง `tempered-glass-screen-protector` ถูกสร้างและดึงข้อมูลแล้ว แต่**ดึงมาผิดสินค้าทั้งหมด**
เพราะใช้คีย์เวิร์ดภาษาอังกฤษบนแพลตฟอร์มจีน — ต้องตั้งคีย์เวิร์ดใหม่แล้วดึงรอบใหม่

## What just happened

เซสชัน 24 ก.ย. 2026 — ทุก commit อยู่บน main และ push ครบแล้ว (ล่าสุด `73e6e9f`)

รอบเช้า–บ่าย (รายละเอียด: `sessions/2026-09-24-0917-run-ui-review.md`):
แก้บั๊กราคา · เงื่อนไขการซื้อ 1688 · ย้าย PGlite → PostgreSQL · agent คัดเลือกผลิตภัณฑ์ ·
`deploy/README.md` · ยกภาษาเป็นทางการ · ปรับ UI หน้า /trends · เปลี่ยนชื่อฟีเจอร์เป็น "ผลิตภัณฑ์น่าสนใจ" ·
**คะแนนบนการ์ด** 2 ด้าน (ความต้องการในกลุ่มตัวเอง · ต้นทุนเทียบค่ากลางหมวด)

รอบเย็น (รายละเอียด: `sessions/2026-09-24-1645-group-editing-and-keywords.md`):
- รหัสสำหรับลิงก์แปลงจากชื่อที่เขียนติดกันได้ (`TemperedGlassScreenProtector` → `tempered-glass-screen-protector`)
- ปุ่มดินสอในตารางกลุ่มแก้ได้ทุกช่อง — ฟอร์มเดียวใน `components/settings/group-edit.tsx` ใช้ร่วมสองที่
- ตารางกลุ่มไม่ตกบรรทัดแล้ว (85px → 59px)
- คีย์เวิร์ดใส่ทีละหลายคำ หลายแพลตฟอร์มได้ พร้อมบอกจำนวนแถวและเตือนค่าใช้จ่ายก่อนกด

รอบค่ำ (รายละเอียด: `sessions/2026-09-24-2024-keyword-trial-and-suggestions.md`) — `69fb923` `f118b21` `d03a616`:
- **ทดลอง 5 ผล** ในฟอร์มคีย์เวิร์ด (จ่ายน้อย ไม่เข้ากลุ่ม นับในงบเดือน · กลุ่ม mock ฟรี)
- **AI แนะนำคีย์เวิร์ด** จากชื่อสินค้าภาษาใดก็ได้ → ภาษาของแต่ละแพลตฟอร์ม + คำพบบ่อยในชื่อสินค้า + คำค้นที่เกี่ยวข้อง XHS
- **กันภาษาไม่ตรงแพลตฟอร์ม** ทั้งฟอร์ม (เตือน + ติ๊กยืนยัน) และ API (400 เว้นแต่ allowLanguageMismatch)

## Blockers

- **Keyword form reverted to the 17:11 version + AI suggestion panel** (session 2026-09-24-2105). Keyword trial,
  language guard and frequent-term chips were removed at the user's request.
- 16 junk keywords deleted 21:20 (user OK). `apple-watch-bands` now: 苹果手表表带 (douyin/1688/xhs) + apple watch band (temu, us)
  → a round ≈ $1.46, still above the $1.00 per-round cap — user has not decided.
- Keyword card (21:20): AI panel on top · one table row per word with platform chips (tap = enable/disable) ·
  add form back to one word + platform dropdown (pre-17:08).

- **Postgres volume was wiped 2026-09-24 ~19:44** (container + volume `product-plus_omnix_pgdata` recreated empty,
  `apps/api/.env` gone — not by an AI session as far as the notes show). Everything created in Postgres after the
  afternoon move is lost: group `tempered-glass-screen-protector`, brand reports, System settings. No backup found.
  **User chose (20:40) to stay on PGlite for now** — api runs without `.env` → `.pglite` (apple-watch-bands + demo-mock).
  Actor evaluation re-run on PGlite (free) so trial estimates work. Going back to Postgres = new `.env` from
  `.env.example` + new `SETTINGS_SECRET` + `pnpm seed`; ask the user first.

- **กลุ่ม `tempered-glass-screen-protector` มีข้อมูลขยะ 150 รายการ** — `Tempered Glass` เป็นคำอังกฤษ
  1688/Temu ให้ฟิล์มมือถือ · XHS ให้กระจกปูโต๊ะร้านอาหาร · Douyin ให้ 0 แถว
  **0 จาก 150 เป็นสินค้านาฬิกา** เสียไปแล้ว ≈$2.05 (ดึง $1.46 + วิเคราะห์ $0.59)
  รายงาน "ผลิตภัณฑ์น่าสนใจ" ของกลุ่มนี้จึงวิเคราะห์ของผิดหมวดทั้งฉบับ — อย่าเชื่อ
- **`FX_CNY_THB` = 4.85 เป็นค่าตัวอย่าง** ต้องแก้เป็นอัตราจริง (ตั้งค่า › ระบบ)
- **เพดานต่อรอบของ `apple-watch-bands` = $1.00 ต่ำกว่าค่าจริง $1.46** → รอบอัตโนมัติจะถูกข้าม
  (`skip.runCap`) ต้องตัดสินใจก่อนถึงคิวจันทร์ 05:00
- **`grill-with-docs` ใช้ไม่ได้** — สกิลย่อย `grilling` + `domain-modeling` ไม่ได้ติดตั้ง ใช้ `scrutinize` แทน
- CI ต้อง `gh auth refresh -s workflow` แล้วย้าย `deploy/ci.yml` เข้า `.github/workflows/`

## Next step

0. **api ที่รันอยู่ไม่มี `apps/api/.env` → กำลังใช้ PGlite ไม่ใช่ Postgres** (กลุ่ม tempered-glass จึงไม่ปรากฏ) —
   ตรวจว่าตั้งใจหรือไม่ ก่อนแก้ข้อมูลอะไร

1. **แก้คีย์เวิร์ดกลุ่ม tempered glass** (กด "ทดลอง 5 ผล" ดูชื่อก่อนได้แล้ว) — ลบ `Tempered Glass` ทั้ง 4 แถว แล้วใส่
   `苹果手表钢化膜` + `苹果手表保护膜` ให้ 1688 · Douyin · XHS และ `apple watch screen protector` ให้ Temu
2. **ลบสินค้า 150 รายการของกลุ่มนั้นทิ้ง** ก่อนดึงรอบใหม่ ไม่งั้นของเก่าปนกับของใหม่
3. ดึงข้อมูลรอบใหม่ (≈$1.46 ต่อคีย์เวิร์ด ต้องขออนุญาตผู้ใช้พร้อมระบุวงเงินทุกครั้ง)
   แล้ว**ดูชื่อสินค้าก่อน** จึงค่อยกดวิเคราะห์ ($0.59)

งานเก็บกวาดที่เหลือ:
- สาขา `feat/buying-terms-and-detail-page` (local + remote ที่ `942fe49`) รวมเข้า main หมดแล้ว ลบได้
- `.pglite` 133MB ยังอยู่เป็นทางถอย ลบได้เมื่อมั่นใจ Postgres แล้ว
- รายงาน brand ของ `apple-watch-bands` ยังเป็นข้อความโทนเดิม (เขียนก่อนแก้ skill) — กดวิเคราะห์ใหม่ ≈$0.65 ถึงจะเปลี่ยน
- **ยังไม่ได้ทำ:** เวลาโดยประมาณของงานที่กำลังรัน — `progressOf()` ฮาร์ดโค้ด `pct: null` ไว้ที่
  [runs.ts:69](apps/api/src/jobs/runs.ts#L69) ทั้งที่ `scrape_runs` มีประวัติรอบที่สำเร็จพอจะหาค่ากลางได้
  (brand ใช้เวลาจริง 1:25 / 2:10 / 2:25 / 3:51 / 4:36) ผู้ใช้เคยบ่นว่า "ประมาณเวลาไม่ได้ ถือว่านานมาก"
