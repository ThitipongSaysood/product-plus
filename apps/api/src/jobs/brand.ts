// Brand scout: which listings are worth ordering under the merchant's own label.
//
// The arithmetic lives in domain/brand-brief.ts and the judgement lives in the brand-candidates skill;
// this file only moves data between them. The report is stored on its own `scrape_runs` row (kind
// "brand", body in `report`) — that table already carries a jsonb column, a cost, a note and a
// one-at-a-time guard. It gains one nullable jsonb column for the body rather than a whole table,
// which would duplicate the status, cost and timing it already tracks.
import { and, desc, eq, inArray } from "drizzle-orm";
import type { BrandItem, BrandReport, BrandResponse, Locale, Platform, SoldPeriod, TaxonomyEntry, TrendLabel } from "@pp/contracts";
import { getDb } from "../db/client.js";
import { productGroups, products, scrapeRuns } from "../db/schema.js";
import { buildBrief, type BriefInput, scoreCandidates } from "../domain/brand-brief.js";
import { supplyTerms } from "../domain/normalize/supply.js";
import { getSetting } from "../settings/settings.js";
import { extractJson, runClaudeCli, skillBody, skillRef, SKILLS } from "./claude-cli.js";
import { aiBackend, apiClient, BRAND_EFFORT, BRAND_MODEL } from "./llm.js";

/** Enough to see the shape of a catalogue without paying for a prompt nobody reads. */
const MAX_CANDIDATES = 60;

/** Upper bound on what reaches the page. Keep in step with the cap written in brand-candidates/SKILL.md. */
export const MAX_PICKS = 12;

export async function loadBriefInput(groupId: string): Promise<{ rows: BriefInput[]; taxonomy: TaxonomyEntry[]; name: string }> {
  const db = await getDb();
  const [group] = await db.select().from(productGroups).where(eq(productGroups.id, groupId));
  const rs = await db.select().from(products).where(and(eq(products.productGroupId, groupId), eq(products.isActive, true)));
  const rows: BriefInput[] = rs.map((p) => {
    const supply = supplyTerms(p.platform as Platform, p.raw);
    return {
      id: p.id,
      platform: p.platform as Platform,
      title: p.title,
      titleTh: p.titleTh,
      price: p.price,
      entryPrice: supply?.entryPrice ?? null,
      currency: p.currency,
      moq: supply?.moq ?? null,
      unit: supply?.unit ?? null,
      soldCount: p.latestSoldCount,
      soldPeriod: p.latestSoldPeriod as SoldPeriod,
      soldLowerBound: p.latestSoldLowerBound,
      trend: p.trendLabel as TrendLabel,
      categoryKey: p.categoryKey ?? "unclassified",
      shopName: p.shopName,
      orderCount: supply?.orderCount ?? null,
    };
  });
  return { rows, taxonomy: group.taxonomy as TaxonomyEntry[], name: group.name };
}

/** Keeps only ids the brief actually contained — a hallucinated id must never reach the UI as a link. */
function sanitize(parsed: unknown, validIds: Set<string>): Pick<BrandReport, "summary" | "picks" | "avoid"> {
  const r = (parsed ?? {}) as { summary?: unknown; picks?: unknown[]; avoid?: unknown[] };
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x, 300)).filter(Boolean).slice(0, 8) : []);
  const picks = (Array.isArray(r.picks) ? r.picks : [])
    .map((p) => p as Record<string, unknown>)
    .filter((p) => typeof p.id === "string" && validIds.has(p.id))
    // Matches the cap in the skill. A larger number here would not produce more picks — the model
    // decides how many to return — it only stops a malformed reply from filling the page.
    .slice(0, MAX_PICKS)
    .map((p) => ({
      id: p.id as string,
      why: str(p.why, 800),
      pros: list(p.pros),
      cons: list(p.cons),
      confidence: (["high", "medium", "low"] as const).includes(p.confidence as never) ? (p.confidence as "high" | "medium" | "low") : "low",
    }));
  const avoid = (Array.isArray(r.avoid) ? r.avoid : [])
    .map((p) => p as Record<string, unknown>)
    .filter((p) => typeof p.id === "string" && validIds.has(p.id))
    .slice(0, 8)
    .map((p) => ({ id: p.id as string, reason: str(p.reason, 400) }));
  return { summary: str(r.summary, 1200), picks, avoid };
}

export async function runBrandScout(groupId: string, lang: Locale = "th"): Promise<{ report: BrandReport | null; costUsd: number | null; note: string | null }> {
  const { rows, taxonomy, name } = await loadBriefInput(groupId);
  const brief = buildBrief(rows, taxonomy, name, lang, MAX_CANDIDATES);
  if (!brief.candidates.length) {
    return { report: null, costUsd: null, note: "brand.noCandidates" };
  }

  const ask = JSON.stringify(brief);
  const backend = await aiBackend();
  let text: string;
  let costUsd: number | null = null;
  if (backend === "cli") {
    const bin = (await getSetting("CLAUDE_CLI_PATH")) ?? "claude";
    const res = await runClaudeCli(bin, BRAND_MODEL, `/${skillRef(SKILLS.brand)}\n\n${ask}`, BRAND_EFFORT);
    text = res.text;
    costUsd = res.costUsd;
  } else {
    const api = await apiClient();
    if (!api) return { report: null, costUsd: null, note: "brand.needsKey" };
    const res = await api.client.messages.create({
      model: api.model(BRAND_MODEL),
      max_tokens: 4096,
      system: skillBody(SKILLS.brand),
      messages: [{ role: "user", content: ask }],
      output_config: { effort: BRAND_EFFORT },
    });
    text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    costUsd = api.costOf(res);
  }

  const ids = new Set(brief.candidates.map((c) => c.id));
  const body = sanitize(extractJson(text), ids);
  // Scored from the same brief the model read, but never sent to it: the skill's job is the judgement
  // a number cannot make, and a model handed a score tends to restate it as prose instead.
  const all = scoreCandidates(brief);
  const shown = new Set([...body.picks.map((p) => p.id), ...body.avoid.map((a) => a.id)]);
  const report: BrandReport = {
    ...body,
    generatedAt: new Date().toISOString(),
    model: BRAND_MODEL,
    lang,
    candidateCount: brief.candidates.length,
    excluded: brief.excluded,
    limits: brief.limits,
    scores: Object.fromEntries(Object.entries(all).filter(([id]) => shown.has(id))),
  };
  return { report, costUsd, note: null };
}

/** The newest stored report for a group with the product facts for everything it mentions, or an empty result
 *  before the job has ever run. Looked up by id rather than paged through the catalogue. */
export async function latestBrandReport(groupId: string): Promise<BrandResponse> {
  const db = await getDb();
  const [run] = await db
    .select({ report: scrapeRuns.report })
    .from(scrapeRuns)
    .where(and(eq(scrapeRuns.productGroupId, groupId), eq(scrapeRuns.kind, "brand"), eq(scrapeRuns.status, "succeeded")))
    .orderBy(desc(scrapeRuns.startedAt))
    .limit(1);
  const report = (run?.report as BrandReport | undefined) ?? null;
  if (!report) return { report: null, items: {} };

  const ids = [...new Set([...report.picks.map((p) => p.id), ...report.avoid.map((a) => a.id)])];
  if (!ids.length) return { report, items: {} };
  const rs = await db.select().from(products).where(inArray(products.id, ids));
  const items = Object.fromEntries(
    rs.map((p): [string, BrandItem] => {
      const supply = supplyTerms(p.platform as Platform, p.raw);
      const th = p.titleTh?.trim();
      return [
        p.id,
        {
          id: p.id,
          title: th || p.title?.trim() || p.id,
          titleLang: th ? "th" : "zh",
          platform: p.platform as Platform,
          imageId: p.imageMediaId,
          imageSourceUrl: p.imageSourceUrl,
          imageLost: p.imageLost,
          productUrl: p.productUrl,
          buyPrice: supply?.entryPrice ?? p.price,
          currency: p.currency as BrandItem["currency"],
          sold: {
            count: p.latestSoldCount,
            period: p.latestSoldPeriod as SoldPeriod,
            lowerBound: p.latestSoldLowerBound,
            text: p.latestSoldText,
          },
          moq: supply?.moq ?? null,
          unit: supply?.unit ?? null,
          categoryKey: p.categoryKey ?? "unclassified",
          trend: p.trendLabel as TrendLabel,
        },
      ];
    }),
  );
  return { report, items };
}
