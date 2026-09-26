import { and, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { AI_RUN_KINDS, type AiActivity, type AiRunKind, type JobProgress, type JobStatus, type RunKind, type RunRow, type RunStatus } from "@pp/contracts";
import { getDb, type DbOrTx } from "../db/client.js";
import { productGroups, scrapeRuns } from "../db/schema.js";
import { AppError } from "../common/errors.js";

export type RunRecord = typeof scrapeRuns.$inferSelect;
export type GroupRecord = typeof productGroups.$inferSelect;

export async function groupBySlug(slug: string | undefined | null): Promise<GroupRecord> {
  const db = await getDb();
  const [g] = slug
    ? await db.select().from(productGroups).where(eq(productGroups.slug, slug))
    : await db.select().from(productGroups).orderBy(productGroups.createdAt).limit(1);
  if (!g) throw new AppError(404, "errors.group.notFound");
  return g;
}

export async function createRun(db: DbOrTx, values: typeof scrapeRuns.$inferInsert): Promise<string> {
  const [r] = await db.insert(scrapeRuns).values(values).returning({ id: scrapeRuns.id });
  return r.id;
}

export async function updateRun(id: string, set: Partial<typeof scrapeRuns.$inferInsert>) {
  const db = await getDb();
  await db.update(scrapeRuns).set(set).where(eq(scrapeRuns.id, id));
}

export async function finishRun(id: string, status: Exclude<RunStatus, "running">, note: string | null, extra: Partial<typeof scrapeRuns.$inferInsert> = {}) {
  await updateRun(id, { status, note, finishedAt: new Date(), step: null, ...extra });
}

export const toRunRow = (r: RunRecord): RunRow => ({
  id: r.id,
  kind: r.kind as RunKind,
  platform: (r.platform as RunRow["platform"]) ?? null,
  keyword: r.keyword,
  actorId: r.actorId,
  status: r.status as RunStatus,
  step: r.step,
  itemsIn: r.itemsIn,
  itemsOut: r.itemsOut,
  costUsd: r.costUsd,
  note: r.note,
  startedAt: r.startedAt.toISOString(),
  finishedAt: r.finishedAt?.toISOString() ?? null,
});

export async function listRuns(groupId: string, limit: number) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(scrapeRuns)
    .where(or(eq(scrapeRuns.productGroupId, groupId), isNull(scrapeRuns.productGroupId)))
    .orderBy(desc(scrapeRuns.startedAt))
    .limit(limit);
  return rows.map(toRunRow);
}

export const PIPELINE_STEPS = ["scrape", "categorize", "media", "trend"] as const;
const LAST_WINDOW_MS = 30 * 60_000;

/** Three progress shapes, never mixed: count (real counts) > steps (finished steps) > time (pct null if unknown). */
function progressOf(r: RunRecord): JobProgress {
  if (r.kind === "pipeline")
    return { shape: "steps", done: r.progressDone ?? 0, total: r.progressTotal ?? PIPELINE_STEPS.length, step: r.step ?? "scrape" };
  if (r.progressTotal !== null && r.progressTotal > 0)
    return { shape: "count", done: r.progressDone ?? 0, total: r.progressTotal, label: r.step ?? r.kind };
  return { shape: "time", pct: null, startedAt: r.startedAt.toISOString() };
}

export async function jobStatus(groupId: string | null, kind: RunKind): Promise<JobStatus> {
  const db = await getDb();
  const scope = groupId && kind !== "evaluate" ? eq(scrapeRuns.productGroupId, groupId) : undefined;
  const [running] = await db
    .select()
    .from(scrapeRuns)
    .where(and(scope, eq(scrapeRuns.kind, kind), eq(scrapeRuns.status, "running")))
    .orderBy(desc(scrapeRuns.startedAt))
    .limit(1);
  const [last] = await db
    .select()
    .from(scrapeRuns)
    .where(and(scope, eq(scrapeRuns.kind, kind), inArray(scrapeRuns.status, ["succeeded", "failed", "suspect"])))
    .orderBy(desc(scrapeRuns.finishedAt))
    .limit(1);
  return {
    running: running ? { ...progressOf(running), runId: running.id } : null,
    last:
      last && last.finishedAt && Date.now() - last.finishedAt.getTime() <= LAST_WINDOW_MS
        ? { runId: last.id, status: last.status as RunStatus, finishedAt: last.finishedAt.toISOString(), note: last.note }
        : null,
  };
}

export async function assertNotRunning(groupId: string | null, kind: RunKind) {
  const s = await jobStatus(groupId, kind);
  if (s.running) throw new AppError(400, "errors.job.alreadyRunning", { progress: s.running });
}

/** How far back the sidebar looks: long enough to see this morning's jobs, short enough to stay a to-do list. */
const ACTIVITY_WINDOW_MS = 24 * 3600_000;

/** Latest run of each AI job in the group (top-level only — a pipeline's own steps are its business),
 *  running ones first, then newest first. */
export async function aiActivity(groupId: string, now = Date.now()): Promise<AiActivity> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(scrapeRuns)
    .where(
      and(
        eq(scrapeRuns.productGroupId, groupId),
        inArray(scrapeRuns.kind, [...AI_RUN_KINDS]),
        isNull(scrapeRuns.parentRunId),
        gte(scrapeRuns.startedAt, new Date(now - ACTIVITY_WINDOW_MS)),
      ),
    )
    .orderBy(desc(scrapeRuns.startedAt));
  const latest = new Map<string, RunRecord>();
  for (const r of rows) if (!latest.has(r.kind)) latest.set(r.kind, r);
  const items = [...latest.values()]
    .sort((a, b) => Number(b.status === "running") - Number(a.status === "running") || b.startedAt.getTime() - a.startedAt.getTime())
    .map((r) => ({
      runId: r.id,
      kind: r.kind as AiRunKind,
      status: r.status as RunStatus,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      progress: r.status === "running" ? progressOf(r) : null,
      note: r.note,
      costUsd: r.costUsd,
    }));
  return { items };
}
