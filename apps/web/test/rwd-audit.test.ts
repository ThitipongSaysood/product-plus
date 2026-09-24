import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  declValue, imageBoxesWithoutSize, isMobileRule, overflowRisks, parseCss, rootOverflowHidden, smallFonts,
  smallInlineFonts, strayBreakpoints, tableViolations, unguardedGrids, unguardedTailwindGrids,
} from "@/lib/rwd-audit";

const ROOT = join(__dirname, "..");
const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
const rules = parseCss(css);

function tsxFiles(dir: string): { path: string; src: string }[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (["node_modules", ".next"].includes(name)) return [];
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith(".tsx") ? [{ path: relative(ROOT, p), src: readFileSync(p, "utf8") }] : [];
  });
}
const files = [...tsxFiles(join(ROOT, "app")), ...tsxFiles(join(ROOT, "components"))];

// Exceptions — each needs a reason. Never loosen a rule to go green.
const ALLOW_GRID: Record<string, string> = {
  ".ox-kpi-grid": "KPI tiles are 2-up on phones by design (§6), 4-up from 1024",
  ".ap-wall": "product wall is 2 columns on phones (§7), cards are narrow by design",
  ".ap-wall--compact": "compact density is 3 small thumbs per row on phones (§7)",
  ".ap-lane__row": "44px thumb | title | number row — fixed thumb column, title is minmax(0,1fr)",
  ".ap-bottomnav": "mobile bottom bar: 5 equal slots (§4.2)",
  ".ap-bottomnav__sheet": "More sheet is 2 columns of nav links (§4.2)",
  ".ap-pick": "brand pick: 96px thumb | minmax(0,1fr) body — same fixed-thumb pattern as .ap-lane__row",
  ".ap-judge li": "14px icon | minmax(0,1fr) text — an icon column, not a layout",
  ".ap-avoid__row": "48px thumb | minmax(0,1fr) text",
  ".ap-score": "score meter: label | minmax(0,1fr) bar | number \u2014 a content row, and the bar column can shrink to 40px",
  ".ap-trial-grid": "keyword trial cards: auto-fill minmax(260px,1fr) — one column below ~560px, fits 375px inside the card padding",
  ".ap-trial__row": "44px thumb | minmax(0,1fr) text | link icon — same fixed-thumb pattern as .ap-lane__row",
  ".ap-tiers": "price ladder: two content-sized columns (\"1–9 เส้น\" + ¥13.50) — ~160px total, safe at 320px",
};
const ALLOW_WIDTH: Record<string, string> = {};
const ALLOW_FONT: Record<string, number> = { ".ap-bottomnav__label": 11 }; // §3: bottom-bar labels only

describe("breakpoints", () => {
  it("only 640/768/1024/1280 min and 639/767/1023/1279 max", () => expect(strayBreakpoints(css)).toEqual([]));
  it("has a mobile block", () => expect(rules.some(isMobileRule)).toBe(true));
});

describe("layout", () => {
  it("no fixed width wider than 288px outside desktop media", () => expect(overflowRisks(rules, Object.keys(ALLOW_WIDTH))).toEqual([]));
  it("multi-column CSS grids are behind a breakpoint or allowed with a reason", () => expect(unguardedGrids(rules, Object.keys(ALLOW_GRID))).toEqual([]));
  it("every ALLOW_GRID entry is still used (no stale exceptions)", () => {
    const used = new Set(rules.filter((r) => declValue(r.body, "grid-template-columns")).map((r) => r.selector));
    expect(Object.keys(ALLOW_GRID).filter((s) => !used.has(s))).toEqual([]);
  });
  it("Tailwind grid-cols-N carries a responsive prefix", () => expect(files.flatMap((f) => unguardedTailwindGrids(f.src))).toEqual([]));
  it("no overflow-x hidden on html/body/.ox-app", () => expect(rootOverflowHidden(rules)).toEqual([]));
  it(".ox-main has min-width: 0 so wide tables cannot push the menu", () => {
    expect(declValue(rules.find((r) => r.selector === ".ox-main")!.body, "min-width")).toBe("0");
  });
});

describe("type", () => {
  it("font-size ≥ 12px (bottom-nav label 11px only)", () => expect(smallFonts(rules, ALLOW_FONT)).toEqual([]));
  it("no inline fontSize < 12 in components", () => expect(files.flatMap((f) => smallInlineFonts(f.src))).toEqual([]));
});

describe("touch (≤ 767px)", () => {
  const mobile = rules.filter(isMobileRule);
  it("control height 44px", () => expect(mobile.some((r) => r.selector === ":root" && declValue(r.body, "--omnix-control-h") === "44px")).toBe(true));
  it("inputs 16px (no iOS zoom)", () => {
    const r = mobile.find((x) => /(^|,\s*)input\b/.test(x.selector) && /select/.test(x.selector) && /textarea/.test(x.selector));
    expect(r && declValue(r.body, "font-size")).toBe("16px");
  });
  it.each([".ox-btn--sm", ".ox-chip"])("%s grows to 36px", (sel) => {
    expect(mobile.some((r) => r.selector === sel && declValue(r.body, "height") === "36px")).toBe(true);
  });
  it("page-head actions go full width", () => {
    expect(mobile.some((r) => r.selector === ".ox-page-head__actions" && declValue(r.body, "width") === "100%")).toBe(true);
  });
  it("main leaves room for the bottom nav", () => {
    expect(mobile.find((r) => r.selector === ".ox-main")?.body ?? "").toMatch(/padding-bottom:\s*calc\(56px/);
  });
  it("sidebar never scrolls sideways on mobile (would clip its dropdowns)", () => {
    expect(mobile.filter((r) => r.selector === ".ox-sidebar").some((r) => /auto|scroll/.test(declValue(r.body, "overflow-x") ?? ""))).toBe(false);
  });
});

describe("images and tables", () => {
  it("image boxes reserve space (height or aspect-ratio)", () => expect(imageBoxesWithoutSize(rules)).toEqual([]));
  it("found the image boxes it should check", () => {
    const sels = rules.map((r) => r.selector);
    for (const s of [".ap-wall__media", ".ap-thumb", ".ap-lane__thumb", ".ap-media-full", ".ap-gallery__thumb"]) expect(sels).toContain(s);
  });
  it("tables only via TableScroll", () => expect(tableViolations(files)).toEqual([]));
});

describe("audit helpers catch violations", () => {
  const bad = parseCss(`
    @media (max-width: 768px) { .a { width: 400px; } }
    html { overflow-x: hidden; }
    .g { display: grid; grid-template-columns: 1fr 1fr; }
    .t { font-size: 10px; }
    .x__thumb { border-radius: 4px; }
  `);
  it("flags each", () => {
    expect(strayBreakpoints("@media (max-width: 768px) {}")).toHaveLength(1);
    expect(overflowRisks(bad)).toHaveLength(1);
    expect(rootOverflowHidden(bad)).toEqual(["html"]);
    expect(unguardedGrids(bad)).toHaveLength(1);
    expect(smallFonts(bad)).toHaveLength(1);
    expect(imageBoxesWithoutSize(bad)).toEqual([".x__thumb"]);
    expect(unguardedTailwindGrids('<div className="grid grid-cols-3 md:grid-cols-4">')).toEqual(["grid-cols-3"]);
    expect(tableViolations([{ path: "a.tsx", src: "<table></table>" }])).toHaveLength(1);
  });
});
