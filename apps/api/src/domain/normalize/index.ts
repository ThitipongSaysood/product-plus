// Per-platform normalizers → ProductInput (handoff §7). Field names were checked against REAL
// smoke-run rows for douyin/1688/xhs (test/fixtures/real) and the README for temu.
// A row that cannot be read returns null (never throws): itemsIn − itemsOut = schema-drift signal.
import type { Platform } from "@pp/contracts";
import { MAX_RESULTS, type ProductInput } from "../types.js";
import { arr, bool, get, int, num, parseCountText, pick, str, uniq, url } from "./pick.js";

type Normalizer = (row: unknown, index: number, keyword: string) => ProductInput | null;

const base = (platform: Platform, row: unknown, index: number, keyword: string) => ({
  platform,
  rank: int(pick(row, "searchPosition", "rank", "position")) ?? index + 1,
  keyword: str(pick(row, "keyword", "sourceKeyword", "searchKeyword")) ?? keyword,
  raw: row,
});

const imageList = (v: unknown) => arr(v).map((x) => url(typeof x === "string" ? x : pick(x, "url", "imgUrl", "src")));

/** "20260607" → "2026-06-07" */
const isoDate = (v: unknown) => {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

export const normalizeDouyin: Normalizer = (row, index, keyword) => {
  const externalId = str(pick(row, "productId", "product_id", "id"));
  if (!externalId) return null;
  const cents = num(pick(row, "price.amountCents"));
  const monthly = int(pick(row, "sales.monthlySold", "monthlySold"));
  const trend = arr(pick(row, "sales.salesTrend", "salesTrend"))
    .map((p) => ({ date: isoDate(get(p, "date")), units: int(get(p, "units")) }))
    .filter((p): p is { date: string; units: number } => p.date !== null && p.units !== null);
  const path = ["first", "second", "third", "fourth"]
    .map((k) => str(pick(row, `category.${k}.name`)))
    .filter((s): s is string => s !== null);
  const main = url(pick(row, "mainImage", "whiteImage", "image", "cover"));
  return {
    ...base("douyin", row, index, keyword),
    externalId,
    title: str(pick(row, "title", "name")),
    productUrl: url(pick(row, "detailUrl", "productUrl", "url")),
    imageUrl: main,
    imageUrls: uniq([main, url(pick(row, "whiteImage")), ...imageList(pick(row, "headImages", "gallery"))]),
    price: num(pick(row, "price.amount", "price.price", "price")) ?? (cents !== null ? cents / 100 : null),
    currency: "CNY",
    originalPrice: num(pick(row, "price.originalAmount", "price.marketPrice", "originalPrice")),
    soldCount: monthly,
    soldPeriod: monthly !== null ? "30d" : "unknown",
    soldIsLowerBound: false,
    soldText: str(pick(row, "sales.monthlySoldText", "sales.soldText")),
    salesTrend: trend.length ? trend : null,
    platformCategoryPath: path.length ? path : null,
    shopName: str(pick(row, "shop.shopName", "shopName")),
    shopUrl: url(pick(row, "shop.shopUrl", "shopUrl")),
    platformSignals: null,
  };
};

export const normalize1688: Normalizer = (row, index, keyword) => {
  const externalId = str(pick(row, "offerId", "offer_id", "id"));
  if (!externalId) return null;
  const images = uniq([...imageList(pick(row, "images")), url(pick(row, "imageUrl", "image_url", "mainImage"))]);
  const soldText = str(pick(row, "soldDisplay", "saledCountStr", "salesText", "sold_count_text"));
  // soldDisplay can disagree with saledCount ("已售1.6万+件" vs 4460): count = saledCount, text = soldDisplay
  let sold = int(pick(row, "saledCount", "recentSoldCount", "bookedCount", "booked_count"));
  let lowerBound = false;
  if (sold === null) {
    const parsed = parseCountText(soldText);
    if (parsed) ({ count: sold, lowerBound } = parsed);
  }
  const catPath = str(pick(row, "categoryPath"));
  const catName = str(pick(row, "categoryName", "mainCategory"));
  return {
    ...base("1688", row, index, keyword),
    externalId,
    title: str(pick(row, "title", "subject")),
    productUrl: url(pick(row, "detailUrl", "detail_url", "url", "offerUrl")),
    imageUrl: images[0] ?? null,
    imageUrls: images,
    price: num(pick(row, "price.min", "priceTiers.0.price", "quantityPrices.0.price", "price")),
    currency: "CNY",
    originalPrice: null,
    soldCount: sold,
    // recentSoldCount == saledCount in real rows → looks cumulative; window never stated → unknown (rule 0.7)
    soldPeriod: "unknown",
    soldIsLowerBound: lowerBound,
    soldText,
    salesTrend: null,
    platformCategoryPath: catPath ? catPath.split(/\s*>\s*/).filter(Boolean) : catName ? [catName] : null,
    shopName: str(pick(row, "supplier.companyName", "supplier.name", "companyName", "sellerName")),
    shopUrl: url(pick(row, "supplier.shopUrl", "shopUrl", "sellerUrl")),
    platformSignals: null,
  };
};

/** crw sends price in CENTS next to a display string ("$1.48") — prefer the explicit USD field, then the
 *  display string; a bare `price` is only trusted when no `price_str` exists (apivault sends dollars). */
function temuMoney(row: unknown, usdKey: string, strKey: string, plainKey: string): number | null {
  const usd = num(pick(row, usdKey));
  if (usd !== null) return usd;
  const text = str(pick(row, strKey));
  if (text) {
    const m = text.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  }
  if (get(row, strKey) !== undefined) return null; // crw: "" means no original price
  return num(pick(row, plainKey));
}

export const normalizeTemu: Normalizer = (row, index, keyword) => {
  const externalId = str(pick(row, "productId", "goodsId", "goods_id", "id"));
  if (!externalId) return null;
  const soldText = str(pick(row, "soldCountText", "sales_num", "soldText"));
  let sold = int(pick(row, "soldCountInt", "soldCount"));
  const bucket = bool(pick(row, "soldCountIsBucket"));
  let lowerBound = bucket ?? /\+/.test(soldText ?? "");
  if (sold === null) {
    const parsed = parseCountText(soldText);
    if (parsed) ({ count: sold, lowerBound } = parsed);
  }
  const cat = pick(row, "category", "categoryPath", "breadcrumb");
  const path = Array.isArray(cat)
    ? cat.map((c) => str(typeof c === "string" ? c : pick(c, "name"))).filter((s): s is string => s !== null)
    : (str(cat)?.split(/\s*(?:>|\/)\s*/).filter(Boolean) ?? []);
  const images = uniq([url(pick(row, "imageUrl", "thumb_url", "image_url")), ...imageList(pick(row, "images"))]);
  const isTrending = bool(pick(row, "isTrending"));
  const demandScore = num(pick(row, "demandScore"));
  return {
    ...base("temu", row, index, keyword),
    externalId,
    title: str(pick(row, "title", "goodsName")),
    // crw link_url carries tracking params → canonical goods page
    productUrl: pick(row, "goods_id") != null ? `https://www.temu.com/goods.html?goods_id=${externalId}` : url(pick(row, "productUrl", "url", "link_url")),
    imageUrl: images[0] ?? null,
    imageUrls: images,
    price: temuMoney(row, "priceUsd", "price_str", "price"),
    currency: "USD",
    originalPrice: temuMoney(row, "originalPriceUsd", "market_price_str", "originalPrice"),
    soldCount: sold,
    soldPeriod: sold !== null ? "lifetime" : "unknown",
    soldIsLowerBound: sold !== null && lowerBound,
    soldText,
    salesTrend: null,
    platformCategoryPath: path.length ? path : null,
    shopName: str(pick(row, "shopName", "mallName")),
    shopUrl: url(pick(row, "shopUrl", "mall_link")),
    platformSignals:
      isTrending === null && demandScore === null
        ? null
        : { ...(isTrending !== null && { isTrending }), ...(demandScore !== null && { demandScore }) },
  };
};

export const normalizeXhs: Normalizer = (row, index, keyword) => {
  const externalId = str(pick(row, "id", "item_id", "goodsId"));
  if (!externalId) return null;
  const images = imageList(pick(row, "images")).filter((x): x is string => x !== null);
  // metrics.shop_sold is SHOP-level — never product sold
  const sold = int(pick(row, "metrics.units_sold", "unitsSold", "soldCount"));
  return {
    ...base("xhs", row, index, keyword),
    externalId,
    title: str(pick(row, "title", "name")),
    productUrl: url(pick(row, "url", "productUrl")),
    imageUrl: images[0] ?? url(pick(row, "imageUrl")),
    imageUrls: images,
    price: num(pick(row, "price.price", "price")),
    currency: "CNY",
    originalPrice: num(pick(row, "price.origin_price", "originalPrice")),
    soldCount: sold, // half the real rows have metrics: {} → null ("—"), never 0
    soldPeriod: "lifetime", // platform semantics, even when this row carries no count
    soldIsLowerBound: false,
    soldText: str(pick(row, "metrics.units_sold_text")),
    salesTrend: null,
    platformCategoryPath: null,
    shopName: str(pick(row, "vendor.vendor_name", "shopName")),
    shopUrl: url(pick(row, "vendor.vendor_link", "shopUrl")),
    platformSignals: null,
  };
};

const NORMALIZERS: Record<Platform, Normalizer> = {
  douyin: normalizeDouyin,
  "1688": normalize1688,
  temu: normalizeTemu,
  xhs: normalizeXhs,
};

/** Normalize, dedupe by externalId, cut to `limit` (≤ 50). itemsIn = raw rows received, readable = before the cut. */
export function normalizeRows(platform: Platform, rows: unknown[], keyword: string, limit = MAX_RESULTS) {
  const fn = NORMALIZERS[platform];
  const seen = new Set<string>();
  const items: ProductInput[] = [];
  rows.forEach((row, i) => {
    let item: ProductInput | null = null;
    try {
      item = fn(row, i, keyword);
    } catch {
      item = null;
    }
    if (item && !seen.has(item.externalId)) {
      seen.add(item.externalId);
      items.push(item);
    }
  });
  return { items: items.slice(0, Math.min(limit, MAX_RESULTS)), itemsIn: rows.length, readable: items.length };
}
