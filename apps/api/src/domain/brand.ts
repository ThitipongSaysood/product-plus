// Trademarks a watch band might be IMITATING, as opposed to the ones it merely fits.
//
// Measured on the 135 real listings in the Apple Watch bands group: 91% name Apple (适用苹果Watch — "fits
// Apple Watch"), 17% name Huawei, 5% Samsung. Those are compatibility statements and flagging them would
// mark almost the whole catalogue, which is the same as flagging nothing. Nike appears in 1 listing —
// and a band branded 耐克Nike is claiming to BE a Nike product. That is the case worth surfacing.
//
// This reports what the seller's own title says. It is not a legal opinion, and the UI must not imply one.

/** Device makers whose names appear as "fits X". Never flagged. */
const COMPATIBILITY = /苹果|apple|iwatch|三星|samsung|华为|huawei|小米|xiaomi|garmin|fitbit|amazfit/gi;

/** Apparel, sport and luxury marks. A band carrying one of these is branded, not compatible. */
const IMITATION: { mark: string; re: RegExp }[] = [
  { mark: "Nike", re: /耐克|\bnike\b/i },
  { mark: "Adidas", re: /阿迪达斯|阿迪|\badidas\b/i },
  { mark: "Hermès", re: /爱马仕|\bherm[eè]s\b/i },
  { mark: "Gucci", re: /古驰|\bgucci\b/i },
  { mark: "Louis Vuitton", re: /路易威登|\blouis\s?vuitton\b|\bLV\b/ },
  { mark: "Chanel", re: /香奈儿|\bchanel\b/i },
  { mark: "Dior", re: /迪奥|\bdior\b/i },
  { mark: "Prada", re: /普拉达|\bprada\b/i },
  { mark: "Burberry", re: /巴宝莉|博柏利|\bburberry\b/i },
  { mark: "Versace", re: /范思哲|\bversace\b/i },
  { mark: "Coach", re: /蔻驰|\bcoach\b/i },
  { mark: "Disney", re: /迪士尼|\bdisney\b/i },
  { mark: "Supreme", re: /\bsupreme\b/i },
  { mark: "Puma", re: /彪马|\bpuma\b/i },
  { mark: "Under Armour", re: /安德玛|\bunder\s?armou?r\b/i },
  { mark: "Chrome Hearts", re: /克罗心|\bchrome\s?hearts\b/i },
  { mark: "MLB", re: /\bMLB\b/ },
];

/**
 * Brands the title claims, with compatibility mentions removed first so "适用苹果Watch…耐克Nike" reports
 * Nike alone. Returns [] for the overwhelming majority of listings — that is the point.
 */
export function brandMarks(title: string | null | undefined): string[] {
  if (!title) return [];
  const stripped = title.replace(COMPATIBILITY, " ");
  return IMITATION.filter(({ re }) => re.test(stripped)).map(({ mark }) => mark);
}
