import { dict, type DictKey } from "./dictionary";

export type Locale = "th" | "en" | "zh";
export const LOCALES: readonly Locale[] = ["th", "en", "zh"];
export const DEFAULT_LOCALE: Locale = "th";
export const LANG_COOKIE = "pp_lang";
export const THEME_COOKIE = "pp_theme";
export const TZ = "Asia/Bangkok";
export const INTL_TAG: Record<Locale, string> = { th: "th-TH-u-ca-gregory", en: "en-US", zh: "zh-CN" };
export type { DictKey };

export function toLocale(v: string | undefined | null): Locale {
  return v === "en" || v === "zh" || v === "th" ? v : DEFAULT_LOCALE;
}

type Vars = Record<string, string | number>;

function fill(s: string, vars?: Vars) {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

export function translate(locale: Locale, key: DictKey, vars?: Vars): string {
  return fill(dict[key][locale], vars);
}

/** For keys that come from data (API error keys, reason keys, platform names). */
export function translateOr(locale: Locale, key: string | null | undefined, fallback: string, vars?: Vars): string {
  if (key && key in dict) return fill(dict[key as DictKey][locale], vars);
  return fallback;
}

export type T = ((key: DictKey, vars?: Vars) => string) & {
  or: (key: string | null | undefined, fallback: string, vars?: Vars) => string;
  locale: Locale;
};

export function makeT(locale: Locale): T {
  const t = ((key: DictKey, vars?: Vars) => translate(locale, key, vars)) as T;
  t.or = (key, fallback, vars) => translateOr(locale, key, fallback, vars);
  t.locale = locale;
  return t;
}

// ---------- formatting (Asia/Bangkok) ----------
export function formatNumber(locale: Locale, n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(INTL_TAG[locale], { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

export function formatCompact(locale: Locale, n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** ratio 0..1 → "12.4%" */
export function formatPercent(locale: Locale, ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return new Intl.NumberFormat(INTL_TAG[locale], { style: "percent", maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(ratio);
}

/** Money: no decimals when ≥ 1,000; small USD costs keep up to 4 decimals (actor $/result). */
export function formatMoney(locale: Locale, n: number | null | undefined, currency: string = "USD", maxDigits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const digits = Math.abs(n) >= 1000 ? 0 : maxDigits;
  return new Intl.NumberFormat(INTL_TAG[locale], {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: digits,
    minimumFractionDigits: Math.min(digits, 2),
  }).format(n);
}

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = typeof v === "string" ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** d MMM yyyy (table) or d MMM (axis, short=true) */
export function formatDate(locale: Locale, v: string | Date | null | undefined, short = false): string {
  const d = toDate(v);
  if (!d) return "—";
  return new Intl.DateTimeFormat(INTL_TAG[locale], {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    ...(short ? {} : { year: "numeric" }),
  }).format(d);
}

export function formatDateTime(locale: Locale, v: string | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "—";
  return new Intl.DateTimeFormat(INTL_TAG[locale], {
    timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
}

export function formatAgo(locale: Locale, v: string | Date | null | undefined, now: Date = new Date()): string {
  const d = toDate(v);
  if (!d) return "—";
  const sec = Math.round((d.getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(INTL_TAG[locale], { numeric: "auto" });
  const abs = Math.abs(sec);
  if (abs < 60) return rtf.format(sec, "second");
  if (abs < 3600) return rtf.format(Math.round(sec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(sec / 86400), "day");
  return formatDate(locale, d);
}
