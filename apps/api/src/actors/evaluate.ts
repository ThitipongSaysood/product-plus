// Actor evaluation (SPEC §4): FREE public Apify API only — never starts an actor.
// candidates (config) + store discovery → live pricing/stats/README → cost per result, completeness,
// exclusions → choose per platform → actor_evaluations.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, inArray } from "drizzle-orm";
import type { Platform } from "@pp/contracts";
import { getDb } from "../db/client.js";
import { actorEvaluations } from "../db/schema.js";
import {
  chooseActor,
  completeness,
  costPerResult,
  estCost,
  exclusionReason,
  parsePricing,
  scanEvidence,
  type Candidate,
  type EventClass,
  type Evidence,
  verified,
} from "../domain/cost.js";
import { NOTE } from "../domain/notes.js";
import { choosable } from "../domain/guards.js";
import { apifyPlanTier } from "../settings/settings.js";

const API = "https://api.apify.com/v2";
const MAX_PER_PLATFORM = 12;
const GAP_MS = 300;

type CandidateCfg = {
  actorId: string;
  events?: Record<string, EventClass>;
  overrides?: Partial<Evidence>;
  inputTemplate?: Record<string, unknown>;
  smoke?: { runId: string; itemsIn: number; itemsOut: number; costUsd: number | null };
  excluded?: string;
};
type Config = { searches: Record<Platform, string[]>; platforms: Record<Platform, CandidateCfg[]> };

const here = path.dirname(fileURLToPath(import.meta.url));
export const loadCandidates = (): Config => JSON.parse(readFileSync(path.resolve(here, "../../config/actor-candidates.json"), "utf8"));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string): Promise<T | null> {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (r.status === 404) return null;
      if (r.ok) return ((await r.json()) as { data: T }).data;
    } catch {
      /* retry once */
    }
    await sleep(1000);
  }
  return null;
}

const PLATFORM_RE: Record<Platform, RegExp> = {
  douyin: /douyin|抖音/i,
  "1688": /1688/,
  temu: /temu/i,
  xhs: /xiaohongshu|rednote|小红书|\bxhs\b/i,
};
const PRODUCT_RE = /product|shop|e-?commerce|goods|商品|wholesale|store|item|listing|price/i;
const NOT_PRODUCT_RE = /video|comment|profile|transcript|\bnotes?\b|downloader|hot[- ]?search|hashtag|livestream/i;

type StoreItem = { username: string; name: string; title?: string; description?: string };
export const relevant = (it: StoreItem, platform: Platform) => {
  const text = `${it.name} ${it.title ?? ""} ${it.description ?? ""}`;
  return PLATFORM_RE[platform].test(text) && PRODUCT_RE.test(text) && !NOT_PRODUCT_RE.test(`${it.name} ${it.title ?? ""}`);
};

/** Input template for an actor we have no config for: keyword field + limit field from its schema. */
export function guessTemplate(schema: { properties?: Record<string, { type?: string }> } | null): Record<string, unknown> | null {
  const props = Object.entries(schema?.properties ?? {});
  const kw = props.find(([k]) => /keyword|search|query/i.test(k));
  if (!kw) return null;
  const out: Record<string, unknown> = { [kw[0]]: kw[1].type === "array" ? ["{{keyword}}"] : "{{keyword}}" };
  const lim = props.find(([k, v]) => /max|limit/i.test(k) && v.type === "integer");
  if (lim) out[lim[0]] = "{{limit}}";
  const region = props.find(([k]) => /region|country/i.test(k));
  if (region) out[region[0]] = "{{region}}";
  return out;
}

type Act = {
  title?: string;
  description?: string;
  pricingInfos?: unknown;
  stats?: { publicActorRunStats30Days?: Record<string, number> };
};
type Build = { readme?: string; inputSchema?: string };

export type EvalRow = typeof actorEvaluations.$inferInsert;

export async function evaluateActors(opts: {
  platforms: Platform[];
  runId?: string | null;
  onProgress?: (done: number, total: number) => Promise<void>;
  log?: (msg: string) => void;
}) {
  const log = opts.log ?? (() => {});
  const cfg = loadCandidates();
  const tier = await apifyPlanTier();
  const db = await getDb();
  const prevSmoke = new Map(
    (await db.select().from(actorEvaluations))
      .filter((r) => r.smokeItemsIn !== null)
      .map((r) => [r.actorId, { itemsIn: r.smokeItemsIn, itemsOut: r.smokeItemsOut, costUsd: r.smokeCostUsd }]),
  );

  const lists = new Map<Platform, string[]>();
  for (const p of opts.platforms) {
    const ids = (cfg.platforms[p] ?? []).map((c) => c.actorId);
    for (const q of cfg.searches[p] ?? []) {
      const res = await getJson<{ items: StoreItem[] }>(`${API}/store?search=${encodeURIComponent(q)}&limit=40`);
      await sleep(GAP_MS);
      for (const it of res?.items ?? []) {
        const id = `${it.username}/${it.name}`;
        if (!ids.includes(id) && relevant(it, p)) ids.push(id);
      }
    }
    lists.set(p, ids.slice(0, MAX_PER_PLATFORM));
    log(`${p}: ${ids.length} candidates found, evaluating ${Math.min(ids.length, MAX_PER_PLATFORM)}`);
  }
  const total = [...lists.values()].reduce((s, l) => s + l.length, 0);
  let done = 0;
  const now = new Date();
  const rows: EvalRow[] = [];

  for (const [platform, ids] of lists) {
    const cands: (Candidate & { row: EvalRow })[] = [];
    for (const actorId of ids) {
      const c = cfg.platforms[platform]?.find((x) => x.actorId === actorId);
      const act = await getJson<Act>(`${API}/acts/${actorId.replace("/", "~")}`);
      await sleep(GAP_MS);
      const build = act ? await getJson<Build>(`${API}/acts/${actorId.replace("/", "~")}/builds/default`) : null;
      await sleep(GAP_MS);
      done++;
      await opts.onProgress?.(done, total);
      if (!act) {
        log(`  ${actorId}: not found`);
        continue;
      }
      let schema: { properties?: Record<string, { type?: string }>; required?: string[] } | null = null;
      try {
        schema = build?.inputSchema ? JSON.parse(build.inputSchema) : null;
      } catch {
        schema = null;
      }
      const pricing = parsePricing(act.pricingInfos, tier, c?.events);
      const text = [act.title, act.description, build?.readme, build?.inputSchema].filter(Boolean).join("\n");
      const ev: Evidence = { ...scanEvidence(text, schema?.required ?? []), ...c?.overrides };
      const stats = act.stats?.publicActorRunStats30Days;
      const runs = stats?.TOTAL ?? null;
      const failRate = runs ? ((stats?.FAILED ?? 0) + (stats?.["TIMED-OUT"] ?? 0)) / runs : null;
      const smoke = c?.smoke ?? prevSmoke.get(actorId) ?? null;
      const start = pricing?.startFee ?? 0;
      const per = pricing?.pricePerResult ?? 0;
      const cand: Candidate = {
        ...ev,
        actorId,
        completeness: completeness(ev),
        costPerResult50: costPerResult(start, per),
        failRate30d: failRate,
        priced: pricing !== null && per > 0,
        smokeItemsOut: smoke?.itemsOut ?? null,
        configExcluded: c?.excluded ?? null,
      };
      cands.push({
        ...cand,
        row: {
          evaluationRunId: opts.runId ?? null,
          platform,
          actorId,
          title: act.title ?? null,
          evaluatedAt: now,
          planTier: tier,
          startFee: round6(start),
          pricePerResult: round6(per),
          estCost50: round6(estCost(start, per)),
          costPerResult50: round6(cand.costPerResult50),
          ...ev,
          completeness: cand.completeness,
          failRate30d: failRate === null ? null : Math.round(failRate * 10000) / 10000,
          runs30d: runs,
          smokeItemsIn: smoke?.itemsIn ?? null,
          smokeItemsOut: smoke?.itemsOut ?? null,
          smokeCostUsd: smoke?.costUsd ?? null,
          chosen: false,
          excluded: exclusionReason(cand),
          reason: null,
          raw: {
            source: c ? "config" : "store-search",
            events: pricing?.events ?? null,
            pricingModel: (Array.isArray(act.pricingInfos) ? (act.pricingInfos.at(-1) as { pricingModel?: string } | undefined)?.pricingModel : null) ?? null,
            stats30d: stats ?? null,
            inputTemplate: c?.inputTemplate ?? guessTemplate(schema),
            smokeRunId: c?.smoke?.runId ?? null,
          },
        },
      });
    }
    const pick = chooseActor(cands);
    if (pick) {
      pick.row.chosen = true;
      pick.row.reason = (verified(pick) ? NOTE.chosenVerified : NOTE.chosenAuto)(pick.completeness, pick.costPerResult50);
    }
    rows.push(...cands.map((c) => c.row));
  }

  await db.transaction(async (tx) => {
    // a new evaluation replaces the previous choice for these platforms (even when nobody qualifies now)
    await tx.update(actorEvaluations).set({ chosen: false }).where(inArray(actorEvaluations.platform, opts.platforms));
    if (rows.length) await tx.insert(actorEvaluations).values(rows);
  });
  const chosen = opts.platforms.map((p) => `${p}=${rows.find((r) => r.platform === p && r.chosen)?.actorId ?? "none"}`).join(", ");
  return { rows, tier, note: NOTE.evaluated(rows.length, chosen) };
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export async function chooseManually(platform: Platform, actorId: string) {
  const db = await getDb();
  const rows = await db.select().from(actorEvaluations).where(eq(actorEvaluations.platform, platform));
  const latest = rows.filter((r) => r.actorId === actorId).sort((a, b) => b.evaluatedAt.getTime() - a.evaluatedAt.getTime())[0];
  if (!latest) return "notFound" as const;
  if (!choosable(latest)) return "notChoosable" as const; // excluded / unpriced / not pay-per-event
  await db.transaction(async (tx) => {
    await tx.update(actorEvaluations).set({ chosen: false }).where(eq(actorEvaluations.platform, platform));
    await tx.update(actorEvaluations).set({ chosen: true, reason: NOTE.chosenManual() }).where(eq(actorEvaluations.id, latest.id));
  });
  return "ok" as const;
}
