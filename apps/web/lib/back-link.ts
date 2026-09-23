// ?from= back links: only same-app list pages, never an absolute/protocol-relative URL.
const ALLOW = ["/overview", "/products", "/categories", "/trends"];

export function safeFrom(from: string | string[] | undefined | null): string | null {
  const v = Array.isArray(from) ? from[0] : from;
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.includes("\\")) return null;
  const path = v.split(/[?#]/)[0];
  return ALLOW.some((p) => path === p) ? v : null;
}
