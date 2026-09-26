// One-button pipeline: scrape → (wait for Apify) → categorize → media → trend. Named steps are stored
// in scrape_runs.step; each step is isolated so one failure doesn't sink the rest. The HTTP call
// returns after planning (< 1 s); drive() keeps going in the background.
import { and, eq, inArray } from "drizzle-orm";
import type { TriggerResult } from "@pp/contracts";
import { getDb } from "../db/client.js";
import { scrapeRuns } from "../db/schema.js";
import { NOTE } from "../domain/notes.js";
import { isUniqueViolation } from "../domain/guards.js";
import { AppError } from "../common/errors.js";
import { runAutoCategorize } from "./auto-categorize.js";
import { aiCategorizeBackend, runCategorize } from "./categorize.js";
import { cacheMedia } from "./media.js";
import { reconcile } from "./reconcile.js";
import { assertNotRunning, createRun, finishRun, PIPELINE_STEPS, updateRun, type GroupRecord } from "./runs.js";
import { planScrape, startTargets } from "./scrape.js";
import { refreshTrends } from "./trend.js";

const WAIT_MAX_MS = 12 * 60_000;
const POLL_MS = 15_000;

export async function triggerPipeline(g: GroupRecord, opts: { now?: Date; wait?: boolean } = {}): Promise<TriggerResult> {
  const now = opts.now ?? new Date();
  await assertNotRunning(g.id, "pipeline");
  const plan = await planScrape(g, now);
  const db = await getDb();
  let runId: string;
  try {
    runId = await createRun(db, {
      productGroupId: g.id,
      kind: "pipeline",
      status: "running",
      step: PIPELINE_STEPS[0],
      progressDone: 0,
      progressTotal: PIPELINE_STEPS.length,
      startedAt: now,
    });
  } catch (e) {
    // partial unique index: one running pipeline per group, even when two requests race past the check
    if (isUniqueViolation(e)) throw new AppError(400, "errors.job.alreadyRunning");
    throw e;
  }
  const p = drive(g, plan, runId, now).catch((e) => finishRun(runId, "failed", NOTE.stepFailed("pipeline", String((e as Error).message).slice(0, 200))));
  if (opts.wait) await p;
  else void p;
  return { ...plan.result, runId };
}

async function drive(g: GroupRecord, plan: Awaited<ReturnType<typeof planScrape>>, runId: string, now: Date) {
  let failedStep: string | null = null;
  const step = async (i: number, name: string, fn: () => Promise<unknown>) => {
    await updateRun(runId, { step: name, progressDone: i });
    try {
      await fn();
    } catch (e) {
      failedStep ??= NOTE.stepFailed(name, (e as Error).message.slice(0, 200));
      console.error(`[pipeline] ${name}`, e);
    }
  };
  let childIds: string[] = [];
  await step(0, "scrape", async () => {
    childIds = await startTargets(g, plan.mode, plan.targets, now, runId);
    const db = await getDb();
    const deadline = Date.now() + WAIT_MAX_MS;
    while (childIds.length && Date.now() < deadline) {
      const still = await db
        .select({ id: scrapeRuns.id })
        .from(scrapeRuns)
        .where(and(inArray(scrapeRuns.id, childIds), eq(scrapeRuns.status, "running")));
      if (!still.length) break;
      await new Promise((r) => setTimeout(r, POLL_MS));
      await reconcile();
    }
  });
  // With an AI engine ready, a round sorts itself like "Let AI sort everything": new kinds of listing get
  // new taxonomy lines (marked addedBy "ai", editable in the text box) and everything is sorted into them —
  // the merchant types a keyword and gets a sorted catalogue. Without one, rules and the platform map only.
  await step(1, "categorize", async () => {
    if (!(await aiCategorizeBackend())) return runCategorize(g.id, "fill");
    const r = await runAutoCategorize(g.id, undefined, "fill");
    // each AI step catches its own error so the others still run; surface it on the round
    if (r.failed) throw new Error(r.note ?? "AI sort failed");
  });
  await step(2, "media", () => cacheMedia(g.id));
  await step(3, "trend", () => refreshTrends(g.id));

  const db = await getDb();
  const children = childIds.length ? await db.select({ status: scrapeRuns.status }).from(scrapeRuns).where(inArray(scrapeRuns.id, childIds)) : [];
  const ok = children.filter((c) => c.status === "succeeded").length;
  const status = failedStep || ok < children.length ? (children.length && ok === 0 ? "failed" : "suspect") : "succeeded";
  await finishRun(runId, status, failedStep ?? NOTE.pipeline(ok, children.length, plan.result.skipped.length), {
    progressDone: PIPELINE_STEPS.length,
    finishedAt: now.getTime() > Date.now() - 60_000 ? new Date() : now,
  });
}
