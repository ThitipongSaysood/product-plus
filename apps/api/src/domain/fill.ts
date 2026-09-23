// Actor input template: JSON with {{keyword}} {{limit}} {{region}}. A value that is exactly one
// placeholder keeps the variable's type (limit stays a number); keys left empty are dropped
// because enum-typed actor inputs reject "".
type Vars = Record<string, string | number | null | undefined>;

const empty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

function fillValue(v: unknown, vars: Vars): unknown {
  if (typeof v === "string") {
    const whole = v.match(/^\{\{(\w+)\}\}$/);
    if (whole) return vars[whole[1]] ?? null;
    return v.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? ""));
  }
  if (Array.isArray(v)) return v.map((x) => fillValue(x, vars)).filter((x) => !empty(x));
  if (v && typeof v === "object") return fill(v as Record<string, unknown>, vars);
  return v;
}

export function fill(template: Record<string, unknown> | string, vars: Vars): Record<string, unknown> {
  const obj = typeof template === "string" ? (JSON.parse(template) as Record<string, unknown>) : template;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const filled = fillValue(v, vars);
    if (!empty(filled)) out[k] = filled;
  }
  return out;
}
