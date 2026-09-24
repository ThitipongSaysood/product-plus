// Auto-categorization layers 1–2 (handoff §9): platform category map → keyword rules on the title.
// Layer 3 (LLM) lives in jobs/llm.ts and only sees what these two could not decide.
import type { CategorySource, TaxonomyEntry } from "@pp/contracts";

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

/** Layer 1: longest prefix of the platform path found in category_map (key = `${platform}|${path}`). */
export function fromPlatformMap(platform: string, path: string[] | null, map: Map<string, string>): string | null {
  if (!path?.length) return null;
  for (let n = path.length; n > 0; n--) {
    const hit = map.get(`${platform}|${pathKey(path.slice(0, n))}`);
    if (hit) return hit;
  }
  return null;
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
