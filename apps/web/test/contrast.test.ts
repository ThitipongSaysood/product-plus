import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, declValue, parseCss, readTokens } from "@/lib/rwd-audit";

const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
const rules = parseCss(css);

// design-system §2.1 — text pairs ≥ 4.5:1 in both modes
const PAIRS: [string, string][] = [
  ["fg", "surface"], ["fg", "bg"], ["fg", "surface-2"],
  ["fg-muted", "surface"], ["fg-muted", "bg"], ["fg-muted", "surface-2"],
  ["accent", "surface"], ["accent", "accent-soft"],
  ["success-fg", "success-bg"], ["warning-fg", "warning-bg"], ["danger-fg", "danger-bg"], ["info-fg", "info-bg"],
  ["on-accent", "accent"],
];

describe.each(["light", "dark"] as const)("contrast (%s)", (mode) => {
  const tok = readTokens(css, mode);
  const c = (k: string) => {
    const v = tok[`--omnix-${k}`];
    if (!v) throw new Error(`missing --omnix-${k} (${mode})`);
    return v;
  };
  it.each(PAIRS)("%s on %s ≥ 4.5", (a, b) => {
    expect(contrast(c(a), c(b))).toBeGreaterThanOrEqual(4.5);
  });
  it("border-strong on surface ≥ 3 (WCAG 1.4.11)", () => {
    expect(contrast(c("border-strong"), c("surface"))).toBeGreaterThanOrEqual(3);
  });
  it("uses the design-system accent", () => {
    expect(c("accent")).toBe(mode === "light" ? "#4f46e5" : "#8b8bf0");
  });
});

describe("component colour rules", () => {
  const body = (sel: string) => rules.filter((r) => r.selector === sel && r.media == null).map((r) => r.body).join(";");
  it(".ox-btn--primary text uses --omnix-on-accent (never #fff)", () => {
    expect(declValue(body(".ox-btn--primary"), "color")).toBe("var(--omnix-on-accent)");
  });
  it.each([".ox-control", ".ox-btn--secondary", ".ox-chip"])("%s border uses --omnix-border-strong", (sel) => {
    expect(body(sel)).toMatch(/border(-color)?:[^;]*var\(--omnix-border-strong\)/);
  });
  it("no #fff / white text on accent anywhere", () => {
    const offenders = rules.filter((r) => /background:\s*var\(--omnix-accent\)/.test(r.body) && /color:\s*(#fff|#ffffff|white)\b/i.test(r.body));
    expect(offenders.map((r) => r.selector)).toEqual([]);
  });
});
