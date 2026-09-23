// ingestRun: normalize → gate → diff → upsert products + snapshots + events, all in ONE transaction.
// Idempotent: only a run still in status "running" is ingested (webhook, poll and cron may race).
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Platform } from "@pp/contracts";
import { getDb } from "../db/client.js";
import { changeEvents, productGroups, products, productSnapshots, scrapeRuns } from "../db/schema.js";
import { extractAttrs } from "../domain/attrs.js";
import { diffRun } from "../domain/diff.js";
import { assessRun } from "../domain/gate.js";
import { normalizeRows } from "../domain/normalize/index.js";
import { detectEvents } from "../domain/trend.js";
import type { SnapshotLike } from "../domain/types.js";
import { refreshTrends } from "./trend.js";

export type IngestPayload = { rows: unknown[]; costUsd: number | null; apifyStatus?: string | null; note?: string | null };

export async function ingestRun(runId: string, payload: IngestPayload, now = new Date()) {
  const db = await getDb();
  const result = await db.transaction(async (tx) => {
    const [run] = await tx.select().from(scrapeRuns).where(eq(scrapeRuns.id, runId)).for("update");
    if (!run || run.status !== "running" || !run.productGroupId || !run.platform) return { ignored: true as const };
    const [group] = await tx.select().from(productGroups).where(eq(productGroups.id, run.productGroupId));
    const platform = run.platform as Platform;
    const keyword = run.keyword ?? "";
    const { items, itemsIn, readable } = normalizeRows(platform, payload.rows, keyword, group.resultLimit);

    const [prev] = await tx
      .select({ n: scrapeRuns.itemsOut })
      .from(scrapeRuns)
      .where(
        and(
          eq(scrapeRuns.productGroupId, group.id),
          eq(scrapeRuns.kind, "scrape"),
          eq(scrapeRuns.platform, platform),
          eq(scrapeRuns.keyword, keyword),
          eq(scrapeRuns.status, "succeeded"),
          ne(scrapeRuns.id, runId),
        ),
      )
      .orderBy(desc(scrapeRuns.startedAt))
      .limit(1);
    const failedStatus = payload.apifyStatus && payload.apifyStatus !== "SUCCEEDED" ? payload.apifyStatus : null;
    const gate = assessRun({ platform, actorFailedStatus: failedStatus, itemsIn, itemsOut: readable, prevSuccessfulCount: prev?.n ?? null });
    const ok = gate.status === "succeeded";
    const touched: string[] = [];
    const events: (typeof changeEvents.$inferInsert)[] = [];
    const ev = (productId: string, kind: string, detail: Record<string, unknown> | null = null) =>
      events.push({ productGroupId: group.id, productId, kind, occurredAt: now, scrapeRunId: runId, detail });

    if (gate.status !== "failed") {
      const scope = await tx
        .select({ id: products.id, externalId: products.externalId, missedRuns: products.missedRuns, lastSeenAt: products.lastSeenAt })
        .from(products)
        .where(and(eq(products.productGroupId, group.id), eq(products.platform, platform), eq(products.keyword, keyword), eq(products.isActive, true)));
      const d = diffRun(scope, items.map((i) => i.externalId), gate.processRetirements);

      const ids = items.map((i) => i.externalId);
      const known = ids.length
        ? await tx
            .select({ id: products.id, externalId: products.externalId, isActive: products.isActive, imageSourceUrl: products.imageSourceUrl })
            .from(products)
            .where(and(eq(products.productGroupId, group.id), eq(products.platform, platform), inArray(products.externalId, ids)))
        : [];
      const knownBy = new Map(known.map((k) => [k.externalId, k]));
      const prevSnaps = known.length
        ? await tx
            .selectDistinctOn([productSnapshots.productId])
            .from(productSnapshots)
            .where(inArray(productSnapshots.productId, known.map((k) => k.id)))
            .orderBy(productSnapshots.productId, desc(productSnapshots.takenAt))
        : [];
      const prevBy = new Map(prevSnaps.map((s) => [s.productId, s]));

      for (const item of items) {
        const k = knownBy.get(item.externalId);
        const fields = {
          title: item.title,
          productUrl: item.productUrl,
          imageUrls: item.imageUrls,
          currency: item.currency,
          price: item.price,
          originalPrice: item.originalPrice,
          shopName: item.shopName,
          shopUrl: item.shopUrl,
          platformCategoryPath: item.platformCategoryPath,
          attrs: extractAttrs(item.title),
          platformSignals: item.platformSignals,
          lastSeenAt: now,
          isActive: true,
          missedRuns: 0,
          goneAt: null,
          raw: item.raw,
          ...(item.imageUrl && { imageSourceUrl: item.imageUrl }),
          // new source URL → give the image cache another chance (the old cached copy stays until then)
          ...(item.imageUrl && k && k.imageSourceUrl !== item.imageUrl && { imageLost: false }),
          // latest_* only from runs that pass the gate (§10.2)
          ...(ok && {
            latestSoldCount: item.soldCount,
            latestSoldPeriod: item.soldPeriod,
            latestSoldLowerBound: item.soldIsLowerBound,
            latestSoldText: item.soldText,
            latestRank: item.rank,
            latestSnapshotAt: now,
          }),
        };
        let productId: string;
        if (k) {
          await tx.update(products).set(fields).where(eq(products.id, k.id));
          productId = k.id;
          if (!k.isActive) ev(productId, "new", { reappeared: true });
        } else {
          const [ins] = await tx
            .insert(products)
            .values({ ...fields, productGroupId: group.id, platform, externalId: item.externalId, keyword: item.keyword, firstSeenAt: now })
            .returning({ id: products.id });
          productId = ins.id;
          ev(productId, "new");
        }
        touched.push(productId);
        const cur: SnapshotLike = {
          takenAt: now,
          rank: item.rank,
          price: item.price,
          soldCount: item.soldCount,
          soldPeriod: item.soldPeriod,
          soldLowerBound: item.soldIsLowerBound,
        };
        await tx
          .insert(productSnapshots)
          .values({ ...cur, productId, productGroupId: group.id, scrapeRunId: runId, salesTrend: item.salesTrend, raw: item.raw })
          .onConflictDoNothing();
        const p = prevBy.get(productId);
        if (ok && p) {
          const prevSnap: SnapshotLike = { ...p, soldPeriod: p.soldPeriod as SnapshotLike["soldPeriod"] };
          for (const e of detectEvents(prevSnap, cur)) ev(productId, e.kind, e.detail);
        }
      }
      if (d.missing.length)
        await tx
          .update(products)
          .set({ missedRuns: sql`${products.missedRuns} + 1` })
          .where(inArray(products.id, d.missing.map((m) => m.id)));
      for (const g of d.gone) {
        await tx.update(products).set({ isActive: false, missedRuns: g.missedRuns + 1, goneAt: g.lastSeenAt }).where(eq(products.id, g.id));
        ev(g.id, "gone", { lastSeenAt: g.lastSeenAt.toISOString() });
      }
      if (events.length) await tx.insert(changeEvents).values(events).onConflictDoNothing();
    }

    await tx
      .update(scrapeRuns)
      .set({
        status: gate.status,
        note: payload.note ?? gate.note,
        itemsIn,
        itemsOut: items.length,
        costUsd: payload.costUsd,
        finishedAt: now,
        step: null,
      })
      .where(eq(scrapeRuns.id, runId));
    return { ignored: false as const, status: gate.status, groupId: group.id, touched, itemsIn, itemsOut: items.length };
  });
  if (!result.ignored && result.touched.length) await refreshTrends(result.groupId, result.touched);
  return result;
}
