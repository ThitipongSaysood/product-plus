// Scrape trigger: 1 run = 1 platform × 1 keyword. Guards in order: source/token/actor → budget →
// already running → Apify concurrency (5). Every skip carries a dict-key reason; the button reads it.
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Platform, SourceMode, TriggerResult } from "@pp/contracts";
import { getDb } from "../db/client.js";
import { actorEvaluations, keywords, scrapeRuns } from "../db/schema.js";
import { budgetState, monthStartBangkok, splitRunCap } from "../domain/budget.js";
import { MAX_RESULTS } from "../domain/types.js";
import { NOTE } from "../domain/notes.js";
import { apifyStart } from "../sources/apify.js";
import { MOCK_ACTOR, mockStart } from "../sources/mock.js";
import { getSetting, sourceMode } from "../settings/settings.js";
import { ingestRun } from "./ingest.js";
import { createRun, finishRun, updateRun, type GroupRecord } from "./runs.js";

export const APIFY_CONCURRENCY = 5;

export async function groupMode(g: GroupRecord): Promise<SourceMode> {
  return g.sourceMode === "mock" || g.sourceMode === "apify" ? g.sourceMode : sourceMode();
}

export async function monthSpend(groupId: string, now = new Date()) {
  const db = await getDb();
  const [r] = await db
    .select({ s: sql<string>`coalesce(sum(${scrapeRuns.costUsd}), 0)` })
    .from(scrapeRuns)
    .where(and(eq(scrapeRuns.productGroupId, groupId), gte(scrapeRuns.startedAt, monthStartBangkok(now))));
  return Number(r.s);
}

export async function chosenActor(platform: Platform) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(actorEvaluations)
    .where(and(eq(actorEvaluations.platform, platform), eq(actorEvaluations.chosen, true)))
    .orderBy(desc(actorEvaluations.evaluatedAt))
    .limit(1);
  if (!row) return null;
  const raw = row.raw as { inputTemplate?: Record<string, unknown> } | null;
  return { actorId: row.actorId, inputTemplate: raw?.inputTemplate ?? null, startFee: row.startFee, pricePerResult: row.pricePerResult };
}

type Target = {
  keywordId: string;
  platform: Platform;
  keyword: string;
  region: string | null;
  actorId: string;
  inputTemplate: Record<string, unknown> | null;
  estimateUsd: number;
  maxTotalChargeUsd: number | null;
};

export async function planScrape(g: GroupRecord, now = new Date()) {
  const db = await getDb();
  const mode = await groupMode(g);
  const kws = (await db.select().from(keywords).where(and(eq(keywords.productGroupId, g.id), eq(keywords.enabled, true)))).filter((k) =>
    g.platforms.includes(k.platform),
  );
  const out: TriggerResult = { runId: null, started: [], skipped: [] };
  const targets: Target[] = [];
  const skip = (k: { platform: string; keyword: string }, reason: string) =>
    out.skipped.push({ platform: k.platform as Platform, keyword: k.keyword, reason });

  const token = mode === "apify" ? await getSetting("APIFY_TOKEN") : null;
  const over = budgetState(await monthSpend(g.id, now), g.monthlyBudgetUsd).over;
  const running = await db
    .select({ platform: scrapeRuns.platform, keyword: scrapeRuns.keyword, groupId: scrapeRuns.productGroupId, apify: scrapeRuns.apifyRunId })
    .from(scrapeRuns)
    .where(and(inArray(scrapeRuns.kind, ["scrape", "smoke"]), eq(scrapeRuns.status, "running")));
  let slots = APIFY_CONCURRENCY - running.filter((r) => r.apify !== null).length;

  for (const k of kws) {
    const platform = k.platform as Platform;
    if (mode === "apify" && !token) {
      skip(k, "skip.noToken");
      continue;
    }
    const actor = mode === "mock" ? { actorId: MOCK_ACTOR, inputTemplate: null, startFee: 0, pricePerResult: 0 } : await chosenActor(platform);
    if (!actor) {
      skip(k, "skip.noActor");
      continue;
    }
    if (over) {
      skip(k, "skip.budget");
      continue;
    }
    if (running.some((r) => r.groupId === g.id && r.platform === platform && r.keyword === k.keyword)) {
      skip(k, "skip.alreadyRunning");
      continue;
    }
    if (mode === "apify" && slots <= 0) {
      skip(k, "skip.concurrency");
      continue;
    }
    if (mode === "apify") slots--;
    const limit = Math.min(g.resultLimit, MAX_RESULTS);
    targets.push({
      keywordId: k.id,
      platform,
      keyword: k.keyword,
      region: k.region,
      actorId: actor.actorId,
      inputTemplate: actor.inputTemplate,
      estimateUsd: actor.startFee + limit * actor.pricePerResult,
      maxTotalChargeUsd: null,
    });
  }
  // per-round spend cap: estimate the whole round; too expensive → skip everything, else give each
  // actor its share of the cap as Apify's maxTotalChargeUsd so Apify itself stops billing there.
  if (mode === "apify" && targets.length) {
    const split = splitRunCap(g.runCapUsd, targets.map((t) => t.estimateUsd));
    if (!split.ok) {
      for (const t of targets) skip(t, "skip.runCap");
      return { mode, targets: [], result: out, estimateUsd: split.total };
    }
    targets.forEach((t, i) => (t.maxTotalChargeUsd = split.shares[i]));
  }
  out.started.push(...targets.map((t) => ({ platform: t.platform, keyword: t.keyword })));
  return { mode, targets, result: out, estimateUsd: targets.reduce((s, t) => s + t.estimateUsd, 0) };
}

/** Insert the run rows and start each target. Mock ingests inline; apify waits for webhook/reconcile. */
export async function startTargets(g: GroupRecord, mode: SourceMode, targets: Target[], now: Date, parentRunId: string | null) {
  const db = await getDb();
  const token = mode === "apify" ? await getSetting("APIFY_TOKEN") : null;
  const webhookSecret = await getSetting("APIFY_WEBHOOK_SECRET");
  const runIds: string[] = [];
  for (const t of targets) {
    const limit = Math.min(g.resultLimit, MAX_RESULTS);
    const runId = await createRun(db, {
      productGroupId: g.id,
      keywordId: t.keywordId,
      keyword: t.keyword,
      platform: t.platform,
      actorId: t.actorId,
      kind: "scrape",
      parentRunId,
      status: "running",
      startedAt: now,
    });
    runIds.push(runId);
    const target = { ...t, limit, now };
    try {
      const res = mode === "mock" ? await mockStart(target) : await apifyStart(token!, target, webhookSecret);
      if (!res.ok) await finishRun(runId, "failed", NOTE.startFailed(res.reason));
      else if ("inline" in res) await ingestRun(runId, { rows: res.inline.rows, costUsd: res.inline.costUsd }, now);
      else await updateRun(runId, { apifyRunId: res.externalRunId });
    } catch (e) {
      await finishRun(runId, "failed", NOTE.startFailed((e as Error).message.slice(0, 200)));
    }
  }
  return runIds;
}
