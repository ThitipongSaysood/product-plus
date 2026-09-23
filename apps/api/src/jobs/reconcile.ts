// Finishing Apify runs without trusting the webhook: poll run status, START-LOST after 10 min
// without an external id, TIMED-OUT after 60 min. closeOrphaned() is ONLY for in-process jobs
// (Apify runs keep going while this server restarts).
import { and, desc, eq, gte, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { actorEvaluations, scrapeRuns } from "../db/schema.js";
import { NOTE } from "../domain/notes.js";
import { normalizeRows } from "../domain/normalize/index.js";
import { costFromEvents } from "../domain/cost.js";
import type { Platform } from "@pp/contracts";
import { apifyFetch } from "../sources/apify.js";
import type { FetchResult } from "../sources/types.js";
import { getSetting } from "../settings/settings.js";
import { ingestRun } from "./ingest.js";
import { finishRun, type RunRecord } from "./runs.js";

const START_LOST_MS = 10 * 60_000;
const TIMED_OUT_MS = 60 * 60_000;
const IN_PROCESS = ["pipeline", "categorize", "media", "trend", "evaluate"];

/** Actual cost: usageTotalUsd, else chargedEventCounts × evaluated prices, else null (keep provisional). */
async function actualCost(run: RunRecord, res: Extract<FetchResult, { finished: true }>) {
  if (res.costUsd !== null) return res.costUsd;
  const db = await getDb();
  const [ev] = await db
    .select({ raw: actorEvaluations.raw })
    .from(actorEvaluations)
    .where(and(eq(actorEvaluations.platform, run.platform ?? ""), eq(actorEvaluations.actorId, run.actorId ?? "")))
    .orderBy(desc(actorEvaluations.evaluatedAt))
    .limit(1);
  const events = (ev?.raw as { events?: { name: string; priceUsd: number | null }[] } | null)?.events ?? [];
  return costFromEvents(res.charged, events);
}

export async function finishApifyRun(run: RunRecord, res: Extract<FetchResult, { finished: true }>) {
  const cost = await actualCost(run, res);
  if (run.status !== "running") {
    // closed already (TIMED-OUT / START-LOST / earlier webhook): cost-only update, never re-ingest
    if (cost !== null) await (await getDb()).update(scrapeRuns).set({ costUsd: cost }).where(eq(scrapeRuns.id, run.id));
    return { ignored: true as const };
  }
  if (run.kind === "scrape") return ingestRun(run.id, { rows: res.rows, costUsd: cost ?? run.costUsd, apifyStatus: res.apifyStatus });
  // smoke: record what the actor really returned against the evaluation row
  const { items, itemsIn } = normalizeRows(run.platform as Platform, res.rows, run.keyword ?? "", 5);
  const db = await getDb();
  await db
    .update(actorEvaluations)
    .set({ smokeItemsIn: itemsIn, smokeItemsOut: items.length, smokeCostUsd: cost ?? run.costUsd })
    .where(and(eq(actorEvaluations.platform, run.platform!), eq(actorEvaluations.actorId, run.actorId!)));
  const status = res.apifyStatus !== "SUCCEEDED" ? "failed" : items.length === 0 ? "suspect" : "succeeded";
  await finishRun(run.id, status, status === "failed" ? NOTE.apifyStatus(res.apifyStatus) : NOTE.smoke(items.length, itemsIn, cost ?? run.costUsd), {
    itemsIn,
    itemsOut: items.length,
    costUsd: cost ?? run.costUsd,
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
  // running runs + runs we closed as TIMED-OUT in the last 24 h (Apify may still finish them: cost-only update)
  // ponytail: those are re-polled every reconcile for 24 h; add an "actual cost known" flag if that gets chatty.
  const running = await db
    .select()
    .from(scrapeRuns)
    .where(
      and(
        inArray(scrapeRuns.kind, ["scrape", "smoke"]),
        or(
          eq(scrapeRuns.status, "running"),
          and(eq(scrapeRuns.note, NOTE.timedOut()), isNotNull(scrapeRuns.apifyRunId), gte(scrapeRuns.finishedAt, new Date(now.getTime() - 86_400_000))),
        ),
      ),
    );
  const token = await getSetting("APIFY_TOKEN");
  let closed = 0;
  for (const run of running) {
    const age = now.getTime() - run.startedAt.getTime();
    if (!run.apifyRunId) {
      if (run.status === "running" && age > START_LOST_MS) {
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
    if (run.status === "running" && age > TIMED_OUT_MS) {
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
