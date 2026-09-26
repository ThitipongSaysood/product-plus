// Thai titles for scraped (mostly Chinese) listings. Manual job: it only touches products that have
// no translation yet, so re-running it costs nothing for titles already done. The original title is
// never overwritten — it is what you paste back into the platform to find the listing again.
//
// How to translate lives in ONE place: apps/api/claude-plugin/skills/translate-listing-titles/SKILL.md.
// The cli backend loads it as a Claude Code skill; the sdk backend sends the same text as its system
// prompt. Edit the skill to change the wording — no TypeScript change needed.
//
// Three backends, chosen by the AI_BACKEND setting:
//   sdk        — api.anthropic.com with ANTHROPIC_API_KEY
//   openrouter — the same Messages API through openrouter.ai with OPENROUTER_API_KEY (reports its cost)
//   cli — a logged-in `claude` binary on this host; no key, but per-invocation overhead → bigger batches
import { and, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { products } from "../db/schema.js";
import { NOTE } from "../domain/notes.js";
import { getSetting } from "../settings/settings.js";
import { CLI_BATCH, CLI_CONCURRENCY, extractJson, pooled, runClaudeCli, skillRef, SKILLS } from "./claude-cli.js";
import { aiBackend, apiClient, llmTranslate, LLM_BATCH, LLM_EFFORT, LLM_MODEL } from "./llm.js";

export const TRANSLATE_LIMIT = 500;

/** No Thai title, or one without a single Thai letter: the skill used to return English (Temu) titles
 *  as they were, lightly tidied, and those read as untranslated next to Thai ones. */
export const notTranslated = or(isNull(products.titleTh), sql`${products.titleTh} !~ '[ก-๛]'`)!;


type Item = { id: string; title: string };
type BatchResult = { got: Map<string, string>; costUsd: number | null };

export function listPrompt(batch: Item[]): string {
  const list = batch.map((it, i) => `${i}. ${it.title.replace(/\s+/g, " ").slice(0, 200)}`).join("\n");
  return `Listings (index. title):\n${list}`;
}

/** The skill carries the rules and the output shape; the prompt only invokes it and supplies the batch. */
async function translateViaCli(batch: Item[]): Promise<BatchResult> {
  const bin = (await getSetting("CLAUDE_CLI_PATH")) ?? "claude";
  const res = await runClaudeCli(bin, LLM_MODEL, `/${skillRef(SKILLS.translate)}\n\n${listPrompt(batch)}`, LLM_EFFORT);
  const parsed = extractJson(res.text) as { results?: { i?: unknown; th?: unknown }[] };
  const got = new Map<string, string>();
  for (const r of parsed.results ?? []) {
    const item = typeof r.i === "number" ? batch[r.i] : undefined;
    const th = typeof r.th === "string" ? r.th.trim() : "";
    if (item && th) got.set(item.id, th.slice(0, 300));
  }
  return { got, costUsd: res.costUsd };
}

/** `redo` re-translates titles that already have a Thai version. The rules live in a skill that gets
 *  edited, so an improved skill has to be able to reach rows the first pass already filled — without it
 *  the only way to fix a bad batch is to clear the column by hand. It costs a full run, so it is opt-in. */
export async function runTranslate(
  groupId: string,
  onProgress?: (done: number, total: number) => Promise<void>,
  redo = false,
) {
  const db = await getDb();
  const backend = await aiBackend();
  const api = await apiClient();
  if (backend !== "cli" && !api) return { total: 0, done: 0, costUsd: null, note: NOTE.translateFailed(`${backend === "openrouter" ? "OPENROUTER_API_KEY" : "ANTHROPIC_API_KEY"} is not set`) };

  const todo = await db
    .select({ id: products.id, title: products.title })
    .from(products)
    .where(
      and(
        eq(products.productGroupId, groupId),
        ...(redo ? [] : [notTranslated]),
        isNotNull(products.title),
        ne(products.title, ""),
      ),
    )
    .limit(TRANSLATE_LIMIT);
  if (!todo.length) return { total: 0, done: 0, costUsd: null, note: null };

  const items = todo as Item[];
  const size = backend === "cli" ? CLI_BATCH : LLM_BATCH;
  const batches: Item[][] = [];
  for (let b = 0; b < items.length; b += size) batches.push(items.slice(b, b + size));

  let finished = 0;
  // Each batch writes its own rows as soon as it lands, so a failure halfway keeps the earlier work and
  // the next run picks up only what is still missing.
  const run = (batch: Item[]) => async (): Promise<BatchResult> => {
    const r: BatchResult =
      backend === "cli" ? await translateViaCli(batch) : await llmTranslate(api!, batch);
    const now = new Date();
    const byText = new Map<string, string[]>();
    for (const [id, th] of r.got) byText.set(th, [...(byText.get(th) ?? []), id]);
    await db.transaction(async (tx) => {
      for (const [th, ids] of byText) await tx.update(products).set({ titleTh: th, titleThAt: now }).where(inArray(products.id, ids));
    });
    finished += batch.length;
    await onProgress?.(Math.min(finished, items.length), items.length);
    return r;
  };

  // Batches are independent, so they run concurrently on both backends — wall-clock is what makes this job feel slow.
  const settled = await pooled(batches.map(run), CLI_CONCURRENCY);

  let done = 0;
  let costUsd: number | null = null;
  let failed: string | null = null;
  for (const s of settled) {
    if (s.status === "fulfilled") {
      done += s.value.got.size;
      if (s.value.costUsd !== null) costUsd = (costUsd ?? 0) + s.value.costUsd;
    } else if (!failed) {
      failed = String((s.reason as Error)?.message ?? s.reason).slice(0, 200);
    }
  }
  return { total: items.length, done, costUsd, note: failed ? NOTE.translateFailed(failed) : NOTE.translated(done, items.length) };
}
