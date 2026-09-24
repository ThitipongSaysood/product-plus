// Live source. start() only launches the actor and returns its run id; the run is finished by the
// webhook (when PUBLIC_URL is set) or by reconcile polling. NEVER call start() without the user's OK:
// every start costs money (handoff rule 0.3). Nothing in this repo calls it automatically except
// the scheduled weekly pipeline, which only runs in apify mode with a token and a budget.
import { ApifyClient } from "apify-client";
import { fill } from "../domain/fill.js";
import type { FetchResult, ScrapeTarget, StartResult } from "./types.js";

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"]);

export async function apifyStart(token: string, t: ScrapeTarget, webhookSecret: string | null): Promise<StartResult> {
  if (!t.inputTemplate) return { ok: false, reason: "no input template for this actor" };
  const input = fill(t.inputTemplate, { keyword: t.keyword, limit: t.limit, region: t.region });
  const base = process.env.PUBLIC_URL;
  try {
    const client = new ApifyClient({ token });
    const run = await client.actor(t.actorId).start(input, {
      maxItems: t.limit,
      ...(t.maxTotalChargeUsd != null ? { maxTotalChargeUsd: t.maxTotalChargeUsd } : {}),
      ...(base && webhookSecret
        ? {
            webhooks: [
              {
                eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"],
                requestUrl: `${base.replace(/\/$/, "")}/api/webhooks/apify?secret=${encodeURIComponent(webhookSecret)}`,
              },
            ],
          }
        : {}),
    });
    return { ok: true, externalRunId: run.id };
  } catch (e) {
    return { ok: false, reason: (e as Error).message.slice(0, 200) };
  }
}

/** The run's default key-value store may hold extra output; XHS actors write RELATED_KEYWORDS there. */
export const relatedKeyFor = (platform: string | null) => (platform === "xhs" ? "RELATED_KEYWORDS" : undefined);

export async function apifyFetch(token: string, runId: string, limit: number, recordKey?: string): Promise<FetchResult> {
  const client = new ApifyClient({ token });
  const run = await client.run(runId).get();
  if (!run || !TERMINAL.has(run.status)) return { finished: false };
  const rows = run.defaultDatasetId ? (await client.dataset(run.defaultDatasetId).listItems({ limit: limit * 3 })).items : [];
  const charged = (run as { chargedEventCounts?: Record<string, number> }).chargedEventCounts ?? null;
  // Best effort: a missing record or store is normal and must never fail the run.
  const record =
    recordKey && run.defaultKeyValueStoreId
      ? await client.keyValueStore(run.defaultKeyValueStoreId).getRecord(recordKey).then((r) => r?.value ?? null, () => null)
      : null;
  return { finished: true, apifyStatus: run.status, rows, costUsd: typeof run.usageTotalUsd === "number" ? run.usageTotalUsd : null, charged, record };
}
