// Categorization layer 3 (handoff §9): only titles the platform map + rules could not decide.
// Structured output restricted to the taxonomy keys. A refusal / failure leaves the product
// unclassified so the next run retries it. Titles are scraped data → treated as untrusted.
//
// Three backends, same rules: "sdk" calls api.anthropic.com with a key, "openrouter" the same Messages API
// through openrouter.ai with its key, "cli" shells out to a logged-in `claude` on this host. How to classify lives in ONE place —
// apps/api/claude-plugin/skills/categorize-listings/SKILL.md — which the cli loads as a skill and the
// sdk sends as its system prompt, so editing the skill changes both without a TypeScript change.
import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { TaxonomyEntry } from "@pp/contracts";
import { OFFTOPIC, UNCLASSIFIED } from "../domain/categorize.js";
import { getSetting } from "../settings/settings.js";
import { CLI_BATCH, CLI_CONCURRENCY, extractJson, pooled, runClaudeCli, skillBody, skillRef, SKILLS, type Effort } from "./claude-cli.js";

/**
 * Every AI job runs on Sonnet 5 (the user's call, 2026-09-25): Haiku's Thai read clumsy
 * ("ฟอร์มเมชคลาสสิก", "ต้องยืนยันจำนวนต่ำ"). Sonnet 5 thinks before answering by default, which is
 * where its extra time goes, so speed is set per job with effort rather than by a smaller model:
 * translation, categorisation and keyword terms are mechanical (a vocabulary table or a fixed list of
 * keys does most of the work) and run at low; the brand brief asks for judgement and runs at medium.
 */
export const LLM_MODEL = "claude-sonnet-5";
export const BRAND_MODEL = LLM_MODEL;
export const LLM_EFFORT: Effort = "low";
export const BRAND_EFFORT: Effort = "medium";
export const LLM_BATCH = 25;

/**
 * Cap for the api engines (sdk, openrouter). Sonnet 5 thinks before it answers and the thinking counts
 * against max_tokens: at 4096 the brand brief ran out mid-JSON twice (2026-09-26). It is only a ceiling —
 * the bill follows what is actually used — so it is sized for thinking plus the longest answer.
 */
export const LLM_MAX_TOKENS = 16_000;

/** A reply cut off at max_tokens carries a partial answer or none: fail loudly rather than keep half of it. */
export function assertComplete(res: { stop_reason: string | null }) {
  if (res.stop_reason === "max_tokens") throw new Error("AI answer hit max_tokens");
}

export type AiBackend = "sdk" | "openrouter" | "cli";

/** One switch for every AI job. Defaults to the cli when no api key is set, because a logged-in
 *  `claude` on the host needs no secret and is what this deploy actually has. */
export async function aiBackend(): Promise<AiBackend> {
  const v = await getSetting("AI_BACKEND");
  return v === "cli" || v === "openrouter" ? v : "sdk";
}

/**
 * OpenRouter speaks the Anthropic Messages API at /api/v1/messages — output_config.format and effort
 * included (checked against https://openrouter.ai/openapi.json, 2026-09-26) — so the same SDK calls work
 * with a different base URL, a Bearer key and the `anthropic/` model prefix. Its usage block also
 * carries the billed `cost` in USD, which api.anthropic.com does not.
 */
const OPENROUTER_BASE_URL = "https://openrouter.ai/api";

/** A Messages client for the two api-key backends. `model` maps our model id to the provider's. */
export type ApiClient = { client: Anthropic; model: (id: string) => string; costOf: (res: { usage: object }) => number | null };

type ClientOpts = Pick<ClientOptions, "timeout" | "fetch">;

export function openRouterClient(key: string, opts: ClientOpts = {}): ApiClient {
  return {
    // apiKey null: otherwise the SDK also sends ANTHROPIC_API_KEY from the environment as x-api-key.
    client: new Anthropic({ apiKey: null, authToken: key, baseURL: OPENROUTER_BASE_URL, defaultHeaders: { "X-Title": "Product Plus" }, ...opts }),
    model: (id) => `anthropic/${id}`,
    costOf: (res) => {
      const cost = (res.usage as { cost?: unknown }).cost;
      return typeof cost === "number" ? cost : null;
    },
  };
}

/** The api-key client for the configured backend, or null when it is the cli or its key is not set. */
export async function apiClient(opts: ClientOpts = {}): Promise<ApiClient | null> {
  const backend = await aiBackend();
  if (backend === "cli") return null;
  if (backend === "openrouter") {
    const key = await getSetting("OPENROUTER_API_KEY");
    return key ? openRouterClient(key, opts) : null;
  }
  const key = await getSetting("ANTHROPIC_API_KEY");
  if (!key) return null;
  return { client: new Anthropic({ apiKey: key, ...opts }), model: (id) => id, costOf: () => null };
}

/** Adds two nullable costs; null only when both are unknown. */
export const addCost = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));

/** Same rules the cli backend loads as a skill — SKILL.md is the single source of truth for both. */
const categorizeSystem = (): string => skillBody(SKILLS.categorize);

export type CategorizeItem = { id: string; title: string };
export type CategorizeResult = { got: Map<string, string>; costUsd: number | null };

/** The taxonomy is per-group and the merchant edits it, so it travels with every request. */
const legendOf = (taxonomy: TaxonomyEntry[]) =>
  taxonomy.map((t) => `- ${t.key}: ${t.en} / ${t.zh} (e.g. ${t.keywords.slice(0, 6).join(", ")})`).join("\n");

const listOf = (batch: CategorizeItem[]) =>
  batch.map((it, i) => `${i}. ${it.title.replace(/\s+/g, " ").slice(0, 200)}`).join("\n");

/** The group's name says what the merchant watches — the yardstick for `offtopic`. It is merchant text,
 *  so it travels as quoted data like the titles. */
const askOf = (group: string, taxonomy: TaxonomyEntry[], batch: CategorizeItem[]) =>
  `Product group (what this merchant watches): ${JSON.stringify(group)}\n\nTaxonomy keys:\n${legendOf(taxonomy)}\n\nListings (index. title):\n${listOf(batch)}\n\nReturn one result per index.`;

/** Keeps only keys that exist in this group's taxonomy, plus OFFTOPIC — the model is asked for them, but a
 *  wrong or hallucinated key must never reach the database. UNCLASSIFIED is dropped so the row is retried. */
function collect(out: Map<string, string>, batch: CategorizeItem[], results: { i?: unknown; key?: unknown }[], keys: string[]) {
  for (const r of results) {
    const item = typeof r.i === "number" ? batch[r.i] : undefined;
    const key = typeof r.key === "string" ? r.key : "";
    if (item && key !== UNCLASSIFIED && (key === OFFTOPIC || keys.includes(key))) out.set(item.id, key);
  }
}

const batchesOf = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, b) => items.slice(b * size, (b + 1) * size));

/** Batches run concurrently, so one failed batch keeps the others' keys (its rows stay unclassified and the
 *  next run retries them); only when every batch failed does the job report the error. */
function failIfNothing(settled: PromiseSettledResult<unknown>[], out: Map<string, string>) {
  const failed = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
  if (failed && !out.size) throw failed.reason;
}

async function categorizeViaApi(api: ApiClient, group: string, items: CategorizeItem[], taxonomy: TaxonomyEntry[]): Promise<CategorizeResult> {
  const keys = taxonomy.map((t) => t.key);
  const out = new Map<string, string>();
  let costUsd: number | null = null;
  const schema = z.object({
    results: z.array(z.object({ i: z.number().int(), key: z.enum([UNCLASSIFIED, OFFTOPIC, ...keys] as [string, ...string[]]) })),
  });
  const settled = await pooled(
    batchesOf(items, LLM_BATCH).map((batch) => async () => {
      const res = await api.client.messages.parse({
        model: api.model(LLM_MODEL),
        max_tokens: LLM_MAX_TOKENS,
        system: categorizeSystem(),
        messages: [{ role: "user", content: askOf(group, taxonomy, batch) }],
        output_config: { format: zodOutputFormat(schema), effort: LLM_EFFORT },
      });
      costUsd = addCost(costUsd, api.costOf(res));
      assertComplete(res);
      if (res.stop_reason !== "refusal") collect(out, batch, res.parsed_output?.results ?? [], keys);
    }),
    CLI_CONCURRENCY,
  );
  failIfNothing(settled, out);
  return { got: out, costUsd };
}

/** The skill carries the rules and the output shape; the prompt only invokes it and supplies the batch. */
async function categorizeViaCli(bin: string, group: string, items: CategorizeItem[], taxonomy: TaxonomyEntry[]): Promise<CategorizeResult> {
  const keys = taxonomy.map((t) => t.key);
  const out = new Map<string, string>();
  let costUsd: number | null = null;
  // Bigger batches than the sdk path: each `claude -p` re-sends its own system prompt, so the cost is
  // per invocation rather than per title.
  const settled = await pooled(
    batchesOf(items, CLI_BATCH).map((batch) => async () => {
      const res = await runClaudeCli(bin, LLM_MODEL, `/${skillRef(SKILLS.categorize)}\n\n${askOf(group, taxonomy, batch)}`, LLM_EFFORT);
      if (res.costUsd !== null) costUsd = (costUsd ?? 0) + res.costUsd;
      const parsed = extractJson(res.text) as { results?: { i?: unknown; key?: unknown }[] };
      collect(out, batch, parsed.results ?? [], keys);
    }),
    CLI_CONCURRENCY,
  );
  failIfNothing(settled, out);
  return { got: out, costUsd };
}

export async function llmCategorize(
  backend: { kind: "api"; api: ApiClient } | { kind: "cli"; bin: string },
  items: CategorizeItem[],
  taxonomy: TaxonomyEntry[],
  group: string,
): Promise<CategorizeResult> {
  if (!taxonomy.length || !items.length) return { got: new Map(), costUsd: null };
  return backend.kind === "cli"
    ? categorizeViaCli(backend.bin, group, items, taxonomy)
    : categorizeViaApi(backend.api, group, items, taxonomy);
}

/** Same rules the cli backend loads as a skill — SKILL.md is the single source of truth for both. */
const translateSystem = (): string => skillBody(SKILLS.translate);

/** Thai titles for Chinese listings. Same batching and refusal handling as llmCategorize. */
export async function llmTranslate(api: ApiClient, items: { id: string; title: string }[]) {
  const out = new Map<string, string>();
  let costUsd: number | null = null;
  if (!items.length) return { got: out, costUsd };
  const schema = z.object({ results: z.array(z.object({ i: z.number().int(), th: z.string().max(300) })) });
  for (let b = 0; b < items.length; b += LLM_BATCH) {
    const batch = items.slice(b, b + LLM_BATCH);
    const list = batch.map((it, i) => `${i}. ${it.title.replace(/\s+/g, " ").slice(0, 200)}`).join("\n");
    const res = await api.client.messages.parse({
      model: api.model(LLM_MODEL),
      max_tokens: LLM_MAX_TOKENS,
      system: translateSystem(),
      messages: [{ role: "user", content: `Listings (index. title):\n${list}\n\nReturn one Thai translation per index.` }],
      output_config: { format: zodOutputFormat(schema), effort: LLM_EFFORT },
    });
    costUsd = addCost(costUsd, api.costOf(res));
    assertComplete(res);
    if (res.stop_reason === "refusal") continue;
    for (const r of res.parsed_output?.results ?? []) {
      const item = batch[r.i];
      const th = r.th.trim();
      if (item && th) out.set(item.id, th.slice(0, 300));
    }
  }
  return { got: out, costUsd };
}
