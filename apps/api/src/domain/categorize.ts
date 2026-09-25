// Auto-categorization layers 1–2 (handoff §9): platform category map → keyword rules on the title.
// Layer 3 (LLM) lives in jobs/llm.ts and only sees what these two could not decide.
import type { CategorySource, CategorySuggestion, PathDecision, TaxonomyEntry, UnmappedCategory } from "@pp/contracts";

export const UNCLASSIFIED = "unclassified";
export const UNCLASSIFIED_LABEL = { th: "ยังไม่จัดหมวด", en: "Unclassified", zh: "未分类" };

/** Handoff §9 proposal + additions from the real smoke rows of 2026-09-24 (beaded/jewelry bands, films). */
export const DEFAULT_TAXONOMY: TaxonomyEntry[] = [
  { key: "material_silicone", en: "Silicone / sport band", th: "สายซิลิโคน", zh: "硅胶/运动表带", keywords: ["硅胶", "运动表带", "silicone", "sport band", "sports band", "sport strap"] },
  { key: "material_leather", en: "Leather", th: "สายหนัง", zh: "真皮表带", keywords: ["真皮", "皮革", "皮表带", "leather"] },
  {
    key: "material_metal",
    en: "Metal / stainless",
    th: "สายโลหะ",
    zh: "金属/不锈钢表带",
    keywords: ["不锈钢", "金属", "米兰尼斯", "milanese", "stainless", "link bracelet", "三珠", "五珠", "一珠", "蝴蝶扣", "304", "手镯"],
  },
  { key: "material_nylon", en: "Nylon / braided loop", th: "สายไนลอน/ถัก", zh: "尼龙/编织表带", keywords: ["尼龙", "编织", "回环", "braided", "solo loop", "nylon"] },
  { key: "style_solo_loop", en: "Solo loop (no buckle)", th: "โซโลลูป", zh: "单圈表带", keywords: ["单圈", "solo loop"] },
  { key: "style_ocean_alpine", en: "Ocean / Alpine / Ultra style", th: "สายทรง Ultra", zh: "海洋/高山表带", keywords: ["海洋", "高山", "ocean band", "alpine"] },
  // "ultra" dropped from §9: real titles use it for model compatibility (a attrs.models value), not style.
  { key: "style_beaded", en: "Beaded / jewelry band", th: "สายลูกปัด/เครื่องประดับ", zh: "串珠/饰品表带", keywords: ["串珠", "水晶", "珍珠", "手链", "手作", "beaded", "crystal"] },
  {
    key: "accessory_case",
    en: "Case / protector (not a band)",
    th: "เคส/ฟิล์ม ไม่ใช่สาย",
    zh: "保护壳/膜（非表带）",
    keywords: ["保护壳", "保护套", "钢化膜", "保护膜", "背膜", "膜", "case", "screen protector"],
  },
  { key: "bundle_set", en: "Multi-pack / set", th: "เซ็ตหลายเส้น", zh: "多条装套装", keywords: ["套装", "多条装", "pack", "set of"] },
];

export const pathKey = (path: string[]) => path.join(" > ");

/**
 * category_map value for a platform path the merchant (or the AI) judged too broad to name one of our
 * categories — "smartwatch bands" holds silicone, metal and leather alike. The longest matching prefix
 * still wins, so a broad path stops layer 1 and hands the listing to the keyword rules; it also takes the
 * path out of the unmapped queue. Taxonomy keys cannot start with "_", so it can never collide.
 */
export const BROAD_PATH = "_broad";

/** What category_map says about a path: a taxonomy key, BROAD_PATH, or null when nobody decided yet. */
export function mapDecision(platform: string, path: string[] | null, map: Map<string, string>): string | null {
  if (!path?.length) return null;
  for (let n = path.length; n > 0; n--) {
    const hit = map.get(`${platform}|${pathKey(path.slice(0, n))}`);
    if (hit) return hit;
  }
  return null;
}

/** Layer 1: longest prefix of the platform path found in category_map (key = `${platform}|${path}`). */
export function fromPlatformMap(platform: string, path: string[] | null, map: Map<string, string>): string | null {
  const hit = mapDecision(platform, path, map);
  return hit === BROAD_PATH ? null : hit;
}

/** Layer 2: the taxonomy keyword that appears EARLIEST in the title wins; a tie between keys = undecided. */
export function fromRules(title: string | null, taxonomy: TaxonomyEntry[]): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  let best: { key: string; at: number } | null = null;
  let tie = false;
  for (const entry of taxonomy) {
    const at = Math.min(...entry.keywords.map((k) => t.indexOf(k.toLowerCase())).filter((i) => i >= 0), Infinity);
    if (at === Infinity) continue;
    if (!best || at < best.at) {
      best = { key: entry.key, at };
      tie = false;
    } else if (at === best.at) tie = true;
  }
  return best && !tie ? best.key : null;
}

export function categorize(
  p: { platform: string; title: string | null; platformCategoryPath: string[] | null },
  map: Map<string, string>,
  taxonomy: TaxonomyEntry[],
): { key: string; source: CategorySource } | null {
  const mapped = fromPlatformMap(p.platform, p.platformCategoryPath, map);
  if (mapped) return { key: mapped, source: "platform" };
  const ruled = fromRules(p.title, taxonomy);
  return ruled ? { key: ruled, source: "rules" } : null;
}

const CATEGORY_SUGGEST_MAX = 6;
const nameOf = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 80) : "");

/**
 * AI category proposals are only as good as the rules they feed: a keyword counts when it is literally in
 * one of the unclassified titles (the rules are a substring match), and a line counts when, added to the
 * taxonomy, the same fromRules() would sort at least 2 different titles into it. The model is told this;
 * this is where it is enforced, so the count the merchant sees is the effect they get. `titles` has one entry
 * per listing, so `matches` counts listings; the ≥ 2 is counted on distinct titles.
 */
export function cleanCategorySuggestions(raw: unknown[], taxonomy: TaxonomyEntry[], titles: string[]): CategorySuggestion[] {
  const taken = new Set([...taxonomy.map((t) => t.key), UNCLASSIFIED]);
  const lower = titles.map((t) => t.toLowerCase());
  const out: CategorySuggestion[] = [];
  for (const r of raw) {
    const x = r as { key?: unknown; en?: unknown; th?: unknown; zh?: unknown; keywords?: unknown } | null;
    const key = typeof x?.key === "string" ? x.key.trim().toLowerCase() : "";
    const [en, th, zh] = [nameOf(x?.en), nameOf(x?.th), nameOf(x?.zh)];
    if (!/^[a-z0-9_]{1,40}$/.test(key) || taken.has(key) || !en || !th || !zh) continue;
    const words = Array.isArray(x?.keywords) ? x.keywords.filter((k): k is string => typeof k === "string") : [];
    const keywords = [...new Set(words.map((k) => k.trim()).filter((k) => k && k.length <= 40 && lower.some((t) => t.includes(k.toLowerCase()))))].slice(0, 12);
    if (!keywords.length) continue;
    const entry: TaxonomyEntry = { key, en, th, zh, keywords };
    const caught = titles.filter((t) => fromRules(t, [...taxonomy, entry]) === key);
    const distinct = [...new Set(caught)]; // one listing relisted under the same title is not a pattern
    if (distinct.length < 2) continue;
    taken.add(key);
    out.push({ ...entry, matches: caught.length, examples: distinct.slice(0, 3) });
  }
  return out.sort((a, b) => b.matches - a.matches).slice(0, CATEGORY_SUGGEST_MAX);
}

/**
 * Mapping a platform path sends every listing under it to one key, ahead of the keyword rules. So a
 * mapping is refused when more than a fifth of the listings the rules already sorted under that path went
 * to a different key: the path is broad, and mapping it would undo correct work. This backs up the AI's
 * judgement with the one fact that decides it.
 */
export const MAP_DISAGREE_MAX = 0.2;
export function mappingSafe(key: string, ruleSplit: Record<string, number>): boolean {
  const sorted = Object.entries(ruleSplit).filter(([k]) => k !== UNCLASSIFIED);
  const total = sorted.reduce((n, [, c]) => n + c, 0);
  const other = sorted.filter(([k]) => k !== key).reduce((n, [, c]) => n + c, 0);
  return total === 0 || other / total <= MAP_DISAGREE_MAX;
}

export type PathBrief = UnmappedCategory & { titles: string[]; ruleSplit: Record<string, number> };

/** AI path decisions → what gets saved. A "map" needs a real taxonomy key AND mappingSafe(); anything else
 *  the model decided becomes broad (with the reason why). A path the model skipped stays undecided. */
export function cleanPathDecisions(raw: unknown[], briefs: PathBrief[], keys: string[]): PathDecision[] {
  const out = new Map<number, PathDecision>();
  for (const r of raw) {
    const x = r as { i?: unknown; decision?: unknown; key?: unknown; reasonTh?: unknown } | null;
    const i = typeof x?.i === "number" ? x.i : -1;
    const b = briefs[i];
    if (!b || out.has(i) || (x?.decision !== "map" && x?.decision !== "broad")) continue;
    const reasonTh = typeof x.reasonTh === "string" ? x.reasonTh.trim().slice(0, 120) : "";
    const key = typeof x.key === "string" ? x.key : "";
    const wantsMap = x.decision === "map" && keys.includes(key);
    const safe = wantsMap && mappingSafe(key, b.ruleSplit);
    out.set(i, {
      platform: b.platform,
      path: b.path,
      count: b.count,
      categoryKey: safe ? key : null,
      reasonTh: wantsMap && !safe ? "catmap.guardBroad" : reasonTh,
    });
  }
  return [...out.values()];
}
