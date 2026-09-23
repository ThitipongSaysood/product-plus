// Size / model attributes from the title (handoff §9: attributes, not categories).
const SIZES = new Set([38, 40, 41, 42, 44, 45, 46, 49]);

export function extractAttrs(title: string | null): { sizes?: string[]; models?: string[] } {
  if (!title) return {};
  const sizes = new Set<number>();
  // "41mm" · "42/44/45mm" · "38 40 41毫米"
  for (const m of title.matchAll(/((?:\d{2}\s*[/、,&\s]\s*)*\d{2})\s*(?:mm|毫米)/gi))
    for (const n of m[1].match(/\d{2}/g) ?? []) if (SIZES.has(Number(n))) sizes.add(Number(n));

  const models = new Set<string>();
  const ultra = title.match(/ultra\s*(\d)?(?!\d)/i);
  if (ultra) models.add(ultra[1] ? `Ultra ${ultra[1]}` : "Ultra");
  if (/(?<![A-Za-z])SE(?![A-Za-z])/i.test(title)) models.add("SE");
  const series = (list: string) => {
    for (const n of list.split(/\s*\/\s*/).map(Number)) if (n >= 1 && n <= 12) models.add(`Series ${n}`);
  };
  const list = String.raw`(\d{1,2}(?:\s*\/\s*\d{1,2})*)(?!\d)`;
  // "Series 9" · "s11/10/9" · "iWatchS12" (capital S after a word) · "watch10"
  for (const m of title.matchAll(new RegExp(String.raw`series\s*${list}`, "gi"))) series(m[1]);
  for (const m of title.matchAll(new RegExp(String.raw`(?<![A-Za-z])[sS]${list}`, "g"))) series(m[1]);
  for (const m of title.matchAll(new RegExp(String.raw`(?<=[a-z])S${list}`, "g"))) series(m[1]);
  for (const m of title.matchAll(new RegExp(String.raw`watch\s*${list}`, "gi"))) series(m[1]);

  const out: { sizes?: string[]; models?: string[] } = {};
  if (sizes.size) out.sizes = [...sizes].sort((a, b) => a - b).map((n) => `${n}mm`);
  if (models.size) out.models = [...models].sort();
  return out;
}
