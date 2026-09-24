// Keyword trial (CONTEXT.md): a 5-listing preview of a candidate Keyword on one platform, run by the
// platform's chosen actor. Paid in an apify group, free and inline in a mock group. Its listings live on
// the run row (scrape_runs.trial_items) and NEVER reach products/snapshots/media — a Round is the only
// way listings enter a Group.
import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { KeywordTrialResult, KeywordTrialsResponse, Platform, RunStatus, TrialItem, TrialRun } from "@pp/contracts";
import { getDb } from "../db/client.js";
import { scrapeRuns } from "../db/schema.js";
import { parseRelatedKeywords, planTrials, toTrialItem, TRIAL_KEEP_MS, TRIAL_LIMIT } from "../domain/keywords.js";
import { NOTE } from "../domain/notes.js";
import { normalizeRows } from "../domain/normalize/index.js";
import { smokeCap } from "../domain/guards.js";
import { apifyStart } from "../sources/apify.js";
import { MOCK_ACTOR, mockStart } from "../sources/mock.js";
import { getSetting } from "../settings/settings.js";
import { createRun, finishRun, updateRun, type GroupRecord } from "./runs.js";
import { APIFY_CONCURRENCY, chosenActor, groupMode, monthSpend } from "./scrape.js";

/** Normalize, cut to 5 and store on the run row. Shared by the mock (inline) and apify (reconcile/webhook) paths. */
export async function finishTrial(
  run: { id: string; platform: string | null; keyword: string | null },
  res: { apifyStatus?: string; rows: unknown[]; record?: unknown },
  costUsd: number | null,
  costFinal: boolean,
) {
  const { items, itemsIn } = normalizeRows(run.platform as Platform, res.rows, run.keyword ?? "", TRIAL_LIMIT);
  const trialItems: TrialItem[] = items.slice(0, TRIAL_LIMIT).map(toTrialItem);
  const related = parseRelatedKeywords(res.record);
  const failed = res.apifyStatus !== undefined && res.apifyStatus !== "SUCCEEDED";
  const status: RunStatus = failed ? "failed" : trialItems.length === 0 ? "suspect" : "succeeded";
  await finishRun(run.id, status, failed ? NOTE.apifyStatus(res.apifyStatus!) : NOTE.partlyRead(trialItems.length, itemsIn), {
    itemsIn,
    itemsOut: trialItems.length,
    costUsd,
    costFinal,
    trialItems,
    ...(related.length ? { relatedKeywords: related } : {}),
  });
}

/** Per-platform hard cap of one trial; null = no chosen actor. */
export async function trialEstimates(g: GroupRecord) {
  const mock = (await groupMode(g)) === "mock";
  const out: KeywordTrialsResponse["estimates"] = {};
  for (const p of g.platforms as Platform[]) {
    const a = mock ? null : await chosenActor(p);
    out[p] = mock ? 0 : a && a.pricePerResult > 0 ? smokeCap(a.startFee, a.pricePerResult) : null;
  }
  return out;
}

/** Guards run in the controller (confirm, count, token). Here: actor → concurrency → monthly budget. */
export async function startTrials(g: GroupRecord, items: { platform: Platform; keyword: string; region?: string | null }[], now = new Date()): Promise<KeywordTrialResult> {
  const db = await getDb();
  const mock = (await groupMode(g)) === "mock";
  const actors = new Map<Platform, Awaited<ReturnType<typeof chosenActor>>>();
  for (const p of new Set(items.map((i) => i.platform))) actors.set(p, mock ? { actorId: MOCK_ACTOR, inputTemplate: null, startFee: 0, pricePerResult: 0 } : await chosenActor(p));
  const running = await db
    .select({ groupId: scrapeRuns.productGroupId, apify: scrapeRuns.apifyRunId, cost: scrapeRuns.costUsd })
    .from(scrapeRuns)
    .where(and(inArray(scrapeRuns.kind, ["scrape", "smoke", "trial"]), eq(scrapeRuns.status, "running")));
  const inFlightUsd = running.filter((r) => r.groupId === g.id).reduce((s, r) => s + (r.cost ?? 0), 0);
  const plan = planTrials({
    items,
    mock,
    // an actor without an input template cannot be started, which is the same as having none
    pricing: (p) => {
      const a = actors.get(p);
      return a && (mock || a.inputTemplate) ? a : null;
    },
    budgetUsd: g.monthlyBudgetUsd,
    spentUsd: (await monthSpend(g.id, now)) - inFlightUsd, // monthSpend already includes the in-flight provisional costs
    inFlightUsd,
    slots: APIFY_CONCURRENCY - running.filter((r) => r.apify !== null).length,
  });
  const out: KeywordTrialResult = { runIds: [], started: [], skipped: plan.skipped.map(({ platform, keyword, reason }) => ({ platform, keyword, reason })) };
  const token = mock ? null : await getSetting("APIFY_TOKEN");
  const webhookSecret = await getSetting("APIFY_WEBHOOK_SECRET");
  for (const t of plan.targets) {
    const actor = actors.get(t.platform)!;
    const region = t.platform === "temu" ? t.region ?? null : null;
    const runId = await createRun(db, {
      productGroupId: g.id,
      keyword: t.keyword,
      platform: t.platform,
      actorId: actor.actorId,
      kind: "trial",
      status: "running",
      startedAt: now,
      costUsd: t.capUsd, // provisional = the cap Apify may charge; replaced by the actual cost
    });
    out.runIds.push(runId);
    const target = { platform: t.platform, keyword: t.keyword, region, limit: TRIAL_LIMIT, now, actorId: actor.actorId, inputTemplate: actor.inputTemplate, maxTotalChargeUsd: t.capUsd };
    try {
      const res = mock ? await mockStart(target) : await apifyStart(token!, target, webhookSecret);
      if (!res.ok) {
        await finishRun(runId, "failed", NOTE.startFailed(res.reason), { costUsd: 0 });
        out.skipped.push({ platform: t.platform, keyword: t.keyword, reason: "skip.startFailed" });
        continue;
      }
      if ("inline" in res) await finishTrial({ id: runId, platform: t.platform, keyword: t.keyword }, { rows: res.inline.rows }, res.inline.costUsd, true);
      else await updateRun(runId, { apifyRunId: res.externalRunId });
      out.started.push({ platform: t.platform, keyword: t.keyword });
    } catch (e) {
      await finishRun(runId, "failed", NOTE.startFailed((e as Error).message.slice(0, 200)), { costUsd: 0 });
      out.skipped.push({ platform: t.platform, keyword: t.keyword, reason: "skip.startFailed" });
    }
  }
  return out;
}

/** Recent trials, newest first. Also drops the stored listings of trials past the 7-day retention —
 *  the row (and its cost) stays, only the preview goes. */
export async function listTrials(g: GroupRecord, since: Date | null, now = new Date()): Promise<TrialRun[]> {
  const db = await getDb();
  const cutoff = new Date(now.getTime() - TRIAL_KEEP_MS);
  await db
    .update(scrapeRuns)
    .set({ trialItems: null })
    .where(and(eq(scrapeRuns.kind, "trial"), lt(scrapeRuns.startedAt, cutoff), isNotNull(scrapeRuns.trialItems)));
  const from = since && since > cutoff ? since : cutoff;
  const rows = await db
    .select()
    .from(scrapeRuns)
    .where(and(eq(scrapeRuns.productGroupId, g.id), eq(scrapeRuns.kind, "trial"), gte(scrapeRuns.startedAt, from)))
    .orderBy(desc(scrapeRuns.startedAt), sql`${scrapeRuns.platform}`)
    .limit(50);
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform as Platform,
    keyword: r.keyword ?? "",
    status: r.status as RunStatus,
    costUsd: r.costUsd,
    note: r.note,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    items: (r.trialItems as TrialItem[] | null) ?? null,
  }));
}
