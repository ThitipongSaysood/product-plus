// Pure keyword helpers (CONTEXT.md: Keyword · Keyword trial · Keyword suggestion · Language mismatch).
// No Nest / DB here — unit-tested in test/keywords.test.ts.
import type { FrequentTerm, KeywordSuggestion, Platform, TrialItem } from "@pp/contracts";
import { planRound } from "./budget.js";
import { smokeCap } from "./guards.js";
import type { ProductInput } from "./types.js";

// ---------- Language mismatch ----------
// Mirrored in apps/web/lib/keyword-lang.ts — change both together, or the form warns about one rule
// while the api enforces another.
const CJK = /[㐀-鿿豈-﫿]/;
const LATIN = /[A-Za-z]/;
const CJK_PLATFORMS: readonly Platform[] = ["douyin", "1688", "xhs"];

/** 1688, Douyin and XHS match an English term against any text that contains it (2026-09-24:
 *  `Tempered Glass` returned 150 rows, 0 of them watch products), so they need Chinese; Temu is English. */
export function languageMismatch(platform: Platform, keyword: string): boolean {
  if (CJK_PLATFORMS.includes(platform)) return !CJK.test(keyword);
  return !LATIN.test(keyword) || CJK.test(keyword);
}

// ---------- Keyword trial ----------
export const TRIAL_LIMIT = 5;
export const TRIAL_MAX_ITEMS = 8;
export const TRIAL_KEEP_MS = 7 * 86_400_000;

type TrialIn = { platform: Platform; keyword: string; region?: string | null };
type Pricing = { startFee: number; pricePerResult: number } | null;

/**
 * Which trials start and what Apify may charge each. Every trial is capped like a smoke test; the whole
 * request must fit the Group's monthly budget (spent + in-flight + these caps) — the per-round cap does not
 * apply, a trial is not a Round. Mock groups cost nothing, so only the actor check applies there.
 */
export function planTrials(i: {
  items: TrialIn[];
  mock: boolean;
  pricing: (p: Platform) => Pricing;
  budgetUsd: number;
  spentUsd: number;
  inFlightUsd: number;
  slots: number; // free Apify concurrency
}) {
  const seen = new Set<string>();
  const targets: (TrialIn & { capUsd: number })[] = [];
  const skipped: (TrialIn & { reason: string })[] = [];
  let slots = i.slots;
  for (const it of i.items) {
    const k = `${it.platform}|${it.keyword}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const pr = i.pricing(it.platform);
    if (!pr) skipped.push({ ...it, reason: "skip.noActor" });
    else if (i.mock) targets.push({ ...it, capUsd: 0 });
    else if (!(pr.pricePerResult > 0)) skipped.push({ ...it, reason: "skip.pricingUnknown" });
    else if (slots <= 0) skipped.push({ ...it, reason: "skip.concurrency" });
    else {
      slots--;
      targets.push({ ...it, capUsd: smokeCap(pr.startFee, pr.pricePerResult) });
    }
  }
  if (i.mock || !targets.length) return { targets, skipped };
  const caps = targets.map((t) => t.capUsd);
  const total = caps.reduce((s, c) => s + c, 0);
  // capUsd = total switches the per-round cap off while keeping planRound's budget arithmetic.
  const plan = planRound({ budgetUsd: i.budgetUsd, spentUsd: i.spentUsd, inFlightUsd: i.inFlightUsd, capUsd: total, estimates: caps });
  if (!plan.ok) return { targets: [], skipped: [...skipped, ...targets.map(({ capUsd: _c, ...t }) => ({ ...t, reason: plan.reason }))] };
  return { targets, skipped };
}

/** What the keyword form shows of a listing — the image stays the platform's URL (no media cache). */
export const toTrialItem = (p: ProductInput): TrialItem => ({
  title: p.title,
  imageUrl: p.imageUrl,
  price: p.price,
  currency: p.currency,
  sold: { count: p.soldCount, period: p.soldPeriod, lowerBound: p.soldIsLowerBound, text: p.soldText },
  productUrl: p.productUrl,
  rank: p.rank,
});

// ---------- Keyword suggestion: AI output ----------
export const SUGGEST_PER_PLATFORM = 6;
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** The model is asked for the right language and to skip saved keywords; this makes sure of both. */
export function cleanSuggestions(raw: unknown[], platforms: Platform[], existing: { platform: string; keyword: string }[]): KeywordSuggestion[] {
  const have = new Set(existing.map((e) => `${e.platform}|${norm(e.keyword)}`));
  const per = new Map<Platform, number>();
  const out: KeywordSuggestion[] = [];
  for (const r of raw) {
    const x = r as { platform?: unknown; keyword?: unknown; glossTh?: unknown } | null;
    const platform = x?.platform as Platform;
    const keyword = typeof x?.keyword === "string" ? x.keyword.trim().replace(/\s+/g, " ").slice(0, 100) : "";
    if (!platforms.includes(platform) || !keyword || languageMismatch(platform, keyword)) continue;
    const k = `${platform}|${norm(keyword)}`;
    if (have.has(k) || (per.get(platform) ?? 0) >= SUGGEST_PER_PLATFORM) continue;
    have.add(k);
    per.set(platform, (per.get(platform) ?? 0) + 1);
    out.push({ platform, keyword, glossTh: typeof x?.glossTh === "string" ? x.glossTh.trim().slice(0, 120) : "" });
  }
  return out;
}

// ---------- Keyword suggestion: frequent terms ----------
// Words that describe every listing in this niche. Still offered as terms, but ranked after the
// distinctive ones — "苹果手表" is in nearly every title and tells the merchant nothing new. They are
// also word boundaries: Chinese titles have no spaces, and without cutting here the grams straddle
// them ("用苹果手", "带适用苹").
const GENERIC_CJK = ["苹果手表", "手表带", "适用于", "适用", "适配", "苹果", "手表", "表带", "华为", "小米", "三星", "新款", "男女", "女款", "男款", "高级感", "官方", "正品", "专用", "系列"];
const GENERIC_SPLIT = new RegExp(`(${GENERIC_CJK.join("|")})`);
const STOP_LATIN = new Set(
  "a an and or the for with of to in on by from compatible replacement fit fits new men women womens mens unisex".split(" "),
);
const GENERIC_LATIN = new Set("apple watch iwatch band bands strap straps series ultra se wristband".split(" "));
export const FREQUENT_TOP = 12;

function grams(title: string, cjk: boolean): Set<string> {
  const out = new Set<string>();
  if (cjk) {
    for (const run of title.match(/[\u3400-\u9fff]+/g) ?? [])
      for (const seg of run.split(GENERIC_SPLIT)) {
        if (GENERIC_CJK.includes(seg)) out.add(seg);
        else for (let n = 2; n <= 4; n++) for (let i = 0; i + n <= seg.length; i++) out.add(seg.slice(i, i + n));
      }
  } else {
    // tokens with a digit are sizes and model numbers ("49mm", "s9"), not search terms
    const words = title.toLowerCase().split(/[^a-z0-9'-]+/).filter((w) => /^[a-z][a-z'-]*$/.test(w) && !STOP_LATIN.has(w));
    for (let i = 0; i < words.length; i++) {
      if (words[i].length > 1) out.add(words[i]);
      if (i + 1 < words.length) out.add(`${words[i]} ${words[i + 1]}`);
    }
  }
  return out;
}

/** "三珠不锈" and "不锈钢" share "不锈" without either containing the other. */
function partlyOverlaps(a: string, b: string): boolean {
  if (a.includes(b) || b.includes(a)) return false;
  for (let k = 1; k < Math.min(a.length, b.length); k++) if (a.endsWith(b.slice(0, k)) || b.endsWith(a.slice(0, k))) return true;
  return false;
}

/**
 * Terms that recur across a platform's listing titles, counted once per title. Deterministic:
 * CJK platforms use 2–4-character n-grams (Chinese titles have no spaces), Temu uses 1–2 words.
 * A gram is dropped when a longer one contains it in ≥80% of its titles ("小蛮" → "小蛮腰"), or when it
 * straddles a more frequent term ("三珠不锈" next to "不锈钢"). Generic-only terms rank last.
 */
export function frequentTerms(platform: Platform, titles: (string | null)[], exclude: string[] = [], top = FREQUENT_TOP): FrequentTerm[] {
  const cjk = CJK_PLATFORMS.includes(platform);
  const df = new Map<string, number>();
  for (const t of titles) if (t) for (const g of grams(t, cjk)) df.set(g, (df.get(g) ?? 0) + 1);
  const min = Math.max(2, Math.ceil(titles.length * 0.04));
  const kept = [...df].filter(([, n]) => n >= min);
  const skip = new Set(exclude.map(norm));
  const survivors = kept.filter(
    ([g, n]) =>
      !skip.has(g) &&
      !kept.some(([h, m]) => (h.length > g.length && h.includes(g) && m >= 0.8 * n) || (cjk && m > n && partlyOverlaps(g, h))),
  );
  const generic = (g: string) => (cjk ? GENERIC_CJK.includes(g) : g.split(" ").every((w) => GENERIC_LATIN.has(w)));
  return survivors
    .sort(([a, n], [b, m]) => Number(generic(a)) - Number(generic(b)) || m - n || b.length - a.length || a.localeCompare(b))
    .slice(0, top)
    .map(([term, count]) => ({ term, count }));
}

// ---------- Keyword suggestion: XHS related searches ----------
/** RELATED_KEYWORDS has never been seen live (reading one needs a paid run), so accept the shapes an
 *  actor plausibly writes: ["a","b"], [{keyword|word|text|query|name|title: "a"}], or either wrapped in
 *  {items|keywords|relatedKeywords|data: [...]}. Anything else → []. */
export function parseRelatedKeywords(v: unknown, depth = 0): string[] {
  if (depth > 2 || v == null) return [];
  if (typeof v === "string") {
    try {
      return parseRelatedKeywords(JSON.parse(v), depth + 1);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const inner = o.items ?? o.keywords ?? o.relatedKeywords ?? o.related ?? o.data;
    return inner === undefined ? [] : parseRelatedKeywords(inner, depth + 1);
  }
  const out: string[] = [];
  for (const x of v) {
    const s =
      typeof x === "string" ? x
      : x && typeof x === "object" ? ["keyword", "word", "text", "query", "name", "title"].map((k) => (x as Record<string, unknown>)[k]).find((y) => typeof y === "string")
      : undefined;
    const t = typeof s === "string" ? s.trim().slice(0, 100) : "";
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 50);
}

/** Related searches across runs, most-seen first, minus what the Group already has. */
export function rankRelated(lists: unknown[], exclude: string[], top = FREQUENT_TOP): FrequentTerm[] {
  const skip = new Set(exclude.map(norm));
  const n = new Map<string, number>();
  for (const l of lists) for (const s of parseRelatedKeywords(l)) if (!skip.has(norm(s))) n.set(s, (n.get(s) ?? 0) + 1);
  return [...n].sort(([a, x], [b, y]) => y - x || a.localeCompare(b)).slice(0, top).map(([term, count]) => ({ term, count }));
}
