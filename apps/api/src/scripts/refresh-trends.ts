// Recompute trend labels of every group (after changing trend rules).
//   pnpm --filter @pp/api refresh:trends
import { closeDb, getDb } from "../db/client.js";
import { productGroups } from "../db/schema.js";
import { refreshTrends } from "../jobs/trend.js";

async function main() {
  const db = await getDb();
  for (const g of await db.select().from(productGroups)) {
    await refreshTrends(g.id);
    console.log(`refreshed ${g.slug}`);
  }
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
