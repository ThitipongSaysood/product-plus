import type { PriceTier, SupplyTerms } from "@pp/contracts";
import type { T } from "@/i18n";
import { formatMoney, formatNumber } from "@/i18n";

/** 1688 states quantities in its own counting words. Left in Chinese by the api (it is the platform's
 *  data); anything we have no word for stays as-is rather than being silently dropped. */
const UNIT_KEY: Record<string, "unit.tiao" | "unit.tao" | "unit.ge" | "unit.jian" | "unit.fu"> = {
  条: "unit.tiao",
  套: "unit.tao",
  个: "unit.ge",
  件: "unit.jian",
  副: "unit.fu",
};

export function unitLabel(t: T, unit: string | null): string {
  if (!unit) return "";
  const key = UNIT_KEY[unit];
  return key ? t(key) : unit;
}

export function qtyLabel(t: T, n: number, unit: string | null): string {
  return t("supply.qty", { n: formatNumber(t.locale, n), unit: unitLabel(t, unit) }).trim();
}

/** "1–9 เส้น" for a bounded rung, "ตั้งแต่ 100 เส้น" for an open-ended one. */
export function tierRange(t: T, tier: PriceTier, unit: string | null): string {
  const u = unitLabel(t, unit);
  return tier.maxQty === null
    ? t("supply.tierFrom", { n: formatNumber(t.locale, tier.minQty), unit: u }).trim()
    : t("supply.tierRange", { a: formatNumber(t.locale, tier.minQty), b: formatNumber(t.locale, tier.maxQty), unit: u }).trim();
}

/** The rung the buyer is actually allowed to take — the ladder is sorted ascending by the api. */
export function entryTier(s: SupplyTerms | null): PriceTier | null {
  return s?.tiers.length ? s.tiers[0] : null;
}

export function cheapestTier(s: SupplyTerms | null): PriceTier | null {
  if (!s?.tiers.length) return null;
  return s.tiers.reduce((best, t) => (t.price < best.price ? t : best), s.tiers[0]);
}

export function money(t: T, v: number, currency: string | null): string {
  return formatMoney(t.locale, v, currency ?? "CNY");
}
