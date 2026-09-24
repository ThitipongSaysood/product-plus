// Categorization layer 3 (handoff §9): only titles the platform map + rules could not decide.
// Structured output restricted to the taxonomy keys. A refusal / failure leaves the product
// unclassified so the next run retries it. Titles are scraped data → treated as untrusted.
//
// Two backends, same rules: "sdk" calls api.anthropic.com with a key, "cli" shells out to a logged-in
// `claude` on this host. How to classify lives in ONE place —
// apps/api/claude-plugin/skills/categorize-listings/SKILL.md — which the cli loads as a skill and the
// sdk sends as its system prompt, so editing the skill changes both without a TypeScript change.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { TaxonomyEntry } from "@pp/contracts";
import { UNCLASSIFIED } from "../domain/categorize.js";
import { getSetting } from "../settings/settings.js";
import { CLI_BATCH, extractJson, runClaudeCli, skillBody, skillRef, SKILLS } from "./claude-cli.js";

export const LLM_MODEL = "claude-haiku-4-5";
export const LLM_BATCH = 25;

export type AiBackend = "sdk" | "cli";

/** One switch for every AI job. Defaults to the cli when no api key is set, because a logged-in
 *  `claude` on the host needs no secret and is what this deploy actually has. */
export async function aiBackend(): Promise<AiBackend> {
  return (await getSetting("AI_BACKEND")) === "cli" ? "cli" : "sdk";
}

/** Same rules the cli backend loads as a skill — SKILL.md is the single source of truth for both. */
const categorizeSystem = (): string => skillBody(SKILLS.categorize);

export type CategorizeItem = { id: string; title: string };
export type CategorizeResult = { got: Map<string, string>; costUsd: number | null };

/** The taxonomy is per-group and the merchant edits it, so it travels with every request. */
const legendOf = (taxonomy: TaxonomyEntry[]) =>
  taxonomy.map((t) => `- ${t.key}: ${t.en} / ${t.zh} (e.g. ${t.keywords.slice(0, 6).join(", ")})`).join("\n");

const listOf = (batch: CategorizeItem[]) =>
  batch.map((it, i) => `${i}. ${it.title.replace(/\s+/g, " ").slice(0, 200)}`).join("\n");

const askOf = (taxonomy: TaxonomyEntry[], batch: CategorizeItem[]) =>
  `Taxonomy keys:\n${legendOf(taxonomy)}\n\nListings (index. title):\n${listOf(batch)}\n\nReturn one result per index.`;

/** Keeps only keys that exist in this group's taxonomy — the model is asked for them, but a wrong or
 *  hallucinated key must never reach the database. UNCLASSIFIED is dropped so the row is retried. */
function collect(out: Map<string, string>, batch: CategorizeItem[], results: { i?: unknown; key?: unknown }[], keys: string[]) {
  for (const r of results) {
    const item = typeof r.i === "number" ? batch[r.i] : undefined;
    const key = typeof r.key === "string" ? r.key : "";
    if (item && key !== UNCLASSIFIED && keys.includes(key)) out.set(item.id, key);
  }
}

async function categorizeViaSdk(apiKey: string, items: CategorizeItem[], taxonomy: TaxonomyEntry[]): Promise<CategorizeResult> {
  const keys = taxonomy.map((t) => t.key);
  const out = new Map<string, string>();
  const schema = z.object({
    results: z.array(z.object({ i: z.number().int(), key: z.enum([UNCLASSIFIED, ...keys] as [string, ...string[]]) })),
  });
  const client = new Anthropic({ apiKey });
  for (let b = 0; b < items.length; b += LLM_BATCH) {
    const batch = items.slice(b, b + LLM_BATCH);
    const res = await client.messages.parse({
      model: LLM_MODEL,
      max_tokens: 2048,
      system: categorizeSystem(),
      messages: [{ role: "user", content: askOf(taxonomy, batch) }],
      output_config: { format: zodOutputFormat(schema) },
    });
    if (res.stop_reason === "refusal") continue;
    collect(out, batch, res.parsed_output?.results ?? [], keys);
  }
  return { got: out, costUsd: null };
}

/** The skill carries the rules and the output shape; the prompt only invokes it and supplies the batch. */
async function categorizeViaCli(bin: string, items: CategorizeItem[], taxonomy: TaxonomyEntry[]): Promise<CategorizeResult> {
  const keys = taxonomy.map((t) => t.key);
  const out = new Map<string, string>();
  let costUsd: number | null = null;
  // Bigger batches than the sdk path: each `claude -p` re-sends its own system prompt, so the cost is
  // per invocation rather than per title.
  for (let b = 0; b < items.length; b += CLI_BATCH) {
    const batch = items.slice(b, b + CLI_BATCH);
    const res = await runClaudeCli(bin, LLM_MODEL, `/${skillRef(SKILLS.categorize)}\n\n${askOf(taxonomy, batch)}`);
    if (res.costUsd !== null) costUsd = (costUsd ?? 0) + res.costUsd;
    const parsed = extractJson(res.text) as { results?: { i?: unknown; key?: unknown }[] };
    collect(out, batch, parsed.results ?? [], keys);
  }
  return { got: out, costUsd };
}

export async function llmCategorize(
  backend: { kind: "sdk"; apiKey: string } | { kind: "cli"; bin: string },
  items: CategorizeItem[],
  taxonomy: TaxonomyEntry[],
): Promise<CategorizeResult> {
  if (!taxonomy.length || !items.length) return { got: new Map(), costUsd: null };
  return backend.kind === "cli"
    ? categorizeViaCli(backend.bin, items, taxonomy)
    : categorizeViaSdk(backend.apiKey, items, taxonomy);
}

/** Same rules the cli backend loads as a skill — SKILL.md is the single source of truth for both. */
const translateSystem = (): string => skillBody(SKILLS.translate);

/** Thai titles for Chinese listings. Same batching and refusal handling as llmCategorize. */
export async function llmTranslate(apiKey: string, items: { id: string; title: string }[]) {
  const out = new Map<string, string>();
  if (!items.length) return out;
  const schema = z.object({ results: z.array(z.object({ i: z.number().int(), th: z.string().max(300) })) });
  const client = new Anthropic({ apiKey });
  for (let b = 0; b < items.length; b += LLM_BATCH) {
    const batch = items.slice(b, b + LLM_BATCH);
    const list = batch.map((it, i) => `${i}. ${it.title.replace(/\s+/g, " ").slice(0, 200)}`).join("\n");
    const res = await client.messages.parse({
      model: LLM_MODEL,
      max_tokens: 4096,
      system: translateSystem(),
      messages: [{ role: "user", content: `Listings (index. title):\n${list}\n\nReturn one Thai translation per index.` }],
      output_config: { format: zodOutputFormat(schema) },
    });
    if (res.stop_reason === "refusal") continue;
    for (const r of res.parsed_output?.results ?? []) {
      const item = batch[r.i];
      const th = r.th.trim();
      if (item && th) out.set(item.id, th.slice(0, 300));
    }
  }
  return out;
}
