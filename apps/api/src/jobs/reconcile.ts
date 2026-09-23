// Finishing Apify runs without trusting the webhook: poll run status, START-LOST after 10 min
// without an external id, TIMED-OUT after 60 min. closeOrphaned() is ONLY for in-process jobs
// (Apify runs keep going while this server restarts).
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { actorEvaluations, scrapeRuns } from "../db/schema.js";
import { NOTE } from "../domain/notes.js";
import { normalizeRows } from "../domain/normalize/index.js";
import type { Platform } from "@pp/contracts";
import { apifyFetch } from "../sources/apify.js";
import type { FetchResult } from "../sources/types.js";
import { getSetting } from "../settings/settings.js";
import { ingestRun } from "./ingest.js";
import { finishRun, type RunRecord } from "./runs.js";

const START_LOST_MS = 10 * 60_000;
const TIMED_OUT_MS = 60 * 60_000;
const IN_PROCESS = ["pipeline", "categorize", "media", "trend", "evaluate"];

export async function finishApifyRun(run: RunRecord, res: Extract<FetchResult, { finished: true }>) {
  if (run.kind === "scrape") return ingestRun(run.id, { rows: res.rows, costUsd: res.costUsd, apifyStatus: res.apifyStatus });
  // smoke: record what the actor really returned against the evaluation row
  const { items, itemsIn } = normalizeRows(run.platform as Platform, res.rows, run.keyword ?? "", 5);
  const db = await getDb();
  await db
    .update(actorEvaluations)
    .set({ smokeItemsIn: itemsIn, smokeItemsOut: items.length, smokeCostUsd: res.costUsd })
    .where(and(eq(actorEvaluations.platform, run.platform!), eq(actorEvaluations.actorId, run.actorId!)));
  const status = res.apifyStatus !== "SUCCEEDED" ? "failed" : items.length === 0 ? "suspect" : "succeeded";
  await finishRun(run.id, status, status === "failed" ? NOTE.apifyStatus(res.apifyStatus) : NOTE.smoke(items.length, itemsIn, res.costUsd), {
    itemsIn,
    itemsOut: items.length,
    costUsd: res.costUsd,
  });
  return { ignored: false };
}

let inFlight: Promise<number> | null = null;

export function reconcile(now = new Date()): Promise<number> {
  inFlight ??= doReconcile(now).finally(() => (inFlight = null));
  return inFlight;
}

async function doReconcile(now: Date) {
  const db = await getDb();
  const running = await db
    .select()
    .from(scrapeRuns)
    .where(and(inArray(scrapeRuns.kind, ["scrape", "smoke"]), eq(scrapeRuns.status, "running")));
  const token = await getSetting("APIFY_TOKEN");
  let closed = 0;
  for (const run of running) {
    const age = now.getTime() - run.startedAt.getTime();
    if (!run.apifyRunId) {
      if (age > START_LOST_MS) {
        await finishRun(run.id, "failed", NOTE.startLost());
        closed++;
      }
      continue;
    }
    if (token) {
      try {
        const res = await apifyFetch(token, run.apifyRunId, 50);
        if (res.finished) {
          await finishApifyRun(run, res);
          closed++;
          continue;
        }
      } catch {
        // network hiccup — try again on the next poll
      }
    }
    if (age > TIMED_OUT_MS) {
      await finishRun(run.id, "failed", NOTE.timedOut());
      closed++;
    }
  }
  return closed;
}

export async function closeOrphaned() {
  const db = await getDb();
  await db
    .update(scrapeRuns)
    .set({ status: "failed", note: NOTE.orphaned(), finishedAt: new Date(), step: null })
    .where(and(inArray(scrapeRuns.kind, IN_PROCESS), eq(scrapeRuns.status, "running")));
  // mock scrapes are in-process too (they never get an external id)
  await db
    .update(scrapeRuns)
    .set({ status: "failed", note: NOTE.orphaned(), finishedAt: new Date(), step: null })
    .where(and(eq(scrapeRuns.kind, "scrape"), eq(scrapeRuns.actorId, "mock"), eq(scrapeRuns.status, "running"), isNull(scrapeRuns.apifyRunId)));
}
