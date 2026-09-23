import type { Platform } from "@pp/contracts";

// contracts exports PLATFORMS as a value, but web only does `import type` — keep the list here.
export const PLATFORM_LIST: readonly Platform[] = ["douyin", "1688", "temu", "xhs"];

/** Colour by identity, never by rank: douyin chart-1 · 1688 chart-2 · temu chart-3 · xhs chart-4 */
export const PLATFORM_CHART_INDEX: Record<Platform, number> = { douyin: 0, "1688": 1, temu: 2, xhs: 3 };

export function platformColorVar(p: Platform): string {
  return `var(--omnix-chart-${PLATFORM_CHART_INDEX[p] + 1})`;
}

export function isPlatform(v: string): v is Platform {
  return (PLATFORM_LIST as readonly string[]).includes(v);
}

export function csv(v: string | string[] | undefined): string[] {
  const s = Array.isArray(v) ? v.join(",") : v ?? "";
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export const DEFAULT_PG = "apple-watch-bands";
