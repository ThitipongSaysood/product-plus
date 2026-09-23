// Static audits over the CSS/TSX we actually ship (design-system §10, §12). Pure functions — used by test/*.test.ts.
// Limitation: reads the rules as written, does not measure rendered layout.

export type Rule = { selector: string; body: string; media: string | null };

export const BREAKPOINTS_MIN = [640, 768, 1024, 1280];
export const BREAKPOINTS_MAX = [639, 767, 1023, 1279];
export const MIN_FONT_PX = 12;
export const NARROWEST_CONTENT_PX = 288; // 320 − 2×16 gutter

function stripComments(css: string) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Brace-counting parser: flat rules with their enclosing @media condition. @keyframes/@theme etc. are skipped. */
export function parseCss(css: string): Rule[] {
  const src = stripComments(css);
  const out: Rule[] = [];
  const walk = (text: string, media: string | null) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open === -1) break;
      const head = text.slice(i, open).replace(/^[\s;]*(@[^;{]*;\s*)*/g, "").trim();
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      const body = text.slice(open + 1, j - 1);
      if (head.startsWith("@media")) walk(body, head.slice(6).trim());
      else if (!head.startsWith("@")) out.push({ selector: head.replace(/\s+/g, " "), body, media });
      i = j;
    }
  };
  walk(src, null);
  return out;
}

export function declValue(body: string, prop: string): string | null {
  const re = new RegExp(`(?:^|[;{\\s])${prop.replace(/[-]/g, "\\-")}\\s*:\\s*([^;]+)`, "g");
  let m: RegExpExecArray | null;
  let last: string | null = null;
  while ((m = re.exec(body))) last = m[1].trim();
  return last;
}

export function pxValue(v: string | null): number | null {
  if (!v) return null;
  const m = v.trim().match(/^(-?\d+(?:\.\d+)?)px$/);
  return m ? Number(m[1]) : null;
}

export function isMobileRule(r: Rule) {
  return r.media != null && /max-width/.test(r.media);
}

export function isDesktopOnly(r: Rule) {
  return r.media != null && /min-width/.test(r.media) && !/max-width/.test(r.media);
}

/** Every @media width must be on the allow-list (max = breakpoint − 1, no 1px gaps). */
export function strayBreakpoints(css: string): string[] {
  const bad: string[] = [];
  for (const m of stripComments(css).matchAll(/\((min|max)-width:\s*(\d+)px\)/g)) {
    const n = Number(m[2]);
    const ok = m[1] === "min" ? BREAKPOINTS_MIN.includes(n) : BREAKPOINTS_MAX.includes(n);
    if (!ok) bad.push(m[0]);
  }
  return bad;
}

/** Fixed widths wider than the narrowest content box, outside desktop-only media. */
export function overflowRisks(rules: Rule[], allow: string[] = []): string[] {
  const out: string[] = [];
  for (const r of rules) {
    if (isDesktopOnly(r) || allow.includes(r.selector)) continue;
    for (const p of ["width", "min-width", "flex-basis"]) {
      const px = pxValue(declValue(r.body, p));
      if (px != null && px > NARROWEST_CONTENT_PX) out.push(`${r.selector} { ${p}: ${px}px }`);
    }
  }
  return out;
}

function columnCount(v: string): number {
  const rep = v.match(/^repeat\(\s*(\d+)/);
  if (rep) return Number(rep[1]);
  // count top-level tracks
  let depth = 0;
  let n = 0;
  let inTok = false;
  for (const ch of v) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth === 0 && /\s/.test(ch)) inTok = false;
    else if (!inTok) { inTok = true; if (depth <= 1) n++; }
  }
  return n;
}

/** Multi-column grids must sit behind a min-width breakpoint (or be in allow with a reason). */
export function unguardedGrids(rules: Rule[], allow: string[] = []): string[] {
  const out: string[] = [];
  for (const r of rules) {
    if (isDesktopOnly(r)) continue;
    const v = declValue(r.body, "grid-template-columns");
    if (!v || columnCount(v) < 2) continue;
    if (!allow.includes(r.selector)) out.push(`${r.selector} { grid-template-columns: ${v} }`);
  }
  return out;
}

/** Tailwind grid-cols-N (N ≥ 2) without a responsive prefix. */
export function unguardedTailwindGrids(tsx: string): string[] {
  return [...tsx.matchAll(/(^|[\s"'`])grid-cols-(\d+)/g)].filter((m) => Number(m[2]) >= 2).map((m) => `grid-cols-${m[2]}`);
}

/** overflow-x hidden on html/body/.ox-app hides real overflow bugs. */
export function rootOverflowHidden(rules: Rule[]): string[] {
  return rules
    .filter((r) => r.selector.split(",").some((s) => ["html", "body", ".ox-app", ":root"].includes(s.trim())))
    .filter((r) => /hidden|clip/.test(declValue(r.body, "overflow-x") ?? "") || /hidden|clip/.test(declValue(r.body, "overflow") ?? ""))
    .map((r) => r.selector);
}

export function smallFonts(rules: Rule[], allow: Record<string, number> = {}): string[] {
  const out: string[] = [];
  for (const r of rules) {
    const px = pxValue(declValue(r.body, "font-size"));
    if (px == null) continue;
    const min = allow[r.selector] ?? MIN_FONT_PX;
    if (px < min) out.push(`${r.selector} { font-size: ${px}px }`);
  }
  return out;
}

export function smallInlineFonts(tsx: string): string[] {
  return [...tsx.matchAll(/fontSize:\s*(\d+)/g)].filter((m) => Number(m[1]) < MIN_FONT_PX).map((m) => m[0]);
}

/** Image boxes (__media, __thumb, .ap-thumb, .ap-media-full) must reserve space: fixed height or aspect-ratio. */
export function imageBoxesWithoutSize(rules: Rule[]): string[] {
  const boxes = new Map<string, boolean>();
  for (const r of rules) {
    for (const sel of r.selector.split(",").map((s) => s.trim())) {
      const last = sel.split(/\s+/).pop() ?? "";
      if (!/^\.[\w-]*(__media|__thumb|-thumb|media-full)$|^\.ap-thumb$/.test(last) || sel.includes(" ")) continue;
      const sized = pxValue(declValue(r.body, "height")) != null || declValue(r.body, "aspect-ratio") != null;
      boxes.set(last, (boxes.get(last) ?? false) || sized);
    }
  }
  return [...boxes].filter(([, sized]) => !sized).map(([s]) => s);
}

/** Tables only through <TableScroll>; nobody hand-writes .ox-table-wrap. */
export function tableViolations(files: { path: string; src: string }[], uiPath = "components/ui.tsx"): string[] {
  const out: string[] = [];
  for (const f of files) {
    if (f.path.endsWith(uiPath)) continue;
    if (f.src.includes("ox-table-wrap")) out.push(`${f.path}: writes ox-table-wrap by hand`);
    if (/<table[\s>]/.test(f.src) && !f.src.includes("<TableScroll")) out.push(`${f.path}: <table> outside TableScroll`);
  }
  return out;
}

// ---------- colour ----------
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Tokens from `:root { }` (light, outside media) or `:root[data-theme="dark"], :root.dark { }`. */
export function readTokens(css: string, mode: "light" | "dark"): Record<string, string> {
  const rules = parseCss(css).filter((r) => r.media == null);
  const pick = mode === "light" ? rules.filter((r) => r.selector === ":root") : rules.filter((r) => r.selector.includes(':root[data-theme="dark"]'));
  const out: Record<string, string> = {};
  for (const r of pick) for (const m of r.body.matchAll(/(--omnix-[\w-]+)\s*:\s*([^;]+)/g)) out[m[1]] = m[2].trim();
  if (mode === "dark") return { ...readTokens(css, "light"), ...out };
  return out;
}
