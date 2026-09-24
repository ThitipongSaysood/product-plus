// How you actually buy a listing: the smallest order the seller accepts, what one unit is, and the
// quantity→price ladder. The 1688 actor sends all of it on every row, but `normalize1688` only kept
// `price.min` — which is the CHEAPEST rung of that ladder, not what you pay at the minimum order.
// Measured on real rows: 16 of 30 laddered products showed a price you cannot buy at (¥9 on screen,
// ¥13.50 at an order of one). This module is what lets the UI say which is which.
//
// Read straight off `products.raw`, which `jobs/ingest.ts` rewrites on every run — so there is no
// column to migrate, no backfill, and no way for a stored copy to drift from the actor payload.
// Everything here is untrusted scraped input: validate, bound, and return null rather than throw.
import type { Platform } from "@pp/contracts";
import { arr, get, int, num, str, url } from "./pick.js";

/** One rung: "≥100条 ¥1.35" or "1~499条 ¥6". `maxQty` null means the rung has no upper bound. */
export type PriceTier = { minQty: number; maxQty: number | null; price: number };

export type SupplyTerms = {
  /** Smallest order the seller accepts, in `unit`s. */
  moq: number | null;
  /** The platform's own unit word, still in Chinese (条/套/个/件/副) — the web layer maps it. */
  unit: string | null;
  /** Ascending by `minQty`, deduped, at most MAX_TIERS. Empty when the listing has no ladder. */
  tiers: PriceTier[];
  /** What one minimum order costs per unit — the ladder rung you are actually allowed to buy. */
  entryPrice: number | null;
  /** Cheapest rung. Equal to `entryPrice` when there is no ladder or only one rung. */
  lowestPrice: number | null;
  /** Distinct orders placed, NOT units sold and with no time window attached. */
  orderCount: number | null;
  videoUrl: string | null;
};

// A listing with more rungs than this is a malformed payload, not a price ladder.
const MAX_TIERS = 12;

/** Ladders are not always cheapest-last — one real row runs 1~1个 ¥4 up to ¥10 — so never index blind. */
function tiers(raw: unknown): PriceTier[] {
  const out: PriceTier[] = [];
  for (const row of arr(get(raw, "quantityPrices")).slice(0, MAX_TIERS)) {
    const minQty = int(get(row, "quantityMin"));
    const price = num(get(row, "price"));
    if (minQty === null || minQty < 0 || price === null || price < 0) continue;
    const maxQty = int(get(row, "quantityMax"));
    out.push({ minQty, maxQty: maxQty !== null && maxQty >= minQty ? maxQty : null, price });
  }
  out.sort((a, b) => a.minQty - b.minQty);
  return out.filter((t, i) => i === 0 || t.minQty !== out[i - 1].minQty);
}

/** 1688 is the only actor that sends buying terms — the retail platforms have no such concept. */
export function supplyTerms(platform: Platform, raw: unknown): SupplyTerms | null {
  if (platform !== "1688" || !raw || typeof raw !== "object") return null;
  const ladder = tiers(raw);
  const declared = int(get(raw, "minOrderQuantity"));
  // The two agree on 29 of 30 real rows; the ladder's first rung is the fallback when only one exists.
  const moq = declared !== null && declared > 0 ? declared : (ladder[0]?.minQty ?? null);
  const unit = str(get(raw, "unit"));
  const orderCount = int(get(raw, "orderCount"));
  const terms: SupplyTerms = {
    moq,
    unit: unit && unit.length <= 8 ? unit : null,
    tiers: ladder,
    entryPrice: ladder.length ? ladder[0].price : null,
    lowestPrice: ladder.length ? Math.min(...ladder.map((t) => t.price)) : null,
    orderCount: orderCount !== null && orderCount >= 0 ? orderCount : null,
    videoUrl: url(get(raw, "videoUrl")),
  };
  // Nothing worth sending to the browser — keep the payload and the UI free of empty rows.
  const empty =
    terms.moq === null && !terms.tiers.length && terms.orderCount === null && !terms.videoUrl && !terms.unit;
  return empty ? null : terms;
}

/** True when the headline `products.price` is a bulk rung the buyer cannot reach at the minimum order. */
export function priceIsBulkOnly(price: number | null, terms: SupplyTerms | null): boolean {
  return price !== null && terms?.entryPrice != null && terms.entryPrice > price;
}
