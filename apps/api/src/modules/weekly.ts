// Schedules (SPEC §3 #6): an in-process tick every hour (Asia/Bangkok) starts each group at the hour it
// is configured for — daily groups on their hour, weekly groups on their hour and weekday. The tick is
// hourly rather than daily only so that per-group times are possible; a group still fires at most once
// per slot, guarded by repeatWindowStart(). GET /api/cron/tick drives the same logic from an external
// timer, and /api/cron/{daily,weekly} remain a force-run escape hatch that ignores the clock.
import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { and, eq, gte, inArray } from "drizzle-orm";
import type { Schedule, TriggerResult } from "@pp/contracts";
import { getDb } from "../db/client.js";
import { productGroups, scrapeRuns } from "../db/schema.js";
import { AppError } from "../common/errors.js";
import { isScheduleSlot, repeatWindowStart, type ScheduleSlot } from "../domain/guards.js";
import { triggerPipeline } from "../jobs/pipeline.js";
import { reconcile } from "../jobs/reconcile.js";

/**
 * `onlyDue` runs the groups whose configured slot is the current hour; without it every group with one
 * of `schedules` is started regardless of the clock (the force-run endpoints).
 */
export async function runScheduled(schedules: Schedule[], opts: { onlyDue?: boolean; now?: Date } = {}) {
  await reconcile().catch(() => 0);
  const now = opts.now ?? new Date();
  const db = await getDb();
  const all = await db.select().from(productGroups).where(inArray(productGroups.schedule, schedules));
  // Filtered here rather than in SQL: a handful of rows, and the Bangkok clock maths stays in one
  // tested pure function instead of being restated in the query.
  const groups = opts.onlyDue ? all.filter((g) => isScheduleSlot(g as ScheduleSlot, now)) : all;
  const started: (TriggerResult["started"][number] & { group: string })[] = [];
  const skipped: (TriggerResult["skipped"][number] & { group: string })[] = [];
  for (const g of groups) {
    const since = repeatWindowStart(g.schedule as Schedule, now);
    const recent = await db
      .select({ id: scrapeRuns.id })
      .from(scrapeRuns)
      .where(and(eq(scrapeRuns.productGroupId, g.id), eq(scrapeRuns.kind, "pipeline"), gte(scrapeRuns.startedAt, since)))
      .limit(1);
    if (recent.length) {
      skipped.push({ group: g.slug, platform: g.platforms[0] as never, keyword: "*", reason: "skip.recentRun" });
      continue;
    }
    try {
      const r = await triggerPipeline(g);
      started.push(...r.started.map((s) => ({ ...s, group: g.slug })));
      skipped.push(...r.skipped.map((s) => ({ ...s, group: g.slug })));
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      skipped.push({ group: g.slug, platform: g.platforms[0] as never, keyword: "*", reason: "skip.alreadyRunning" });
    }
  }
  return { started, skipped };
}

@Injectable()
export class WeeklyCron {
  @Cron("0 * * * *", { timeZone: "Asia/Bangkok", name: "scheduled-pipelines" })
  async tick() {
    const r = await runScheduled(["daily", "weekly"], { onlyDue: true });
    if (r.started.length || r.skipped.length) {
      console.log(`[cron] started ${r.started.length}, skipped ${r.skipped.length}`);
    }
  }
}
