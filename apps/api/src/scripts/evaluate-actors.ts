// Standalone actor evaluation (free public Apify API — never starts an actor):
//   pnpm --filter @pp/api evaluate            (platforms of all groups)
//   pnpm --filter @pp/api evaluate -- douyin xhs
// Stop the api first when using PGlite (one process at a time).
import type { Platform } from "@pp/contracts";
import { closeDb, getDb } from "../db/client.js";
import { productGroups } from "../db/schema.js";
import { evaluateActors } from "../actors/evaluate.js";
import { PLATFORM_LIST } from "../domain/types.js";
import { createRun, finishRun, updateRun } from "../jobs/runs.js";

async function main() {
  const db = await getDb();
  const asked = process.argv.slice(2).filter((a): a is Platform => (PLATFORM_LIST as string[]).includes(a));
  const platforms = asked.length
    ? asked
    : ([...new Set((await db.select({ p: productGroups.platforms }).from(productGroups)).flatMap((g) => g.p))] as Platform[]);
  if (!platforms.length) throw new Error("no platforms (seed first or pass platforms)");
  const runId = await createRun(db, { kind: "evaluate", status: "running", step: "evaluate" });
  const r = await evaluateActors({
    platforms,
    runId,
    log: (m) => console.log(m),
    onProgress: (done, total) => updateRun(runId, { progressDone: done, progressTotal: total }),
  });
  await finishRun(runId, "succeeded", r.note, { itemsOut: r.rows.length });
  console.log(`\nplan tier: ${r.tier}\n`);
  const pad = (s: unknown, n: number) => String(s ?? "").padEnd(n).slice(0, n);
  console.log([pad("platform", 7), pad("actor", 46), pad("$/result", 9), pad("$ 50", 7), pad("cmpl", 4), pad("fail30d", 7), pad("smoke", 5), pad("chosen", 6), "excluded / reason"].join(" | "));
  for (const e of r.rows)
    console.log(
      [
        pad(e.platform, 7),
        pad(e.actorId, 46),
        pad(e.costPerResult50.toFixed(5), 9),
        pad(e.estCost50.toFixed(3), 7),
        pad(`${e.completeness}/5`, 4),
        pad(e.failRate30d === null || e.failRate30d === undefined ? "—" : `${(e.failRate30d * 100).toFixed(1)}%`, 7),
        pad(e.smokeItemsOut ?? "—", 5),
        pad(e.chosen ? "YES" : "", 6),
        e.excluded ?? e.reason ?? "",
      ].join(" | "),
    );
  console.log(`\n${r.note}`);
  await closeDb();
}

void main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
