// jobs (pipeline · categorize · status) and actor evaluation
import { Body, Controller, Get, HttpCode, Post, Put, Query } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { ActorEvaluation, ActorsResponse, Platform, RunKind, TriggerResult } from "@pp/contracts";
import { getDb } from "../db/client.js";
import { actorEvaluations, keywords, productGroups } from "../db/schema.js";
import { AppError } from "../common/errors.js";
import { ZodPipe } from "../common/http.js";
import { planRound } from "../domain/budget.js";
import { confirmMissing, smokeCap } from "../domain/guards.js";
import { NOTE } from "../domain/notes.js";
import { PLATFORM_LIST } from "../domain/types.js";
import { chooseManually, evaluateActors } from "../actors/evaluate.js";
import { runCategorize } from "../jobs/categorize.js";
import { triggerPipeline } from "../jobs/pipeline.js";
import { reconcile } from "../jobs/reconcile.js";
import { assertNotRunning, createRun, finishRun, groupBySlug, jobStatus, updateRun } from "../jobs/runs.js";
import { groupMode, monthSpend } from "../jobs/scrape.js";
import { apifyStart } from "../sources/apify.js";
import { getSetting } from "../settings/settings.js";

const platform = z.enum(PLATFORM_LIST as ["douyin", "1688", "temu", "xhs"]);
const KINDS = ["scrape", "categorize", "media", "trend", "evaluate", "smoke", "pipeline"] as const;

const toEval = (r: typeof actorEvaluations.$inferSelect): ActorEvaluation => ({
  id: r.id,
  platform: r.platform as Platform,
  actorId: r.actorId,
  title: r.title,
  evaluatedAt: r.evaluatedAt.toISOString(),
  planTier: r.planTier,
  startFee: r.startFee,
  pricePerResult: r.pricePerResult,
  estCost50: r.estCost50,
  costPerResult50: r.costPerResult50,
  hasSold30d: r.hasSold30d,
  hasSold: r.hasSold,
  hasCategory: r.hasCategory,
  hasImage: r.hasImage,
  hasLink: r.hasLink,
  hasTrend: r.hasTrend,
  needsCookie: r.needsCookie,
  completeness: r.completeness,
  failRate30d: r.failRate30d,
  runs30d: r.runs30d,
  smokeItemsIn: r.smokeItemsIn,
  smokeItemsOut: r.smokeItemsOut,
  smokeCostUsd: r.smokeCostUsd,
  chosen: r.chosen,
  excluded: r.excluded,
  reason: r.reason,
});

@Controller()
export class JobsController {
  @Post("jobs/pipeline")
  @HttpCode(200)
  async pipeline(@Body(new ZodPipe(z.object({ pg: z.string().min(1), confirm: z.boolean().optional() }))) body: { pg: string; confirm?: boolean }): Promise<TriggerResult> {
    const g = await groupBySlug(body.pg); // explicit group only — never the default one
    if (confirmMissing(await groupMode(g), body.confirm)) throw new AppError(400, "errors.confirmRequired");
    return triggerPipeline(g);
  }

  @Post("jobs/categorize")
  @HttpCode(200)
  async categorize(@Body(new ZodPipe(z.object({ pg: z.string().optional(), mode: z.enum(["fill", "retag"]) }))) body: { pg?: string; mode: "fill" | "retag" }) {
    const g = await groupBySlug(body.pg);
    await assertNotRunning(g.id, "categorize");
    const runId = await createRun(await getDb(), { productGroupId: g.id, kind: "categorize", status: "running", step: body.mode });
    void runCategorize(g.id, body.mode, (done, total) => updateRun(runId, { progressDone: done, progressTotal: total }))
      .then((r) => finishRun(runId, r.failed ? "suspect" : "succeeded", r.note, { itemsIn: r.total, itemsOut: r.total }))
      .catch((e) => finishRun(runId, "failed", NOTE.stepFailed("categorize", String(e?.message ?? e).slice(0, 200))));
    return { runId };
  }

  @Get("jobs/status")
  async status(@Query(new ZodPipe(z.object({ pg: z.string().optional(), kind: z.enum(KINDS) }))) q: { pg?: string; kind: RunKind }) {
    void reconcile().catch(() => 0);
    const g = q.kind === "evaluate" ? null : await groupBySlug(q.pg);
    return jobStatus(g?.id ?? null, q.kind);
  }

  @Get("actors")
  async actors(): Promise<ActorsResponse> {
    const db = await getDb();
    const rows = await db.select().from(actorEvaluations).orderBy(desc(actorEvaluations.evaluatedAt));
    const latestAt = new Map<string, number>();
    for (const r of rows) if (!latestAt.has(r.platform)) latestAt.set(r.platform, r.evaluatedAt.getTime());
    const current = rows
      .filter((r) => r.evaluatedAt.getTime() === latestAt.get(r.platform))
      .sort((a, b) => a.platform.localeCompare(b.platform) || Number(b.chosen) - Number(a.chosen) || b.completeness - a.completeness || a.costPerResult50 - b.costPerResult50);
    return { evaluations: current.map(toEval), evaluatedAt: rows[0]?.evaluatedAt.toISOString() ?? null, planTier: rows[0]?.planTier ?? "FREE" };
  }

  /** Free: public Apify API only. Evaluates the platforms that some group actually watches. */
  @Post("actors/evaluate")
  @HttpCode(200)
  async evaluate() {
    await assertNotRunning(null, "evaluate");
    const db = await getDb();
    const platforms = [...new Set((await db.select({ p: productGroups.platforms }).from(productGroups)).flatMap((g) => g.p))] as Platform[];
    const runId = await createRun(db, { kind: "evaluate", status: "running", step: "evaluate" });
    void evaluateActors({ platforms, runId, onProgress: (done, total) => updateRun(runId, { progressDone: done, progressTotal: total }) })
      .then((r) => finishRun(runId, "succeeded", r.note, { itemsOut: r.rows.length }))
      .catch((e) => finishRun(runId, "failed", NOTE.stepFailed("evaluate", String(e?.message ?? e).slice(0, 200))));
    return { runId };
  }

  /** PAID (5 results). Requires confirm:true AND a token; refuses in mock mode / without token. */
  @Post("actors/smoke")
  @HttpCode(200)
  async smoke(@Body(new ZodPipe(z.object({ platform, actorId: z.string().max(200), confirm: z.literal(true) }))) body: { platform: Platform; actorId: string }): Promise<TriggerResult> {
    const token = await getSetting("APIFY_TOKEN");
    if (!token) throw new AppError(400, "errors.actors.needsToken");
    const db = await getDb();
    const [ev] = await db
      .select()
      .from(actorEvaluations)
      .where(and(eq(actorEvaluations.platform, body.platform), eq(actorEvaluations.actorId, body.actorId)))
      .orderBy(desc(actorEvaluations.evaluatedAt))
      .limit(1);
    const template = (ev?.raw as { inputTemplate?: Record<string, unknown> } | null)?.inputTemplate ?? null;
    if (!ev || !template) throw new AppError(400, "errors.actors.noTemplate");
    const [kw] = await db.select().from(keywords).where(eq(keywords.platform, body.platform)).limit(1);
    if (!kw) throw new AppError(400, "errors.actors.noKeyword");
    const g = (await db.select().from(productGroups).where(eq(productGroups.id, kw.productGroupId)))[0];
    if ((await groupMode(g)) === "mock") throw new AppError(400, "errors.actors.mockGroup");
    await assertNotRunning(g.id, "smoke");
    const cap = smokeCap(ev.startFee, ev.pricePerResult);
    const budget = planRound({ budgetUsd: g.monthlyBudgetUsd, spentUsd: await monthSpend(g.id), inFlightUsd: 0, capUsd: Math.max(cap, g.runCapUsd), estimates: [cap] });
    if (!budget.ok) return { runId: null, started: [], skipped: [{ platform: body.platform, keyword: kw.keyword, reason: budget.reason }] };
    const runId = await createRun(db, {
      productGroupId: g.id,
      keyword: kw.keyword,
      platform: body.platform,
      actorId: body.actorId,
      kind: "smoke",
      status: "running",
      costUsd: cap, // provisional until Apify reports the actual cost
    });
    const res = await apifyStart(
      token,
      { platform: body.platform, keyword: kw.keyword, region: kw.region, limit: 5, now: new Date(), actorId: body.actorId, inputTemplate: template, maxTotalChargeUsd: cap },
      await getSetting("APIFY_WEBHOOK_SECRET"),
    );
    if (!res.ok) {
      await finishRun(runId, "failed", NOTE.startFailed(res.reason), { costUsd: 0 });
      return { runId, started: [], skipped: [{ platform: body.platform, keyword: kw.keyword, reason: "skip.startFailed" }] };
    }
    if ("externalRunId" in res) await updateRun(runId, { apifyRunId: res.externalRunId });
    return { runId, started: [{ platform: body.platform, keyword: kw.keyword }], skipped: [] };
  }

  @Put("actors/choose")
  async choose(@Body(new ZodPipe(z.object({ platform, actorId: z.string().max(200) }))) body: { platform: Platform; actorId: string }) {
    const r = await chooseManually(body.platform, body.actorId);
    if (r === "notFound") throw new AppError(404, "errors.actors.notFound");
    if (r === "notChoosable") throw new AppError(400, "errors.actors.notChoosable");
    return { ok: true };
  }
}
