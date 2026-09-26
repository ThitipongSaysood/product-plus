# แผน: ระบบ login รายบุคคลสำหรับองค์กร (Product Plus)

## Context
ตอนนี้ทั้งทีมใช้รหัสผ่านเดียว (`APP_PASSWORD`) และเซิร์ฟเวอร์จริง**ยังไม่ได้ตั้งรหัสนั้น** จึงไม่มีใครต้อง login
ตรวจเมื่อ 2026-09-26: `GET https://product-plus.nineplus.co.th/api/settings` ได้ 200 โดยไม่ต้อง login
ทั้งที่ระบบมี `APIFY_TOKEN` (ดึงข้อมูลเสียเงินได้) และงาน AI ที่ใช้โควตา Max
ระบบยังไม่มีตาราง user และไม่มีบันทึกว่าใครกดอะไร
HTTPS ใช้ได้แล้ว: Let's Encrypt หมดอายุ 24 ธ.ค. 2026 และ http → 301 ไป https

ผู้ใช้ตัดสินแล้ว:
- login ด้วย**อีเมล + รหัสผ่าน** โดย admin เป็นคนสร้างบัญชีให้ในแอป
- แบ่งสิทธิ์ 3 ระดับ: **Admin / Editor / Viewer**
- **บันทึกประวัติว่าใครทำอะไร**
- Editor แก้คีย์เวิร์ดและรันงาน AI ได้ แต่**ห้าม**กดดึงข้อมูลเสียเงิน แก้งบหรือเพดาน ลบกลุ่ม หรือตั้งค่าระบบ

## ขั้น 0 — ปิดช่องโหว่วันนี้ (ผู้ใช้รันเอง ไม่ต้องแก้โค้ด)
ระบบ permission ไม่ยอมให้ agent เขียน secret ผู้ใช้ต้องรันคำสั่งนี้บนเซิร์ฟเวอร์ (มีอยู่ในข้อความก่อนหน้า)
- ใส่ `APP_PASSWORD` และ `CRON_SECRET` ใน `apps/api/.env`
- ใส่ `APP_PASSWORD` ใน `apps/web/.env.local`
- เพิ่ม `NODE_ENV=production` ใน `apps/api/.env` ได้แล้วตอนนี้ เพราะ HTTPS ใช้ได้แล้ว
- รัน `deploy/start-nineplus.sh`

ตรวจผล: `curl -o /dev/null -w '%{http_code}' https://product-plus.nineplus.co.th/api/settings` ต้องได้ `401`

## การออกแบบ

### ฐานข้อมูล (`apps/api/src/db/schema.ts` → migration `0002_*`)
- **`users`**
  - `email` (unique, lower-case), `name`, `role` (`admin|editor|viewer`, มี check constraint)
  - `password_hash` เป็น scrypt ของ `node:crypto` และเก็บพารามิเตอร์ไว้ในค่า hash ด้วย ไม่ต้องลง dependency ใหม่
  - `disabled`, `must_change_password`, `last_login_at`, `created_by`, `created_at`, `updated_at`
  - ไม่ลบ user จริง ใช้วิธีปิดบัญชีแทน เพื่อให้ประวัติยังชี้กลับไปหาคนได้
- **`sessions`**
  - `token_hash` คือ sha256 ของ token 32 byte ที่อยู่ใน cookie
  - `user_id`, `expires_at`, `last_seen_at`, `ip`, `user_agent`
  - หมดอายุเมื่อไม่ใช้งาน 7 วัน และอยู่ได้นานสุด 30 วัน
  - เลือกเก็บ session ฝั่งเซิร์ฟเวอร์แทน HMAC เพื่อให้ admin เพิกถอนได้ และเปลี่ยน role หรือปิดบัญชีแล้วมีผลทันที
- **`audit_log`**: `actor_id`, `actor_email` (เก็บสำเนาไว้), `action`, `target_type`, `target_id`, `detail` jsonb, `ip`, `at`
- **`scrape_runs.triggered_by`**: เพิ่มคอลัมน์ ค่า null หมายถึงรันตามตารางหรือจาก script
- แก้ `apps/api/drizzle.config.ts` จาก `schemaFilter: ["scout"]` เป็น `["product_plus"]`

### สร้าง admin คนแรก และเลิกใช้ `APP_PASSWORD`
- สร้าง CLI `apps/api/src/scripts/user.ts` มีคำสั่ง `create`, `reset` และ `list`
  - เรียกใช้ด้วย `pnpm --filter @pp/api user:create --email … --name … --role admin`
  - คำสั่งจะพิมพ์รหัสผ่านใช้ครั้งเดียวออกมาครั้งเดียว และบังคับให้เปลี่ยนรหัสตอน login ครั้งแรก
  - `reset` ใช้กู้คืนเมื่อ admin ถูกล็อกออก
- **ตอนสลับระบบ ให้ลบ `APP_PASSWORD` ทิ้งเลย ไม่เก็บไว้เป็นทางสำรอง** เพราะรหัสร่วมระบุตัวคนไม่ได้ ซึ่งขัดกับการบันทึกประวัติ
- ระบบบังคับ login เสมอ รวมถึงตอน dev
- แทน `bootError` ใน `domain/guards.ts` ด้วย `authWarnings`
  - ถ้ายังไม่มี admin ให้ log คำเตือนว่าต้องรัน `user:create` แต่ยัง boot ต่อได้
  - หน้า login แสดงข้อความแจ้งจาก `GET /api/auth` → `{setupNeeded}`

### API
- **ไฟล์ใหม่**
  - `common/password.ts`: scrypt (N=2^15, r=8, p=1, maxmem 64 MiB), timing-safe compare, `DUMMY_HASH`, นโยบายรหัสผ่านยาว 10–200 ตัว
  - `common/sessions.ts`: สร้าง, โหลด (join กับ user), ต่ออายุ และเพิกถอน session
  - `common/auth.ts`: decorator `@Roles`, `@Public`, `@Audit` และ `@CurrentUser`
    - ต้องสร้าง `new Reflector()` เองในไฟล์ เพราะ tsx ไม่สร้าง decorator metadata ให้ inject ผ่าน constructor
  - `common/audit.ts`: `writeAudit` และ `AuditInterceptor` ที่ลงทะเบียนเป็น `APP_INTERCEPTOR`
    - บันทึกเฉพาะเมื่อคำสั่งสำเร็จ ไม่เก็บรหัสผ่าน token หรือค่าของ secret
  - `modules/auth.controller.ts`: ย้าย login/logout ออกมาจาก `system.controller.ts` และเพิ่ม `/me`
  - `modules/users.controller.ts`: จัดการผู้ใช้ และ `GET /audit`
- **เขียน `AuthGuard` ใหม่** ใน `common/http.ts` (ยังเก็บ `safeEqual`, `cronAuthorized` และ `ErrorFilter` ไว้)
  - route public เดิมผ่านได้เหมือนเดิม
  - cookie ต้องมีรูปแบบถูกต้อง แล้ว `loadSession` ต้องเจอ session ที่ยังไม่หมดอายุและบัญชียังไม่ถูกปิด
  - ถ้าต้องเปลี่ยนรหัสผ่าน ให้เข้าได้เฉพาะ `/me`, `/me/password` และ logout
  - **ใช้หลักห้ามไว้ก่อน:** route ที่ไม่ได้ติด `@Roles` ถ้าเป็น GET ต้องเป็น viewer ขึ้นไป ถ้าเป็นคำสั่งเขียน ต้องเป็น editor ขึ้นไป
  - เมื่อสิทธิ์ไม่พอ ตอบ 403 และบันทึก `access.denied`
- **Endpoint ใหม่**
  - `GET/POST/DELETE /auth`
  - `GET /me` และ `POST /me/password` (เปลี่ยนรหัสแล้วเพิกถอน session อื่นของคนนั้น)
  - admin เท่านั้น:
    - `GET/POST/PATCH /users`
    - `POST /users/:id/reset-password` และ `DELETE /users/:id/sessions`
    - `GET /audit?before=&actor=&action=`
  - กันไม่ให้ลดสิทธิ์หรือปิด admin คนสุดท้าย และกันไม่ให้ปิดบัญชีตัวเอง
- **ตารางสิทธิ์** (GET ที่เหลือทั้งหมดเป็น viewer)

  | Admin เท่านั้น | Editor ขึ้นไป |
  |---|---|
  | `GET/PUT /settings`, `POST /settings/test` | keywords CRUD, `PUT keyword-list`, `keyword-suggestions` |
  | `POST /jobs/pipeline` (เสียเงิน Apify) | `POST /jobs/categorize`, `/jobs/translate`, `/jobs/brand` |
  | `POST /actors/smoke`, `PUT /actors/choose` | `POST /actors/evaluate` (ฟรี) |
  | `POST/PATCH/DELETE /groups` (งบ เพดาน ตาราง ลบ) | `PUT taxonomy`, `category-suggestions`, `PUT/DELETE /category-map`, `POST /category-map/auto` |

  `/cron/*`, `/webhooks/apify`, `/media/*` และ `/health` ยัง public เหมือนเดิม เพราะแต่ละอันมี secret ของตัวเอง
- **การใส่ `triggeredBy`**
  - `triggerPipeline()` (`jobs/pipeline.ts`) → `createRun` (`jobs/runs.ts`) และส่งต่อไปถึง run ย่อย (`jobs/scrape.ts`)
  - การเรียก `createRun` ใน `jobs.controller.ts`
  - `toRunRow` ส่งค่านี้ออกไปด้วย

### ความปลอดภัย
- **Rate limit** ใช้ `RateLimiter` และ `clientIp` เดิมจาก `domain/guards.ts` เช็กก่อนรัน scrypt
  - ต่อ IP 20 ครั้งต่อนาที
  - ต่อ IP+อีเมล 5 ครั้งต่อ 15 นาที
  - ต่ออีเมล 20 ครั้งต่อ 15 นาที
  - `POST /me/password` 5 ครั้งต่อ 15 นาที
- **กันเดาว่ามีอีเมลนี้ในระบบหรือไม่**
  - ใช้ error key เดียวคือ `errors.auth.invalid`
  - อีเมลที่ไม่มีในระบบก็ยังรัน `DUMMY_HASH` เพื่อให้เวลาตอบเท่ากัน
- **Cookie** ชื่อ `pp_session` ตั้ง `httpOnly`, `sameSite=lax` และ `secure` ตาม `COOKIE_SECURE` หรือถ้าไม่ตั้งให้ดูจาก `NODE_ENV=production`
  - กัน CSRF ด้วย `needsJson415` เดิม

### Web
- **`apps/web/proxy.ts`**
  - ลบ HMAC และ `APP_PASSWORD` ออก ฝั่ง web ไม่ต้องรู้ secret อะไรเลย
  - เช็กแค่ว่ามี cookie และรูปแบบถูก ถ้าไม่ผ่านให้ไป `/login?next=<path>`
  - เพิ่ม header `x-pp-path`
- **`lib/api.ts`**: ได้ 401 ให้ redirect ไป `/login?next=…` ได้ 403 `mustChangePassword` ให้ไป `/account/password`
- **`lib/client-api.ts` `send()`**: ได้ 401 ให้พาไปหน้า login
- **`lib/session.ts`**: `getMe` (ใช้ `cache`) และ `requireRole`
- **contracts**: `ROLE_RANK` และ `roleAtLeast` ใช้ร่วมกันทั้ง api และ web
- **Shell**
  - `app/(shell)/layout.tsx` ดึง `/me` เพิ่มใน `Promise.all` แล้วส่งเข้า `ShellData` (`useMe` และ `useCan`)
  - ทำ `components/shell/UserMenu.tsx` บน topbar ด้วย `Dropdown` ใน `ui.tsx` มีชื่อ, badge role, เปลี่ยนรหัสผ่าน, ผู้ใช้/ประวัติ (admin) และออกจากระบบ
- **Nav (`components/shell/nav.ts`)**
  - เพิ่ม `minRole`: หน้ากลุ่ม ระบบ ผู้ใช้ และประวัติ ต้องเป็น admin ส่วนคีย์เวิร์ดเป็น editor
  - `Sidebar.tsx` และ `BottomNav.tsx` กรองเมนูตามสิทธิ์
- **ปุ่มตามสิทธิ์** (เซิร์ฟเวอร์ยังตรวจซ้ำเสมอ)
  - ปุ่มดึงข้อมูลใน `Sidebar.tsx` และ smoke/choose ใน `ActorActions.tsx` แสดงเฉพาะ admin
  - ปุ่มงาน AI แสดงตั้งแต่ editor ขึ้นไป
  - Viewer เห็นฟอร์มแบบอ่านอย่างเดียว พร้อม `Alert` แจ้งว่าอ่านอย่างเดียว
- **หน้า**
  - `app/login/*`: อีเมล + รหัสผ่าน, `next` ที่ปลอดภัย (ต้องขึ้นต้นด้วย `/` และห้ามเป็น `//`), ข้อความแจ้งเมื่อยังไม่มี admin
  - `app/account/password`: เปลี่ยนรหัสผ่าน รวมถึงตอนถูกบังคับเปลี่ยน
  - `app/(shell)/settings/users` ใช้ `components/settings/UsersSettings.tsx`
    - ตารางใน `TableScroll`
    - เพิ่มผู้ใช้ผ่าน `Modal` แล้วแสดงรหัสผ่านใช้ครั้งเดียวครั้งเดียว
    - เปลี่ยน role, ปิดบัญชี, รีเซ็ตรหัส และเพิกถอน session
  - `app/(shell)/settings/audit`: ตัวกรองอยู่ใน URL ผ่าน `qs()`, ตารางใน `TableScroll`, ปุ่ม "เก่ากว่า"
  - ตารางรอบดึงข้อมูลเพิ่มคอลัมน์ "โดย"
- **i18n** (th/en/zh ครบ ถ้าขาด test จะ fail)
  - เพิ่ม `login.email`, `errors.auth.invalid`, `errors.auth.mustChangePassword`, `errors.auth.weakPassword`, `errors.auth.wrongCurrent`
  - เพิ่ม `errors.user.*`, `role.*`, `usermenu.*`, `account.password.*`, `users.*`, `audit.*`, `audit.action.<key>`, `nav.users`, `nav.audit`, `common.readOnlyRole`
  - ลบ `errors.auth.wrongPassword`
- **ลำดับ skill ตาม AGENTS.md**: `grill-with-docs` → `omnix-design-system` → `frontend-design` + `ui-ux-pro-max` → โค้ด → `web-design-guidelines`
  - ใช้ OMNIX tokens เท่านั้น ห้าม hex ใน component

### Contracts (`packages/contracts/src/index.ts`)
- เพิ่ม `Role`, `ROLES`, `roleAtLeast`, `Me`, `UserRow`, `CreatedUser`, `AuditRow`, `AuditPage`
- เพิ่ม `RunRow.triggeredBy`
- บันทึกการเปลี่ยนแปลงใน `docs/CONTRACT-CHANGES.md`

## ลำดับการทำ
เลข 1–5 คือขั้นที่ deploy ได้ทีละขั้น

1. **Schema:** รัน `grill-with-docs` → แก้ schema และ `schemaFilter` → `pnpm --filter @pp/api db:generate`
   - เปิดอ่าน `0002_*.sql` ต้องมีแค่ CREATE TABLE และ ADD COLUMN ใน `product_plus` ห้ามมี DROP
   - เขียน `password.ts` และ `sessions.ts` พร้อม test
2. **CLI:** เขียน `user.ts` พร้อม test แล้วสร้าง admin คนแรกบนเซิร์ฟเวอร์ (ผู้ใช้รันเอง เพราะรหัสผ่านจะแสดงบนจอ)
3. **สลับระบบ:** api กับ web ต้อง deploy พร้อมกัน เพราะรูปแบบ cookie เปลี่ยน
   - guard ใหม่, auth/me/users API, ตารางสิทธิ์, บันทึกประวัติ, `triggeredBy`
   - proxy, หน้า login, redirect เมื่อได้ 401, หน้าเปลี่ยนรหัส, UserMenu
   - แล้วลบ `APP_PASSWORD` ออกจาก `.env` ทั้งสองฝั่ง ทุกคนต้อง login ใหม่
4. **UI เพิ่มเติม:** เมนูและปุ่มตามสิทธิ์ → หน้าผู้ใช้ → หน้าประวัติ
5. **เอกสาร:**
   - `docs/SPEC.md`: ลบ "multi-user accounts" ออกจาก out of scope และเพิ่มหน้าใหม่ในรายการ
   - `docs/PLAN.md`: เขียนส่วน auth ใหม่
   - `deploy/README.md`: ลบ `APP_PASSWORD`, เพิ่ม `COOKIE_SECURE` และขั้นสร้าง admin คนแรก, หัวข้อ "ถูกล็อก" → `user:reset`, อัปเดต §14 ว่า HTTPS ใช้ได้แล้ว
   - `deploy/start-nineplus.sh`: แก้คอมเมนต์ที่บอกว่ายังไม่ตั้ง `NODE_ENV`
   - README ของ api และ web
   - `CONTEXT.md`: เพิ่มคำ Account, Role, Session, Audit log และ One-time password
   - `.agents/active.md` และ session note
6. **เพิ่มเติม:** ให้ API ฟังเฉพาะ `127.0.0.1` เพราะตอนนี้ `:4010` เปิดทุก interface (ต้องเช็กเพิ่มว่าจากภายนอกเข้าถึงได้จริงหรือไม่)

## Code เดิมที่นำกลับมาใช้
- `domain/guards.ts`: `RateLimiter`, `clientIp`, `needsJson415`, `isUniqueViolation`
- `common/http.ts`: `safeEqual`, `cronAuthorized`, `ZodPipe`, `ErrorFilter` (map 401/403/429 ไว้แล้ว)
- อื่นๆ: `AppError`, `createRun`, `getDb`/`closeDb`
- ฝั่ง web: `api()`, `send()`, `qs()`, `ApiErrorAlert`
- `ui.tsx`: `Card`, `Badge`, `Button`, `Field`, `TextInput`, `Select`, `Toggle`, `Alert`, `Modal`, `EmptyState`, `Dropdown`, `TableScroll`, `ConfirmSubmit`

## การตรวจสอบ
**Test (vitest)**
- `apps/api/test/auth.test.ts`
  - hash/verify และนโยบายรหัสผ่าน
  - วงจร session (ใช้ PGlite): หมดอายุ, ต่ออายุ, เพิกถอน, บัญชีถูกปิด
  - guard แบบ table-driven: {ไม่มี cookie, cookie ผิดรูปแบบ, viewer, editor, admin, ต้องเปลี่ยนรหัส} × {GET, คำสั่งเขียน, `@Roles("admin")`}
  - **test ครบตาราง:** reflect ทุก route ของทุก controller แล้วเทียบกับตารางสิทธิ์ ถ้ามี route ใหม่ที่ยังไม่จัดสิทธิ์ test จะ fail และคำสั่งเขียนทุกตัวต้องมี `@Audit`
  - rate limit, กันเดาอีเมล, ประวัติต้องไม่มี secret, admin คนสุดท้าย, CLI
- `guards.test.ts`: ลบ test ของ HMAC และ `bootError` แล้วเพิ่ม test ของ `authWarnings`
- web: `proxy.test.ts` และ `safeNext()`
- รันทั้งหมด: `pnpm -r typecheck && pnpm -r test`

**End-to-end (curl ที่ `localhost:4010/api`)**
1. ยังไม่ login: `/groups` ได้ 401 และอีเมลผิดได้ `errors.auth.invalid`
2. login ด้วยรหัสใช้ครั้งเดียว: ได้ 403 mustChange → เปลี่ยนรหัส → `/me` แสดง role admin
3. สร้าง viewer: viewer เรียก `POST /jobs/pipeline` และ `GET /settings` ต้องได้ 403
4. ปิดบัญชี viewer: viewer เรียก `/me` ต้องได้ 401
5. login ผิด 6 ครั้งติด: ครั้งที่ 6 ต้องได้ 429
6. `/audit` ต้องมีแถวครบ
7. cron ที่ใช้ Bearer token ยังได้ 200

**เบราว์เซอร์**
- เปิดลิงก์ลึกตอนยังไม่ login แล้วต้องไป login ก่อนแล้วกลับมาที่ลิงก์เดิม
- ถูกบังคับเปลี่ยนรหัสตอน login ครั้งแรก
- viewer ไม่เห็นปุ่มดึงข้อมูลและเมนูตั้งค่า, editor เห็นเฉพาะคีย์เวิร์ด
- ออกจากระบบได้
- เพิกถอน session จากอีกเครื่องแล้วเครื่องแรกถูกเด้งออก
- cookie เป็น `HttpOnly; Secure; SameSite=Lax`
- ครบ th/en/zh และธีมสว่าง/มืด แล้วปิดท้ายด้วย `web-design-guidelines`
