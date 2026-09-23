import type { DictKey } from "@/i18n";

// Run notes / actor reasons are fixed EN patterns from apps/api/src/domain/notes.ts (NOTE.*) → dict key + vars.
// Keep in sync with that file. Unknown text is shown as-is rather than hidden.
const PATTERNS: [RegExp, DictKey, string[]][] = [
  [/^Apify reported (\w+)\.?$/, "notes.apifyReported", ["status"]],
  [/^The (\S+) actor could not read this target: (.*)$/, "notes.targetUnreadable", ["platform", "detail"]],
  [/^The (\S+) actor returned no rows for this keyword\.?$/, "notes.noRows", ["platform"]],
  [/^The (\S+) actor returned (\d+) rows and none could be read\.?$/, "notes.noneReadable", ["platform", "n"]],
  [/^Run returned (\d+) products against (\d+) last time \(below the 40% floor\)\.?$/, "notes.belowFloor", ["x", "y"]],
  [/^Read (\d+) of (\d+) rows\.?$/, "notes.partlyRead", ["out", "in"]],
  [/^Start lost/, "notes.startLost", []],
  [/^Timed out/, "notes.timedOut", []],
  [/^Server restarted while this job was running/, "notes.orphaned", []],
  [/^Could not start the actor: (.*)$/, "notes.startFailed", ["detail"]],
  [/^Categorized (\d+) products: (\d+) by platform map, (\d+) by rules, (\d+) by AI, (\d+) unclassified\.?$/, "notes.categorized", ["n", "platform_n", "rules", "llm", "unclassified"]],
  [/^AI categorization failed: (.*)$/, "notes.llmFailed", ["detail"]],
  [/^Cached (\d+) images, (\d+) failed\.?$/, "notes.media", ["ok", "failed"]],
  [/^Pipeline finished: (\d+) of (\d+) scrapes succeeded, (\d+) skipped\.?$/, "notes.pipeline", ["ok", "total", "skipped"]],
  [/^Step (\S+) failed: (.*)$/, "notes.stepFailed", ["step", "detail"]],
  [/^Evaluated (\d+) actors; chosen: (.*?)\.?$/, "notes.evaluated", ["n", "chosen"]],
  [/^Highest completeness (\d)\/5 at (\$\d+(?:\.\d+)?) per result\.?$/, "notes.chosenAuto", ["completeness", "cost"]],
  [/^Verified by smoke test; completeness (\d)\/5 at (\$\d+(?:\.\d+)?) per result\.?$/, "notes.chosenVerified", ["completeness", "cost"]],
  [/^Chosen manually\.?$/, "notes.chosenManual", []],
  [/^Smoke test read (\d+) of (\d+) rows for (\$\d+(?:\.\d+)?)\.?$/, "notes.smokeCost", ["out", "in", "cost"]],
  [/^Smoke test read (\d+) of (\d+) rows\.?$/, "notes.smoke", ["out", "in"]],
  [/^Imported from Apify smoke run (\S+?)\.?$/, "notes.seededReal", ["runId"]],
];

export function parseNote(note: string | null | undefined): { key: DictKey; vars: Record<string, string> } | null {
  if (!note) return null;
  const s = note.trim();
  for (const [re, key, names] of PATTERNS) {
    const m = s.match(re);
    if (m) return { key, vars: Object.fromEntries(names.map((n, i) => [n, m[i + 1] ?? ""])) };
  }
  return null;
}
