// Diff engine (handoff §3.3): a product is "gone" only after 2 consecutive misses, and only
// counted when the gate says the run is trustworthy (processRetirements).
export const RETIRE_AFTER_MISSES = 2;

export type Existing = { id: string; externalId: string; missedRuns: number };

export function diffRun<T extends Existing>(existing: T[], seenExternalIds: string[], processRetirements: boolean) {
  const seen = new Set(seenExternalIds);
  const known = new Set(existing.map((e) => e.externalId));
  const newIds = [...seen].filter((id) => !known.has(id));
  const kept = existing.filter((e) => seen.has(e.externalId));
  const absent = processRetirements ? existing.filter((e) => !seen.has(e.externalId)) : [];
  const gone = absent.filter((e) => e.missedRuns + 1 >= RETIRE_AFTER_MISSES);
  const missing = absent.filter((e) => e.missedRuns + 1 < RETIRE_AFTER_MISSES);
  return { newIds, kept, missing, gone };
}
