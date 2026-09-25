import Link from "next/link";
import type { ProductCard, ProductList } from "@pp/contracts";
import { formatMoney, type T } from "@/i18n";
import { BrandMark, ProductImage, shownTitle, SoldBadge, TrendBadge } from "./bits";

export function categoryLabel(t: T, key: string, taxonomy: { key: string; th: string; en: string; zh: string }[]): string {
  if (key === "unclassified") return t("category.unclassified");
  const e = taxonomy.find((x) => x.key === key);
  return e ? e[t.locale] : key;
}

export function ProductCardView({ t, p, pg, from, categoryText, fxThb = {} }: { t: T; p: ProductCard; pg: string; from: string; categoryText: string; fxThb?: ProductList["fxThb"] }) {
  // `== null`, not truthiness: a listing priced at 0 is free, not unpriced, and must not read as "—".
  const buyPrice = p.entryPrice ?? p.price;
  // ¥ and $ sit side by side in the list; the baht line lets them be compared without mental maths.
  const fx = p.currency === "CNY" || p.currency === "USD" ? fxThb[p.currency] : undefined;
  return (
    <article className="ap-card">
      <Link className="ap-card-link" href={`/products/${encodeURIComponent(p.id)}?pg=${encodeURIComponent(pg)}&from=${encodeURIComponent(from)}`}>
        <div className="ap-wall__media">
          <ProductImage t={t} product={p} alt={p.title ?? ""} />
          <div className="ap-wall__top">
            <BrandMark t={t} platform={p.platform} />
            {!p.isActive ? <span className="ox-badge ox-badge--danger">{t("product.gone")}</span> : null}
          </div>
        </div>
        <div className="ap-wall__body">
          <div className="ap-wall__title line-clamp-2" lang={shownTitle(t, p).lang} title={p.title ?? undefined}>{shownTitle(t, p).text}</div>
          <div className="ox-xs ox-muted line-clamp-2">{categoryText}</div>
          <div className="ap-wall__foot">
            {/* entryPrice first: `price` is the ladder's cheapest rung, which is often a bulk rate the
                buyer cannot take at the minimum order — the detail page would then disagree with this card. */}
            <div className="ap-wall__prices">
              <span className="ap-wall__price">{buyPrice == null ? "—" : formatMoney(t.locale, buyPrice, p.currency ?? "CNY")}</span>
              {buyPrice != null && fx ? <span className="ox-xs ox-muted ox-num">{t("fx.approx", { v: formatMoney(t.locale, buyPrice * fx.rate, "THB") })}</span> : null}
            </div>
            <div className="ap-wall__facts">
              <SoldBadge t={t} sold={p.sold} />
              {/* No history yet is the normal state of a new listing — saying so on every card is noise. */}
              {p.trend !== "insufficient_history" ? <TrendBadge t={t} trend={p.trend} /> : null}
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}
