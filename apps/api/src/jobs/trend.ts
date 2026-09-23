import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { products, productSnapshots } from "../db/schema.js";
import { computeTrend } from "../domain/trend.js";
import type { SnapshotLike } from "../domain/types.js";

export const toSnapshotLike = (s: typeof productSnapshots.$inferSelect): SnapshotLike => ({
  takenAt: s.takenAt,
  rank: s.rank,
  price: s.price,
  soldCount: s.soldCount,
  soldPeriod: s.soldPeriod as SnapshotLike["soldPeriod"],
  soldLowerBound: s.soldLowerBound,
  salesTrend: s.salesTrend,
});

/** Recompute trend columns from snapshots (all products of the group, or just `productIds`). */
export async function refreshTrends(groupId: string, productIds?: string[]) {
  const db = await getDb();
  const snaps = await db
    .select()
    .from(productSnapshots)
    .where(and(eq(productSnapshots.productGroupId, groupId), productIds ? inArray(productSnapshots.productId, productIds) : undefined))
    .orderBy(asc(productSnapshots.takenAt));
  const by = new Map<string, SnapshotLike[]>();
  for (const s of snaps) by.set(s.productId, [...(by.get(s.productId) ?? []), toSnapshotLike(s)]);
  await db.transaction(async (tx) => {
    for (const [id, list] of by) {
      const t = computeTrend(list);
      await tx
        .update(products)
        .set({ trendLabel: t.label, trendDeltaSold: t.deltaSold, trendDeltaRank: t.deltaRank, trendDouyinRatio: t.douyinRatio })
        .where(eq(products.id, id));
    }
  });
  return by.size;
}
