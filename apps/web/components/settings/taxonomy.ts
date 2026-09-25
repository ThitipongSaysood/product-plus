import type { TaxonomyEntry } from "@pp/contracts";

// Taxonomy editor format, one entry per line:  key | en | th | zh | keyword1, keyword2
export function taxonomyToText(list: TaxonomyEntry[]): string {
  return list.map((e) => [e.key, e.en, e.th, e.zh, e.keywords.join(", ")].join(" | ")).join("\n");
}

export function parseTaxonomy(text: string): { entries: TaxonomyEntry[]; errors: { line: number; reason: "columns" | "key" | "duplicate" | "reserved" }[] } {
  const entries: TaxonomyEntry[] = [];
  const errors: { line: number; reason: "columns" | "key" | "duplicate" | "reserved" }[] = [];
  const seen = new Set<string>();
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cols = line.split("|").map((c) => c.trim());
    if (cols.length < 4 || cols.length > 5) return errors.push({ line: i + 1, reason: "columns" });
    const [key, en, th, zh, kw = ""] = cols;
    if (!/^[a-z0-9_]+$/.test(key) || key.startsWith("_")) return errors.push({ line: i + 1, reason: "key" }); // "_" is kept for the api's "too broad" mark
    if (key === "unclassified") return errors.push({ line: i + 1, reason: "reserved" });
    if (seen.has(key)) return errors.push({ line: i + 1, reason: "duplicate" });
    seen.add(key);
    entries.push({ key, en, th, zh, keywords: kw.split(/[,，]/).map((k) => k.trim()).filter(Boolean) });
  });
  return { entries, errors };
}
