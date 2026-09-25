// DATABASE_URL set → node-postgres. Unset → PGlite (WASM Postgres) at <repo>/.pglite (PGLITE_DIR overrides).
// Migrations (apps/api/drizzle) are applied on first use unless DB_AUTO_MIGRATE=false.
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, "../../drizzle");
export const PGLITE_DIR = process.env.PGLITE_DIR ?? path.resolve(here, "../../../../.pglite");

let pending: Promise<{ db: Db; close: () => Promise<void>; kind: "pg" | "pglite" }> | null = null;

async function open() {
  const autoMigrate = (process.env.DB_AUTO_MIGRATE ?? "true") !== "false";
  if (process.env.DATABASE_URL) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pg = await import("pg");
    const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
    const db = drizzle(pool, { schema });
    // The journal lives in our own schema: the shared server's default "drizzle" schema belongs to another
    // app (Ads Plus), which this user may not write to and must not touch.
    if (autoMigrate) await migrate(db, { migrationsFolder: MIGRATIONS_DIR, migrationsSchema: "product_plus" });
    return { db, close: () => pool.end(), kind: "pg" as const };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(PGLITE_DIR);
  const db = drizzle(client, { schema });
  if (autoMigrate) await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db: db as unknown as Db, close: () => client.close(), kind: "pglite" as const };
}

export async function getDb(): Promise<Db> {
  pending ??= open();
  return (await pending).db;
}

export async function dbKind() {
  return pending ? (await pending).kind : null;
}

export async function closeDb() {
  if (!pending) return;
  const p = pending;
  pending = null;
  await (await p).close();
}
