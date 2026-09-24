// Settings: catalog is the single source of truth for keys. Resolution order DB → env → fallback → unset.
// Secrets are AES-256-GCM encrypted in app_settings when SETTINGS_SECRET is set ("enc:v1:<b64 iv|tag|ct>").
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { SettingRow, SourceMode } from "@pp/contracts";
import { getDb } from "../db/client.js";
import { appSettings } from "../db/schema.js";

type Entry = { key: string; group: SettingRow["group"]; secret: boolean; envOnly: boolean; fallback?: () => Promise<string | null> };

export const CATALOG: Entry[] = [
  { key: "APIFY_TOKEN", group: "apify", secret: true, envOnly: false },
  { key: "APIFY_WEBHOOK_SECRET", group: "apify", secret: true, envOnly: false },
  { key: "SOURCE_MODE", group: "apify", secret: false, envOnly: false, fallback: async () => ((await getSetting("APIFY_TOKEN")) ? "apify" : "mock") },
  { key: "ANTHROPIC_API_KEY", group: "ai", secret: true, envOnly: false },
  // Governs every AI job (translate + categorize). "sdk" calls api.anthropic.com with a key;
  // "cli" shells out to a logged-in `claude` on this host
  // (no key needed, but each invocation re-sends Claude Code's own system prompt — batch big).
  { key: "AI_BACKEND", group: "ai", secret: false, envOnly: false, fallback: async () => ((await getSetting("ANTHROPIC_API_KEY")) ? "sdk" : "cli") },
  { key: "CLAUDE_CLI_PATH", group: "ai", secret: false, envOnly: false, fallback: async () => "claude" },
  // Hand-entered because a live FX feed is another dependency to run and pay for; the settings row's
  // own updatedAt is what the UI shows, so a forgotten rate is visible rather than silently wrong.
  { key: "FX_CNY_THB", group: "money", secret: false, envOnly: false },
  { key: "FX_USD_THB", group: "money", secret: false, envOnly: false },
  { key: "APP_PASSWORD", group: "app", secret: true, envOnly: true },
  { key: "CRON_SECRET", group: "app", secret: true, envOnly: true },
  { key: "SETTINGS_SECRET", group: "app", secret: true, envOnly: true },
  { key: "DATABASE_URL", group: "app", secret: true, envOnly: true },
];

export const entryFor = (key: string) => CATALOG.find((e) => e.key === key);

const PREFIX = "enc:v1:";
const cryptoKey = () => {
  const s = process.env.SETTINGS_SECRET;
  return s ? createHash("sha256").update(s).digest() : null;
};

export function encrypt(plain: string): string {
  const key = cryptoKey();
  if (!key) return plain;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function decrypt(stored: string): string | null {
  if (!stored.startsWith(PREFIX)) return stored;
  const key = cryptoKey();
  if (!key) return null; // encrypted but no secret available → treat as unset
  try {
    const buf = Buffer.from(stored.slice(PREFIX.length), "base64");
    const d = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

let cache: { at: number; rows: Map<string, string> } | null = null;
const TTL = 30_000;

async function dbValues(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < TTL) return cache.rows;
  const db = await getDb();
  const rows = await db.select().from(appSettings);
  cache = { at: Date.now(), rows: new Map(rows.map((r) => [r.key, r.value])) };
  return cache.rows;
}

export async function resolveSetting(key: string): Promise<{ value: string | null; source: SettingRow["source"] }> {
  const entry = entryFor(key);
  if (!entry?.envOnly) {
    const stored = (await dbValues()).get(key);
    const v = stored === undefined ? null : decrypt(stored);
    if (v) return { value: v, source: "db" };
  }
  const env = process.env[key];
  if (env) return { value: env, source: "env" };
  const fb = entry?.fallback ? await entry.fallback() : null;
  if (fb) return { value: fb, source: "fallback" };
  return { value: null, source: "unset" };
}

export const getSetting = async (key: string) => (await resolveSetting(key)).value;

export async function sourceMode(): Promise<SourceMode> {
  return (await getSetting("SOURCE_MODE")) === "apify" ? "apify" : "mock";
}

export const mask = (v: string) => (v.length > 4 ? `••••${v.slice(-4)}` : "••••");

export async function listSettings(): Promise<SettingRow[]> {
  const out: SettingRow[] = [];
  for (const e of CATALOG) {
    const { value, source } = await resolveSetting(e.key);
    // env-only secrets never leave the server, not even masked
    const shown = value === null || e.envOnly ? null : e.secret ? mask(value) : value;
    out.push({ key: e.key, group: e.group, secret: e.secret, value: shown, source });
  }
  return out;
}

export async function saveSetting(key: string, value: string | null) {
  const db = await getDb();
  if (value === null || value === "") await db.delete(appSettings).where(eq(appSettings.key, key));
  else {
    const stored = entryFor(key)?.secret ? encrypt(value) : value;
    await db
      .insert(appSettings)
      .values({ key, value: stored })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: stored, updatedAt: new Date() } });
  }
  cache = null;
}

/** Cheapest authenticated endpoint per service. Apify also tells us the plan tier (pricing). */
export async function testService(service: "apify" | "anthropic"): Promise<{ ok: boolean; detail: string }> {
  const key = await getSetting(service === "apify" ? "APIFY_TOKEN" : "ANTHROPIC_API_KEY");
  if (!key) return { ok: false, detail: "settings.test.noKey" };
  try {
    if (service === "apify") {
      const r = await fetch("https://api.apify.com/v2/users/me", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      const d = ((await r.json()) as { data?: { username?: string; plan?: { id?: string } } }).data;
      return { ok: true, detail: `${d?.username ?? "?"} · plan ${d?.plan?.id ?? "?"}` };
    }
    const r = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    const d = (await r.json()) as { data?: { id?: string }[] };
    return { ok: true, detail: d.data?.[0]?.id ?? "ok" };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

/** Apify plan tier for pricing: from /users/me when a token exists, else FREE (most expensive = safe). */
export async function apifyPlanTier(): Promise<string> {
  const token = await getSetting("APIFY_TOKEN");
  if (!token) return "FREE";
  try {
    const r = await fetch("https://api.apify.com/v2/users/me", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    const id = ((await r.json()) as { data?: { plan?: { id?: string } } }).data?.plan?.id;
    return id ? id.toUpperCase() : "FREE";
  } catch {
    return "FREE";
  }
}
