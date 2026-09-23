# Design System — OMNIX ฉบับที่ Ads Plus ใช้จริง (สำหรับยกไปสร้างระบบใหม่)

> เขียนเมื่อ 2026-09-23 จาก `app/globals.css` · `components/ui.tsx` · `components/icons.tsx` · `components/shell/*` · `components/charts/index.tsx`
> · `test/contrast.test.ts` · `test/rwd-audit.test.ts` · `i18n/*` ของ Ads Plus และ skill `omnix-design-system` (ต้นฉบับ OMNIX)
>
> **ต้นฉบับ** คือ OMNIX Design System (accent `#5b5bd6`) · เอกสารนี้คือ **ฉบับที่ผ่านการใช้จริงบน production แล้วแก้ให้ผ่าน WCAG AA และจอมือถือ**
> จุดที่ต่างจากต้นฉบับอยู่ใน §2 — ระบบใหม่ให้ยึด**ฉบับนี้** เพราะมีเทสต์บังคับอยู่แล้ว (§12)
>
> คู่กับ [04-handoff-china-marketplace-scout.md](04-handoff-china-marketplace-scout.md) §12 — ผู้อ่านคือ AI ตัวใหม่ **ห้ามแก้ไฟล์ใน repo ads-plus**

---

## 0. กติกาสั้น ๆ ที่ต้องท่องก่อนเขียน UI

1. **สีมาจาก token เท่านั้น ห้าม hex ใน component** — ยกเว้นสีที่มาจากข้อมูล (สีประจำแบรนด์/แพลตฟอร์ม) ส่งผ่าน `style={{"--c": hex}}`
2. **ลำดับชั้นมาจากความต่างของ `bg`/`surface`/`surface-2` และเส้นขอบ ไม่ใช่เงา** — การ์ดมีเส้นขอบ ไม่มีเงา (เงามีได้เฉพาะแผงลอย: dropdown, bottom sheet, more-menu)
3. **ทุกข้อความที่ผู้ใช้เห็นผ่าน `t()` ครบ 3 ภาษา** (`th en zh`) มีเทสต์ที่แดงเมื่อคีย์ขาดภาษา
4. **ไอคอน = Boxicons outline ฝังเป็น SVG จากสคริปต์** ห้าม icon font ห้ามอีโมจิเป็นไอคอน UI · ปุ่มไอคอนล้วนต้องมี `aria-label`
5. **สถานะต้องมีข้อความกำกับ ไม่สื่อด้วยสีอย่างเดียว** (แถบงบ, เดลต้า, ป้าย trend)
6. **ห้ามลบวงแหวนโฟกัสโดยไม่มีตัวแทน** — `:focus-visible` เป็นกฎ global
7. **ห้ามเรียก `localStorage` ตรง** — ผ่าน `lib/storage.ts` (try/catch ครอบทุกครั้ง, prefix ชื่อแอป)
8. **ตัวกรองทั้งหมดอยู่ใน URL** ไม่มี client state ที่ต้อง sync
9. **ตารางทุกตัวอยู่ใน `<TableScroll>`** ห้ามเขียนคลาส `ox-table-wrap` เอง
10. **แถบความคืบหน้าที่ประมาณค่าไม่ได้ต้องส่ง `pct = null`** (แถบวิ่ง ไม่มี `aria-valuenow`) ห้ามโชว์ 0%
11. **ค่าที่ยังไม่มีแสดง `—`** ไม่แสดง `0` · ตัวเลขที่เทียบกันในคอลัมน์ใส่ `.ox-num`
12. **ห้ามติดตั้ง UI library อื่น** (shadcn/MUI/Bootstrap) — มี `components/ui.tsx` แล้ว

---

## 1. Token ทั้งชุด (คัดลอกไปวางใน `app/globals.css` ได้ทันที)

Tailwind 4: token ประกาศเป็น CSS variable แล้วแมปเข้า `@theme inline` → ได้คลาส `bg-bg bg-surface bg-surface-2 border-edge text-fg text-muted text-accent bg-accent bg-accent-soft` และ `text-success-fg` ฯลฯ

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

@theme inline {
  --color-bg: var(--omnix-bg);
  --color-surface: var(--omnix-surface);
  --color-surface-2: var(--omnix-surface-2);
  --color-edge: var(--omnix-border);
  --color-fg: var(--omnix-fg);
  --color-muted: var(--omnix-fg-muted);
  --color-accent: var(--omnix-accent);
  --color-accent-soft: var(--omnix-accent-soft);
  --color-success-fg: var(--omnix-success-fg);
  --color-success-bg: var(--omnix-success-bg);
  --color-warning-fg: var(--omnix-warning-fg);
  --color-warning-bg: var(--omnix-warning-bg);
  --color-danger-fg: var(--omnix-danger-fg);
  --color-danger-bg: var(--omnix-danger-bg);
  --color-info-fg: var(--omnix-info-fg);
  --color-info-bg: var(--omnix-info-bg);
  --color-chart-1: var(--omnix-chart-1);
  --color-chart-2: var(--omnix-chart-2);
  --color-chart-3: var(--omnix-chart-3);
  --color-chart-4: var(--omnix-chart-4);
  --color-chart-5: var(--omnix-chart-5);
  --color-chart-other: var(--omnix-chart-other);
  --font-sans: var(--omnix-font);
}

:root {
  --omnix-bg: #f5f6f8;
  --omnix-surface: #ffffff;
  --omnix-surface-2: #eef1f5;
  --omnix-border: #dfe3e9;
  /* เส้นขอบของสิ่งที่กดได้ต้องเห็นชัด 3:1 ตาม WCAG 1.4.11 — เส้นคั่นเฉย ๆ ใช้ --omnix-border */
  --omnix-border-strong: #8a919d;
  /* ตัวหนังสือบนพื้นสีเน้น — โหมดมืดต้องใช้สีเข้ม ขาวบนม่วงอ่อนได้แค่ 2.98:1 */
  --omnix-on-accent: #ffffff;
  --omnix-fg: #131820;
  --omnix-fg-muted: #5b6472;
  --omnix-accent: #4f46e5;
  --omnix-accent-soft: #e8e8fb;

  --omnix-success-fg: #047857;
  --omnix-success-bg: #d1fae5;
  --omnix-warning-fg: #b45309;
  --omnix-warning-bg: #fef3c7;
  --omnix-danger-fg: #b91c1c;
  --omnix-danger-bg: #fee2e2;
  --omnix-info-fg: #1d4ed8;
  --omnix-info-bg: #dbeafe;

  --omnix-font: var(--font-inter), var(--font-plex-thai), var(--font-noto-thai), "Noto Sans SC", system-ui, sans-serif;
  --omnix-text-xs: 12px;
  --omnix-text-sm: 14px;
  --omnix-text-base: 16px;
  --omnix-text-lg: 18px;
  --omnix-text-xl: 20px;      /* ★ เพิ่มใหม่ — Ads Plus อ้างถึงแต่ลืมประกาศ (ดู §2.2) */
  --omnix-text-2xl: 24px;

  --omnix-space-1: 4px;
  --omnix-space-2: 8px;
  --omnix-space-3: 12px;
  --omnix-space-4: 16px;
  --omnix-space-5: 20px;
  --omnix-space-6: 24px;
  --omnix-space-8: 32px;

  --omnix-radius-md: 6px;     /* ★ เพิ่มใหม่ — ใช้กับ thumb เล็ก/แถบในเซลล์ (ดู §2.2) */
  --omnix-radius-lg: 8px;
  --omnix-radius-xl: 12px;
  --omnix-radius-2xl: 16px;
  --omnix-radius-full: 9999px;

  --omnix-shadow-lg: 0 -8px 24px rgb(0 0 0 / .12);   /* ★ เพิ่มใหม่ — ใช้เฉพาะแผงลอย */

  --omnix-sidebar-w: 240px;
  --omnix-control-h: 36px;

  /* series ในกราฟ — ลำดับตายตัว ห้ามสลับ ห้ามเลือกสีเอง (ผ่านการตรวจตาบอดสีแล้ว) */
  --omnix-chart-1: #5b5bd6;
  --omnix-chart-2: #0e9f8f;
  --omnix-chart-3: #d97706;
  --omnix-chart-4: #db2777;
  --omnix-chart-5: #2563eb;
  --omnix-chart-other: #94a3b8;
  --omnix-chart-grid: #e6e9ee;
  --omnix-chart-axis: #5b6472;

  color-scheme: light;
}

/* โหมดมืด: ตามระบบ (เมื่อไม่ได้บังคับ light) และแบบบังคับด้วย data-theme / .dark — ค่าชุดเดียวกันทั้งสองบล็อก */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]):not(.light) {
    --omnix-bg: #0d1117; --omnix-surface: #161b22; --omnix-surface-2: #1d242e;
    --omnix-border: #2b323d; --omnix-border-strong: #626e80; --omnix-on-accent: #131820;
    --omnix-fg: #e7ebf1; --omnix-fg-muted: #98a2b1;
    --omnix-accent: #8b8bf0; --omnix-accent-soft: #23244a;
    --omnix-success-fg: #34d399; --omnix-success-bg: #064e3b;
    --omnix-warning-fg: #fbbf24; --omnix-warning-bg: #451a03;
    --omnix-danger-fg: #f87171; --omnix-danger-bg: #450a0a;
    --omnix-info-fg: #60a5fa; --omnix-info-bg: #172554;
    --omnix-chart-1: #7c7ce8; --omnix-chart-2: #0d9488; --omnix-chart-3: #d97706;
    --omnix-chart-4: #ec4899; --omnix-chart-5: #3b82f6; --omnix-chart-other: #64748b;
    --omnix-chart-grid: #232a35; --omnix-chart-axis: #98a2b1;
    color-scheme: dark;
  }
}
:root[data-theme="dark"], :root.dark {
  --omnix-bg: #0d1117; --omnix-surface: #161b22; --omnix-surface-2: #1d242e;
  --omnix-border: #2b323d; --omnix-border-strong: #626e80; --omnix-on-accent: #131820;
  --omnix-fg: #e7ebf1; --omnix-fg-muted: #98a2b1;
  --omnix-accent: #8b8bf0; --omnix-accent-soft: #23244a;
  --omnix-success-fg: #34d399; --omnix-success-bg: #064e3b;
  --omnix-warning-fg: #fbbf24; --omnix-warning-bg: #451a03;
  --omnix-danger-fg: #f87171; --omnix-danger-bg: #450a0a;
  --omnix-info-fg: #60a5fa; --omnix-info-bg: #172554;
  --omnix-chart-1: #7c7ce8; --omnix-chart-2: #0d9488; --omnix-chart-3: #d97706;
  --omnix-chart-4: #ec4899; --omnix-chart-5: #3b82f6; --omnix-chart-other: #64748b;
  --omnix-chart-grid: #232a35; --omnix-chart-axis: #98a2b1;
  color-scheme: dark;
}
```

ฟอนต์ประกาศใน `app/layout.tsx` ด้วย `next/font/google`:
`Inter({variable:"--font-inter"})` · `IBM_Plex_Sans_Thai({variable:"--font-plex-thai", weight:["400","500","600"]})` · `Noto_Sans_Thai({variable:"--font-noto-thai"})` แล้วใส่ตัวแปรทั้งสามบน `<html className>` — ภาษาจีนพึ่ง `"Noto Sans SC"` ของระบบ (ระบบใหม่ที่ข้อมูลเป็นจีนควรเพิ่ม `Noto_Sans_SC` ผ่าน next/font ด้วย)

### 1.1 ตารางความหมายของ token

| token | ใช้กับ | ห้ามใช้กับ |
|---|---|---|
| `--omnix-bg` | พื้นหลังหน้า | พื้นการ์ด |
| `--omnix-surface` | การ์ด แถบบน เมนูข้าง ตาราง tooltip | |
| `--omnix-surface-2` | พื้นซ้อน: หัวตาราง ไทล์ไอคอน hover ของแถว thumb ที่ยังไม่มีรูป | |
| `--omnix-border` | **เส้นคั่นตกแต่ง** ขอบการ์ด เส้นระหว่างแถว | ขอบของสิ่งที่กดได้ |
| `--omnix-border-strong` | **ขอบของสิ่งที่กดได้**: ช่องกรอก ปุ่มรอง ชิป (3:1) | เส้นคั่น (จะกลายเป็นตารางเส้นดำทั้งหน้า) |
| `--omnix-fg` / `--omnix-fg-muted` | ข้อความหลัก / ป้าย-ข้อความรอง | |
| `--omnix-accent` / `--omnix-accent-soft` | สิ่งที่เลือกอยู่ ลิงก์ ปุ่มหลัก / พื้นอ่อนของสิ่งที่เลือก | series ในกราฟ (ใช้ `chart-1` แทน) |
| `--omnix-on-accent` | ตัวหนังสือบนพื้น accent (ปุ่มหลัก ไทล์ 90 วัน) | ห้ามฝัง `#fff` |
| `success/warning/danger/info` คู่ `-fg`/`-bg` | **สถานะเท่านั้น** ป้าย alert เดลต้า แถบงบ | series ในกราฟ |
| `--omnix-chart-1..5`, `-other`, `-grid`, `-axis` | กราฟ แถบสัดส่วนในเซลล์ แถบด้านซ้ายของ event card | |

---

## 2. จุดที่ Ads Plus ต่างจาก OMNIX ต้นฉบับ (และระบบใหม่ต้องเอาฉบับนี้)

### 2.1 แก้เพื่อผ่าน WCAG AA (มีเทสต์บังคับ `test/contrast.test.ts`)

| เรื่อง | ต้นฉบับ OMNIX | Ads Plus | ทำไม |
|---|---|---|---|
| accent (สว่าง) | `#5b5bd6` | `#4f46e5` | ให้ accent บน surface และบน accent-soft ≥ 4.5:1 |
| semantic fg (สว่าง) | success `#059669` warning `#d97706` danger `#dc2626` info `#2563eb` | `#047857` `#b45309` `#b91c1c` `#1d4ed8` | ตัวหนังสือบนพื้น `-bg` ต้อง ≥ 4.5:1 |
| ขอบของสิ่งที่กดได้ | `--omnix-border` (#dfe3e9 ≈ 1.3:1) | เพิ่ม `--omnix-border-strong` `#8a919d` / มืด `#626e80` และบังคับใช้กับ `.ox-control .ox-btn--secondary .ox-chip` | WCAG 1.4.11 ต้อง 3:1 |
| ตัวหนังสือบนปุ่มหลัก | `color: #fff` ฝังตายตัว | `--omnix-on-accent` (สว่างขาว / มืด `#131820`) | โหมดมืดขาวบนม่วงอ่อนได้แค่ 2.98:1 |
| chart tokens | อยู่ในบล็อกแยกท้ายไฟล์ | เหมือนกัน (ค่าเดียวกันทุกตัว) | |

คู่สีที่เทสต์บังคับ ≥ 4.5:1 ทั้งสองโหมด: fg/surface · fg/bg · fg/surface-2 · fg-muted/surface · fg-muted/bg · fg-muted/surface-2 · accent/surface · accent/accent-soft · success · warning · danger · info (fg บน bg) · on-accent/accent — และ border-strong/surface ≥ 3:1

### 2.2 รูโหว่ใน Ads Plus ที่ระบบใหม่ต้องอุด (ตรวจแล้ว 2026-09-23 ด้วย grep)

| token | สถานะใน Ads Plus | ผล | ทำอย่างไรในระบบใหม่ |
|---|---|---|---|
| `--omnix-text-xl` | ใช้ 1 ที่ (`.ox-page-title` บนจอแคบ) แต่**ไม่ได้ประกาศ** | ค่าตกเป็น invalid → หัวหน้าบนมือถือใช้ font-size ที่สืบทอดมา | ประกาศ `20px` (ใส่ไว้ใน §1 แล้ว) |
| `--omnix-radius-md` | ใช้ 3 ที่ (thumb ใน link card / lane, แถบใน flow table) ไม่ได้ประกาศ | มุมไม่โค้ง | ประกาศ `6px` |
| `--omnix-shadow-lg` | ใช้ 1 ที่ พร้อม fallback | ไม่พัง | ประกาศไว้ให้ชัด |

### 2.3 เพิ่มจากต้นฉบับ (เพราะของจริงบังคับ)

- โหมดมืดต้องประกาศ**สองบล็อก**: `prefers-color-scheme` (เมื่อไม่ได้บังคับ light) และ `:root[data-theme="dark"], :root.dark` (เมื่อผู้ใช้กดสลับ) — เทสต์อ่านบล็อก `data-theme="dark"` เป็นตัวแทน
- `.ox-prose` ปรับให้ตัวหนังสือไทยอ่านได้: `font-size 16px · line-height 1.7 · max-width 68ch · text-wrap: pretty` + กันเนื้อหายาวดันหน้า (`overflow-wrap: anywhere`, ตาราง markdown เลื่อนในตัวเอง)
- เมนูข้าง sticky ตามความสูงจอบนเดสก์ท็อป · แถบเมนูล่างบนมือถือ (§4.2)
- ขนาดของสิ่งที่ต้องแตะบนจอแคบขยายเป็น 44px (§10)

---

## 3. ตัวอักษร ระยะ มุมโค้ง

| ชั้น | ค่า | คลาส |
|---|---|---|
| หัวข้อหน้า | 24px / 600 (มือถือ 20px) | `.ox-page-title` |
| หัวข้อส่วน | 18px / 600 | `.ox-h2` · `.ox-prose h2` |
| หัวการ์ด/หัวส่วนย่อย | 16px / 600 | `.ox-section-title h2` · `.ox-prose h3` |
| เนื้อหาปกติ | 14px / 400 · line-height 1.5 | `body` |
| เนื้อหาที่ต้องอ่านยาว (บทวิเคราะห์) | 16px · line-height 1.7 · ≤ 68ch | `.ox-prose` |
| ป้าย/meta | 12px | `.ox-xs` · `.ox-label` · `.ox-help` · `.ox-badge` |
| ป้ายหมวด | 12px / 500 / uppercase / tracking .04em / muted | `.ox-label-caps` |
| ตัวเลขเทียบกัน | tabular-nums | `.ox-num` · `td.is-num` |
| ตัวเลขใหญ่ในไทล์ | 28px / 600 / tracking −.02em (มือถือ 22px) | `.ap-longevity__n` |
| ขั้นต่ำ | **12px** (เทสต์บังคับ · ยกเว้นป้ายแถบล่าง 11px) | |

ระยะ: 4 / 8 / 12 / 16 / 20 / 24 / 32 — ช่องว่างระหว่างส่วนในหน้า `--omnix-space-5` (20px) · ใน card body `space-4` · ระหว่างไอเท็ม `space-3` · ห้ามใส่ค่านอกสเกล
มุมโค้ง: `lg` 8px ค่าเริ่มต้นของการ์ด/ปุ่ม/ช่องกรอก · `xl` 12px modal/ไทล์ไอคอน · `2xl` 16px · `full` ชิป/ป้าย/ปุ่มกลม · `md` 6px thumb เล็ก/แถบ · `space-1` (4px) thumb ในการ์ด event
ความสูงควบคุม: `--omnix-control-h` 36px (มือถือ 44px) · ปุ่มเล็ก 30px (มือถือ 36) · ชิป 28px (มือถือ 36) · แถบบน 52px · เมนูข้าง 240px · เนื้อหากว้างสุด 1200px

---

## 4. โครงหน้า (shell)

### 4.1 เดสก์ท็อป

```
.ox-app
├ header.ox-topbar (52px · sticky top:0 · z 40)      ← ox-brand + spacer + LangSwitch + ThemeToggle
└ .ox-shell
  ├ aside.ox-sidebar (240px · sticky top:52px · height calc(100vh − 52px) · overflow-y auto · align-self flex-start)
  │   GroupSwitcher (ตัวเลือกขอบเขตข้อมูล เช่น กลุ่มสินค้า)
  │   .ox-nav-list (display: contents) → .ox-label-caps.ox-nav-group__label + a.ox-nav-item(.is-active, aria-current="page")
  │   PipelineStatus (แถบความคืบหน้างานเบื้องหลัง)
  │   BudgetMeter variant="mini" (margin-top:auto → ดันก้อนล่างลงล่างสุด)
  │   SyncStatus (ดึงข้อมูลล่าสุด + ปุ่มดึง)
  └ main.ox-main > .ox-main__inner (padding 20 · max-width 1200 · flex-col gap 20)
      .ox-page-head > h1.ox-page-title (+ .ox-muted sub) + .ox-page-head__actions
      … เนื้อหา …
BottomNav (มือถือเท่านั้น)
```

- เมนูแบ่งเป็นหมวด (เฝ้าดู / วิเคราะห์ / ตั้งค่า) ป้ายหมวดใช้ `.ox-label-caps`
- ลิงก์ในเมนูพก `?pg=<slug>` (ขอบเขตปัจจุบัน) ไปด้วยทุกลิงก์ · active = `pathname === base || startsWith(base + "/")`
- แถบข้างเป็น **server component** ที่อ่านสถานะจาก DB มาใส่เป็นค่าเริ่มต้นให้ client component (`initial=`) เพื่อให้ขึ้นตั้งแต่เฟรมแรก ไม่ต้องรอ poll
- `.ox-main` ต้อง `min-width: 0` ไม่งั้นตารางกว้างจะดันเมนู

### 4.2 มือถือ (≤ 767px)

- `.ox-shell` เป็นคอลัมน์ · `.ox-sidebar` เป็นแถวห่อบรรทัด (**ห้าม `overflow-x: auto`** — จะตัด dropdown ในนั้นจนกดไม่ได้) ซ่อนป้ายหมวดและ `.ox-nav-list`
- เมนูย้ายไป **`.ap-bottomnav`** (fixed bottom · grid คอลัมน์เท่ากัน · สูง 56px + `env(safe-area-inset-bottom)`) ไม่เกิน 5 ช่อง = 4 หน้าที่เปิดบ่อยสุด + ปุ่ม "เพิ่มเติม" ที่เปิด `.ap-bottomnav__sheet` (เลื่อนขึ้นจากแถบล่าง 2 คอลัมน์ + scrim) · ป้ายบนแถบล่างใช้ **ชุดคำสั้น** แยกจากเมนูข้าง (`nav.short.*`)
- สถานะเปิดแผงเก็บเป็น "เปิดไว้ตอนอยู่หน้าไหน" (`openedAt === pathname`) เปลี่ยนหน้าแล้วปิดเองไม่ต้องใช้ effect
- `.ox-main { padding-bottom: 56px + safe-area }` กันเนื้อหาโดนแถบล่างทับ
- `.ox-page-head__actions { width: 100% }` ปุ่มบนหัวหน้าเรียงเต็มกว้าง

---

## 5. คลาส `.ox-*` และคอมโพเนนต์ใน `components/ui.tsx` (client)

| งาน | คลาส | คอมโพเนนต์ | กติกา |
|---|---|---|---|
| การ์ด | `.ox-card > .ox-card__body (+ __foot margin-top:auto)` · `.ox-grid-cards` 1/2/3 คอลัมน์ที่ 640/1280 | `Card({body?})` `CardFoot` | foot ปักท้ายให้ปุ่มของทุกการ์ดตรงกัน |
| หัวส่วน | `.ox-section-title > h2 (+ .ox-xs.ox-muted) + action` | `SectionTitle({title, sub, action})` | |
| ป้าย | `.ox-badge` + `--accent/--success/--warning/--danger/--info` · สีจากข้อมูล `style="--c:#hex"` → พื้น `color-mix(--c 15%)` ตัวอักษร `--c` | `Badge({tone, color})` | ป้ายสถานะต้องมีคำ ไม่ใช่สีล้วน |
| จุดสถานะ | `.ox-dot(--success/--warning/--danger)` | `Dot` | `aria-hidden` เสมอ ต้องมีข้อความข้าง ๆ |
| ชิป (ตัวกรอง/toggle) | `.ox-chip(.is-active)` 28px ขอบ border-strong | `Chip({active})` → `aria-pressed` | |
| ปุ่ม | `.ox-btn` + `--primary --secondary --ghost --danger` · `--sm --icon --round --block` · `:disabled opacity .5` | `Button({variant="secondary", size, icon, block})` `type="button"` เป็นค่าเริ่มต้น | หน้าหนึ่งมีปุ่ม primary เดียว · ใช้กริยาบอกผล ("ดึงข้อมูล" ไม่ใช่ "ตกลง") · ปุ่มไอคอนล้วน `aria-label` |
| ยืนยันก่อน submit | | `ConfirmSubmit({message, variant})` ใช้ `window.confirm` | ข้อความแปลจาก server ส่งมา |
| ฟอร์ม | `.ox-field > .ox-label(--required) + .ox-control + .ox-help/.ox-error` · `textarea.ox-control` min 88px · `select.ox-control` ลูกศร SVG ฝัง · `[aria-invalid=true]` ขอบแดง | `Field TextInput TextArea Select` · `CONTROL_CLASS = "ox-control"` ค่าเดียวคุมทั้งระบบ | ช่องกรอกบนมือถือ font 16px กัน iOS ซูม |
| สวิตช์/เช็ก | `.ox-toggle > input + .ox-toggle__track` (36×20) · `.ox-check` (16px, มือถือ 20px แถวสูง 40) | `Toggle Checkbox` | โฟกัสวาดที่ track |
| ตาราง | `.ox-table-wrap > table.ox-table` · `th` 12px muted พื้น surface-2 · `td` padding 12 · `.is-num` ชิดขวา tabular · `.ox-table--data` แถวบาง + `.ox-bar` ในเซลล์ | **`TableScroll({label})`** = `div.ox-table-wrap[role=region][tabIndex=0][aria-label]` | ห้ามเขียน wrap เอง · เลื่อนในตัวเองไม่ดันหน้า · โฟกัสด้วยคีย์บอร์ดได้ |
| ประกาศ | `.ox-alert(--success/--warning/--danger/--info)` `role="status"` | `Alert({tone})` | |
| โมดัล | `.ox-modal-mask > .ox-modal(role=dialog aria-modal) > __head __body __foot` · กว้าง 520 (wide 820) · max-height 90vh | `Modal({title, onClose, foot, wide})` ปิดด้วย Esc และคลิกนอกกล่อง | |
| หน้าว่าง | `.ox-empty > __title + body + action` เส้นประ | `EmptyState({title, body, action})` | ต้องมีปุ่มพาไปทำสิ่งที่ทำให้ไม่ว่าง |
| ดรอปดาวน์ตัวกรอง | `.ap-dropdown > Chip[aria-expanded aria-haspopup=menu] + .ap-dropdown__menu[role=menu]` (absolute, max-height 320, z 30) | `Dropdown({label, active, width, children:(close)=>…})` | ปิดเมื่อคลิกนอก/Esc |
| คอมโบบ็อกซ์ | `input[role=combobox aria-expanded aria-controls aria-autocomplete=list]` + `[role=listbox] > button[role=option aria-selected]` | `ComboBox({value, onChange, options})` | พิมพ์ค่านอกรายการได้ · ลูกศรขึ้นลง/Enter/Esc |
| ลำดับขั้น | `.ox-steps > .ox-step (นับเลขอัตโนมัติด้วย counter) > __title` | — | คู่มือ/ขั้นตอนตั้งค่า |
| ปุ่มรองที่นาน ๆ ใช้ | `details.ap-more > summary + .ap-more__menu` (มือถือ static เต็มกว้าง) | — | เก็บปุ่มที่ไม่บ่อยไว้หลังปุ่มเดียว |
| แถบความคืบหน้า | `.ap-progress > div` 6px · `--idle` แถบวิ่ง (reduced-motion: เต็ม 100% หรี่ .45) | `ProgressBar({pct: number\|null, label})` `role=progressbar aria-valuetext` · idle **ไม่ส่ง** `aria-valuenow` · ขั้นต่ำ 2% | null ≠ 0 |
| ปุ่มงานเบื้องหลัง | | `JobButton` — POST เริ่มงาน → poll `/api/jobs/status?kind=` ทุก 5 วิ → แถบ 3 รูป (`count` จำนวนจริง · `steps` ขั้นที่จบ · `time` ประมาณมี `~`) → เมื่อจบบอกผลจาก `last` แล้ว `router.refresh()` | ห้ามปน 3 รูป · ผลของ trigger ต้องอ่าน `skipped` ไม่ใช่แค่ `res.ok` |
| แถบงบ | `.ap-budget(.is-ok/.is-warn/.is-over)` การ์ด · `--mini` ในเมนูข้าง (ไม่มีกรอบ) | `BudgetMeter({spent, budget, variant})` | เตือนที่ 80% · ระดับบอกด้วยพื้น+ข้อความ · ไม่ตั้งเพดาน = Alert warning "ไม่จำกัด" ไม่ใช่ 0% |
| แปล note ของ run | | `NoteText({note})` / `noteToText(t, note)` ผ่าน `parseNote()` | note ใน DB เป็น EN pattern |
| แถวโน้ต/การตีความ | `.ap-notes(--plain) > .ap-note(--row) > __label __title __body` | — | ป้ายระดับ → หัวข้อหนา → เนื้อจาง 1.7 |
| พับ/กาง | `details.ap-disclosure > summary(__title __meta __chev) + __body` | — | ลูกศรหมุน 180° ตอนเปิด |
| ช่องข้อมูลรายสูตร | `.ap-fields > .ap-field > __label(.is-fact ✓เขียว / .is-interp ✓เหลือง) + __value` | — | แยก "ข้อเท็จจริง" กับ "การตีความ" ด้วยสี+คำ |

ตัวช่วย: `.ox-stack` (คอลัมน์ gap 12) · `.ox-row` (แถวห่อ gap 8) · `.ox-muted` · `.ox-xs` · `.line-clamp-2` (ไม่ใช้ `truncate` ในไทล์แคบ) · `.ap-sticky` (แถบตัวกรองติดบน พื้น bg 92% + blur) · `.ap-spin`
`cn()` มีสองตัว: ตัวใน `components/ui` เป็น client-only **server component ต้องใช้ `lib/cn`** ไม่งั้นหน้า 500 โดยไม่มี log

---

## 6. Dashboard / BI (ลำดับหน้าตายตัว)

```
1 .ox-page-head            หัวข้อ + คำอธิบาย + ปุ่ม ≤ 2 (ไม่มี primary)
2 .ox-filter-bar           .ox-segment (7/30/90 วัน) · select.ox-control · __spacer · __meta "อัปเดตล่าสุด …"
3 .ox-kpi-grid             KPI 4 ช่อง (มือถือ 2) .ox-kpi > __label → __value → __delta(.is-up/.is-down + ลูกศร) (+ __spark)
4 .ox-chart.is-wide        กราฟหลัก 1 ตัว (แนวโน้มตามเวลา) เต็มแถว
5 .ox-chart-grid           กราฟรอง 2 ต่อแถว (≥1024) .ox-chart > __head(__title __sub) __body > __canvas(260px / --tall 340) (+ __foot)
6 TableScroll              .ox-table.ox-table--data + .ox-bar + ปุ่มดาวน์โหลด CSV
```

- KPI: ค่าเดียวต่อช่อง · ยังไม่มีค่าแสดง `—` · เดลต้าสลับคลาสตาม**ความหมาย** (ลงแล้วดี = `is-up`) และมีลูกศรเสมอ · sparkline เฉพาะเมื่อมี ≥ 7 จุด เส้นเดียว `chart-1` ไม่มีแกน
- ตัวเลข: `Intl.NumberFormat(locale)` ไม่มีทศนิยม · เงินไม่มีทศนิยมถ้า ≥ 1,000 · % ทศนิยม 1 · แกนย่อ K/M · วันที่ `d MMM` ในแกน `d MMM yyyy` ในตาราง (เขตเวลา Asia/Bangkok — `i18n/index.ts` มี `formatNumber formatPercent formatDate formatDateTime formatAgo`)
- **สี series ตามตัวตน ไม่ใช่อันดับ** ("Douyin" เป็นสีเดิมทุกกราฟในหน้าเดียวกัน) · series ที่ 6+ ยุบเป็น "อื่น ๆ" · semantic ไม่ใช่ series
- ชนิดกราฟ: เวลา → เส้น ≤ 4 เส้น · เทียบหมวด → **แท่งแนวนอนเรียงมากไปน้อย** · สัดส่วน → แท่งซ้อน 100% หรือ donut ≤ 5 · ค่าเดียว → KPI · ห้าม dual-axis, pie > 5, 3D, gradient, เงา, animation ตอนโหลด
- กริดแนวนอนอย่างเดียว `--omnix-chart-grid` · แกน `--omnix-chart-axis` 12px ไม่มี axisLine/tickLine · แท่งมุมโค้ง 4px ด้านปลาย · ≥ 2 series ต้องมี `.ox-legend` (`__item > __swatch[--c]`) · tooltip พื้น surface ขอบ border ตัวอักษร fg
- สถานะ: โหลด `.ox-skeleton` (shimmer) · ว่าง `.ox-chart__empty` บอกช่วงที่เลือก + ปุ่มขยายช่วง · ผิดพลาด `.ox-alert--danger` + โหลดใหม่
- **Sankey/แผนภาพซับซ้อนต้องมีตารางคู่** (`FlowTable` แถว "จาก → ไป · จำนวน · %") เพราะจอแคบอ่านแผนภาพไม่ออกและ tooltip ใช้กับการแตะไม่ได้ — ตารางเป็นตัวหลักบนมือถือ ไม่ใช่ของสำรอง · แถบสัดส่วนในเซลล์เป็นพื้นหลัง ตัวเลขอยู่บนแถบเสมอ (`.ap-flow__cell > .ap-flow__bar + .ox-num`)

Recharts (`components/charts/index.tsx`): `useChartColors()` อ่าน token ด้วย `getComputedStyle` หลัง paint แรก + `MutationObserver` บน `class`/`data-theme` ของ `<html>` เพื่อสลับธีมสด · `seriesColor(colors, i)` (i ≥ 5 → other) · `Legend` · `HBarChart({data, series[{key,label,colorIndex}], height, stacked, percent})` เป็นแม่แบบ

---

## 7. แพตเทิร์นเฉพาะที่พิสูจน์แล้วใน Ads Plus (ยกไปใช้กับ "สินค้า" ได้ตรง ๆ)

| แพตเทิร์น | คลาส | ใช้กับระบบใหม่ |
|---|---|---|
| **การ์ดเหตุการณ์ในฟีด** — แถบสี 3px ด้านซ้ายบอกชนิด (`--launched` success · `--retired` danger · `--milestone_90` accent · อื่น chart-other) + thumb 72px + เนื้อหา + ไทล์ตัวเลข · ทั้งการ์ดเป็นลิงก์ `color: inherit` | `.ap-event` `.ap-thumb(.is-retired grayscale)` `.ap-thumb__overlay` | change_events: `new` success · `gone` danger · `sales_surge` accent · `price_drop` warning |
| **ไทล์ตัวเลขไล่ระดับ** — 80×64 (มือถือ 64×56) เลขใหญ่ 28px + ป้าย · พื้นไล่ 5 ขั้นจาก surface-2 → accent-soft → accent 35% → 65% → accent (ตัวหนังสือ on-accent) | `.ap-longevity(--0-7 … --90-plus)(.is-retired)` | trend / ยอดขาย 30 วันแบ่ง bucket · หรือ "วันที่เห็นในลิสต์" |
| **Wall การ์ดสื่อ** — กริด 2/3/4 คอลัมน์ (768/1280) · compact 3/4/6 · กล่องสื่อสูงคงที่ 200px (compact 140) **ไม่ crop** (`object-fit: contain` พื้น surface-2) · วิดีโอ: โปสเตอร์ cover → เล่นแล้ว contain · ปุ่ม play กลางช่อง (absolute inset 0) | `.ap-wall(--compact)` `.ap-wall__media` `.ap-media(--poster/--playing)` `.ap-media__play` `.ap-card-link` | หน้า Products: รูปสินค้าตามสัดส่วนจริง สลับ grid/compact ใน URL `?density=` |
| **หัวแบ่งวัน** ในฟีด | `.ap-day-head` | ฟีด snapshot รายรอบ |
| **แถบสรุปบนสุด** — ตัวเลขใหญ่ 18px + ป้ายหลายตัวในแถวเดียว ห่อบรรทัด | `.ap-summary > __main` | สรุปรอบล่าสุด: ใหม่ N · หาย N · พุ่ง N |
| **เลนต่อหมวด (Angle Board)** — แถวเลนเลื่อนข้าง `scroll-snap` · เลน 316px (มือถือ 84vw) · หัวเลน + รายการเลื่อนในตัวเอง ≤ 62vh · แถว `44px thumb | ชื่อ | ตัวเลข` · เรียงตามชิ้นที่นานสุด | `.ap-board > .ap-lane > __head + __list > a.ap-lane__row > __thumb` | หน้า Categories: เลนต่อหมวดสินค้า เรียงตามยอดขาย |
| **การ์ดโดเมนเลือกได้** — กริด 1/2/4 · `.is-selected` ขอบ accent พื้น accent-soft · แถบสัดส่วน 4px ล่างการ์ด | `.ap-domlist > a.ap-domcard(.is-selected) > __top + .ox-bar` | ตัวกรองแพลตฟอร์ม/ร้าน |
| **การ์ดลิงก์** — กริด 1/2/3 · thumb 56px จองพื้นที่ล่วงหน้า (ไม่กระตุกตอนโหลด) · URL ย่อด้วย `shortUrl()` (เก็บ path ท้าย ทิ้ง query tracking) เต็มอยู่ใน href | `.ap-linkgrid > .ap-linkcard > __main(__thumb) + __url` | รายการลิงก์สินค้า |
| **แถบสถานะงานในเมนูข้าง** | `.ap-jobstatus` | เหมือนเดิม |
| **สีประจำแบรนด์** — `BrandMark` วงกลม/สี่เหลี่ยมมุมโค้ง ขอบ 2px `--c` โลโก้ contain · badge สี `--c` | `.ap-brand-mark[--c]` | สีประจำแพลตฟอร์ม (Douyin/1688/Temu/XHS) เก็บเป็น hex ในข้อมูล ไม่ใช่ใน CSS |
| **สื่อเต็มในหน้า detail** | `.ap-media-full` max-height 520 contain | หน้า Product detail |

---

## 8. ไอคอน

- Boxicons **regular (outline)** ฝังเป็น SVG `viewBox 0 0 24 24 fill=currentColor` ขนาดเริ่มต้น 18 (เมนู 16, แถบล่าง 20)
- ไฟล์ `components/icons.tsx` **สร้างจาก `scripts/gen-icons.mjs`** (อ่าน `node_modules/boxicons/svg/regular/bx-<name>.svg` ดึง `<path d>` ทุกอัน) — แก้ `MAP` แล้วรัน `npm run gen:icons` ห้ามแก้มือ
- `IconProps = {size?, label?}` — ไม่มี `label` → `aria-hidden` · มี `label` → `role="img" aria-label`
- ชุดที่มี (55): Search Plus Refresh History PauseCircle PlayCircle ChevronDown/Left/Right Check X Sun Moon Globe Calendar Filter Image Video Carousel LinkExternal ErrorCircle InfoCircle CheckCircle Trash Edit Upload Grid Pulse Analyse Cog ArrowBack Dollar Time Flag TrendingUp Download Layer BarChart Bulb Link BookContent ListUl Store Target Tag Loader Bell MailSend Images MoviePlay LineChart PieChart GitCompare Wrench Menu
- ระบบใหม่น่าจะเพิ่ม: `trending-down` `cart` `package` `yuan`/`money` `sort` `star` — ดูชื่อไฟล์จริงใน `node_modules/boxicons/svg/regular/` ก่อนใส่ MAP

---

## 9. ธีมและภาษา

| เรื่อง | กลไก |
|---|---|
| ธีม | cookie `<app>_theme` = `light\|dark\|system` · `layout.tsx` ใส่คลาส + `data-theme` บน `<html>` เฉพาะเมื่อไม่ใช่ system · `ThemeToggle` (client) รอ mount ก่อนอ่าน `matchMedia` กัน SSR/CSR ไม่ตรง · กดแล้วตั้ง cookie + สลับคลาสทันที + `router.refresh()` |
| ภาษา | cookie `<app>_lang` ∈ `th en zh` (ค่าเริ่มต้น th) · `<html lang>` = `zh-CN` เมื่อ zh · `LocaleProvider` ครอบ body · client: `useT()` `useLocale()` · server: `getT()` `getLocale()` |
| dictionary | ไฟล์เดียว `i18n/dictionary.ts` รูป `"nav.more": { th, en, zh }` (Ads Plus มี ~590 คีย์) · `translate()` แทน `{var}` · `translateOr()` สำหรับคีย์ที่อาจไม่มี (platform แปลก ๆ) · **เทสต์ `dictionary.test.ts` แดงเมื่อคีย์ใดขาดภาษา** |
| error จาก API | ส่งเป็นคีย์ (`errors.job.alreadyRunning`) แล้วแปลที่ UI |
| note ของ run | EN pattern คงที่ใน DB → `parseNote()` regex → คีย์ + ตัวแปร → `t()` |
| รูปแบบวันที่/ตัวเลข | ทุกตัวผ่าน `i18n/index.ts` ด้วย `INTL_TAG = {th:"th-TH", en:"en-US", zh:"zh-CN"}` เขตเวลา `Asia/Bangkok` |

---

## 10. Responsive (เทสต์บังคับใน `test/rwd-audit.test.ts` — อ่าน CSS และ tsx จริง)

| กฎ | ค่า |
|---|---|
| breakpoint ที่อนุญาต | `min-width: 640 / 768 / 1024 / 1280` · `max-width` ต้องเป็น `639 / 767 / 1023 / 1279` (ไม่งั้นมีช่องโหว่ 1px) · เลขอื่นเทสต์ตก |
| จอเล็กสุด | 320px · ความกว้างคงที่ > 288px (320 − padding 32) ถือว่าเสี่ยง ต้องอยู่ใน ALLOW พร้อมเหตุผล (ตอนนี้มีแค่ตารางใน TableScroll 1 ที่) |
| กริดหลายคอลัมน์ | ต้องอยู่หลัง breakpoint หรืออยู่ใน ALLOW (`.ox-kpi-grid .ap-wall .ox-step .ap-lane__row .ap-bottomnav__sheet .ox-nav-list`) · Tailwind `grid-cols-N` ต้องมี prefix (`sm:grid-cols-2`) |
| ห้าม | `overflow-x: hidden` ที่ `html/body/.ox-app` (ซ่อนปัญหา) · font-size < 12px (ยกเว้น `.ap-bottomnav__label` 11px) |
| รูป | กล่องรูปทุกตัวจองพื้นที่ (`aspect-ratio` หรือความสูงคงที่) กันหน้ากระตุก |
| จอแคบ (≤ 767) | `--omnix-control-h` 44px · `.ox-btn--sm` 36 · `.ox-chip` 36 · `.ox-check` แถว 40 กล่อง 20 · `input/select/textarea` **16px** (กัน iOS ซูม) · ปุ่มหัวหน้าเต็มกว้าง · หัวหน้า 20px |
| ตาราง | เลื่อนในตัวเอง (`TableScroll`) ไม่ดันหน้า |
| เนื้อหายาว | `.ox-prose { min-width:0; overflow-wrap:anywhere }` ลิงก์/โค้ดตัดได้ · ตาราง markdown `display:block; overflow-x:auto` |
| Sankey/กราฟกว้าง | วัดความกว้างจริง + มีตารางคู่ (§6) |
| ข้อจำกัด | เทสต์อ่าน "กฎที่เขียน" ไม่ได้วัด "ผลเรนเดอร์" — layout จริงต้องเปิดดูเองที่ 320/375/768/1024/1280 |

---

## 11. การเข้าถึง (มีในโค้ดจริง ห้ามถอย)

- `:focus-visible { outline: 2px solid accent; offset 2px }` global · ถ้าวาดเองใช้ `.focus-delegated` แล้วตัวครอบวาดแทน
- ลิงก์เมนูที่ active ใส่ `aria-current="page"` · ชิป toggle `aria-pressed` · dropdown `aria-expanded aria-haspopup aria-controls`
- `TableScroll` = `role="region" tabIndex={0} aria-label` (คีย์บอร์ดเลื่อนคอลัมน์ที่ล้นได้)
- `ProgressBar` idle ไม่ส่ง `aria-valuenow` · มี `aria-valuetext` เสมอ
- `Alert` = `role="status"` · สถานะที่เปลี่ยนเอง (sync เสร็จ) ประกาศให้ screen reader
- `Modal` = `role="dialog" aria-modal="true"` ปิดด้วย Esc
- ไอคอนตกแต่ง `aria-hidden` · ปุ่มไอคอนล้วน `aria-label` + `title`
- `LangSwitch` มี `<span class="sr-only">` + `aria-label`
- `prefers-reduced-motion`: ปิด transition/animation ทั้งหมด · แถบวิ่งเปลี่ยนเป็นเต็มหรี่ (ไม่งั้นค้างที่ 40% อ่านเหมือน "ไป 40%")
- contrast AA 4.5:1 ทุกคู่ใน §2.1 · ขอบของสิ่งที่กดได้ 3:1
- สื่อความหมายด้วยสีอย่างเดียวไม่ได้: เดลต้ามีลูกศร · แถบงบมีข้อความ · ป้าย fact/interp มีคำ

---

## 12. เทสต์ที่ต้องยกไปด้วย (ทำให้กติกาข้างบน "บังคับ" ไม่ใช่ "แนะนำ")

| เทสต์ | ทำอะไร | แหล่ง |
|---|---|---|
| `test/contrast.test.ts` (32 ข้อ) | อ่าน token จาก `:root` และ `:root[data-theme="dark"]` คำนวณ WCAG contrast · คู่สีใน §2.1 ≥ 4.5 · border-strong ≥ 3 · `.ox-btn--primary` ต้องใช้ `--omnix-on-accent` · `.ox-control .ox-btn--secondary .ox-chip` ต้องใช้ `--omnix-border-strong` | `lib/domain/rwd-audit.ts`: `readTokens contrast luminance hexToRgb` |
| `test/rwd-audit.test.ts` (21 ข้อ) | parse CSS ด้วยการนับปีกกา · overflow risk · unguarded grid (CSS + Tailwind) · stray breakpoint · ห้าม overflow-x hidden ที่ root · font ≥ 12 · กล่องรูปจองพื้นที่ · ตารางอยู่ใน TableScroll | `parseCss declValue pxValue isMobileRule isDesktopOnly overflowRisks unguardedGrids strayBreakpoints unguardedTailwindGrids` |
| `i18n/dictionary.test.ts` | ทุกคีย์มีครบ th/en/zh ไม่ว่าง | |

กติกาโปรเจกต์: **ข้อยกเว้นต้องอยู่ใน ALLOW พร้อมคอมเมนต์เหตุผล ห้ามผ่อนเกณฑ์ให้เทสต์เขียว**

---

## 13. เช็กลิสต์ก่อนส่งหน้าใหม่

1. ไม่มี hex ใน tsx/CSS ของหน้า (ยกเว้น `--c` จากข้อมูล) · ไม่มี `#fff` บนพื้น accent
2. ทุกข้อความผ่าน `t()` มีครบ 3 ภาษา · `npm test` (dictionary/contrast/rwd) เขียว
3. ตัวกรองอยู่ใน URL · เลขหน้าถูกดึงกลับเข้าช่วง (`pageInfo`) · เรียงผลตามลำดับจริง
4. ตารางใน `TableScroll` · ตัวเลขใน `.ox-num` · ยังไม่มีค่า = `—`
5. ปุ่มงานเบื้องหลังใช้ `JobButton` + `/api/jobs/status` · แถบ 3 รูปไม่ปน · null ≠ 0
6. หน้าว่างมี `EmptyState` + ปุ่ม · สถานะโหลด/ว่าง/ผิดพลาดครบในกราฟ
7. กราฟ: สีจาก `chart-*` ตามตัวตน · แกนเดียว · legend เมื่อ ≥ 2 series · มีตารางคู่ถ้าเป็นแผนภาพ
8. ลองสลับธีมมืด · ลองภาษาจีน (ข้อความยาวกว่า) · ย่อ 320/375 — ไม่มี scroll ข้าง, เป้าแตะ ≥ 44, แถบล่างไม่ทับเนื้อหา
9. ปุ่มไอคอนมี `aria-label` · โฟกัสเห็นวงแหวน · ไม่มีสถานะที่สื่อด้วยสีล้วน
10. server component ไม่ import `cn` จาก `components/ui`

---

## 14. แมปหน้าของระบบใหม่ (China Marketplace Scout) กับแพตเทิร์นข้างบน

| หน้า | โครง | ยืมจาก |
|---|---|---|
| Overview | `.ap-summary` (ใหม่/หาย/พุ่ง/งบ) → แถบเตือน `Alert` (run suspect/failed ล่าสุดต่อ platform×keyword) → `.ox-kpi-grid` (สินค้าที่ติดตาม · ยอดรวม 30 วัน (เฉพาะที่มี period 30d) · rising · ค่าใช้จ่ายเดือนนี้) → กราฟหลัก (ยอดรวมต่อ snapshot ต่อแพลตฟอร์ม, ≤ 4 เส้น) → ฟีด `.ap-event` ของ change_events → ActivityLog | `/adsplus` |
| Products | `.ap-sticky` แถบตัวกรอง (`Dropdown` แพลตฟอร์ม/หมวด/trend/period · `Chip` grid/compact · sort) → `.ap-wall` การ์ดสินค้า: รูป contain 200px · `BrandMark`-แบบแพลตฟอร์ม (สี `--c`) · ชื่อ `line-clamp-2` · ราคา + สกุล · **ป้ายยอดขายต้องมี period** (`Badge` "30 วัน" accent / "สะสม ≥" default / "ไม่ทราบช่วง" warning) · ไทล์ trend แบบ `.ap-longevity` (rising accent / flat surface-2 / falling danger-bg / insufficient = `—`) | `/creative-wall` |
| Product detail | `.ap-media-full` + gallery → ตาราง facts (ราคา, ยอด+period, หมวดแพลตฟอร์ม, หมวดเรา + `category_source`) → กราฟ snapshot (เส้นเดียว sold · Douyin เพิ่ม salesTrend 30 จุด) → change_events → ปุ่มกลับผ่าน `?from=` (allow-list) | `/creative-wall/[id]` |
| Categories | `.ap-board` เลนต่อหมวด: หัวเลน (จำนวน · ยอดรวม · share%) + แถวสินค้าเรียงตามยอด · ตัวกรองแพลตฟอร์มหลายตัว (`?platform=a,b`) | `/angle-board` |
| Trends | ตาราง `.ox-table--data` rising/falling (delta sold · delta rank · `.ox-bar`) + กราฟแท่งแนวนอน top-10 | `/strategy` (ตาราง) |
| Actor Evaluation | ตาราง `actor_evaluations` (actor · tier · $/result · 50 ผล · ✓ 30d/หมวด/รูป/ลิงก์/trend · fail% · ผลสโมกเทสต์ · เลือก/เหตุผล) + `Badge` "เลือกใช้" | ใหม่ |
| Settings: Keywords / Taxonomy | ฟอร์ม `Field` + `TextArea` taxonomy รูป `key \| en \| th \| keywords` + `ComboBox` หมวดแพลตฟอร์ม + คิว unmapped | `/settings/watchlist` |
| Settings: System | ตาราง settings ต่อกลุ่ม (`SettingsGroupTabs`) · ค่าลับ mask 4 ตัวท้าย · บอกที่มา (db/env/fallback) · ปุ่ม `TestConnection` | `/settings/system` |
| Login | ฟอร์มเดียวกลางหน้า (ไม่มี shell) | `/login` |

ภาษาหลักของระบบใหม่: **ไทย + จีน + อังกฤษ** เหมือนเดิม · ชื่อสินค้า/หมวดจากแพลตฟอร์มแสดงเป็นจีนตามต้นฉบับเสมอ (ไม่แปลอัตโนมัติ) แล้วให้ taxonomy ของเรามีทั้ง `th en zh`
