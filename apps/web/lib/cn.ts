/** Server-safe class joiner (components/ui is client-only — server components import this one). */
export function cn(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(" ");
}
