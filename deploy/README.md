# Deploy — Product Plus

คู่มือลง deploy แบบครบขั้นตอน สำหรับคนที่ไม่ได้เขียนโค้ดตัวนี้

> **สถานะ: ยังไม่เคย deploy** ตัวเลขค่าใช้จ่ายทุกตัวในเอกสารนี้**วัดจากการรันจริงบนเครื่อง dev
> เมื่อ 24 ก.ย. 2026** ไม่ใช่การประมาณ

---

## 0. ภาพรวมสิ่งที่จะ deploy

```text
                 ┌──────────────────────────────┐
  เบราว์เซอร์  ──▶│  web  (Next.js)  โดเมนสาธารณะ │
                 │   /api/* ──rewrite──┐        │
                 └─────────────────────┼────────┘
                                       ▼
                 ┌──────────────────────────────┐
                 │  api  (NestJS)  ไม่ต้องมีโดเมน │
                 │   · scheduler ในโปรเซส        │
                 │   · เรียก Apify (เสียเงิน)     │
                 │   · เรียก Claude (เสียเงิน)    │
                 └─────────────────┬────────────┘
                                   ▼
                 ┌──────────────────────────────┐
                 │  PostgreSQL 18               │
                 │   database  omnix_marketing  │
                 │   └ schema  product_plus     │
                 └──────────────────────────────┘
```

**สามอย่างจาก repo เดียว** — `web` เป็นตัวเดียวที่ต้องมีโดเมนสาธารณะ เบราว์เซอร์คุยกับ api ผ่าน
rewrite `/api/*` ของ web เท่านั้น api ไม่ต้องเปิดออกอินเทอร์เน็ต

**ต้องมี:** Node ≥ 22 · pnpm 10.34.5 (ระบุไว้ใน `packageManager`) · PostgreSQL 18

---

## 1. ตัดสินใจก่อนเริ่ม — สี่ข้อ

ทั้งสี่ข้อนี้เปลี่ยนทีหลังได้ แต่ข้อ 2 กับ 3 ถ้าพลาดคือ**เสียเงินจริง**

| # | ตัดสินใจ | ทางเลือก |
|---|---|---|
| 1 | โฮสต์ที่ไหน | Railway (มีตัวอย่างคำสั่งในเอกสารนี้) · VPS ของตัวเอง · อื่น ๆ |
| 2 | **เพดานค่าใช้จ่ายต่อรอบ** | ค่าเริ่มต้น `$1.00` แต่รอบจริง 4 แพลตฟอร์ม = **$1.46** → ดู §6 |
| 3 | งาน AI ใช้ backend ไหน | `sdk` (ต้องมี API key) · `cli` (ต้องมี `claude` ล็อกอินค้างบนเครื่อง) → ดู §7 |
| 4 | เริ่มด้วยข้อมูลอะไร | `seed` ข้อมูลจริง 24 ก.ย. (ฟรี) · ย้ายจาก dev · เริ่มเปล่า |

### ความลับที่ต้องสร้างไว้ก่อน

```bash
# รันสามครั้ง เก็บค่าที่ได้ไว้ใช้ในขั้นตอนถัดไป
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

| ตัวแปร | ใช้ทำอะไร | ถ้าไม่ตั้ง |
|---|---|---|
| `APP_PASSWORD` | รหัสผ่านเข้าเว็บ | 🔴 **API เปิดโล่ง ใครก็เรียกได้ รวมถึงปุ่มที่เสียเงิน** |
| `SETTINGS_SECRET` | เข้ารหัสความลับที่บันทึกผ่านหน้าเว็บ | 🔴 **`APIFY_TOKEN` ถูกเก็บเป็น plaintext ในฐานข้อมูล** |
| `CRON_SECRET` | ยืนยันตัวตนของ timer ภายนอก | endpoint `/api/cron/*` ปฏิเสธทุกคำขอ (fail closed — ปลอดภัย) |

> ⚠️ **`SETTINGS_SECRET` เปลี่ยนทีหลังแล้วมีผล** — ความลับที่บันทึกไว้ด้วยคีย์เก่าจะอ่านไม่ออก
> และกลายเป็น "ยังไม่ได้ตั้งค่า" เงียบ ๆ ต้องไปใส่ใหม่ทุกตัว

---

## 2. PostgreSQL

สร้าง PostgreSQL **18** (ให้ตรงกับที่ dev ใช้) แล้วเอา connection string มาใส่เป็น `DATABASE_URL`

api จะ**สร้าง schema `product_plus` และตารางทั้งหมดเองตอนบูตครั้งแรก** ไม่ต้องรัน migration มือ

```bash
DATABASE_URL=postgres://<user>:<pass>@<host>:5432/omnix_marketing
```

**ทำไมเป็น database เดียว schema เดียว:** หนึ่ง database ต่อหนึ่งสายธุรกิจ หนึ่ง schema ต่อหนึ่งแอป
บริการอื่นของ NinePlus จึงมาอยู่บนเซิร์ฟเวอร์เดียวกันได้โดยไม่ชนกัน

ถ้าอยากตั้งชื่อ database อื่น เปลี่ยนที่ `DATABASE_URL` ได้เลย — **ชื่อ schema `product_plus` ฮาร์ดโค้ด**
อยู่ใน [`apps/api/src/db/schema.ts`](../apps/api/src/db/schema.ts) ถ้าจะเปลี่ยนต้อง generate migration ใหม่

### รูปภาพเก็บในฐานข้อมูล — ต้องรู้ก่อนเลือกแพ็กเกจ

รูปสินค้าเก็บเป็น `bytea` ในตาราง `media` **ไม่ใช่ object storage**

| วัดจริงบน dev | ค่า |
|---|---|
| รูป 294 ใบ | **42 MB** (เฉลี่ย 145 KB/ใบ) |
| ข้อมูลอื่นทั้งหมด | 4.7 MB |

`storage_key` เป็น sha1 ของไบต์จึง dedupe ให้อยู่แล้ว แต่ถ้าติดตามครบ 1,400 สินค้า (7 คีย์เวิร์ด ×
4 แพลตฟอร์ม × 50 ผล) จะอยู่ราว **200 MB** และ backup จะ copy ทั้งหมดทุกครั้ง เลือกแพ็กเกจเผื่อไว้

---

## 3. Service `api`

| setting | value |
|---|---|
| build | `pnpm install --frozen-lockfile && pnpm --filter @pp/api build` |
| start | `pnpm --filter @pp/api start` |
| port | ฟัง `$PORT` (ไม่ตั้ง = 4010) |
| **replicas** | 🔴 **1 เท่านั้น** |

> 🔴 **ห้ามเกิน 1 replica** — scheduler รันอยู่ในโปรเซส สอง replica = สองรอบ = **จ่ายเงินสองเท่า**
> ถ้าจำเป็นต้อง scale ให้ปิด scheduler ในโปรเซสแล้วใช้ `/api/cron/tick` จาก timer ภายนอกแทน (§8)

### ตัวแปรที่ต้องมี

```bash
DATABASE_URL=postgres://…/omnix_marketing
APP_PASSWORD=<ที่สร้างไว้ใน §1>
SETTINGS_SECRET=<ที่สร้างไว้ใน §1>
CRON_SECRET=<ที่สร้างไว้ใน §1>
NODE_ENV=production
```

Railway ใช้ตัวแปรอ้างอิงได้: `DATABASE_URL=${{Postgres.DATABASE_URL}}`

### ตัวแปรที่ใส่ทีหลังได้

| ตัวแปร | ผลถ้าไม่ใส่ |
|---|---|
| `APIFY_TOKEN` | ดึงข้อมูลจริงไม่ได้ · ปุ่มสโมกเทสต์ปิด · **ใส่ผ่านหน้า ตั้งค่า › ระบบ ก็ได้** |
| `ANTHROPIC_API_KEY` | งาน AI ต้องใช้ backend `cli` แทน (§7) |
| `AI_BACKEND` | เลือกเองเป็น `sdk` เมื่อมี key, `cli` เมื่อไม่มี |
| `CLAUDE_CLI_PATH` | ค่าเริ่มต้น `claude` (ใช้เมื่อ `AI_BACKEND=cli`) |
| `PUBLIC_URL` + `APIFY_WEBHOOK_SECRET` | ไม่มี webhook — รอบที่รันจะจบด้วยการ poll แทน ช้ากว่าแต่ทำงานได้ |
| `DB_AUTO_MIGRATE` | ค่าเริ่มต้น `true` ตั้ง `false` เมื่อต้องการคุม migration เอง |

---

## 4. Service `web`

| setting | value |
|---|---|
| build | `pnpm install --frozen-lockfile && pnpm --filter @pp/web build` |
| start | `pnpm --filter @pp/web start` (ฟัง `$PORT`) |
| โดเมน | **ตัวนี้ตัวเดียวที่ต้องมีโดเมนสาธารณะ** |

```bash
API_URL=http://<api host>:<api port>
APP_PASSWORD=<ค่าเดียวกับ api>
```

Railway: `API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}`

> ⚠️ **`API_URL` ต้องมีตั้งแต่ตอน build** — Next อบ rewrite `/api/*` ลงใน build
> ([`next.config.ts`](../apps/web/next.config.ts)) ตั้งให้ครบก่อน deploy ครั้งแรก
> ถ้าไม่ตั้ง มันจะ fallback เป็น `http://localhost:4010` แล้วหน้าเว็บจะขึ้น "ติดต่อเซิร์ฟเวอร์ข้อมูลไม่ได้"

> ⚠️ **`APP_PASSWORD` ต้องเป็นค่าเดียวกันทั้งสอง service** — คุกกี้เป็น HMAC ที่ใช้รหัสผ่านเป็นคีย์
> ถ้าไม่ตรงกัน ล็อกอินได้แต่ทุกคำขอไป api จะถูกปฏิเสธ 401

> ⚠️ **คำขอหนึ่งครั้งอาจรอได้นานถึง 150 วินาที** — การบันทึกคีย์เวิร์ดและปุ่มเสนอคีย์เวิร์ดรอ AI ตอบ
> (วัดจริง 14–92 วิ) rewrite `/api/*` ของ web จึงตั้ง `proxyTimeout` ไว้ 180 วิ
> ([`next.config.ts`](../apps/web/next.config.ts)) และงาน AI ฝั่ง api หยุดตัวเองที่ 150 วิ
> **ทุกชั้นที่อยู่หน้า web** (load balancer, reverse proxy, nginx, Cloudflare) ต้องยอมให้ request
> ค้างได้ **อย่างน้อย 180 วิ** ถ้าตัดเร็วกว่า เว็บจะขึ้น "เซิร์ฟเวอร์ตอบกลับผิดพลาด" ทั้งที่ api ยังบันทึกต่อจนเสร็จ
> — nginx: `proxy_read_timeout 180s;` · Cloudflare แผนฟรีตัดที่ 100 วิ แก้ไม่ได้

---

## 5. บูตครั้งแรกและใส่ข้อมูล

### 5.1 ตรวจว่าขึ้นแล้วจริง

```bash
curl -s https://<โดเมน web>/api/health
# {"ok":true,"db":true,"sourceMode":"mock"}
```

`db: true` แปลว่าต่อฐานข้อมูลติดและ migration รันแล้ว ·
`sourceMode: "mock"` เป็นเรื่องปกติตอนยังไม่มี `APIFY_TOKEN`

ตรวจว่า schema ถูกสร้างจริง — ต้องเห็น 10 ตาราง:

```bash
psql "$DATABASE_URL" -c "\dt product_plus.*"
```

### 5.2 ใส่ข้อมูลเริ่มต้น (ฟรี ไม่เรียก Apify)

```bash
pnpm --filter @pp/api seed
# Railway: railway run pnpm --filter @pp/api seed
```

สร้างสองกลุ่ม:

- **`apple-watch-bands`** — ข้อมูลจริงจาก Apify วันที่ 24 ก.ย. 2026 ที่เก็บไว้ใน `apps/api/data/real/`
  **seed ไม่เรียก Apify จึงไม่เสียเงิน**
- **`demo-mock`** — ข้อมูลจำลอง 3 รอบย้อนหลัง ไว้ดูหน้าตาเทรนด์ มีป้าย "ข้อมูลจำลอง" ทุกหน้า

### 5.3 ประเมิน actor (ฟรี ใช้ Apify public API ไม่ต้องมี token)

```bash
pnpm --filter @pp/api evaluate
```

ไม่รันขั้นนี้ หน้า **ประเมิน Actor** จะว่างและระบบไม่รู้ว่าจะใช้ actor ตัวไหน

---

## 6. 🔴 ด่านเงิน — ทำให้ครบก่อนใส่ `APIFY_TOKEN`

**ตราบใดที่ยังไม่ใส่ `APIFY_TOKEN` ระบบใช้เงิน Apify ไม่ได้เลย** ใช้ช่วงนี้ตั้งด่านให้ครบ

### 6.1 สามชั้นที่ควรมี

| ชั้น | ตั้งที่ไหน | ทำอะไร |
|---|---|---|
| 1 | Apify Console → Billing → monthly spending limit | ตาข่ายสุดท้าย แอปข้ามไม่ได้ |
| 2 | ตั้งค่า › กลุ่มสินค้า → **งบต่อเดือน** (ค่าเริ่มต้น $10) | รอบใหม่ถูกปฏิเสธเมื่อใช้เกินงบเดือนนั้น |
| 3 | ตั้งค่า › กลุ่มสินค้า → **เพดานต่อรอบ** (ค่าเริ่มต้น $1.00) | actor แต่ละตัวได้ `maxTotalChargeUsd` ตามส่วนแบ่ง |

### 6.2 ตัวเลขจริงที่ต้องตัดสินใจ

วัดจาก actor ที่ระบบเลือกไว้ ที่ 50 ผลต่อแพลตฟอร์ม:

| แพลตฟอร์ม | actor | ค่าใช้จ่าย |
|---|---|---|
| 1688 | `zen-studio/1688-wholesale-scraper` | $0.2549 |
| douyin | `zen-studio/douyin-product-search-scraper` | $0.4050 |
| temu | `crw/temu-products-scraper` | $0.5000 |
| xhs | `zen-studio/rednote-product-search-scraper` | $0.3000 |
| | **รวมต่อคีย์เวิร์ดต่อรอบ** | **$1.4599** |

🔴 **$1.46 > เพดานเริ่มต้น $1.00 → รอบแรกจะถูกกั้น** เลือกอย่างใดอย่างหนึ่งก่อนใส่ token:

- ขยับเพดานต่อรอบเป็น **$1.60** (เผื่อ 10%)
- ลด **จำนวนผลต่อรอบ** จาก 50 ลง
- **ตัดแพลตฟอร์มออก** — Temu แพงสุด ($0.50) และมีสินค้าแค่ 5 ชิ้นในข้อมูลปัจจุบัน

> **คูณด้วยจำนวนคีย์เวิร์ดด้วย** — $1.46 คือ **ต่อคีย์เวิร์ดหนึ่งคำ** คีย์เวิร์ดทุกคำค้นทุกแพลตฟอร์มที่เปิดไว้
> ทุกรอบ หน้า ตั้งค่า › คีย์เวิร์ดและหมวดหมู่ แสดงยอดนี้ให้แล้วใต้กล่องคีย์เวิร์ด
> ("N คีย์เวิร์ด ≈ $X ต่อรอบ · เพดาน $Y" พร้อมคำเตือนเมื่อเกินเพดาน คำนวณจาก `GET /api/groups/:slug/round-estimate`)
> ดูตัวเลขนี้ของทุกกลุ่มก่อนคำนวณงบรายเดือน กลุ่มที่เกินเพดาน**จะไม่รันตามตารางเลย**

### 6.3 กฎที่ระบบบังคับอยู่แล้ว

- 50 ผลต่อแพลตฟอร์มต่อคีย์เวิร์ดต่อรอบ เป็นเพดานแข็งในโค้ด
- pipeline ที่กำลังรันอยู่ ห้ามมีเกินหนึ่งต่อกลุ่ม (บังคับด้วย partial unique index ในฐานข้อมูล)
- กลุ่มหนึ่งรันตามตารางได้**วันละครั้ง** (รายสัปดาห์คือทุก 6 วัน)

---

## 7. งาน AI — ห้างาน สอง backend

ระบบเรียก Claude ห้าที่ ทุกที่เกิดจากคนกด **ไม่มีอันไหนรันตามตารางเวลา** แต่การบันทึกคีย์เวิร์ด
เรียก AI ให้เอง เมื่อมีบรรทัดที่ยังไม่มีคำจีน/อังกฤษ หรือเป็นภาษาผิด

| งาน | เกิดตอน | โมเดล | ค่าใช้จ่ายจริงที่วัดได้ |
|---|---|---|---|
| แปลชื่อสินค้าเป็นไทย | กดปุ่มที่หน้าสินค้า | `claude-haiku-4-5` | **$0.3479** ต่อ 135 ชื่อ (1 นาที 58 วิ) |
| จัดหมวดสินค้า (ชั้นที่ 3) | กดปุ่มที่หน้าสินค้า | `claude-haiku-4-5` | **$0.0397** ต่อ 135 สินค้า (18 วิ) |
| เสนอสินค้าน่าทำแบรนด์ | กดปุ่มที่หน้า สินค้าน่าทำแบรนด์ | `claude-sonnet-5` | **$0.4575** ต่อรอบ |
| แปลคีย์เวิร์ดเป็นคำจีน + อังกฤษ | **กดบันทึก**ที่ ตั้งค่า › คีย์เวิร์ดและหมวดหมู่ (อัตโนมัติ เฉพาะบรรทัดที่ขาดคำ) | `claude-haiku-4-5` | **$0.028** ต่อ 12 บรรทัด (21.5 วิ) — ทุกบรรทัดในการเรียกครั้งเดียว |
| เสนอคีย์เวิร์ดจากชื่อสินค้า | กดขอคำแนะนำใต้กล่องคีย์เวิร์ด | `claude-haiku-4-5` | **$0.009–0.066** ต่อครั้ง (14–92 วิ ขึ้นกับ cache ของ `cli`) |

> สองงานคีย์เวิร์ดให้เบราว์เซอร์รอคำตอบ จึงหยุดตัวเองที่ 150 วิ — ดูเรื่อง timeout ของ proxy ใน §4
> ค่าใช้จ่ายของ `cli` เป็นตัวเลขเทียบเท่า API ถ้าล็อกอินด้วยบัญชี claude.ai จะนับเป็นโควตาแพ็กเกจ ไม่ใช่บิล

> งาน brand scout ใช้โมเดลแรงกว่าโดยตั้งใจ — เป็น 1 call ต่อรอบ และเป็นงานตัดสินใจ + เขียนให้คนอ่าน
> ตอนทดสอบด้วย Haiku มันให้ระดับความเหมาะสมเป็น "สูง" ทั้ง 6 ตัว ทั้งที่ skill สั่งให้ระบุว่าข้อมูลไม่พอ
> ส่วน Sonnet ทำตามกฎถูกต้อง เปลี่ยนกลับได้ที่ `BRAND_MODEL` ใน
> [`apps/api/src/jobs/llm.ts`](../apps/api/src/jobs/llm.ts)

### 7.1 เลือก backend ด้วย `AI_BACKEND`

| ค่า | ต้องมี | หมายเหตุ |
|---|---|---|
| `sdk` | `ANTHROPIC_API_KEY` | เรียก api.anthropic.com ตรง ๆ ไม่มี overhead **เหมาะกับ Railway / คอนเทนเนอร์** |
| `cli` | `claude` ที่ล็อกอินค้างบนเครื่อง | ไม่ต้องมีคีย์ **ต้องมี home directory ถาวร → ใช้กับ VPS เท่านั้น** |

ไม่ตั้ง = เลือกเองเป็น `sdk` เมื่อมี key, `cli` เมื่อไม่มี

### 7.2 🔴 ถ้าใช้ `cli` — สามเรื่องที่พลาดบ่อย

**(ก) ต้องล็อกอินด้วย OS user ตัวเดียวกับที่รัน api**

credential อยู่ใน `~/.claude` ของ user นั้น และ systemd unit มักรันด้วย user อื่นที่ `HOME` ต่างกัน

```bash
# รันในฐานะ user ที่จะรัน api (เช่น deploy) ไม่ใช่ root
curl -fsSL https://claude.ai/install.sh | bash
claude                                                        # ล็อกอินครั้งเดียว
echo 'say ok' | claude -p --output-format json --allowed-tools ""   # ต้องได้ JSON ไม่ใช่หน้าให้ล็อกอิน
claude auth status                                            # authMethod "claude.ai" = ใช้แพ็กเกจ ไม่ใช่ API key
```

ถ้า binary ไม่อยู่ใน `PATH` ของ service ให้ตั้ง `CLAUDE_CLI_PATH=/home/deploy/.local/bin/claude`
(รับเฉพาะชื่อคำสั่งล้วนหรือ absolute path — อะไรที่เชลล์ตีความได้จะถูกปฏิเสธ)

**(ข) ต้อง deploy `claude-plugin/` ไปด้วย**

โฟลเดอร์นี้อยู่**ข้าง ๆ** `dist/` ไม่ใช่ข้างใน เพราะ `tsc` ไม่ copy ไฟล์ `.md`
deploy ทั้ง repo แล้ว build บนเครื่อง (ตามคำสั่งใน §3) จะได้ไปด้วยอัตโนมัติ
แต่ถ้าอัปโหลดแค่ `apps/api/dist` จะหาย

```bash
# ตรวจบนเซิร์ฟเวอร์ — ต้องเห็นห้าไฟล์
ls apps/api/claude-plugin/skills/*/SKILL.md
```

api ตรวจก่อนทุกครั้งที่เรียก AI และปฏิเสธด้วย `errors.*.noSkill` แทนที่จะพังกลางทาง

**(ค) 🔴 อย่าติดตั้ง skill อื่นในบัญชี claude ของเซิร์ฟเวอร์**

`--plugin-dir` **เพิ่ม** ปลั๊กอินของเราเข้าไป **ไม่ได้แทนที่**ของที่บัญชีนั้นมีอยู่
ทดสอบแล้วบนเครื่อง dev: โมเดลมองเห็น skill ส่วนตัวของผู้ใช้ทั้งชุด
ผลคือ **dev กับ prod ให้ผลไม่เหมือนกัน** และ skill ที่ไม่เกี่ยวถูกโหลดทุก invocation = จ่ายโทเคนเพิ่มทุกครั้ง

(`--bare` แยกได้จริงแต่บังคับใช้ `ANTHROPIC_API_KEY` ซึ่งขัดกับเหตุผลที่เลือก `cli` ตั้งแต่แรก)

### 7.3 กฎการทำงานอยู่ใน skill ไม่ได้อยู่ในโค้ด

```text
apps/api/claude-plugin/skills/
├── translate-listing-titles/SKILL.md   ตารางคำศัพท์จีน→ไทย + รูปแบบ JSON
├── categorize-listings/SKILL.md        คำวัสดุจีน + กฎ "ไม่มี key ให้ตอบ unclassified"
├── brand-candidates/SKILL.md           กฎห้ามเทียบยอดขายข้ามแพลตฟอร์ม + ขอบเขตคำแนะนำ
├── translate-keyword/SKILL.md          คีย์เวิร์ด → คำจีนตัวย่อ (Douyin · 1688 · XHS) + คำอังกฤษ (Temu)
└── suggest-keywords/SKILL.md           ชื่อสินค้า → คีย์เวิร์ดทั้งบรรทัด (ไทย | จีน | อังกฤษ)
```

backend `cli` โหลดเป็น skill ส่วน `sdk` อ่านไฟล์เดียวกันเป็น system prompt
**แก้ไฟล์ = เปลี่ยนพฤติกรรมทั้งสอง backend โดยไม่ต้องแก้ TypeScript**

---

## 8. ตารางเวลาดึงข้อมูล

แต่ละกลุ่มตั้ง **วันและชั่วโมง** ของตัวเองได้ที่ ตั้งค่า › กลุ่มสินค้า (เวลาไทย Asia/Bangkok)
ตั้งได้เป็นชั่วโมงเต็มเท่านั้น เพราะตัวจับเวลาเดินทุกต้นชั่วโมง

| พฤติกรรม | รายละเอียด |
|---|---|
| tick | ทุกต้นชั่วโมง เริ่มเฉพาะกลุ่มที่ชั่วโมงตรงกับที่ตั้งไว้ |
| กันรันซ้ำ | รายวัน = วันละครั้งตามวันไทย · รายสัปดาห์ = ทุก 6 วัน |
| โปรเซสดับตอนถึงเวลา | **ข้ามรอบนั้น ไม่ไล่ตามทีหลัง** — ยิง actor ที่เสียเงินในชั่วโมงที่ไม่ได้เลือกแย่กว่า |
| ย้ายวันของรายสัปดาห์ไปก่อนหน้า | **ข้ามหนึ่งรอบ** (จันทร์ → อาทิตย์ จะเว้น 13 วัน) เป็นการแลกเพื่อกันจ่ายซ้ำในสัปดาห์เดียว |

### Timer ภายนอก (ถ้าต้องการ)

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<โดเมน web>/api/cron/tick
```

เรียก**ทุกชั่วโมง** ทำงานเหมือน tick ในโปรเซสเป๊ะ

`/api/cron/daily` และ `/api/cron/weekly` **ไม่สนใจชั่วโมงที่ตั้งไว้** สั่งรันทั้ง schedule ทันที
เก็บไว้ใช้กู้สถานการณ์ด้วยมือ **อย่าเอาไปผูกกับ timer**

---

## 9. รายการตรวจหลัง deploy

ไล่ทีละข้อ ทุกข้อควรผ่านก่อนใส่ `APIFY_TOKEN`

```bash
# 1. api มีชีวิตและต่อฐานข้อมูลได้
curl -s https://<web>/api/health          # {"ok":true,"db":true,…}

# 2. ตารางครบ 10
psql "$DATABASE_URL" -c "\dt product_plus.*"

# 3. ต้องล็อกอินก่อนถึงเรียกได้ (ถ้าได้ 200 แปลว่า APP_PASSWORD ไม่ได้ตั้ง)
curl -s -o /dev/null -w "%{http_code}\n" https://<web>/api/groups    # ต้องเป็น 401

# 4. cron ปฏิเสธคำขอที่ไม่มี secret
curl -s -o /dev/null -w "%{http_code}\n" https://<web>/api/cron/tick # ต้องเป็น 401

# 5. skill ครบห้าตัว (เฉพาะเมื่อใช้ AI_BACKEND=cli)
ls apps/api/claude-plugin/skills/*/SKILL.md
```

แล้วเปิดเว็บตรวจด้วยตา:

- [ ] ล็อกอินด้วย `APP_PASSWORD` ได้
- [ ] **ภาพรวม** เห็น KPI และงบประมาณ
- [ ] **สินค้า** เห็นสินค้าและรูปขึ้น (รูปเสิร์ฟจากฐานข้อมูลผ่าน `/api/media/<id>`)
- [ ] **ประเมิน Actor** ไม่ว่าง (ถ้าว่าง = ยังไม่ได้รัน `pnpm evaluate`)
- [ ] ตั้งค่า › ระบบ — `SETTINGS_SECRET` ขึ้นว่า **ตั้งจาก env แล้ว**
- [ ] ตั้งค่า › กลุ่มสินค้า — เพดานต่อรอบตรงกับที่ตัดสินใจใน §6
- [ ] แถบข้างขึ้นป้าย **"ดึงใหม่ไม่ได้"** ถ้ายังไม่ใส่ `APIFY_TOKEN` (ถูกต้องแล้ว)

---

## 10. งานดูแลประจำ

### สำรองข้อมูล

```bash
pg_dump "$DATABASE_URL" --schema=product_plus -Fc -f backup-$(date +%F).dump
```

กู้คืน:

```bash
pg_restore -d "$DATABASE_URL" --clean --if-exists backup-2026-09-24.dump
```

> รูปภาพอยู่ในฐานข้อมูล dump จึงมีขนาดเท่ากับข้อมูลทั้งหมด (~46 MB ตอนนี้)

### อัปเกรดเวอร์ชัน

```bash
git pull && pnpm install --frozen-lockfile
pnpm --filter @pp/api build && pnpm --filter @pp/web build
# restart ทั้งสอง service — migration ใหม่รันเองตอน api บูต
```

### ตั้งเรตเงินบาท

หน้ารายละเอียดสินค้าแสดงราคาเป็นบาทได้เมื่อตั้ง `FX_CNY_THB` ที่ **ตั้งค่า › ระบบ**
เป็น**เรตที่กรอกเอง ไม่อัปเดตอัตโนมัติ** ระบบแสดงวันที่ตั้งไว้ข้างตัวเลขเสมอเพื่อไม่ให้เข้าใจผิดว่าเป็นเรตสด
ต้องกลับมาอัปเดตเอง

---

## 11. เรื่องที่จะกัดคุณ — อ่านก่อนเจอเอง

| อาการ | สาเหตุจริง |
|---|---|
| เว็บขึ้น "ติดต่อเซิร์ฟเวอร์ข้อมูลไม่ได้" | `API_URL` ไม่ได้ตั้งตอน **build** — Next อบ rewrite ลง build ต้อง build ใหม่ |
| ล็อกอินได้แต่ทุกหน้าขึ้น 401 | `APP_PASSWORD` ของ web กับ api ไม่ตรงกัน |
| ใครก็เปิดเว็บได้โดยไม่ต้องล็อกอิน | `APP_PASSWORD` ไม่ได้ตั้ง — โค้ดเปิดโล่งโดยตั้งใจเมื่อไม่มีค่า |
| `APIFY_TOKEN` ที่ใส่ไว้หายไปเอง | `SETTINGS_SECRET` เปลี่ยน — ของเก่าถอดรหัสไม่ออกจึงนับเป็น "ยังไม่ได้ตั้ง" |
| รอบแรกถูกปฏิเสธว่าเกินเพดาน | $1.46 × จำนวนคีย์เวิร์ด > เพดาน ดู §6.2 |
| กดบันทึกคีย์เวิร์ดแล้วขึ้น "เซิร์ฟเวอร์ตอบกลับผิดพลาด" แต่รีเฟรชแล้วบันทึกอยู่ | proxy หน้า web ตัด request ก่อน 180 วิ ดู §4 |
| ดึงข้อมูลสองรอบในวันเดียว จ่ายสองเท่า | มีมากกว่า 1 replica |
| ปุ่ม AI ขึ้นว่าไม่พบ skill | deploy แค่ `dist/` — `claude-plugin/` อยู่ข้างนอก ดู §7.2(ข) |
| แปลภาษาได้ผลต่างจากตอน dev | บัญชี claude บนเซิร์ฟเวอร์มี skill อื่นติดตั้งอยู่ ดู §7.2(ค) |
| กลุ่มรายสัปดาห์เงียบไป 13 วัน | ย้ายวันไปก่อนหน้า ดู §8 |

### 🔴 อย่าเปิดไฟล์ `.pglite` เก่าด้วย api ตัวใหม่

ไฟล์ `.pglite` จากยุคก่อนย้าย Postgres เก็บข้อมูลไว้ใน schema `scout` และ migration ชุดปัจจุบันมี
timestamp ใหม่กว่าที่ไฟล์นั้นเคยบันทึก พอบูตขึ้นมา drizzle จะสร้าง schema `product_plus` **เปล่า ๆ**
ทับลงไป แล้วแอปขึ้นสินค้า 0 ชิ้นทั้งที่ข้อมูลยังอยู่ครบใน `scout`

อยากอ่านของเก่าให้ใช้ `pnpm --filter @pp/api migrate-store --verify` ซึ่งเปิดแบบอ่านอย่างเดียว

---

## 12. CI

`deploy/ci.yml` เป็น GitHub Actions workflow ที่พร้อมใช้ (install → typecheck → test)
ยังไม่ได้อยู่ใน `.github/workflows/` เพราะโทเคนที่ push ตอนนั้นไม่มี scope `workflow`

```bash
gh auth refresh -s workflow
mkdir -p .github/workflows
git mv deploy/ci.yml .github/workflows/ci.yml
git commit -m "Add CI" && git push
```

---

## 13. ตารางตัวแปรทั้งหมด

| ตัวแปร | service | จำเป็น | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|---|---|
| `DATABASE_URL` | api | 🔴 | — | ไม่ตั้ง = ตกไปใช้ PGlite (dev เท่านั้น) |
| `APP_PASSWORD` | api + web | 🔴 | — | **ค่าเดียวกันทั้งสองฝั่ง** ไม่ตั้ง = เปิดโล่ง |
| `SETTINGS_SECRET` | api | 🔴 | — | ไม่ตั้ง = ความลับเก็บเป็น plaintext · เปลี่ยนแล้วของเก่าอ่านไม่ออก |
| `API_URL` | web | 🔴 | `http://localhost:4010` | **ต้องมีตั้งแต่ตอน build** |
| `NODE_ENV` | ทั้งคู่ | ✓ | — | `production` |
| `CRON_SECRET` | api | แนะนำ | — | ไม่ตั้ง = `/api/cron/*` ปฏิเสธทุกคำขอ |
| `PORT` | ทั้งคู่ | — | api 4010 | แพลตฟอร์มมักตั้งให้เอง |
| `APIFY_TOKEN` | api | — | — | ใส่ผ่านหน้าเว็บก็ได้ |
| `ANTHROPIC_API_KEY` | api | — | — | จำเป็นเมื่อ `AI_BACKEND=sdk` |
| `AI_BACKEND` | api | — | `sdk` ถ้ามี key ไม่งั้น `cli` | คุมทั้งห้างาน AI |
| `CLAUDE_CLI_PATH` | api | — | `claude` | ใช้เมื่อ `AI_BACKEND=cli` |
| `PUBLIC_URL` | api | — | — | คู่กับ `APIFY_WEBHOOK_SECRET` |
| `APIFY_WEBHOOK_SECRET` | api | — | — | ไม่มี = รอบจบด้วยการ poll |
| `DB_AUTO_MIGRATE` | api | — | `true` | `false` เมื่อคุม migration เอง |
| `PGLITE_DIR` | api | — | `<repo>/.pglite` | dev เท่านั้น |

## 14. เครื่อง nineplus (ที่ใช้จริงตอนนี้ — 2026-09-25)

| อะไร | ค่า |
|---|---|
| URL | http://product-plus.nineplus.co.th (DNS A → `119.10.140.196`) |
| OS user | `product` — ไม่มี sudo, ไม่อยู่ในกลุ่ม docker |
| Apache | vhost `product-plus.nineplus.co.th` (Virtualmin) `ProxyPass / http://localhost:3020/` · `Timeout 300` (≥ 180 วิ ✓) |
| web / api | `next start` :3020 · `node dist/main.js` :4010 — **api ไม่ได้ตั้ง `NODE_ENV=production`** เพราะ cookie จะเป็น `secure` แล้ว login ผ่าน http ไม่ได้ |
| DB | `apps/api/.env` → Postgres ที่ใช้ร่วมกับ Ads Plus, schema `product_plus` |
| AI | `AI_BACKEND=cli` · `~/.local/bin/claude` ล็อกอินด้วยบัญชี claude.ai (แพ็กเกจ ไม่ใช่ API key) |
| log | `~/logs/product-plus/{api,web}.log` |

อัปเดตโค้ดแล้วเปิดใหม่:

```bash
cd ~/product-plus && git pull && pnpm install && pnpm build
deploy/start-nineplus.sh        # ปิดตัวเก่าที่พอร์ต 4010/3020 แล้วเปิดใหม่ รอจน health ตอบ
```

ให้เปิดเองหลังรีบูต (ทำครั้งเดียว): `crontab -e` แล้วเพิ่ม

```
@reboot /home/product/product-plus/deploy/start-nineplus.sh >> /home/product/logs/product-plus/boot.log 2>&1
```

ยังค้าง: cert จริง (Let's Encrypt ผ่าน Virtualmin — ต้องใช้สิทธิ์ admin) → จากนั้นค่อยตั้ง `NODE_ENV=production`
และ `PUBLIC_URL=https://product-plus.nineplus.co.th` (webhook ของ Apify ส่ง secret ใน URL ห้ามใช้ผ่าน http)
