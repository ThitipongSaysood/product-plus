// Run notes are fixed English patterns stored in scrape_runs.note; the web translates them with
// regexes (parseNote). Change a pattern here ⇒ change the web's parser too. List: apps/api/README.md.
const usd = (n: number) => `$${n.toFixed(4)}`;

export const NOTE = {
  apifyStatus: (status: string) => `Apify reported ${status}.`,
  unreadable: (platform: string, detail: string) => `The ${platform} actor could not read this target: ${detail}`,
  noRows: (platform: string) => `The ${platform} actor returned no rows for this keyword.`,
  noneReadable: (platform: string, n: number) => `The ${platform} actor returned ${n} rows and none could be read.`,
  belowFloor: (got: number, prev: number) => `Run returned ${got} products against ${prev} last time (below the 40% floor).`,
  partlyRead: (out: number, inn: number) => `Read ${out} of ${inn} rows.`,
  startLost: () => "Start lost: no Apify run id after 10 minutes.",
  timedOut: () => "Timed out: still running after 60 minutes.",
  orphaned: () => "Server restarted while this job was running.",
  startFailed: (detail: string) => `Could not start the actor: ${detail}`,
  categorized: (n: number, platform: number, rules: number, llm: number, unclassified: number) =>
    `Categorized ${n} products: ${platform} by platform map, ${rules} by rules, ${llm} by AI, ${unclassified} unclassified.`,
  llmFailed: (detail: string) => `AI categorization failed: ${detail}`,
  pipeline: (ok: number, total: number, skipped: number) =>
    `Pipeline finished: ${ok} of ${total} scrapes succeeded, ${skipped} skipped.`,
  stepFailed: (step: string, detail: string) => `Step ${step} failed: ${detail}`,
  evaluated: (n: number, chosen: string) => `Evaluated ${n} actors; chosen: ${chosen}.`,
  chosenAuto: (completeness: number, costPerResult: number) =>
    `Highest completeness ${completeness}/5 at ${usd(costPerResult)} per result.`,
  chosenVerified: (completeness: number, costPerResult: number) =>
    `Verified by smoke test; completeness ${completeness}/5 at ${usd(costPerResult)} per result.`,
  chosenManual: () => "Chosen manually.",
  smoke: (out: number, inn: number, cost: number | null) =>
    `Smoke test read ${out} of ${inn} rows${cost === null ? "" : ` for ${usd(cost)}`}.`,
} as const;
