// Characters that survive a code review by being invisible, but not a round trip through the browser.
//
// This exists because of a real bug: the "create a group" row of the sidebar <select> used a literal NUL
// (U+0000) as its sentinel value. The HTML parser rewrites NUL to U+FFFD per spec, so the value coming
// back from the select never matched the constant it was compared against, and choosing that row
// navigated to /overview?pg=%EF%BF%BDnew — "product group not found" — instead of the new-group page.
// Nothing in the source looked wrong; the byte is not visible in an editor or a diff.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const SKIP = new Set(["node_modules", ".next", "dist", ".turbo"]);
const EXT = [".ts", ".tsx", ".css", ".json"];

function sourceFiles(dir: string): { path: string; bytes: Buffer }[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return EXT.some((e) => p.endsWith(e)) ? [{ path: relative(ROOT, p), bytes: readFileSync(p) }] : [];
  });
}

const files = [
  ...sourceFiles(join(ROOT, "app")),
  ...sourceFiles(join(ROOT, "components")),
  ...sourceFiles(join(ROOT, "lib")),
  ...sourceFiles(join(ROOT, "i18n")),
];

/** Zero-width, bidi and other invisible controls. Built from an escaped string on purpose: writing the
 *  class as a regex literal puts the real characters in this file, which is exactly what it forbids. */
const INVISIBLE = new RegExp(
  "[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u200b-\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\ufeff]",
);

describe("source hygiene", () => {
  it("finds source files to check", () => expect(files.length).toBeGreaterThan(20));

  it("no NUL bytes — the HTML parser rewrites them to U+FFFD and string comparisons stop matching", () => {
    expect(files.filter((f) => f.bytes.includes(0)).map((f) => f.path)).toEqual([]);
  });

  it("no zero-width or bidi control characters", () => {
    const bad = files
      .map((f) => ({ path: f.path, m: f.bytes.toString("utf8").match(INVISIBLE) }))
      .filter((f) => f.m)
      .map((f) => `${f.path}: U+${f.m![0].codePointAt(0)!.toString(16).padStart(4, "0").toUpperCase()}`);
    expect(bad).toEqual([]);
  });
});
