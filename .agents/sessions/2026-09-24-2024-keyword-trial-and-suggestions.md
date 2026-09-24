---
date: 2026-09-24 20:24
agent: Claude Opus 5.5 in Claude Code (subagent)
branch: main
task: Keyword trial · AI keyword suggestion · language-mismatch guard · frequent-term + XHS related suggestions
status: done
---

# ทดลองคีย์เวิร์ด 5 ผล · AI แนะนำคีย์เวิร์ด · กันภาษาไม่ตรงแพลตฟอร์ม

ต่อจาก `2026-09-24-1645-group-editing-and-keywords.md` (บทเรียน Tempered Glass $2.05 ทิ้ง) —
ทุกข้อในงานนี้คือการทำให้เรื่องนั้นเกิดซ้ำไม่ได้ คำศัพท์ตาม `CONTEXT.md` (commit ไปด้วยแล้ว)

## What was done

**API** (`f118b21`)
- Pure functions + tests: [domain/keywords.ts](apps/api/src/domain/keywords.ts) — `languageMismatch` :17 ·
  `planTrials` :35 · `cleanSuggestions` :87 · `frequentTerms` :150 · `parseRelatedKeywords` :173 · `rankRelated` :200
  (สำเนา `languageMismatch` ฝั่งเว็บที่ [lib/keyword-lang.ts](apps/web/lib/keyword-lang.ts) — แก้คู่กันเสมอ)
- ทดลองคีย์เวิร์ด: [jobs/trials.ts](apps/api/src/jobs/trials.ts) + endpoints ที่ [groups.controller.ts:204](apps/api/src/modules/groups.controller.ts#L204)
  `POST/GET /api/groups/:slug/keyword-trials` — kind `"trial"`, เก็บผลใน `scrape_runs.trial_items` (migration `0001`, generate ด้วย drizzle-kit)
  ไม่ ingest ไม่แคชรูป · ปิดงานผ่าน reconcile/webhook เหมือน smoke · GET ลบ `trial_items` ที่เกิน 7 วัน
- เงิน: เพดานต่อรายการ = `smokeCap` · รวมกันต้องอยู่ในงบเดือน (ใช้ `planRound` โดยตั้ง capUsd = ผลรวม ⇒ ปิดเพดานต่อรอบ) ·
  งบ 0 = ห้าม · เกิน 8 → `errors.keyword.trialTooMany` · ต้อง `confirm:true` · apify ไม่มี token → `errors.actors.needsToken` ·
  **กลุ่ม mock ทำงานฟรีแบบ inline** (ใช้ mock source) · ไม่มี actor ที่เลือก → `skip.noActor` · นับ concurrency 5 ของ Apify ด้วย
- AI แนะนำ: skill [suggest-keywords/SKILL.md](apps/api/claude-plugin/skills/suggest-keywords/SKILL.md) + [jobs/suggest.ts](apps/api/src/jobs/suggest.ts)
  `POST /api/groups/:slug/keyword-suggestions {productName}` — sdk (zod, haiku) / cli เหมือน translate; ชื่อสินค้าส่งเป็น JSON data
- คำพบบ่อย + XHS related: `GET /api/groups/:slug/keyword-suggestions/frequent` · `apifyFetch` อ่าน KV record `RELATED_KEYWORDS`
  เฉพาะ xhs (`relatedKeyFor`) เก็บที่ `scrape_runs.related_keywords` ทั้งรอบ scrape และ trial
- `POST keywords` ปฏิเสธภาษาไม่ตรง (`errors.keyword.languageMismatch`) เว้นแต่ `allowLanguageMismatch:true`

**Web** (`d03a616`) — [keyword-helpers.tsx](apps/web/components/settings/keyword-helpers.tsx) + [KeywordsSettings.tsx](apps/web/components/settings/KeywordsSettings.tsx)
- ช่อง "ชื่อสินค้า" + "แนะนำคีย์เวิร์ด" → ชิปแยกแพลตฟอร์ม (`aria-pressed`) กดแล้วใส่คำลงช่อง + ติ๊กแพลตฟอร์มที่แนะนำคำนั้น กดซ้ำเอาออก
- ชิปคำพบบ่อย/คำค้นที่เกี่ยวข้อง XHS ซ่อนเมื่อไม่มีข้อมูล
- คำเตือนภาษาทีละคู่ (คำ × แพลตฟอร์ม) ขณะพิมพ์ + บทเรียน Tempered Glass + ช่องติ๊กยืนยัน (รีเซ็ตเมื่อพิมพ์ต่อ) ก่อนจึงกดเพิ่มได้
- ปุ่ม "ทดลอง 5 ผล" → dialog เดียว "ทดลอง 2 คำ × 4 แพลตฟอร์ม = 8 รายการ ≈ $x" → poll ทุก 4 วิ →
  การ์ดต่อแพลตฟอร์ม: รูปจาก URL ต้นทาง (SafeImg), ชื่อเดิม line-clamp-2, ราคา, SoldBadge พร้อมช่วงเวลา, ลิงก์ออก ·
  หัวข้อ "ผลทดลอง — ไม่ถูกเพิ่มเข้ากลุ่ม"

## Decisions I made (not in the brief)
- frequent terms: ตัดคำที่ **คำทั่วไป** (苹果手表/适用/表带…) ก่อนทำ n-gram — ไม่งั้นได้เศษข้ามคำ `用苹果手` `带适用苹`;
  ทิ้ง gram ที่ถูก gram ยาวกว่าครอบ ≥80% (`小蛮`→`小蛮腰`) และที่คร่อมคำที่พบบ่อยกว่า (`三珠不锈` ข้าง `不锈钢`); ขั้นต่ำ 2 หรือ 4% ของชื่อ
- confirm บังคับแม้กลุ่ม mock (dialog เดียวกัน) · รายการที่แพลตฟอร์มไม่อยู่ในกลุ่ม → 400 `errors.validation`
- ชิปกดแล้ว **ไม่เอาติ๊กแพลตฟอร์มอื่นออก** — คำจีนที่ติ๊ก Temu ค้างอยู่จะโดนคำเตือนภาษาแทน (guard ทำงานตามที่ออกแบบ)
- sdk backend คืน `costUsd: null` (เหมือน job AI อื่น ไม่เดาราคาต่อ token) · cli คืนค่าจริง
- PATCH keyword ที่เปลี่ยนตัวคำ ยังไม่ตรวจภาษา (UI แก้ได้แค่เปิด/ปิด)

## Verified (this session, run and seen)
- `pnpm typecheck` เขียว · `pnpm test` **270 ผ่าน** (api 161 [+17] · web 109 [+1])
- curl: 1688 "Tempered Glass" → 400 languageMismatch; ส่ง allow → สร้างได้ · trial ไม่มี confirm → confirmRequired ·
  ใน `apple-watch-bands` (apify, **ไม่มี token**) confirm → needsToken · 9 รายการ → trialTooMany
- AI จริง 2 ครั้งผ่าน cli ($0.041 + $0.013): "ฟิล์มกระจก Apple Watch" → 1688/douyin/xhs ได้ 苹果手表钢化膜 · iwatch钢化膜 …,
  temu ได้ apple watch tempered glass / screen protector
- frequent ของ apple-watch-bands: 1688 不锈钢·三珠·硅胶·磁吸·金属·…·蝴蝶扣·小蛮腰 · douyin 硅胶·小蛮腰·米兰尼斯·小波点
- Mock group ชั่วคราว `tmp-trial-mock` (ลบแล้ว): ผ่าน UI จริง (Chrome headless + CDP, สคริปต์อยู่ใน scratchpad) 8 trials × 5 แถว,
  $0, สินค้าในกลุ่ม 0 · 375px ไม่มี horizontal scroll ชิป 44px · คำเตือนภาษาโผล่และปุ่มเพิ่มถูกปิด
- **ไม่ได้เริ่ม Apify run ที่เสียเงินเลย** (ไม่มี token ใน instance นี้ด้วย)

## Not done / not verifiable
- เส้นทาง apify จริงของ trial (start → reconcile → finishTrial) ทดสอบแค่ด้วยโค้ดร่วมกับ smoke ไม่ได้ยิงจริง
- รูปร่างจริงของ `RELATED_KEYWORDS` ยังไม่เคยเห็น — parser รับ string[] / object[] (keyword|word|text|query|name|title) / wrapper
- ประมาณการใน dialog ของกลุ่ม apify ยังไม่ได้เห็นบนจอ: instance นี้ไม่มี actor_evaluations (ทุกแพลตฟอร์ม = null ⇒ "ข้าม")

## For the next agent
- **api ที่รันอยู่ตอนนี้ไม่มี `apps/api/.env`** ⇒ ใช้ PGlite (`.pglite`) ไม่ใช่ Postgres 5433 ที่ notes ก่อนหน้าบอก —
  กลุ่ม tempered-glass จึงไม่อยู่ใน instance นี้ (เจอแค่ `apple-watch-bands` และ `demo-mock` ที่โผล่มาระหว่างเซสชัน ไม่ใช่ของผม)
  ถ้าจะกลับไป Postgres: `cp apps/api/.env.example apps/api/.env` (ตรวจ SETTINGS_SECRET) แล้วรีสตาร์ต api — migration 0001 จะลงเอง
- Next step เดิมยังค้าง: แก้คีย์เวิร์ดกลุ่ม tempered glass — ตอนนี้กด "ทดลอง 5 ผล" ดูชื่อก่อนได้แล้ว (≈ smokeCap ต่อรายการ)
