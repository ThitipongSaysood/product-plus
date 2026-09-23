// Schedules (SPEC §3 #6): one in-process tick every day 05:00 Asia/Bangkok runs "daily" groups, and on
// Mondays also "weekly" groups; GET /api/cron/{daily,weekly} for an external timer. A pipeline started
// < 12 h ago is not repeated.
import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { and, eq, gte, inArray } from "drizzle-orm";
import type { Schedule, TriggerResult } from "@pp/contracts";
import { getDb } from "../db/client.js";
import { productGroups, scrapeRuns } from "../db/schema.js";
import { AppError } from "../common/errors.js";
import { schedulesDue } from "../domain/guards.js";
import { triggerPipeline } from "../jobs/pipeline.js";
import { reconcile } from "../jobs/reconcile.js";

export async function runScheduled(schedules: Schedule[]) {
  await reconcile().catch(() => 0);
  const db = await getDb();
  const groups = await db.select().from(productGroups).where(inArray(productGroups.schedule, schedules));
  const started: (TriggerResult["started"][number] & { group: string })[] = [];
  const skipped: (TriggerResult["skipped"][number] & { group: string })[] = [];
  const since = new Date(Date.now() - 12 * 3_600_000);
  for (const g of groups) {
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
  @Cron("0 5 * * *", { timeZone: "Asia/Bangkok", name: "scheduled-pipelines" })
  async tick() {
    const due = schedulesDue(new Date());
    const r = await runScheduled(due);
    console.log(`[cron] ${due.join("+")}: started ${r.started.length}, skipped ${r.skipped.length}`);
  }
}
