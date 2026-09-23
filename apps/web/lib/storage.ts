// The only place allowed to touch localStorage (design-system §0.7).
const PREFIX = "pp:";

export const storage = {
  get(key: string): string | null {
    try { return window.localStorage.getItem(PREFIX + key); } catch { return null; }
  },
  set(key: string, value: string): void {
    try { window.localStorage.setItem(PREFIX + key, value); } catch { /* private mode / quota */ }
  },
  remove(key: string): void {
    try { window.localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
  },
};
