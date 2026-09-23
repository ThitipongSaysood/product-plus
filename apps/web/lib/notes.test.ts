import { describe, expect, it } from "vitest";
import { dict } from "@/i18n/dictionary";
import { parseNote } from "./notes";

// Mirrors apps/api/src/domain/notes.ts NOTE.* outputs.
const SAMPLES: [string, string, Record<string, string>][] = [
  ["Apify reported FAILED.", "notes.apifyReported", { status: "FAILED" }],
  ["The xhs actor could not read this target: login wall", "notes.targetUnreadable", { platform: "xhs", detail: "login wall" }],
  ["The temu actor returned no rows for this keyword.", "notes.noRows", { platform: "temu" }],
  ["The douyin actor returned 12 rows and none could be read.", "notes.noneReadable", { platform: "douyin", n: "12" }],
  ["Run returned 10 products against 50 last time (below the 40% floor).", "notes.belowFloor", { x: "10", y: "50" }],
  ["Read 48 of 50 rows.", "notes.partlyRead", { out: "48", in: "50" }],
  ["Start lost: no Apify run id after 10 minutes.", "notes.startLost", {}],
  ["Timed out: still running after 60 minutes.", "notes.timedOut", {}],
  ["Server restarted while this job was running.", "notes.orphaned", {}],
  ["Could not start the actor: 402", "notes.startFailed", { detail: "402" }],
  ["Categorized 128 products: 40 by platform map, 70 by rules, 0 by AI, 18 unclassified.", "notes.categorized", { n: "128", platform_n: "40", rules: "70", llm: "0", unclassified: "18" }],
  ["AI categorization failed: 429", "notes.llmFailed", { detail: "429" }],
  ["Cached 120 images, 8 failed.", "notes.media", { ok: "120", failed: "8" }],
  ["Pipeline finished: 3 of 4 scrapes succeeded, 1 skipped.", "notes.pipeline", { ok: "3", total: "4", skipped: "1" }],
  ["Step media failed: boom", "notes.stepFailed", { step: "media", detail: "boom" }],
  ["Evaluated 14 actors; chosen: a/b, c/d.", "notes.evaluated", { n: "14", chosen: "a/b, c/d" }],
  ["Highest completeness 4/5 at $0.0023 per result.", "notes.chosenAuto", { completeness: "4", cost: "$0.0023" }],
  ["Chosen manually.", "notes.chosenManual", {}],
  ["Smoke test read 5 of 5 rows for $0.0210.", "notes.smokeCost", { out: "5", in: "5", cost: "$0.0210" }],
  ["Smoke test read 0 of 0 rows.", "notes.smoke", { out: "0", in: "0" }],
  ["Imported from Apify smoke run abc123.", "notes.seededReal", { runId: "abc123" }],
];

describe("parseNote", () => {
  it.each(SAMPLES)("%s", (note, key, vars) => {
    expect(parseNote(note)).toEqual({ key, vars });
    expect(key in dict).toBe(true);
  });
  it("returns null for unknown text", () => expect(parseNote("something new")).toBeNull());
});
