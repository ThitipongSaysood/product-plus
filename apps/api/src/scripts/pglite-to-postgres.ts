// One-off: copy the development PGlite store into Postgres.
//
//   pnpm --filter @pp/api migrate-store            # copy, then verify
//   pnpm --filter @pp/api migrate-store --verify   # verify only, copies nothing
//
// PGlite is opened directly rather than through db/client.ts, because that module would try to apply
// migrations to it — and the migrations now describe schema "product_plus", while this old store holds
// "scout". The source is read-only here and is never modified.
//
// Safe to re-run: every insert is ON CONFLICT DO NOTHING on the primary key, so a partial run continues
// where it stopped. It does not delete anything on the target, so a table that already has rows keeps
// them; the verification at the end is what tells you whether the two stores actually agree.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const PGLITE_DIR = process.env.PGLITE_DIR ?? path.resolve(here, "../../../../.pglite");
const SRC_SCHEMA = process.env.SRC_SCHEMA ?? "scout";
const DST_SCHEMA = "product_plus";

/** Parents before children: every table's foreign keys must already be satisfied when it is inserted. */
const TABLES = [
  "app_settings",
  "product_groups",
  "keywords",
  "media",
  "category_map",
  "actor_evaluations",
  "scrape_runs",
  "products",
  "product_snapshots",
  "change_events",
] as const;

/** Rows per INSERT. Large enough to be quick, small enough that a 42MB media table does not build one
 *  enormous statement — Postgres also caps a query at 65535 bound parameters. */
const CHUNK = 200;

const log = (...a: unknown[]) => console.log(...a);

type Col = { name: string; udt: string };

async function columnsOf(client: pg.PoolClient, table: string): Promise<Col[]> {
  const r = await client.query(
    `select column_name, udt_name from information_schema.columns
     where table_schema = $1 and table_name = $2 order by ordinal_position`,
    [DST_SCHEMA, table],
  );
  return r.rows.map((x: { column_name: string; udt_name: string }) => ({ name: x.column_name, udt: x.udt_name }));
}

/**
 * PGlite hands back already-decoded JavaScript values, and node-postgres then re-encodes them by
 * JavaScript type rather than by column type. That is wrong in two places:
 *
 *  - a jsonb column holding an array arrives as a JS Array, which pg encodes as a Postgres array
 *    literal `{"a","b"}` — not JSON, so the insert fails with "invalid input syntax for type json"
 *  - a bytea column arrives as a Uint8Array, which pg does not recognise as binary
 *
 * Both are fixed by looking at the destination column's type instead of guessing from the value.
 */
function encode(value: unknown, udt: string): unknown {
  if (value === null || value === undefined) return null;
  if (udt === "json" || udt === "jsonb") return typeof value === "string" ? value : JSON.stringify(value);
  if (udt === "bytea") return Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
  return value;
}

async function copyTable(src: PGlite, client: pg.PoolClient, table: string, cols: Col[]): Promise<number> {
  const list = cols.map((c) => `"${c.name}"`).join(", ");
  // Column list comes from information_schema on the target, so the two stores stay aligned even if the
  // old store has columns the new schema dropped.
  const { rows } = await src.query<Record<string, unknown>>(`select ${list} from "${SRC_SCHEMA}"."${table}"`);
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const params: unknown[] = [];
    const tuples = batch.map((row) => {
      const ph = cols.map((c) => {
        params.push(encode(row[c.name], c.udt));
        return `$${params.length}`;
      });
      return `(${ph.join(", ")})`;
    });
    const res = await client.query(
      `insert into "${DST_SCHEMA}"."${table}" (${list}) values ${tuples.join(", ")} on conflict do nothing`,
      params,
    );
    written += res.rowCount ?? 0;
  }
  return written;
}

/** Counts on both sides, plus a checksum on the one table where silent corruption would be invisible. */
async function verify(src: PGlite, client: pg.PoolClient): Promise<boolean> {
  let ok = true;
  log("\nverify");
  for (const table of TABLES) {
    const a = (await src.query<{ n: number }>(`select count(*)::int n from "${SRC_SCHEMA}"."${table}"`)).rows[0].n;
    const b = Number((await client.query(`select count(*)::int n from "${DST_SCHEMA}"."${table}"`)).rows[0].n);
    const same = a === b;
    ok &&= same;
    log(`  ${same ? "ok  " : "FAIL"} ${table.padEnd(20)} pglite ${String(a).padStart(6)}  postgres ${String(b).padStart(6)}`);
  }

  // media rows are image bytes; a truncated copy would still count as one row. storage_key is the sha1
  // of those bytes, so re-deriving it on the target proves the bytes themselves survived.
  const bad = await client.query(
    `select count(*)::int n from "${DST_SCHEMA}"."media" where encode(digest(bytes, 'sha1'), 'hex') <> storage_key`,
  ).catch(() => null);
  if (bad) {
    const n = Number(bad.rows[0].n);
    ok &&= n === 0;
    log(`  ${n === 0 ? "ok  " : "FAIL"} media bytes match their sha1 storage_key (${n} mismatched)`);
  } else {
    // pgcrypto is not installed; fall back to comparing total byte size, which still catches truncation.
    const a = (await src.query<{ s: string }>(`select coalesce(sum(size),0)::text s from "${SRC_SCHEMA}"."media"`)).rows[0].s;
    const b = (await client.query(`select coalesce(sum(octet_length(bytes)),0)::text s from "${DST_SCHEMA}"."media"`)).rows[0].s;
    const same = String(a) === String(b);
    ok &&= same;
    log(`  ${same ? "ok  " : "FAIL"} media bytes total  pglite ${a}  postgres ${b}  (sha1 check needs pgcrypto)`);
  }
  return ok;
}

async function main() {
  const verifyOnly = process.argv.includes("--verify");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — nothing to migrate into");

  const src = new PGlite(PGLITE_DIR);
  const pool = new pg.Pool({ connectionString: url, max: 4 });
  const client = await pool.connect();
  try {
    const exists = await client.query(`select 1 from information_schema.schemata where schema_name = $1`, [DST_SCHEMA]);
    if (!exists.rowCount) throw new Error(`schema "${DST_SCHEMA}" does not exist — start the api once so migrations run`);

    if (!verifyOnly) {
      log(`copying ${SRC_SCHEMA} (pglite) -> ${DST_SCHEMA} (${url.replace(/:\/\/[^@]*@/, "://***@")})\n`);
      for (const table of TABLES) {
        const cols = await columnsOf(client, table);
        if (!cols.length) throw new Error(`target table ${DST_SCHEMA}.${table} has no columns`);
        const n = await copyTable(src, client, table, cols);
        log(`  ${table.padEnd(20)} ${String(n).padStart(6)} rows inserted`);
      }
    }

    const ok = await verify(src, client);
    log(ok ? "\nstores agree" : "\nSTORES DISAGREE — do not delete .pglite");
    process.exitCode = ok ? 0 : 1;
  } finally {
    client.release();
    await pool.end();
    await src.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
