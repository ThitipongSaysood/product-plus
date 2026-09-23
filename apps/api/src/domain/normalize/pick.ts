// Tolerant field access for actor rows: actors rename fields without notice, so every read
// goes through pick(row, "a", "b.c", "images.0.url") and returns null instead of throwing.

export function get(row: unknown, path: string): unknown {
  let cur: unknown = row;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** First value along `paths` that is not null/undefined/"" (flattened "a.b" keys are tried too). */
export function pick(row: unknown, ...paths: string[]): unknown {
  for (const p of paths) {
    let v = get(row, p);
    if ((v === undefined || v === null) && row && typeof row === "object") v = (row as Record<string, unknown>)[p];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

export function str(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" ? null : s;
}

export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[,\s¥￥$]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export function int(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.round(n);
}

export function bool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === 1) return true;
  if (v === "false" || v === 0) return false;
  return null;
}

/** Only absolute http(s) URLs count — deep links (xhsdiscover://) and echoed inputs are not data. */
export function url(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("/api/media/mock/")) return s; // mock source placeholder images (served by this api)
  return /^https?:\/\//i.test(s) ? s : null;
}

export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** "10K+ sold" → 10000 lb · "全网10万+件" → 100000 lb · "已售1.6万+件" → 16000 lb · "31 sold" → 31. */
export function parseCountText(text: string | null): { count: number; lowerBound: boolean } | null {
  if (!text) return null;
  const m = text.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(万|千|[kKmMwW])?\s*(\+)?/);
  if (!m) return null;
  const mult: Record<string, number> = { 万: 1e4, w: 1e4, W: 1e4, 千: 1e3, k: 1e3, K: 1e3, m: 1e6, M: 1e6 };
  return { count: Math.round(Number(m[1]) * (m[2] ? mult[m[2]] : 1)), lowerBound: Boolean(m[3]) || /以上|over/i.test(text) };
}

export function uniq<T>(xs: (T | null | undefined)[]): T[] {
  return [...new Set(xs.filter((x): x is T => x !== null && x !== undefined))];
}
