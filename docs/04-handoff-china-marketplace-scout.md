# Handoff Brief — สร้างระบบใหม่ "China Marketplace Scout" (สายนาฬิกา Apple Watch)

> เขียนเมื่อ 2026-09-23 จากการอ่านโค้ด Ads Plus ทั้ง repo + ดึงข้อมูล Apify Store จริงในวันเดียวกัน
> ผู้อ่านคือ **AI ตัวใหม่** ที่จะสร้างระบบแยกอีกตัว — ไม่ใช่คนที่จะแก้ Ads Plus
>
> ตัวเลขราคา actor ทุกตัวในเอกสารนี้ดึงจาก `GET https://api.apify.com/v2/acts/<owner>~<name>` และ `.../builds/default`
> ณ วันที่ 2026-09-23 · ราคาเปลี่ยนได้ทุกวัน **ต้องดึงใหม่ก่อนใช้จริงเสมอ** (วิธีอยู่ใน §6.2)

---

## 0. กติกาเด็ดขาด (อ่านก่อนทำอะไรทั้งสิ้น)

1. **ห้ามแตะระบบ Ads Plus เด็ดขาด** — ห้ามแก้ไฟล์ใน repo `ads-plus`, ห้ามต่อฐานข้อมูล `omnix_marketing` schema `adsplus`,
   ห้ามใช้ role `dev_adsplus`, ห้ามแตะ systemd unit `adsplus*`, ห้ามใช้พอร์ต `3010`, ห้ามใช้โฟลเดอร์ `/home/ads-plus/ads-plus`
   ระบบใหม่ต้องมี **repo ของตัวเอง · ฐานข้อมูล/schema ของตัวเอง · role ของตัวเอง · พอร์ตของตัวเอง · โฟลเดอร์ของตัวเอง**
2. **ห้ามเดาทุกกรณี** — ไม่แน่ใจให้ตรวจ ตรวจไม่ได้ให้ถาม ห้ามสมมติแล้วเดินต่อ
   ชื่อฟิลด์ของ actor, ราคา, input schema, ชื่อคอลัมน์, ชื่อ env — ต้องเปิดของจริงอ่านก่อนเขียนทุกครั้ง
3. **ห้ามเรียก endpoint/actor ที่มีผลข้างเคียงเพื่อ "ดูว่ามันตอบอะไร"** — การ start actor ของ Apify = เสียเงินทันที
   ก่อนรัน actor จริงทุกครั้งต้อง (ก) อ่าน input schema จาก API สาธารณะ (ไม่เสียเงิน) (ข) คำนวณค่าใช้จ่ายสูงสุดของ run นั้น
   (ค) รันสโมกเทสต์ด้วย `maxResults` เล็กสุด (5) ก่อน (ง) ถามผู้ใช้ก่อนรันชุดใหญ่ครั้งแรก
4. **จำกัด 50 ผลลัพธ์ต่อแพลตฟอร์มต่อรอบ** — ค่านี้เป็นค่าตั้งต้นที่ผู้ใช้กำหนด ใส่ไว้ใน input ของ actor (`maxResults`/`limit`)
   **และ** กันซ้ำในโค้ดฝั่งเรา (ตัดที่ 50 ตอน ingest) เพราะ actor บางตัวนับ `maxResults` ต่อคีย์เวิร์ด ไม่ใช่ต่อ run
5. **AI ต้องหา actor ที่ถูกและข้อมูลครบที่สุดก่อนดึงจริง** — §6 มีผลสำรวจให้แล้ว แต่ต้อง **ดึงราคา/schema ใหม่** ตอนลงมือ
   แล้วบันทึกผลเปรียบเทียบลงตาราง `actor_evaluations` (§8) ให้ผู้ใช้เห็นว่าเลือกตัวไหนเพราะอะไร
6. **ค่าที่แพลตฟอร์มภายนอกกำหนด ห้ามพิมพ์จากความจำ** — ดึงจากต้นทางแล้วเก็บใน `config/` พร้อม `_source` และวันที่ดึง
   (ตัวอย่างใน Ads Plus: `config/tiktok-industries.json` 420 ค่า จาก openapi.json ของ actor)
7. **ไม่กุตัวเลข** — ยอดขาย 30 วันที่แพลตฟอร์มไม่ให้ ห้ามคำนวณจากอย่างอื่นแล้วเรียกว่า "30 วัน"
   ต้องเก็บ `period` กำกับเสมอ (`30d` | `lifetime` | `unknown`) และ UI ต้องบอกให้เห็น
8. รายงานผลตามที่เกิดจริง ถ้าไม่ได้ตรวจให้บอกว่าไม่ได้ตรวจ

---

## 1. ระบบใหม่ต้องทำอะไร (สรุปโจทย์จากผู้ใช้)

**เป้าหมาย:** เฝ้าดูสินค้า "สายนาฬิกา Apple Watch" บน 4 แพลตฟอร์มจีน แล้วบอกว่า **หมวดไหน ขายดีแค่ไหน กำลังมาหรือกำลังไป**

| แพลตฟอร์ม | ชนิด | สิ่งที่หาได้จริง (ดู §6) |
|---|---|---|
| Xiaohongshu (小红书 / RedNote) | social commerce | สินค้าในร้าน XHS + โน้ต (buzz) |
| 1688 | B2B ค้าส่ง (โรงงาน) | สินค้า ราคาขั้นบันได MOQ ยอดสั่ง หมวดเต็ม |
| Temu | B2C ข้ามพรมแดน | สินค้า ราคา ยอดขาย (ช่วง) หมวด แฟล็ก trending |
| Douyin (抖音商城) | video commerce | สินค้า **ยอดขาย 30 วันรายวัน** หมวดเต็ม ค่าคอม |

**ข้อมูลที่ต้องได้ต่อสินค้า**

| ต้องการ | ทำได้แค่ไหน |
|---|---|
| จัดหมวดหมู่สินค้าอัตโนมัติ | ได้ — ใช้หมวดที่แพลตฟอร์มให้ (Douyin/1688/Temu มี) + taxonomy ของเราเอง (กฎคีย์เวิร์ด → LLM → `unclassified`) ดู §9 |
| จำนวนขายย้อนหลัง 30 วัน ถ้าไม่ได้ใช้จำนวนล่าสุด | Douyin ให้ 30 วันจริง · ที่เหลือให้ยอดสะสม/ยอดช่วง → เก็บพร้อม `period` ดู §10 |
| รูปสินค้า + ลิงก์สินค้า | ได้ทุกแพลตฟอร์ม · **รูปของ XHS หมดอายุเป็นชั่วโมง/วัน ต้อง cache ทันที** ดู §11 |
| trend สินค้า | Douyin มี `salesTrend` ในตัว · ที่เหลือคำนวณจาก snapshot ของเราเอง (ต้องเก็บหลายรอบ) ดู §10.3 |

**ขอบเขต:** 50 ผลลัพธ์ต่อแพลตฟอร์มต่อรอบ · เริ่มที่คีย์เวิร์ดชุดเดียว · งบต้องมีเพดานและเห็นได้บนหน้าเว็บ

---

## 2. Ads Plus คืออะไร และควรยืมอะไรมา

Ads Plus = ระบบเฝ้าดู Ad Library ของคู่แข่ง (Meta + TikTok) ผ่าน Apify แล้ว diff ทุกเช้าเป็นสัญญาณ เริ่มยิง/เลิกยิง/ครบ 90 วัน
ใช้งานจริงบน production แล้ว (483 โฆษณา 5 แบรนด์, งบ Apify ใช้ไป $1.61 จาก $5.00/เดือน)

Stack: **Next.js 16.3.5 (App Router, route handlers, server actions) · TypeScript strict · Drizzle ORM · Postgres (dev = PGlite ใน WASM ไม่ต้องติดตั้ง)
· Tailwind 4 + OMNIX Design System · Recharts · apify-client 2.25 · @anthropic-ai/sdk · zod 4 · vitest 5 · self-host บน systemd user unit หลัง Apache**

> ⚠️ Next.js 16 ต่างจากที่โมเดลจำได้ (เช่น `proxy.ts` แทน middleware, global type `PageProps`/`RouteContext` ต้องรัน `next typegen` ก่อน typecheck)
> ต้องอ่าน `node_modules/next/dist/docs/` ของ repo ใหม่ก่อนเขียนโค้ด framework ทุกครั้ง

### 2.1 หลักการที่ยืมมาได้ทั้งดุ้น (พิสูจน์แล้วว่าใช้ได้จริง)

| หลักการ | ทำไม | ใน Ads Plus อยู่ที่ |
|---|---|---|
| **1 run = 1 เป้าหมาย** (brand×source) → ระบบใหม่: **1 run = 1 platform × 1 keyword** | ล้มเป็นราย ต้นทุนดูได้รายเป้าหมาย | `lib/jobs/sync.ts` `triggerGroup()` |
| **Adapter interface** แยก "ดึง" ออกจาก "ประมวลผล" มี mock ที่ฟรี | ทดสอบ pipeline ทั้งเส้นโดยไม่เสียเงิน · สลับด้วย `SOURCE_MODE=mock\|apify` | `lib/sources/types.ts` `apify.ts` `mock.ts` `index.ts` |
| **Input template เป็น JSON string มี `{{placeholder}}`** ตั้งจาก settings ได้ · ตัด key ที่ค่าว่างทิ้ง | เปลี่ยน actor/input ไม่ต้องแก้โค้ด · actor ที่ใช้ enum จะ reject ค่าว่าง | `lib/sources/apify.ts` `fill()` |
| **Normalizer ทนชื่อฟิลด์ต่างกัน คืน `null` เมื่ออ่านไม่ได้ ไม่ throw** · `itemsIn − itemsOut` = สัญญาณ schema drift | actor เปลี่ยน output โดยเราไม่รู้ตัวเป็นเรื่องปกติ | `lib/domain/normalize.ts` |
| **Quality gate ตัดสินก่อนแตะข้อมูลเดิม** — actor ล้ม / อ่านไม่ได้เลย / ได้ต่ำกว่า 40% ของรอบก่อน → `suspect`/`failed` **ไม่ mark หาย ไม่ลบ** | กัน false "หายไปแล้ว" ตอน scrape ไม่ครบ | `lib/domain/gate.ts` `assessRun()` |
| **หาย 2 รอบติดถึงจะถือว่าหาย** (`missed_runs`, `RETIRE_AFTER_MISSES = 2`) | Ad Library เคยคืน 412 → 150 ในวันเดียว | `lib/domain/diff.ts` `lib/domain/types.ts` |
| **`raw jsonb` เก็บของดิบทุกแถวเสมอ** | normalizer เปลี่ยนได้ ของดิบเปลี่ยนไม่ได้ · สอบย้อนหลังได้ | `ads.raw` |
| **สองวันที่แยกกัน** — วันที่แพลตฟอร์มบอก vs วันที่เราเห็นครั้งแรก · คอลัมน์ `started_at` คำนวณไว้ล่วงหน้าให้ SQL เรียงด้วย index | ห้ามกุอายุ · ห้าม cast `date::timestamptz` ใน query (เพี้ยนตาม TimeZone ของ session) | `lib/domain/longevity.ts` `ads.started_at` |
| **`note` ของ run เป็นข้อความอังกฤษ pattern คงที่ แปลที่ UI ด้วย regex** | ค้นหา/รวมสถิติได้ · UI 3 ภาษาไม่ต้องเก็บ 3 สำเนา | `lib/domain/notes.ts` `NOTE` + `parseNote()` |
| **Budget guard ต่อกลุ่ม** — รวม `cost_usd` ของเดือนนี้ (เดือนตามเวลาไทย) ≥ เพดาน → skip ทุกเป้าหมายด้วยเหตุผล `skip.budget` · UI เตือนที่ 80% · เงื่อนไข `over` ต้องตรงกับตัวกันงบเป๊ะ | งบเต็มแล้วปุ่มต้องบอกตรง ๆ ไม่ใช่ขึ้น "เริ่มแล้ว" | `monthSpend()` ใน `lib/jobs/sync.ts` · `lib/domain/budget.ts` · `lib/domain/trigger-summary.ts` |
| **กันชนเพดาน concurrent ของ Apify (5 งาน)** เอง ไม่ปล่อยให้ actor ตัวที่ 6 ตอบ error | error นั้นจะค้างเป็นคำเตือนจนกว่าจะมี run ใหม่ | `lib/domain/source-scope.ts` `concurrencySlots()` |
| **จบ run ได้ 3 ทาง: inline (mock) · webhook · reconcile (poll)** · webhook มาไม่ถึงก็ไม่พัง · run ที่ไม่มี id ภายนอกเกิน 10 นาที = START-LOST · เกิน 60 นาที = TIMED-OUT | Apify webhook ไม่ถึงบ่อย | `reconcileRunning()` · `app/api/sync/webhook/route.ts` · `app/api/sync/status/route.ts` |
| **บันทึก `cost_usd` จาก `run.usageTotalUsd` ทุก run** · ประวัติการดำเนินการโชว์ต่อรายการ | งบเดือนขึ้นกับตัวเลขนี้ | `ingestRun()` |
| **ค่าตั้งระบบอยู่ในตาราง `app_settings` ทับ env ได้ · แก้จากหน้าเว็บ · ค่าลับเข้ารหัส AES-GCM ถ้าตั้ง `SETTINGS_SECRET` · มีปุ่มทดสอบการเชื่อมต่อที่เรียก endpoint ถูกสุดของแต่ละเจ้า** | ไม่ต้องขึ้นเซิร์ฟเวอร์ไปแก้ env | `lib/settings/*` (`catalog.ts` = แหล่งความจริงของคีย์) · `/settings/system` |
| **งานเบื้องหลังตอบ `{runId}` ทันที แล้วหน้าเว็บ poll `/api/jobs/status`** · ความคืบหน้า 3 แบบห้ามปน: `count` (จำนวนจริง) > `steps` (ขั้นที่จบจริง) > `time` (ประมาณ ต้องมี `~`) · ประมาณไม่ได้คืน `pct = null` ห้ามเดา 0 | Apache Timeout 300 · งานจริงกินหลายนาที | `lib/jobs/pipeline.ts` `cli-job.ts` · `lib/domain/count-progress.ts` `pipeline.ts` `job-progress.ts` · `components/JobButton.tsx` |
| **ปิดซากงานที่ค้าง `running` จากเซิร์ฟเวอร์รอบก่อน (`closeOrphaned`) — ใช้ได้เฉพาะงานที่วิ่งในโปรเซสของเว็บ ห้ามใช้กับ run ของ Apify** | actor วิ่งต่อที่ Apify แม้เว็บรีสตาร์ต | `lib/queries/jobs.ts` |
| **AI ทำงานได้โดยไม่มี API key** — export → `claude -p --allowed-tools ''` ทาง stdin → import · prompt มีสำเนาเดียวใน `lib/domain/<งาน>-prompt.ts` | ประหยัด · แต่ห้ามให้เครื่องมือเพราะ input คือของที่ scrape มา | `scripts/*-cron.sh` · `lib/llm.ts` (`llmConfigured()` ≠ `aiAvailable()`) |
| **ติดแท็กด้วยกฎคีย์เวิร์ดก่อน (ฟรี) แล้วค่อย LLM เฉพาะที่กฎตัดสินไม่ได้** · กฎ = คีย์เวิร์ดที่ปรากฏ**เร็วที่สุด**ในข้อความชนะ เสมอกันดูจำนวน · มี `unclassified` เสมอ | | `lib/domain/angle-rules.ts` `taxonomy.ts` · `lib/jobs/angle-rules.ts` `angle-tag.ts` |
| **Cache รูปฝั่งเรา ไม่ hotlink** — sha1 ของไฟล์เป็นชื่อ · ลอง 3 ครั้ง · ต้องบอกเมื่อล้ม · ไฟล์หายดึงใหม่จาก `source_url` | URL CDN หมดอายุ | `lib/media/store.ts` |
| **ทุกตัวกรองอยู่ใน URL** (`?brand=a,b&window=7&page=2`) เรียงผลตามลำดับจริงไม่ใช่ลำดับที่พิมพ์ | แชร์ลิงก์ได้ ไม่มี client state | `lib/domain/brand-filter.ts` `paging.ts` |
| **ปุ่ม "กลับ" รับ `?from=` เฉพาะ path ในรายการ allow** ห้าม redirect ค่าที่รับมาตรง ๆ | กัน open redirect | `lib/domain/back-link.ts` |
| **RWD + contrast มีเทสต์บังคับ** อ่าน CSS จริง (breakpoint 640/768/1024/1280 · จอเล็กสุด 320 · AA 4.5:1) | | `lib/domain/rwd-audit.ts` `test/rwd-audit.test.ts` `test/contrast.test.ts` |

### 2.2 สิ่งที่ **ไม่ควร** ยืม / ต้องทำต่างจาก Ads Plus

- Ads Plus ไม่มีคอลัมน์ผลลัพธ์ (ยอดขาย/ยอดวิว) ใน `ads` เพราะ Ad Library ไม่ให้ — **ระบบใหม่ต้องมี** และต้องมี `period` กำกับ
- Ads Plus ไม่มี snapshot รายรอบของตัวเลข (มีแค่ event เกิด/ตาย) — **ระบบใหม่ต้องมีตาราง snapshot** เพื่อทำ trend
- Ads Plus ผูก "กลุ่มสินค้า" กับ "แบรนด์" — ระบบใหม่ผูก "กลุ่มสินค้า" กับ **"คีย์เวิร์ดต่อแพลตฟอร์ม"**
- Strategy prompt ใน Ads Plus มีสองสำเนา (ts + sh) แล้วต้องแก้คู่กัน — **อย่าทำซ้ำ** ให้มีสำเนาเดียว

---

## 3. Logic ของ Ads Plus ทีละชั้น (เพื่อเอาไปเขียนใหม่ให้ตรงหลักการ)

### 3.1 เส้นทางข้อมูล

```
trigger (ปุ่ม / cron / CLI)
  → listTargets(): 1 target ต่อ brand×source (TikTok 1 ต่อกลุ่ม)
  → budget guard (spent ≥ budget → skip.budget ทุกตัว)
  → กันซ้ำ: มี run running ของ target เดิม → skip.alreadyRunning
  → concurrency slots (5 − running)
  → insert sync_runs(status=running) → adapter.start(target)
       ├ ok+inline  → ingestRun ทันที (mock)
       ├ ok+runId   → เก็บ apify_run_id รอ webhook หรือ reconcile
       └ !ok        → failed + note = reason
ingestRun(run, finished)
  → normalizeRows(source, rows) → {items, itemsIn}
  → assessRun({actorFailed, targetUnreadable, itemsIn, itemsOut, prevSuccessfulCount}) → {status, note, processRetirements}
  → transaction:
       existing = ads ที่ active ในขอบเขตเดียวกัน
       diffSnapshot(existing, items, processRetirements) → launched / kept / missing / retired
       launched: เคย retired มาก่อน → เปิดใหม่ ไม่ insert ซ้ำ · ใหม่จริง → insert + event launched
       kept: อัปเดต last_seen_at, missed_runs=0, ฟิลด์ที่แหล่งเพิ่งให้
       missing: missed_runs += 1 (ยังถือว่าอยู่)
       retired: is_active=false, retired_at = last_seen_at (ไม่ใช่ตอนสรุป) + event retired
       milestone_90: เฉพาะชิ้นที่เห็นจริงรอบนี้และเพิ่งข้ามเส้น
       update sync_runs(status, note, items_in, items_out, cost_usd)
  → cacheMediaFor(launched ≤ 120) · runRuleTag(fill) · เติม page id/โลโก้
```

### 3.2 Quality gate (`assessRun`) — ลำดับสำคัญ

```
actorFailed            → failed,  note "Apify reported <STATUS>."                      processRetirements=false
targetUnreadable       → suspect, note "The <src> actor could not read this target: …" processRetirements=false
itemsIn>0 && itemsOut=0→ suspect, note "…returned N rows and none could be read…"      processRetirements=false
itemsOut < 40% ของรอบสำเร็จก่อน → suspect, note "Run returned X ads against Y … (below the 40% floor)." processRetirements=false
itemsOut = 0           → succeeded, note "<name> has no ads running right now."       processRetirements=true
else                   → succeeded                                                    processRetirements=true
```

### 3.3 Diff engine (pure, ทดสอบได้)

- dedupe ภายใน run ด้วย `externalId`
- `absent = existing − seen` เฉพาะเมื่อ `processRetirements`
- `retired = absent ที่ missedRuns+1 ≥ 2` · `missing = ที่เหลือ`
- milestone นับเฉพาะ `daysLive(now) ≥ 90 && daysLive(lastSeenAt) < 90 && !hasMilestone`

### 3.4 Pipeline "ปุ่มเดียวจบ" (`lib/jobs/pipeline.ts`)

ขั้นเป็นชื่อ ไม่ใช่ตัวเลข (`ad_sync → media → link_read → angle_tag → strategy`) เก็บใน `sync_runs.step` · รอ Apify สูงสุด 12 นาที (poll 15 วิ + reconcile) เลยแล้วเดินต่อด้วยข้อมูลเท่าที่มี · งาน CLI รอ 26 นาที (KILL 25) · ทุกขั้น `.catch(() => null)` ขั้นเดียวล้มไม่ทำทั้ง pipeline พัง · `void drive()` ไม่ await เพื่อตอบใน 1 วินาที

### 3.5 Settings (`lib/settings`)

ลำดับค่า: **DB (`app_settings`) → env → fallback ในโค้ด → unset** · cache 30 วิ ล้างตอนบันทึก · คีย์ที่ย้ายเข้า DB ไม่ได้ (ต้องรู้ก่อนต่อ DB): `DATABASE_URL DB_AUTO_MIGRATE PGLITE_DIR MEDIA_DIR APP_PASSWORD SETTINGS_SECRET` · เทสต์เชื่อมต่อ: Apify `GET /v2/users/me` (คืน username + **plan id** — ใช้ตัดสิน tier ราคา), Anthropic `GET /v1/models?limit=1`, Resend `GET /domains`

### 3.6 Auth

`APP_PASSWORD` ว่าง = เปิดสาธารณะ · cookie = HMAC-SHA256(password, "adsplus-session-v1") ด้วย **Web Crypto** (รันใน proxy runtime ที่ไม่มี `node:crypto`) · `proxy.ts` ปล่อย `/api/cron` `/api/sync/webhook` `/api/auth` `/login` ผ่าน (มี secret ของตัวเอง) · `cronAuthorized()`: ไม่ตั้ง `CRON_SECRET` → dev ผ่าน / production 401

### 3.7 AI โดยไม่มี API key (`.agents/topics/ai-without-api-key.md`)

route แทรกแถว `sync_runs(kind, source="claude-cli", status=running)` → `spawn("bash", script, {env: ADSPLUS_RUN_ID})` → ตอบ `{runId}` · สคริปต์: `npm run <งาน>:export` → `claude -p --allowed-tools ''` → ดึงก้อน JSON ระหว่าง `{` แรกกับ `}` สุดท้าย (โมเดลชอบครอบ code fence) → `npm run <งาน>:import` ปิดแถวเองเมื่อเห็น `ADSPLUS_RUN_ID` · token ของ Claude Code หมดอายุได้ ไม่มีแจ้งเตือนอัตโนมัติ

---

## 4. API ของ Ads Plus (แบบแผน request/response ที่ควรยึด)

ทุก error คืน `{ error: "<dict key>" }` เช่น `errors.validation` (400) `errors.group.notFound` (404) `errors.job.alreadyRunning` (400 + `progress`) `common.unauthorized` (401) — key ไม่ใช่ข้อความ เพื่อแปล 3 ภาษาที่ UI

| method / path | body / query | คืน | หมายเหตุ |
|---|---|---|---|
| `POST /api/sync/trigger` | `{pg, brand?}` | `{started:[{runId,brand,source}], skipped:[{brand,source,reason}]}` | ข้ามทุกตัวก็ยัง 200 — ปุ่มต้องอ่าน `skipped` |
| `GET /api/sync/status?pg=` | | `{running:[{id,source,brandName,startedAt}]}` | ทุก poll: reconcile + เติมรูป 12 + โลโก้ |
| `GET /api/sync/runs?pg=&limit=` | | `{runs:[{id,status,brand,source,itemsReturned,errorMessage,finishedAt,startedAt}]}` | |
| `POST /api/sync/webhook?secret=` | Apify payload `{eventType, resource:{id}}` | `{ok, ignored?/pending?}` | run ที่ไม่ running แล้ว = ignored |
| `GET /api/cron/daily` | `Authorization: Bearer <CRON_SECRET>` หรือ `?secret=` | `{ok, groups:{slug:{started,skipped}}, reconciled}` | systemd timer 05:00 ไทย |
| `POST /api/jobs/pipeline` | `{pg}` | `{runId}` | อ่าน locale จาก cookie **ก่อน** spawn |
| `GET /api/jobs/status?pg=&kind=` | kind ∈ angle_tag\|strategy\|creative\|pipeline\|link_read\|ad_sync | `{running: {shape:"time"\|"steps"\|"count", …} \| null, last: {runId,status,finishedAt,note} \| null}` | `last` อายุ ≤ 30 นาที |
| `POST /api/jobs/angle-tag` | `{pg, mode: fill\|retag\|rules\|rules-retag}` | `{runId}` หรือผลทันที | API key → sync · ไม่มี → CLI job |
| `POST /api/jobs/link-read` | `{pg}` | `{runId}` | |
| `POST /api/jobs/strategy` | `{pg, window?}` | `{id, content}` หรือ `{runId}` | |
| `POST /api/jobs/creative` | `{pg}` | `{runId}` | CLI เท่านั้น |
| `POST /api/settings/test` | `{service: apify\|anthropic\|resend}` | `{ok, detail}` หรือ `{ok:false, noKey:true}` | |
| `POST /api/auth` · `DELETE` | `{password}` | cookie 30 วัน | |
| `GET /api/media/:id` · `GET /api/brand-logo/:id` | | binary, `cache-control: immutable` | |

Server actions (ไม่ใช่ route): `app/settings/watchlist/actions.ts` (กลุ่ม/แบรนด์/alias/taxonomy) · `app/settings/system/actions.ts` (บันทึก settings)

---

## 5. ฐานข้อมูลของ Ads Plus (โครงจริงจาก `lib/db/schema.ts`)

ทุกตารางประกาศผ่าน `pgSchema("adsplus").table()` ให้ query เขียนชื่อเต็มเสมอ — **ห้ามพึ่ง `search_path`** (PgBouncer transaction pooling ทำให้ SET ใน session ไม่ติดไป) · `drizzle.config.ts` ต้องมี `schemaFilter` ไม่งั้น drizzle-kit เห็นตารางคนอื่นแล้วเสนอให้ลบ · migration ห้ามเขียนมือ (`npm run db:generate`) ห้ามแก้ย้อนหลัง · expand/contract

```
product_groups   id uuid PK · slug unique · name · category · country='TH' · platforms text[] · sync_schedule='daily_0500'|'manual'
                 · alert_email · alert_threshold_days=60 · alert_last_sent_at · monthly_budget_usd numeric(8,2)=20
                 · tiktok_industry · angle_taxonomy jsonb [{key,en,th,keywords?}] · created_at · updated_at
brands           id · product_group_id FK cascade · name_th · name_en · meta_page_id · meta_page_handle · tiktok_advertiser_id
                 · google_advertiser_id · google_domain · is_own_brand · logo_bytes bytea · logo_mime · logo_checksum · ci_color · ci_palette jsonb
                 idx brands_group_idx(product_group_id)
advertiser_aliases id · product_group_id · source · advertiser_name · brand_id FK cascade   unique(product_group_id, source, advertiser_name)
media            id · source_url · storage_key · content_type · bytes · created_at
ads              id · product_group_id · brand_id (null = จับคู่ไม่ได้) · source · external_id · advertiser_name · publisher_platforms text[]
                 · format image|video|carousel|text · caption · media_id FK set null · media_source_url · video_url · link_url
                 · landing_url · landing_domain · landing_read_at · library_url · library_start_date date
                 · started_at timestamptz NOT NULL (คำนวณไว้) · first_seen_at · last_seen_at · is_active · retired_at · missed_runs=0
                 · angle_key · angle_tagged_at · raw jsonb
                 unique(source, external_id) · idx(product_group_id,is_active) · idx(brand_id,source,is_active) · idx(product_group_id,is_active,started_at)
change_events    id bigserial · product_group_id · ad_id FK cascade · kind launched|retired|milestone_90 · occurred_at · sync_run_id   (append-only)
sync_runs        id · product_group_id · brand_id FK **set null** (ลบแบรนด์แล้วประวัติค่าใช้จ่ายต้องอยู่) · brand_name text
                 · kind ad_sync|angle_tag|link_read|strategy|creative|pipeline · source · mode · step · status running|succeeded|failed|suspect
                 · apify_run_id · started_at · finished_at · items_in · items_out · cost_usd numeric(10,4) · note
link_cache       url PK · final_url · domain · ok · checked_at   (ใช้ซ้ำ 14 วัน)
analyses         id · product_group_id · kind strategy|creative · locale · model · window_days · content · created_at
app_settings     key PK (ชื่อเดียวกับ env) · value (อาจ enc:v1:…) · updated_at
```

กฎ: `product_group_id` อยู่บนทุกตารางข้อมูล (cascade) · timestamp ทุกตัว `withTimezone` เก็บ UTC · การเขียนของ ingest อยู่ใน transaction เดียวและทนถูกเรียกซ้ำ (webhook + poll + cron ซ้อนกันได้) · `raw` ไว้สอบย้อนหลัง ถ้าต้องกรอง/เรียงให้ยกเป็นคอลัมน์จริง · query ใหม่ต้องมี index รองรับ

---

## 6. ผลสำรวจ Apify actor สำหรับ 4 แพลตฟอร์ม (ดึงจริง 2026-09-23)

### 6.1 ข้อเท็จจริงเรื่องราคาที่ต้องรู้ก่อนคำนวณ

- actor ที่เกี่ยวข้อง**ทุกตัว**ใช้โมเดล **pay-per-event (PPE)** — จ่ายต่อเหตุการณ์ที่ผู้พัฒนากำหนด (มักคือ `result` ต่อแถว + `actor-start` ต่อ run)
  เอกสาร Apify ระบุว่า **ส่วนใหญ่รวมค่า platform usage แล้ว แต่บางตัวเก็บแยก** — ต้องดูหน้า pricing ของ actor นั้น ๆ
- ราคาหลายตัวเป็น **tiered ตามแพลนของบัญชี** (FREE / BRONZE / SILVER / GOLD / …) — ตารางด้านล่างใช้ **ราคา tier FREE** (แพงสุด, ปลอดภัยสุด)
  ต้องตรวจแพลนจริงของบัญชีด้วย `GET https://api.apify.com/v2/users/me` (คืน `plan.id`) แล้วคำนวณใหม่
- ค่าใช้จ่ายจริงต่อ run อ่านได้จาก object ของ run (`usageTotalUsd` และรายการ charged events) — บันทึกลง `scrape_runs.cost_usd` ทุกครั้งเหมือน Ads Plus
- เทียบกับที่ Ads Plus จ่ายอยู่: Meta `curious_coder/facebook-ads-library-scraper` **$0.00075/โฆษณา** · TikTok `azzouzana/...` **$0.001/แถว** — actor ฝั่งจีนแพงกว่า 3–10 เท่า เป็นเรื่องปกติ
- API สาธารณะของ Apify ให้สถิติ run 30 วันของ actor แต่ละตัว (`stats.publicActorRunStats30Days` = SUCCEEDED/FAILED) — ตัวที่ล้ม > 10% ตัดออกแม้จะถูก

### 6.2 วิธีดึงราคาและ schema ใหม่ (ไม่เสียเงิน ไม่ต้องใช้ token)

```bash
# รายการ actor ในหมวด + ราคา (tier FREE อยู่ใน pricingPerEvent.actorChargeEvents.<event>.eventTieredPricingUsd.FREE)
curl -s "https://api.apify.com/v2/store?search=douyin&limit=40"
# รายละเอียด actor (pricingInfos[-1] = ราคาปัจจุบัน, stats.publicActorRunStats30Days = อัตราล้ม)
curl -s "https://api.apify.com/v2/acts/zen-studio~douyin-product-search-scraper"
# input schema + README (มีชื่อฟิลด์ output) ของ build ปัจจุบัน
curl -s "https://api.apify.com/v2/acts/zen-studio~douyin-product-search-scraper/builds/default"
# ตรวจแพลนบัญชี (ต้องใช้ token) — เพื่อรู้ว่าใช้ tier ราคาไหน
curl -s -H "Authorization: Bearer $APIFY_TOKEN" https://api.apify.com/v2/users/me
```

สูตร **cost per result** = `(actor-start + N × (ราคาต่อ result + add-on ที่เปิด)) / N` ที่ N = 50

### 6.3 Douyin (抖音商城) — ครบที่สุดใน 4 แพลตฟอร์ม

| actor | events (tier FREE) | ค่า 50 ผล | /result | ได้อะไร | ล้ม 30 วัน | หมายเหตุ |
|---|---|---|---|---|---|---|
| **`zen-studio/douyin-product-search-scraper`** ⭐ | start $0.005 · product $0.00799 · dataset-item $0.00001 · detail add-on $0.029 (ไม่ต้องเปิด) | **$0.405** | **$0.0081** | `price{}` · `sales{monthlySold, salesTrend[30 จุดรายวัน]}` · `category{first..fourth{id,name}}` · `mainImage` `whiteImage` · `detailUrl` (ถาวร) · `shop{}` · `affiliate{}` · `raw` | 1/402 | **ตรงโจทย์ทุกข้อ** (ยอด 30 วันจริง + trend + หมวดเต็ม + รูป + ลิงก์) · ไม่มี sort/filter ต้องเรียงเอง · `maxResults` ต่อคีย์เวิร์ด |
| `socialdatax/socialdatax-douyin-data-api` | dataset-item $0.00499 · start $0.00005 | $0.250 | $0.0050 | operation `search_products` (sort `sales_descending` ได้) · `get_product_detail` | 7/1714 | ถูกกว่า 38% แต่ **README เป็นจีน ไม่ระบุว่ามียอด 30 วัน/trend** — ต้องสโมกเทสต์ดูฟิลด์ก่อน |
| `sian.agency/douyin-shop-scraper` | FREE: start $0.14 · search $0.03 / BRONZE+: $0.014 · $0.01 | $1.64 (FREE) / $0.514 | $0.033 / $0.010 | `salesCount` (lifetime) · `imageList` · `tags` · SKU | 0/113 | ไม่มียอด 30 วัน · แพงบน FREE |
| `zen-studio/douyin-hot-search-scraper` | start $0.05 · result $0.00799 | $0.45 | $0.009 | เทรนด์หัวข้อ 5 บอร์ด (มี 种草榜 = สินค้า) | 0/222 | ไม่ใช่ข้อมูลสินค้า — ใช้เสริม trend ระดับหัวข้อเท่านั้น |

**สรุป Douyin:** ใช้ `zen-studio/douyin-product-search-scraper` เป็นหลัก (`includeDetails: false`) · ลอง `socialdatax` ด้วยสโมกเทสต์ 5 ผล ถ้ามี `monthlySold`/trend จริงค่อยสลับ

### 6.4 1688 — ค้าส่ง ราคาถูกสุดต่อผล

| actor | events (tier FREE) | ค่า 50 ผล | /result | ได้อะไร | ล้ม 30 วัน | หมายเหตุ |
|---|---|---|---|---|---|---|
| **`zen-studio/1688-wholesale-scraper`** ⭐ | start $0.0049 · item $0.00499 · dataset-item $0.00001 · supplier-intel add-on $0.00299 | **$0.255** (+$0.15 ถ้าเปิด add-on) | **$0.0051** (+add-on $0.0081) | `categoryPath` `categoryName` `mainCategory` · `images[]` `videoUrl` · `detailUrl` · `recentSoldCount` `soldDisplay` (เช่น `全网10万+件`) · `priceTiers` MOQ · `sortBy: bestSelling` · add-on: `salesVolume`+ช่วงเวลา, dropship orders 7/30 วัน | 0/26,670 | ครบสุด · ไม่มีอัตราล้มเลย · `maxResults` ต่อคีย์เวิร์ด |
| `datacach/1688-search-scraper` | start $0.00005 · item $0.001 (GOLD+ $0.0005) | $0.050 | $0.0010 | `url` `imageUrl` `price` `priceTiers` `bookedCount` `salesText` `sellerUrl` · sort `sales` | 24/1,990 (1.2%) | ถูกกว่า 5 เท่า แต่**ไม่มีหมวด** — ใช้เป็นตัวเช็กราคาไขว้ |
| `devcake/1688-com-products-scraper` | item $0.002 · start $0.00005 | $0.100 | $0.0020 | `booked_count` `sold_count_text` `repurchase_rate_percent` `image_url` `detail_url` · sort `va_rmdarkgmv30` = **เรียงตาม GMV 30 วัน** | 0/2,081 | ไม่มีหมวด · แต่ sort 30 วันมีประโยชน์ |
| `webdata_labs/1688-scraper` | product $0.005 | $0.250 | $0.0050 | `priceTiers` ชื่ออังกฤษ supplier · 4 โหมด | 8/5,350 | ราคาเท่า zen แต่ README ไม่ยืนยันว่ามีหมวด/ยอดขาย |
| `dami_studio/1688-wholesale-scraper` | start $0.001 · product $0.00035 | $0.019 | $0.0004 | offer id, title, unit price, image, MOQ, supplier rating | 0/250 | **ถูกสุด** แต่ README ไม่มียอดขาย → ไม่ครบ |
| `piotrv1001/1688-listings-scraper` | listing $0.001 · detail $0.004 | $0.050 | $0.0010 | tiered prices MOQ images | **234/819 (29%)** | ตัดออก — ล้มบ่อย |
| `sian.agency/alibaba-1688-wholesale-scraper` | FREE: start $0.14 · search $0.012 | $0.74 | $0.0148 | `saledCount` `imageUrls` `itemUrl` | 0/200 | แพงบน FREE |
| `prodiger/1688-scraper` | start $0.05 · product ไม่ระบุ | ? | ? | sales volume, return rate | **46/231 (20%)** | ตัดออก |

**สรุป 1688:** ใช้ `zen-studio/1688-wholesale-scraper` (`sortBy: "bestSelling"`, ปิด add-on ก่อน) · ถ้าต้องการยอด "ช่วง 30 วัน" ทดลองเปิด `includeSupplierIntelligence` 1 รอบ (เพิ่ม $0.15/50 ผล) แล้วดูว่า `salesVolume` ระบุช่วงเวลาอย่างไร

### 6.5 Temu

| actor | events (tier FREE) | ค่า 50 ผล | /result | ได้อะไร | ล้ม 30 วัน | หมายเหตุ |
|---|---|---|---|---|---|---|
| **`apivault_labs/temu-product-scraper`** ⭐ | start $0.00005 · product $0.003 | **$0.150** | **$0.0030** | `category` · `soldCountInt` `soldCountText` `soldCountIsBucket` (ยอดสะสม **ขั้นต่ำ** เช่น `10K+` → 10000) · `imageUrl` `images` `videoUrl` · `productUrl` · `isTrending` `demandScore` `hotProductScore` · `sortBy: top_sales` · `region` (us เป็นค่าเริ่มต้น) | 0/1,993 | ครบ + ถูก · README บอกชัดว่า sold count เป็น bucket ไม่ใช่ยอดจริง |
| `pear_fight/temu-scraper` | start $0.00005 · result $0.0015 | $0.075 | $0.0015 | `soldCount` `imageUrl` `productUrl` `category` breadcrumb | 0/67 | ถูกกว่าครึ่ง แต่ใช้ Playwright+residential proxy (ช้า) และรันน้อย (67 run/30 วัน) — ลองเป็นตัวสำรอง |
| `amit123/temu-products-scraper` | result $0.006 | $0.300 | $0.0060 | `sales_num` ("3.2K+") `link_url` `thumb_url` | 1/4,863 | ไม่มีหมวด · แพงกว่า |
| `crw/temu-products-scraper` | result $0.01 | $0.500 | $0.0100 | `sales_num` `sales_tip` `image_url` `link_url` `opt_id` (category id) · sort `top_sales` | 71/4,610 | แพงสุด |
| `gio21/temu-scraper` | product $0.003 | $0.150 | $0.0030 | title price rating reviews image shipping | 0/200 | **ไม่มียอดขาย** → ไม่ครบ |
| `scrapeunblocker/temu-search-scraper` + `temu-product-scraper` | $0.002 URL + $0.003 detail | $0.250 | $0.0050 | detail ไม่มี sold count | | ไม่ครบ |
| `crw/temu-category-trend-report` | row $0.01 × 100 แถวคงที่ | **$1.00/หมวด/run** | — | top-100 ตามยอดขายในหมวด · `price_7d_delta` · momentum 7 วัน · `market_signal` · US เท่านั้น | 0/90 | หมวดที่มี: 33 หมวดกว้าง (ใกล้สุด `2640 Cell Phones & Accessories`, `248 Electronics & Accessories`, `352 Jewelry Accessories`) — **ไม่มีหมวดสายนาฬิกาโดยตรง** ใช้ได้แค่ดูบริบทหมวดใหญ่ · ไม่แนะนำในงบเริ่มต้น |

**สรุป Temu:** ใช้ `apivault_labs/temu-product-scraper` (`sortBy: "top_sales"`, `region: "us"`) · ยอดขาย = lifetime lower bound เท่านั้น → trend ต้องมาจาก snapshot ของเราหรือแฟล็ก `isTrending`

### 6.6 Xiaohongshu (小红书) — ยากสุด เพราะ search ในร้านล็อกอินเป็นส่วนใหญ่

| actor | events (tier FREE) | ค่า 50 ผล | /result | ได้อะไร | ล้ม 30 วัน | หมายเหตุ |
|---|---|---|---|---|---|---|
| **`zen-studio/rednote-product-search-scraper`** ⭐ | start $0.05 · product $0.00499 · dataset-item $0.00001 · **detail add-on $0.00299 เปิดเป็นค่าเริ่มต้น → ปิด** | **$0.300** (details off) / $0.450 (on) | **$0.0060** / $0.0090 | `url` (ถาวร) `link` (deep link) · `price{price, origin_price}` · `images[].url` (**หมดอายุเป็นชั่วโมง–วัน**) · `metrics{units_sold, shop_sold}` · `keyword` · `vendor_link` | 7/189 (3.7%) | ค้นด้วยคีย์เวิร์ดได้**โดยไม่ต้อง cookie** · README ไม่พูดถึงหมวด → จัดหมวดเอง |
| `socialdatax/socialdatax-xhs-data-api` | dataset-item $0.00499 · start $0.00005 | $0.250 | $0.0050 | มี 商品搜索 (product search) + 商品详情 | 817/62,116 (1.3%) | ฟิลด์ยังไม่ยืนยัน — สโมกเทสต์ก่อน |
| `zhorex/rednote-shop-scraper` | start $0.00005 · product $0.0075 · vendor $0.025 | $0.375 | $0.0075 | `category` path · `soldCount` · `images` · `productUrl` · `sortBy: sales` | 0/61 | **`product_search` ต้องใช้ cookie ล็อกอินของผู้ใช้** — ถ้าผู้ใช้ให้ cookie ได้ ตัวนี้มีหมวดให้เลย · โหมด `vendor_products` ไม่ต้อง cookie |
| `memo23/rednote-product-scraper` | start $0.005 · result $0.005 | $0.255 | $0.0051 | seed `goodsId` → ร้าน + สินค้าใกล้เคียง · `soldCount` · coupon/flash price | 15/223 | ไม่มี keyword search — ใช้ต่อยอดจากสินค้าที่เจอแล้ว |
| `zen-studio/rednote-search-scraper` (โน้ต ไม่ใช่สินค้า) | start $0.05 · result $0.00599 | $0.350 | $0.0070/โน้ต | engagement (likes/comments/collects) · `timeFilter: 1w` · `sortType: popularity_descending` | 2/23,222 | ใช้วัด **buzz** ของคีย์เวิร์ดรายสัปดาห์ (trend ทางสังคม) — เป็นตัวเลือกเสริม |
| `memo23/rednote-trending-scraper` | start $0.005 · result $0.005 | $0.255 | $0.0051 | feed หมวด `homefeed.fashion_v3` ฯลฯ ไม่ใช่คีย์เวิร์ด | 1/46 | ไม่ตรงโจทย์ |

**สรุป XHS:** ใช้ `zen-studio/rednote-product-search-scraper` (`includeProductDetails: false`) · **ต้อง cache รูปทันทีหลัง run** · หมวดจัดเอง (§9) · ถ้าผู้ใช้ยินดีให้ cookie → ประเมิน `zhorex` เพิ่มเพราะมี `category` มาให้

### 6.7 สรุปที่แนะนำ + งบต่อรอบ

| แพลตฟอร์ม | actor ที่แนะนำ | /result | 50 ผล | ยอดขาย 30 วัน? | หมวดจากแพลตฟอร์ม? | รูป+ลิงก์? | trend ในตัว? |
|---|---|---|---|---|---|---|---|
| Douyin | `zen-studio/douyin-product-search-scraper` | $0.0081 | $0.41 | ✅ `monthlySold` | ✅ 4 ชั้น | ✅ (CDN ไม่มี signature) | ✅ `salesTrend` 30 จุด |
| 1688 | `zen-studio/1688-wholesale-scraper` | $0.0051 | $0.26 | ⚠️ `recentSoldCount` ช่วงไม่ชัด | ✅ `categoryPath` | ✅ | ❌ ต้อง snapshot |
| Temu | `apivault_labs/temu-product-scraper` | $0.0030 | $0.15 | ❌ lifetime bucket | ✅ `category` | ✅ | ⚠️ `isTrending` flag · snapshot |
| Xiaohongshu | `zen-studio/rednote-product-search-scraper` | $0.0060 | $0.30 | ❌ lifetime `units_sold` | ❌ จัดเอง | ✅ (**รูปหมดอายุ**) | ❌ ต้อง snapshot |
| **รวม 1 รอบ (4×50)** | | | **≈ $1.11** | | | | |

ความถี่ที่แนะนำ: **สัปดาห์ละ 1 รอบ ≈ $4.5/เดือน** (รายวัน ≈ $33/เดือน — ไม่คุ้มเพราะ 3 ใน 4 แพลตฟอร์มให้ยอดสะสม เปลี่ยนช้า) · ตั้ง `monthly_budget_usd` เริ่มที่ **$10** และตั้ง spending limit ใน Apify console ด้วยอีกชั้น

### 6.8 คีย์เวิร์ดตั้งต้น (ต้องยืนยันด้วยสโมกเทสต์ 5 ผลก่อน)

| แพลตฟอร์ม | ภาษา | คีย์เวิร์ดเริ่มต้น | สำรอง |
|---|---|---|---|
| Douyin / 1688 / XHS | จีน | `苹果手表表带` (สายนาฬิกา Apple Watch) | `applewatch表带` · `iwatch表带` · `apple watch 表带` |
| Temu (region us) | อังกฤษ | `apple watch band` | `apple watch strap` · `iwatch band` |

หลักฐานว่าคีย์เวิร์ดใช้ได้ = สโมกเทสต์คืนสินค้าที่เป็นสายนาฬิกาจริง ≥ 4 ใน 5 · ถ้าไม่ถึงให้เปลี่ยนคีย์เวิร์ดก่อนรัน 50

### 6.9 Input ที่แนะนำ (จาก input schema ที่อ่านจริง — ตรวจซ้ำก่อนใช้)

```jsonc
// zen-studio/douyin-product-search-scraper
{ "keywords": ["苹果手表表带"], "maxResults": 50, "includeDetails": false }

// zen-studio/1688-wholesale-scraper
{ "keywords": ["苹果手表表带"], "maxResults": 50, "sortBy": "bestSelling",
  "includeSkuDetails": false, "includeDescriptionHtml": false, "includeSupplierIntelligence": false }

// apivault_labs/temu-product-scraper
{ "searchKeywords": ["apple watch band"], "region": "us", "maxProductsPerKeyword": 50, "sortBy": "top_sales",
  "extractCategory": true, "extractSoldCount": true, "writeSummary": false }

// zen-studio/rednote-product-search-scraper
{ "keywords": ["苹果手表表带"], "maxResults": 50, "includeProductDetails": false }
```

ตัวแปรใน template ที่ระบบใหม่ควรมี: `{{keyword}}` `{{limit}}` `{{region}}` — ให้ `fill()` ตัด key ที่ค่าว่างทิ้งเหมือน Ads Plus

---

## 7. Field mapping → โครง `ProductInput` กลาง (normalizer ต่อแพลตฟอร์ม)

```ts
type ProductInput = {
  platform: "douyin" | "1688" | "temu" | "xhs";
  externalId: string;                 // ตัวตนจริงคู่กับ platform (unique)
  title: string | null;
  productUrl: string | null;          // ลิงก์ถาวร
  imageUrl: string | null;            // รูปหลัก (ต้อง cache)
  imageUrls: string[];                // gallery
  price: number | null; currency: "CNY" | "USD" | null; originalPrice: number | null;
  soldCount: number | null;           // ตัวเลขที่แพลตฟอร์มให้
  soldPeriod: "30d" | "lifetime" | "unknown";   // ★ ห้ามเดา
  soldIsLowerBound: boolean;          // Temu "10K+" = true
  soldText: string | null;            // ข้อความดิบ เช่น "全网10万+件"
  salesTrend: { date: string; units: number }[] | null;  // Douyin เท่านั้น
  platformCategoryPath: string[] | null;   // ["数码、电脑","手机配件","手机保护套"]
  shopName: string | null; shopUrl: string | null;
  rank: number;                       // ลำดับในผลค้นหา (สัญญาณ trend อีกตัว)
  keyword: string;
  raw: unknown;
};
```

| ฟิลด์ | Douyin (zen) | 1688 (zen) | Temu (apivault) | XHS (zen) |
|---|---|---|---|---|
| externalId | `productId` | `offerId` | `productId` | `id` / `item_id` |
| productUrl | `detailUrl` | `detailUrl` | `productUrl` | `url` |
| imageUrl | `mainImage` (สำรอง `whiteImage`) | `images[0]` | `imageUrl` | `images[0].url` |
| price | `price.*` (ดู raw) CNY | `priceTiers[0].price` CNY | `priceUsd` USD | `price.price` CNY |
| soldCount / period | `sales.monthlySold` / `30d` | `recentSoldCount` / `unknown` (+`soldDisplay`) | `soldCountInt` / `lifetime` · lowerBound = `soldCountIsBucket` | `metrics.units_sold` / `lifetime` |
| salesTrend | `sales.salesTrend` | — | — | — |
| platformCategoryPath | `category.first..fourth[].name` | `categoryPath.split(" > ")` | `category` | — |

**ชื่อฟิลด์ข้างบนมาจาก README ของ actor ไม่ใช่จาก run จริง** — normalizer ต้องเขียนแบบ `pick(row, "a", "b", "c")` ทนหลายชื่อ และต้องมี fixture จากแถวดิบของสโมกเทสต์จริงก่อน commit (แบบ `test/fixtures/meta-curious-coder-row.json`)

---

## 8. โครงฐานข้อมูลที่เสนอสำหรับระบบใหม่ (Drizzle · schema ของตัวเอง เช่น `scout`)

```
app_settings        key PK · value · updated_at                                   (เหมือน Ads Plus ทุกประการ)
product_groups      id · slug unique · name · country · platforms text[] · monthly_budget_usd numeric(8,2) default 10
                    · result_limit int default 50 · schedule 'weekly'|'daily'|'manual' · taxonomy jsonb [{key,en,th,zh,keywords[]}]
                    · created_at · updated_at
keywords            id · product_group_id FK cascade · platform · keyword · region · enabled · created_at
                    unique(product_group_id, platform, keyword)
products            id · product_group_id · platform · external_id · title · product_url · image_media_id FK media set null
                    · image_source_url · image_urls jsonb · currency · price numeric · original_price numeric
                    · shop_name · shop_url · platform_category_path text[] · category_key (taxonomy ของเรา) · category_source 'platform'|'rules'|'llm'|'manual'
                    · category_tagged_at · first_seen_at · last_seen_at · is_active · missed_runs int default 0 · gone_at
                    · latest_sold_count int · latest_sold_period · latest_sold_lower_bound bool · latest_snapshot_at · raw jsonb
                    unique(platform, external_id) · idx(product_group_id, platform, is_active) · idx(product_group_id, category_key)
product_snapshots   id bigserial · product_id FK cascade · scrape_run_id · taken_at · rank int · price · sold_count · sold_period
                    · sold_lower_bound · sales_trend jsonb (Douyin) · raw jsonb     ★ append-only — นี่คือแหล่งของ trend
                    idx(product_id, taken_at)
media               id · source_url · storage_key · content_type · bytes · created_at
scrape_runs         id · product_group_id · keyword_id FK set null · keyword text · platform · actor_id text · kind 'scrape'|'categorize'|'trend'|'pipeline'
                    · step · status running|succeeded|failed|suspect · apify_run_id · started_at · finished_at
                    · items_in · items_out · cost_usd numeric(10,4) · note
actor_evaluations   id · platform · actor_id · evaluated_at · plan_tier · price_per_result numeric(10,6) · start_fee · est_cost_50
                    · has_sold_30d bool · has_category bool · has_image bool · has_link bool · has_trend bool
                    · fail_rate_30d numeric · smoke_items_in · smoke_items_out · smoke_cost_usd · chosen bool · reason text · raw jsonb
                    ★ ตารางนี้คือหลักฐานว่า "AI หา actor ที่ถูกและครบที่สุดแล้ว" ผู้ใช้ต้องเปิดดูได้บนหน้าเว็บ
category_map        id · platform · platform_path text · category_key · created_at   (แมปหมวดแพลตฟอร์ม → taxonomy ของเรา · unique(platform, platform_path))
change_events       id bigserial · product_group_id · product_id · kind new|gone|price_drop|sales_surge|rank_up · occurred_at · scrape_run_id · detail jsonb
```

กฎเดิมใช้ต่อ: `product_group_id` ทุกตาราง · timestamptz UTC · transaction เดียวต่อ ingest · unique index + upsert · `raw` เก็บทุกแถว · `keyword_id` set null (ลบคีย์เวิร์ดแล้วประวัติค่าใช้จ่ายต้องอยู่ เก็บ `keyword` text ซ้ำ)

---

## 9. จัดหมวดหมู่อัตโนมัติ (3 ชั้น ตามลำดับ ราคาถูกก่อน)

1. **หมวดจากแพลตฟอร์ม** (`platformCategoryPath`) → เทียบ `category_map` → ได้ `category_key` (`category_source = platform`)
   ไม่มีในแมป → ใส่คิว "unmapped" ให้คนกดจับคู่ครั้งเดียวแล้วระบบจำ (แบบ `advertiser_aliases` ของ Ads Plus)
2. **กฎคีย์เวิร์ดบน title** (ฟรี, ทันทีหลัง ingest) — ยืม `scoreAngles()/pickAngle()`: คีย์เวิร์ดที่ปรากฏเร็วสุดชนะ · เสมอ = ตัดสินไม่ได้ → ข้าม
3. **LLM** เฉพาะที่ 1–2 ตัดสินไม่ได้ · batch 25 · structured output · ใช้เฉพาะ key ที่อยู่ใน taxonomy · ปฏิเสธ = ปล่อยว่างรอรอบหน้า
4. **`unclassified` มีเสมอ** ทั้งใน taxonomy และ UI

taxonomy ตั้งต้น (แก้ได้บนหน้า settings แบบ `key | en | th | keywords`) — เป็นข้อเสนอ ต้องให้ผู้ใช้ยืนยัน:

```
material_silicone | Silicone / sport band | สายซิลิโคน | 硅胶, 运动表带, silicone, sport band
material_leather  | Leather               | สายหนัง   | 真皮, 皮革, 皮表带, leather
material_metal    | Metal / stainless     | สายโลหะ   | 不锈钢, 金属, 米兰尼斯, milanese, stainless, link bracelet
material_nylon    | Nylon / braided loop  | สายไนลอน/ถัก | 尼龙, 编织, 回环, braided, solo loop, nylon
style_solo_loop   | Solo loop (no buckle) | โซโลลูป   | 单圈, solo loop
style_ocean_alpine| Ocean / Alpine / Ultra style | สายทรง Ultra | 海洋, 高山, ultra, ocean band, alpine
accessory_case    | Case / protector (not a band) | เคส/ฟิล์ม ไม่ใช่สาย | 保护壳, 保护套, 钢化膜, case, screen protector
bundle_set        | Multi-pack / set      | เซ็ตหลายเส้น | 套装, 多条装, pack, set of
```

ขนาด (38/40/41/42/44/45/46/49 mm) และรุ่น (Ultra/SE) ควรเป็น**แอตทริบิวต์แยก** ไม่ใช่หมวด — ดึงด้วย regex จาก title เก็บใน `products.attrs jsonb`

---

## 10. ยอดขาย 30 วัน · ตัวเลขล่าสุด · trend

### 10.1 ยอดขาย

- มี `30d` จริง (Douyin) → เก็บทั้ง `monthlySold` และ `salesTrend` ลง snapshot
- ไม่มี → เก็บ `latest_sold_count` + `period` + `lower_bound` และ **หน้าเว็บต้องแสดงป้ายช่วงเวลา** ("ยอดสะสม ≥ 10,000" ไม่ใช่ "ขาย 10,000")
- ห้ามคูณ/หาร/ประมาณให้เป็น 30 วัน

### 10.2 ตัวเลขล่าสุด

`products.latest_*` อัปเดตจาก snapshot ล่าสุดในรอบที่ gate ผ่านเท่านั้น (รอบ `suspect` เขียน snapshot ได้แต่ไม่อัปเดต latest และไม่ mark `gone`)

### 10.3 trend (คำนวณจาก snapshot ของเราเอง — pure function ทดสอบได้)

```
delta_sold(7d)  = sold(ล่าสุด) − sold(snapshot ที่ใกล้ 7 วันก่อนที่สุด)   // ใช้ได้เมื่อ period เดียวกันและ lower_bound เท่ากัน
delta_rank      = rank(ก่อน) − rank(ล่าสุด)                               // + = ไต่ขึ้น
douyin_trend    = สัดส่วน units 7 วันหลัง / 7 วันก่อนใน salesTrend       // เฉพาะ Douyin
trend_label     = "rising" ถ้า delta_sold > 0 และ delta_rank ≥ 0 · "falling" ถ้าตรงข้าม · "flat" · "insufficient_history" ถ้ามี snapshot < 2 รอบ
```

- ต้องมี ≥ 2 snapshot ถึงจะบอกได้ — ก่อนหน้านั้น UI แสดง "ยังไม่มีประวัติพอ" **ห้ามโชว์ 0 หรือ flat**
- Temu `isTrending`/`demandScore` เป็นสัญญาณจากแพลตฟอร์ม เก็บแยก ไม่ปนกับ trend ที่เราคำนวณ
- buzz ทางสังคม (โน้ต XHS ต่อสัปดาห์ / Douyin hot search) เป็น**ชั้นเสริม**ที่มีค่าใช้จ่ายเพิ่ม เปิดทีหลังเมื่อผู้ใช้สั่ง

### 10.4 Change events ที่มีประโยชน์

`new` (เจอครั้งแรก) · `gone` (หาย 2 รอบติด, เฉพาะ gate ผ่าน) · `sales_surge` (delta_sold ≥ เกณฑ์) · `rank_up` (ไต่ ≥ 10 อันดับ) · `price_drop` (≥ 15%)

---

## 11. รูปและลิงก์

- ลิงก์: เก็บ `product_url` ที่ actor บอกว่าถาวร (Douyin `detailUrl`, XHS `url`, 1688 `detailUrl`, Temu `productUrl`) · ค่าที่ actor สะท้อน input กลับมาไม่ใช่ข้อมูล
- รูป: ยืม `lib/media/store.ts` ทั้งไฟล์ — ดาวน์โหลดทันทีหลัง ingest (XHS หมดอายุเร็ว) · ลอง 3 ครั้ง · sha1 เป็นชื่อไฟล์ · ขนาดสูงสุด 8 MB · `readMedia` ดึงใหม่เมื่อไฟล์หาย (XHS จะดึงใหม่ไม่ได้ถ้า URL หมดอายุ → ต้องบอกผู้ใช้ว่ารูปหาย ไม่ใช่โชว์กล่องว่างเงียบ ๆ)
- เซิร์ฟเวอร์ nineplus ไม่มี IPv6 ออกเน็ต → ถ้ารันเครื่องเดียวกันต้องตั้ง `NODE_OPTIONS=--no-network-family-autoselection --dns-result-order=ipv4first` ใน unit (Ads Plus เจอแล้วกับ CDN ของ Meta)

---

## 12. Design — ยืม OMNIX Design System ของ Ads Plus

> ฉบับเต็ม (token ทั้งชุด · คอมโพเนนต์ · แพตเทิร์น · กติกา RWD/a11y · เทสต์บังคับ · แมปหน้าของระบบใหม่) อยู่ที่ [design-system.md](design-system.md) — หัวข้อนี้เป็นสรุปย่อ

คัดลอกบล็อก token จาก `app/globals.css` ของ Ads Plus ไปทั้งก้อน (ห้าม hex ใน component · สีจากข้อมูลส่งผ่าน `style={{"--c": …}}`):

```
:root  --omnix-bg #f5f6f8 · --omnix-surface #ffffff · --omnix-surface-2 #eef1f5 · --omnix-border #dfe3e9 · --omnix-border-strong #8a919d (ขอบของสิ่งที่กดได้ 3:1)
       --omnix-on-accent #ffffff · --omnix-fg #131820 · --omnix-fg-muted #5b6472 · --omnix-accent #4f46e5 · --omnix-accent-soft #e8e8fb
       success #047857/#d1fae5 · warning #b45309/#fef3c7 · danger #b91c1c/#fee2e2 · info #1d4ed8/#dbeafe
dark   bg #0d1117 · surface #161b22 · surface-2 #1d242e · border #2b323d · border-strong #626e80 · on-accent #131820 (ขาวบนม่วงอ่อนได้แค่ 2.98:1)
       fg #e7ebf1 · fg-muted #98a2b1 · accent #8b8bf0 · accent-soft #23244a · success #34d399/#064e3b · warning #fbbf24/#451a03 · danger #f87171/#450a0a · info #60a5fa/#172554
text   12/14/16/18/24px · space 4/8/12/16/20/24/32 · radius 8/12/16/full · sidebar 240px · control-h 36px
font   Inter → IBM Plex Sans Thai → Noto Sans Thai → "Noto Sans SC" (จีน) → system-ui
dark mode: คลาส .dark หรือ data-theme บน <html> + prefers-color-scheme ที่ :root:not([data-theme="light"])
```

คลาส `.ox-*` ที่มีให้: `ox-app ox-topbar ox-shell ox-sidebar ox-nav-item ox-main__inner ox-page-head ox-tabs ox-grid-cards ox-stack ox-row ox-prose ox-card ox-card__body ox-section-title ox-badge(--accent|--success|--warning|--danger|--info) ox-chip ox-btn(--primary|--secondary|--ghost|--danger|--sm|--icon) ox-field ox-label ox-control ox-help ox-alert ox-modal ox-empty ox-table-wrap`
คอมโพเนนต์ใน `components/ui.tsx`: `Card CardFoot SectionTitle Badge Dot Button Chip Field TextInput TextArea Select Toggle Checkbox Modal EmptyState Alert ComboBox Dropdown` · ตารางทุกตัวต้องอยู่ใน `<TableScroll>` · ปุ่มงานเบื้องหลัง = `JobButton` (poll 5 วิ, แถบ 3 แบบ) · `ProgressBar` แบบไม่ระบุค่าห้ามส่ง `aria-valuenow`

กติกา RWD: breakpoint 640/768/1024/1280 เท่านั้น (max-width = breakpoint − 1) · จอเล็กสุด 320 · กริดหลายคอลัมน์ต้องอยู่หลัง breakpoint · ทุกอย่างที่แตะได้ ≥ 44px · โฟกัส outline 2px accent · contrast AA · เมนูล่างมือถือไม่เกิน 5 ช่อง

i18n: dictionary เดียว 3 ภาษา (`th en zh`) + เทสต์ที่แดงเมื่อคีย์ขาดภาษา (`i18n/dictionary.test.ts`) · locale จาก cookie `…_lang` · วันที่แสดงเขตเวลา Asia/Bangkok — ระบบใหม่ควรมี **zh เป็นภาษาหลักที่สอง** เพราะข้อมูลดิบเป็นจีน

หน้าที่ควรมี (เทียบ Ads Plus): **Overview** (สรุปรอบล่าสุด + คำเตือน + งบ) · **Products** (การ์ด/ตาราง กรองใน URL: platform, category, trend, keyword, sort by sold/rank/price) · **Product detail** (snapshot chart, salesTrend, events, ลิงก์ออก) · **Categories** (เลนต่อหมวด: จำนวน, ยอดรวม, trend) · **Trends** (rising/falling) · **Actor Evaluation** (ตาราง `actor_evaluations`) · **Settings: Keywords/Taxonomy** · **Settings: System** (คีย์ + ทดสอบ)

---

## 13. ลำดับสร้าง (ทีละขั้น มี DoD · ห้ามข้าม)

| ขั้น | ทำอะไร | Definition of Done |
|---|---|---|
| 0 | **ถามผู้ใช้** ก่อนลงมือ: (1) repo/โฟลเดอร์/พอร์ต/ชื่อฐานข้อมูลใหม่ (2) `APIFY_TOKEN` (บัญชีเดียวกับ Ads Plus ไหม — งบจะรวมกัน) (3) แพลน Apify (4) ยืนยันคีย์เวอร์ด §6.8 (5) ให้ cookie XHS ไหม (6) เพดานงบเริ่มต้น | ได้คำตอบครบ บันทึกใน `.agents/active.md` ของ repo ใหม่ |
| 1 | โครง: Next.js 16 + Drizzle + PGlite dev · schema §8 · settings catalog · mock adapter ที่สร้างสินค้าจำลองเปลี่ยนตามวัน · typecheck/test/lint ผ่าน · CI | `npm run seed && npm run dev` เห็น Products จาก mock · เทสต์ domain ≥ 20 เคส |
| 2 | Apify adapter + normalizer 4 ตัว + gate + diff + snapshot + budget guard + concurrency + reconcile + webhook | เทสต์ normalizer จาก fixture (ยังเป็น fixture จาก README — ป้ายกำกับว่ายังไม่ยืนยัน) |
| 3 | **Actor evaluation** ในโค้ด: ดึง store/acts/builds → คำนวณ cost per result ตาม tier จริง → เขียน `actor_evaluations` → หน้า Actor Evaluation | ผู้ใช้เปิดดูตารางแล้วเห็นเหตุผลว่าเลือกตัวไหน |
| 4 | **สโมกเทสต์ของจริง 5 ผล × 4 แพลตฟอร์ม** (ถามผู้ใช้ก่อน · งบ ≈ $0.20) → เก็บแถวดิบเป็น fixture จริง → แก้ normalizer ให้ `itemsOut = itemsIn` → บันทึก `cost_usd` จริง | ประวัติการดำเนินการโชว์ 4 run สำเร็จ อ่านได้ครบ ค่าใช้จ่ายจริงตรงกับที่คำนวณ ±20% (ถ้าไม่ตรง หยุดแล้วหาสาเหตุ) |
| 5 | รัน 50 ผล × 4 (ถามก่อน · ≈ $1.11) → จัดหมวดชั้น 1–2 → cache รูป → หน้า Products/Categories | สินค้า ≤ 200 ชิ้น หมวดครบ (unclassified ≤ 20%) รูปครบ ≥ 95% ลิงก์เปิดได้ |
| 6 | Snapshot รอบที่ 2 (ห่างอย่างน้อย 3 วัน) → trend + change_events + หน้า Trends | trend_label ไม่ใช่ `insufficient_history` ทั้งหมด · เทสต์ pure function ของ trend |
| 7 | LLM ชั้น 3 (API key หรือ Claude Code CLI แบบ Ads Plus) เฉพาะที่กฎตัดสินไม่ได้ | unclassified ลดลง · prompt สำเนาเดียว |
| 8 | Deploy: systemd user unit ของตัวเอง พอร์ตใหม่ vhost ใหม่ timer รายสัปดาห์ · `APP_PASSWORD` ตั้งก่อนเปิด DNS · `CRON_SECRET` · `SETTINGS_SECRET` | เช้าวันถัดไปเปิดหน้า Overview เห็นรอบใหม่โดยไม่มี run `suspect` |

ก่อนบอกว่า "เสร็จ" ทุกขั้น: `npm run typecheck · npm test · npm run lint` ผ่าน และรายงานตามที่เกิดจริง

---

## 14. คำถามที่ต้องให้ผู้ใช้ตอบ (อย่าเดา)

1. ระบบใหม่อยู่ที่ไหน — เครื่อง nineplus เดียวกัน (พอร์ต/ฐาน/role/โฟลเดอร์ใหม่) หรือที่อื่น
2. ใช้บัญชี Apify เดียวกับ Ads Plus ไหม (งบรวมกัน · concurrent 5 งานรวมกัน — ต้องเผื่อ Ads Plus ที่ยิงตอน 05:00)
3. แพลน Apify ปัจจุบัน (ตัดสิน tier ราคา)
4. คีย์เวิร์ดชุดแรกและจำนวนคีย์เวิร์ดต่อแพลตฟอร์ม (แต่ละคีย์เวิร์ด = +50 ผล = +เงิน)
5. ยินดีให้ cookie ล็อกอิน Xiaohongshu ไหม (ได้หมวดจากแพลตฟอร์ม แต่เป็นความเสี่ยงต่อบัญชี)
6. ความถี่: รายสัปดาห์ (แนะนำ) หรือรายวัน
7. ภาษาหลักของ UI: ไทย + จีน + อังกฤษ เหมือน Ads Plus ไหม
8. ต้องการอีเมลสรุป (Resend) ไหม

---

## ภาคผนวก A — ไฟล์ของ Ads Plus ที่ควรเปิดอ่านต้นฉบับ (อ่านอย่างเดียว ห้ามแก้)

| เรื่อง | ไฟล์ |
|---|---|
| หลักการทั้งหมด + กติกาถาวร | `.agents/AGENTS.md` · `README.md` · `docs/02-build-plan.md` · `.agents/db-structure.md` |
| adapter / input template / normalizer / fixture | `lib/sources/*.ts` · `lib/domain/normalize.ts` · `test/fixtures/meta-curious-coder-row.json` · `test/apify-input.test.ts` |
| gate / diff / longevity / notes / budget / concurrency | `lib/domain/gate.ts` `diff.ts` `longevity.ts` `notes.ts` `budget.ts` `source-scope.ts` `types.ts` |
| orchestrator / ingest / reconcile / webhook / cron | `lib/jobs/sync.ts` `daily.ts` `pipeline.ts` · `app/api/sync/*` `app/api/cron/daily/route.ts` |
| settings + ทดสอบการเชื่อมต่อ + เข้ารหัส | `lib/settings/catalog.ts` `index.ts` `resolve.ts` `crypto.ts` `test.ts` · `app/settings/system/*` |
| งานเบื้องหลัง + ความคืบหน้า 3 แบบ | `lib/jobs/cli-job.ts` · `lib/queries/jobs.ts` · `lib/domain/count-progress.ts` `pipeline.ts` `job-progress.ts` · `components/JobButton.tsx` `ProgressBar.tsx` |
| ติดแท็กด้วยกฎ → LLM | `lib/domain/angle-rules.ts` `taxonomy.ts` · `lib/jobs/angle-rules.ts` `angle-tag.ts` · `scripts/angle-tag-cron.sh` `tag-export.ts` `tag-import.ts` |
| รูป | `lib/media/store.ts` · `app/api/media/[id]/route.ts` |
| auth | `lib/auth.ts` · `proxy.ts` · `app/api/auth/route.ts` · `lib/api.ts` |
| UI / design / RWD / i18n | `app/globals.css` · `components/ui.tsx` · `components/shell/Shell.tsx` · `lib/domain/rwd-audit.ts` · `test/rwd-audit.test.ts` `contrast.test.ts` · `i18n/*` |
| deploy | `deploy/README.md` · `deploy/user/*.service` `*.timer` · `.github/workflows/ci.yml` |
| ค่าจากแพลตฟอร์มภายนอกเก็บอย่างไร | `config/tiktok-industries.json` (`_source`, `_fetchedAt`) · `lib/domain/tiktok-industry.ts` |

## ภาคผนวก B — ไฟล์ดิบที่ใช้ทำตาราง §6 (อยู่นอก repo, scratchpad ของ session นี้ — อาจถูกลบ ให้ดึงใหม่ตาม §6.2)

`store-{xiaohongshu,rednote,1688,temu,douyin}.json` · `acts/<owner>~<name>.act.json` · `acts/<owner>~<name>.build.json` · `acts-summary.txt`
