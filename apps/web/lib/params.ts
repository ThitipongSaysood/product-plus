import { DEFAULT_PG, first } from "./platform";

export type SP = Record<string, string | string[] | undefined>;

export function getPg(sp: SP): string {
  return first(sp.pg) || DEFAULT_PG;
}

/** Build a URL keeping current params, overriding/removing some (undefined/"" removes). */
export function href(path: string, sp: SP, patch: Record<string, string | number | undefined | null> = {}): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const f = first(v);
    if (f != null && f !== "") u.set(k, f);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") u.delete(k);
    else u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `${path}?${s}` : path;
}
