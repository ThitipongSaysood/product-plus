// Free, deterministic source: same (platform, keyword, date) → same rows. Rows use each actor's
// REAL output shape so the normalizers run exactly as on live data. Products drift day to day
// (appear / disappear / sell more or less / go on promo) so trends and change events show up.
// Everything here is fake market data — the UI labels it "mock data".
import type { Platform } from "@pp/contracts";
import type { ScrapeTarget, StartResult } from "./types.js";

const DAY = 86_400_000;
const POOL = 70;
export const MOCK_ACTOR = "mock";
export const MOCK_IMAGE_PREFIX = "/api/media/mock/";

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
function rng(seed: string) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r01 = (...parts: (string | number)[]) => rng(parts.join("|"))();
const pickOf = <T>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const digits = (seed: string, n: number) => {
  const r = rng(seed);
  return String(1 + Math.floor(r() * 9)) + Array.from({ length: n - 1 }, () => Math.floor(r() * 10)).join("");
};

const STYLES = [
  { key: "silicone", zh: "硅胶运动表带", en: "Silicone Sport Band", price: [6, 25], w: 5 },
  { key: "leather", zh: "真皮表带 复古商务", en: "Genuine Leather Band", price: [18, 69], w: 3 },
  { key: "milanese", zh: "米兰尼斯磁吸表带", en: "Milanese Loop Stainless Steel Band", price: [9, 39], w: 4 },
  { key: "metal", zh: "不锈钢三珠金属表带 蝴蝶扣", en: "Stainless Steel Link Bracelet", price: [15, 59], w: 3 },
  { key: "nylon", zh: "尼龙编织回环表带", en: "Braided Nylon Sport Loop", price: [8, 29], w: 4 },
  { key: "solo", zh: "单圈弹力表带", en: "Stretchy Solo Loop Band", price: [9, 35], w: 2 },
  { key: "ocean", zh: "海洋表带 潜水运动", en: "Ocean Band for Ultra", price: [12, 45], w: 2 },
  { key: "alpine", zh: "高山回环表带", en: "Alpine Loop Band", price: [15, 49], w: 1 },
  { key: "beaded", zh: "手工串珠水晶表带 手链款", en: "Beaded Crystal Bracelet Band", price: [29, 128], w: 2 },
  { key: "case", zh: "保护壳 钢化膜一体 全包防摔", en: "Protective Case with Tempered Glass Screen Protector", price: [5, 19], w: 2 },
  { key: "set", zh: "3条装套装 硅胶表带", en: "3 Pack Set of Sport Bands", price: [19, 49], w: 1 },
  { key: "plain", zh: "小蛮腰表带 ins风", en: "Slim Band for Women", price: [8, 30], w: 2 },
] as const;
const PREFIX = ["适用苹果手表", "适用Apple Watch", "iwatch", "苹果手表"];
const SIZES = ["38/40/41mm", "42/44/45mm", "45/46/49mm", "41mm", "45mm", "49mm", "44/45/46mm"];
const MODELS = ["S10/9/8", "Ultra2", "SE", "S11/10", "", "Ultra"];
const EN_SIZES = ["38mm 40mm 41mm", "42mm 44mm 45mm", "44mm 45mm 46mm 49mm", "41mm", "49mm"];
const EN_MODELS = ["Series 9 8 SE", "Ultra 2", "Series 10", "Series 11 10 9", ""];

type Proto = {
  i: number;
  id: string;
  style: (typeof STYLES)[number];
  title: string;
  price: number;
  base: number; // daily units
  amp: number;
  period: number;
  phase: number;
  cycle: number;
  alive: number; // alive days per cycle (≥ cycle = always)
  offset: number;
  startLifetime: number;
  shop: string;
};

function weightedStyle(r: () => number) {
  const total = STYLES.reduce((s, x) => s + x.w, 0);
  let x = r() * total;
  for (const s of STYLES) if ((x -= s.w) < 0) return s;
  return STYLES[0];
}

function pool(platform: Platform, keyword: string): Proto[] {
  return Array.from({ length: POOL }, (_, i) => {
    const r = rng(`${platform}|${keyword}|${i}`);
    const style = weightedStyle(r);
    const [lo, hi] = style.price;
    const en = platform === "temu";
    const title = en
      ? `${style.en} Compatible with Apple Watch Band ${pickOf(r, EN_SIZES)} ${pickOf(r, EN_MODELS)}`.trim()
      : `${pickOf(r, PREFIX)}${style.zh}${pickOf(r, SIZES)}${pickOf(r, MODELS)}`;
    const always = r() < 0.55;
    const cycle = 60 + Math.floor(r() * 120);
    const id =
      platform === "douyin" ? digits(`id${i}${keyword}`, 19)
      : platform === "1688" ? digits(`id${i}${keyword}`, 12)
      : platform === "temu" ? `60${digits(`id${i}${keyword}`, 13)}`
      : hash(`x${i}${keyword}`).toString(16).padStart(8, "0") + hash(`y${i}`).toString(16).padStart(8, "0") + hash(`z${i}`).toString(16).padStart(8, "0");
    return {
      i,
      id,
      style,
      title,
      price: Math.round((lo + r() * (hi - lo)) * (en ? 0.16 : 1) * 100) / 100,
      base: Math.max(1, Math.round(Math.exp(r() * 5))), // 1..148 units/day, long tail
      amp: r() * 0.8,
      period: 20 + Math.floor(r() * 70),
      phase: Math.floor(r() * 100),
      cycle,
      alive: always ? Infinity : Math.floor(cycle * (0.55 + r() * 0.35)),
      offset: Math.floor(r() * cycle),
      startLifetime: Math.floor(r() * 20000),
      shop: `${pickOf(r, ["星辰", "果粉", "潮流", "极简", "优品", "数码"])}${pickOf(r, ["数码店", "配件旗舰店", "表带工厂", "精品店"])}`,
    };
  });
}

const isAlive = (p: Proto, day: number) => ((day + p.offset) % p.cycle) < p.alive;
const units = (p: Proto, day: number) =>
  Math.max(0, Math.round(p.base * (1 + p.amp * Math.sin((2 * Math.PI * (day + p.phase)) / p.period)) * (0.8 + 0.4 * r01(p.id, day))));
const sum30 = (p: Proto, day: number) => {
  let s = 0;
  for (let d = day - 29; d <= day; d++) s += units(p, d);
  return s;
};
const lifetime = (p: Proto, day: number) => p.startLifetime + p.base * (day - 20000) + sum30(p, day);
const promo = (p: Proto, day: number) => (r01(p.id, "promo", Math.floor(day / 7)) < 0.12 ? 0.8 : 1);
const ymd = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);

function bucket(n: number): { int: number; text: string } {
  const steps = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000];
  const lb = [...steps].reverse().find((s) => n >= s);
  if (!lb) return { int: n, text: `${n} sold` };
  return { int: lb, text: `${lb >= 1000 ? `${lb / 1000}K` : lb}+ sold` };
}
const wan = (n: number) => (n >= 10000 ? `${Math.floor(n / 1000) / 10}万+` : `${n}+`);

function image(platform: Platform, p: Proto) {
  const expired = platform === "xhs" && p.i % 25 === 3; // XHS CDN URLs expire — show image_lost handling
  return `${MOCK_IMAGE_PREFIX}${expired ? "expired-" : ""}${platform}-${p.i}-${p.style.key}.svg`;
}

function row(platform: Platform, p: Proto, day: number, position: number, keyword: string): Record<string, unknown> {
  const price = Math.round(p.price * promo(p, day) * 100) / 100;
  const img = image(platform, p);
  const isCase = p.style.key === "case";
  if (platform === "douyin") {
    const trend = Array.from({ length: 30 }, (_, k) => {
      const d = day - 29 + k;
      return { date: ymd(d).replace(/-/g, ""), units: k === 29 ? 0 : units(p, d) }; // last point = partial "today"
    });
    return {
      productId: p.id,
      title: p.title,
      detailUrl: `https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=${p.id}&origin_type=2631`,
      mainImage: img,
      price: { amount: price, amountCents: Math.round(price * 100), label: "到手价" },
      sales: { monthlySold: trend.reduce((s, x) => s + x.units, 0), salesTrend: trend },
      category: {
        first: { id: 1000007020, name: "3C数码及配件" },
        second: { id: 1000007021, name: "智能设备" },
        third: { id: 1000007047, name: "智能设备配件" },
        fourth: { id: isCase ? 1000007099 : 0, name: isCase ? "智能手表保护壳" : "" },
      },
      shop: { shopId: hash(p.shop), shopName: p.shop },
      keyword,
      searchPosition: position,
    };
  }
  if (platform === "1688") {
    const sold = lifetime(p, day);
    return {
      offerId: p.id,
      title: p.title,
      detailUrl: `https://detail.1688.com/offer/${p.id}.html`,
      images: [img],
      price: { min: Math.round(price * 0.45 * 100) / 100, max: Math.round(price * 0.6 * 100) / 100, currency: "CNY" },
      quantityPrices: [],
      categoryPath: `数码、电脑 > 智能设备 > ${isCase ? "智能手表保护壳" : "智能手表表带"}`,
      recentSoldCount: sold,
      saledCount: sold,
      soldDisplay: `已售${wan(sold)}件`,
      supplier: { companyName: `深圳市${p.shop}科技有限公司`, shopUrl: `http://shop${p.id.slice(0, 6)}.1688.com` },
      sourceKeyword: keyword,
    };
  }
  if (platform === "temu") {
    const b = bucket(Math.round(lifetime(p, day) / 3));
    return {
      success: true,
      productId: p.id,
      title: p.title,
      productUrl: `https://www.temu.com/goods.html?goods_id=${p.id}`,
      imageUrl: img,
      images: [img],
      category: `Cell Phones & Accessories > ${isCase ? "Smart Watch Cases" : "Smart Watch Bands"}`,
      priceUsd: price,
      originalPriceUsd: Math.round(p.price * 1.8 * 100) / 100,
      soldCountText: b.text,
      soldCountInt: b.int,
      soldCountIsBucket: b.int !== Math.round(lifetime(p, day) / 3),
      shopName: p.shop,
      isTrending: sum30(p, day) > sum30(p, day - 7) * 1.1,
      demandScore: Math.min(100, Math.round(sum30(p, day) / 30)),
    };
  }
  const sold = Math.round(lifetime(p, day) / 40);
  return {
    id: p.id,
    title: p.title,
    url: `https://www.xiaohongshu.com/goods-detail/${p.id}`,
    link: `xhsdiscover://goods_detail/${p.id}`,
    price: { price: Math.round(price * 1.3), origin_price: Math.round(p.price * 1.6) },
    images: [{ url: img, width: 540, height: 720 }],
    vendor: { vendor_name: `${p.shop}的店`, vendor_link: `xhsdiscover://shop_detail?seller_id=${p.id.slice(0, 12)}` },
    metrics: { units_sold: sold, units_sold_text: `${sold} sold`, shop_sold: sold * 9 },
    keyword,
  };
}

export function mockRows(platform: Platform, keyword: string, now: Date, limit: number): unknown[] {
  const day = Math.floor(now.getTime() / DAY);
  const alive = pool(platform, keyword).filter((p) => isAlive(p, day));
  alive.sort((a, b) => sum30(b, day) * (0.85 + 0.3 * r01(b.id, "rank", day)) - sum30(a, day) * (0.85 + 0.3 * r01(a.id, "rank", day)));
  return alive.slice(0, limit).map((p, k) => row(platform, p, day, k + 1, keyword));
}

export async function mockStart(t: ScrapeTarget): Promise<StartResult> {
  return { ok: true, inline: { rows: mockRows(t.platform, t.keyword, t.now, t.limit), costUsd: 0 } };
}

const COLORS: Record<string, string> = {
  silicone: "#f97316", leather: "#92400e", milanese: "#64748b", metal: "#475569", nylon: "#0ea5e9", solo: "#ec4899",
  ocean: "#1d4ed8", alpine: "#15803d", beaded: "#a855f7", case: "#111827", set: "#eab308", plain: "#f43f5e",
};

/** Placeholder product image (no network). null = "expired" (the XHS image_lost demo). */
export function mockSvg(file: string): string | null {
  const m = file.match(/^(expired-)?(\w+)-(\d+)-(\w+)\.svg$/);
  if (!m || m[1]) return null;
  const [, , platform, i, style] = m;
  const c = COLORS[style] ?? "#6366f1";
  const bg = `hsl(${hash(file) % 360} 35% 94%)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
<rect width="400" height="400" fill="${bg}"/>
<rect x="160" y="20" width="80" height="360" rx="30" fill="${c}"/>
<rect x="120" y="130" width="160" height="140" rx="36" fill="#1f2937"/>
<rect x="134" y="144" width="132" height="112" rx="26" fill="#0b1220"/>
<text x="200" y="208" font-family="sans-serif" font-size="22" fill="#e5e7eb" text-anchor="middle">${style}</text>
<text x="200" y="392" font-family="sans-serif" font-size="14" fill="#6b7280" text-anchor="middle">MOCK · ${platform} #${i}</text>
</svg>`;
}
