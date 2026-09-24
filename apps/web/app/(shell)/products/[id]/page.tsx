import Link from "next/link";
import type { ProductDetail } from "@pp/contracts";
import { ApiErrorAlert, BrandMark, shownTitle, SoldBadge, TrendBadge } from "@/components/bits";
import { ProductGallery } from "@/components/ProductGallery";
import { LineChart } from "@/components/charts";
import { EventFeed } from "@/components/feeds";
import { ArrowBackIcon, LinkExternalIcon } from "@/components/icons";
import { categoryLabel } from "@/components/ProductCardView";
import { Alert, Card, SectionTitle, TableScroll } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney, formatNumber, formatPercent } from "@/i18n";
import { getT } from "@/i18n/server";
import { api, qs } from "@/lib/api";
import { safeFrom } from "@/lib/back-link";
import { getPg, href } from "@/lib/params";
import { cheapestTier, entryTier, money, qtyLabel, tierRange, unitLabel } from "@/lib/supply";
import { loadGroup } from "@/lib/group";

export default async function ProductDetailPage(props: PageProps<"/products/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const pg = getPg(sp);
  const t = await getT();
  const back = safeFrom(sp.from) ?? `/products${qs({ pg })}`;
  const [res, g] = await Promise.all([api<ProductDetail>(`/products/${encodeURIComponent(id)}`), loadGroup(pg)]);
  const taxonomy = g.group?.taxonomy ?? [];

  const backLink = (
    <Link href={back} className="ox-btn ox-btn--ghost" style={{ alignSelf: "flex-start" }}>
      <ArrowBackIcon />{t("common.back")}
    </Link>
  );
  if (res.error) return <>{backLink}<ApiErrorAlert t={t} error={res.status === 404 ? "errors.product.notFound" : res.error} /></>;
  const { product: p, snapshots, salesTrend, trendDetail: td, events } = res.data;

  const snapData = snapshots
    .slice()
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt))
    .map((s) => ({ date: s.takenAt, sold: s.soldCount }));
  const periods = new Set(snapshots.map((s) => s.soldPeriod));
  const gallery = p.imageUrls.slice(0, 8);

  // `p.price` is the cheapest rung of the wholesale ladder, which on 1688 is routinely a bulk rate you
  // cannot take at the minimum order (measured: 16 of 30 laddered rows). Show what is actually buyable.
  const sup = p.supply;
  const entry = entryTier(sup);
  const cheap = cheapestTier(sup);
  const buyPrice = entry ? entry.price : p.price;
  // A hand-set rate is the only one this system has. Always print it and the day it was entered next to
  // the baht figure, so nobody reads it as a live quote.
  const fx = res.data.fxThb;
  const baht = (v: number) => (fx ? t("fx.approx", { v: formatMoney(t.locale, v * fx.rate, "THB") }) : null);
  const fxNote = fx ? t("fx.manualRate", { rate: formatNumber(t.locale, fx.rate, 2), date: formatDateTime(t.locale, fx.updatedAt) }) : null;
  const minOrderTotal = sup?.moq != null && sup.moq > 1 && buyPrice != null ? buyPrice * sup.moq : null;

  // A row whose value is "—" tells you nothing, and this page printed three of them in a row. Unknown
  // values drop their row instead: when you are scanning for a number, a missing row and a missing value
  // read the same, and the shorter table ends level with the photo beside it.
  const maybeFacts: [string, React.ReactNode | null][] = [
    [t("facts.platform"), <BrandMark key="p" t={t} platform={p.platform} />],
    [t("facts.price"), buyPrice == null ? null : (
      <span key="pr" className="ap-kv">
        <span className="ox-row">
          <span className="ox-num">{money(t, buyPrice, p.currency)}</span>
          {entry ? <span className="ox-xs ox-muted">{t("supply.atEntry", { range: tierRange(t, entry, sup!.unit) })}</span> : null}
          {p.originalPrice != null && p.originalPrice !== buyPrice ? <span className="ox-xs ox-muted">{t("facts.originalPrice", { v: money(t, p.originalPrice, p.currency) })}</span> : null}
          {baht(buyPrice) ? <span className="ox-xs ox-muted">{baht(buyPrice)}</span> : null}
        </span>
        {cheap && cheap.price < buyPrice ? (
          <span className="ox-xs ox-muted">{t("supply.lowest", { price: money(t, cheap.price, p.currency), range: tierRange(t, cheap, sup!.unit) })}</span>
        ) : null}
      </span>
    )],
    [t("facts.moq"), sup?.moq == null ? null : <span key="moq" className="ox-num">{qtyLabel(t, sup.moq, sup.unit)}</span>],
    [t("facts.minOrderTotal"), minOrderTotal == null ? null : (
      <span key="mot" className="ox-row">
        <span className="ox-num">{money(t, minOrderTotal, p.currency)}</span>
        {baht(minOrderTotal) ? <span className="ox-num">{baht(minOrderTotal)}</span> : null}
        {fxNote ? <span className="ox-xs ox-muted">{fxNote}</span> : null}
      </span>
    )],
    [t("facts.priceTiers"), sup && sup.tiers.length > 1 ? (
      <span key="tiers" className="ap-tiers">
        {sup.tiers.map((tier) => (
          <span key={tier.minQty} className="ap-tiers__row">
            <span className="ox-muted">{tierRange(t, tier, sup.unit)}</span>
            <span className="ox-num">{money(t, tier.price, p.currency)}</span>
          </span>
        ))}
      </span>
    ) : null],
    [t("facts.sold"), <span key="s" className="ox-row"><SoldBadge t={t} sold={p.sold} />{p.sold.text ? <span className="ox-xs ox-muted" lang="zh-CN">{t("facts.rawText", { v: p.sold.text })}</span> : null}</span>],
    [t("facts.rank"), p.rank == null ? null : <span key="r" className="ox-num">{formatNumber(t.locale, p.rank)}</span>],
    [t("facts.category"), <span key="c" className="ox-row">{categoryLabel(t, p.categoryKey, taxonomy)}{p.categorySource ? <span className="ox-badge">{t(`categorySource.${p.categorySource}`)}</span> : null}</span>],
    [t("facts.platformCategory"), p.platformCategoryPath?.length ? <span key="pc" lang="zh-CN">{p.platformCategoryPath.join(" › ")}</span> : null],
    [t("facts.shop"), p.shopName ? (p.shopUrl ? <a key="sh" href={p.shopUrl} target="_blank" rel="noopener noreferrer" lang="zh-CN">{p.shopName}</a> : <span key="sh" lang="zh-CN">{p.shopName}</span>) : null],
    [t("facts.keyword"), p.keyword ? <span key="k" lang="zh-CN">{p.keyword}</span> : null],
    [t("facts.sizes"), p.attrs.sizes?.length ? p.attrs.sizes.join(", ") : null],
    [t("facts.models"), p.attrs.models?.length ? p.attrs.models.join(", ") : null],
    // TrendBadge already prints the label — a second copy of the same sentence next to it said nothing.
    [t("facts.trend"), <span key="t" className="ox-row"><TrendBadge t={t} trend={td.label} /></span>],
    [t("facts.deltaSold"), td.deltaSold == null ? null : <span key="ds" className="ox-num">{formatNumber(t.locale, td.deltaSold)}</span>],
    [t("facts.deltaRank"), td.deltaRank == null ? null : <span key="dr" className="ox-num">{formatNumber(t.locale, td.deltaRank)}</span>],
    ...(p.platform === "douyin" ? [[t("facts.douyinRatio"), td.douyinRatio == null ? null : <span key="dy" className="ox-num">{formatPercent(t.locale, td.douyinRatio)}</span>] as [string, React.ReactNode | null]] : []),
    // Orders, not units, and the actor attaches no window — say both, per the "sold numbers carry a period" rule.
    [t("facts.orderCount"), sup?.orderCount == null ? null : (
      <span key="oc" className="ox-row">
        <span className="ox-num">{formatNumber(t.locale, sup.orderCount)}</span>
        <span className="ox-xs ox-muted">{t("facts.orderCountNote")}</span>
      </span>
    )],
    [t("facts.video"), sup?.videoUrl ? (
      <a key="vid" href={sup.videoUrl} target="_blank" rel="noopener noreferrer">{t("supply.watchVideo")}</a>
    ) : null],
    [t("facts.snapshots"), <span key="sc" className="ox-num">{formatNumber(t.locale, td.snapshotCount)}</span>],
    [t("facts.firstSeen"), formatDateTime(t.locale, p.firstSeenAt)],
    [t("facts.lastSeen"), formatDateTime(t.locale, p.lastSeenAt)],
    ...(p.platformSignals ? [[t("facts.platformSignals"), <span key="ps">{p.platformSignals.isTrending ? t("facts.temuTrending") : t("facts.temuNotTrending")}{p.platformSignals.demandScore != null ? ` · ${t("facts.demandScore", { v: formatNumber(t.locale, p.platformSignals.demandScore, 1) })}` : ""}</span>] as [string, React.ReactNode | null]] : []),
  ];
  const facts = maybeFacts.filter((f): f is [string, React.ReactNode] => f[1] !== null);

  // Only Douyin gives a daily series; without it the snapshot chart is alone and should fill the row.
  const hasSalesTrend = p.platform === "douyin";

  return (
    <>
      {backLink}
      <div className="ox-page-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="ox-page-title" lang={shownTitle(t, p).lang} style={{ overflowWrap: "anywhere" }}>{shownTitle(t, p).text}</h1>
          {p.titleTh && p.title ? (
            <p className="ox-muted ox-xs" lang="zh-CN" style={{ overflowWrap: "anywhere", marginTop: 4 }}>{t("product.original", { title: p.title })}</p>
          ) : null}
          <div className="ox-row" style={{ marginTop: 8 }}>
            <BrandMark t={t} platform={p.platform} />
            {!p.isActive ? <span className="ox-badge ox-badge--danger">{t("product.gone")}</span> : null}
          </div>
        </div>
        <div className="ox-page-head__actions">
          {p.productUrl ? (
            <a className="ox-btn ox-btn--secondary" href={p.productUrl} target="_blank" rel="noopener noreferrer">
              <LinkExternalIcon />{t("product.open", { platform: t(`platform.${p.platform}`) })}
            </a>
          ) : <span className="ox-btn ox-btn--secondary" aria-disabled="true">{t("product.noLink")}</span>}
        </div>
      </div>

      <div className="ap-detail">
        <div className="ox-stack">
          <ProductGallery
            product={{ ...p, imageUrls: gallery }}
            alt={shownTitle(t, p).text}
            labels={{
              lost: t("image.lost"),
              none: t("image.none"),
              gallery: t("product.gallery"),
              zoom: t("product.zoom"),
              prev: t("product.prevImage"),
              next: t("product.nextImage"),
              close: t("common.close"),
              thumbs: gallery.map((_, i) => t("product.galleryImage", { n: i + 1 })),
            }}
          />
          {p.imageLost ? <Alert tone="warning">{t("image.lostBody")}</Alert> : null}
          {/* Fires on roughly 1 listing in 135 — device names the band merely fits are stripped first,
              so this stays a signal rather than a banner on every page. */}
          {/* Optional-chained on purpose: api and web deploy separately, so a web build can be served
              alongside an api that predates this field. A missing warning beats a 500 on the page. */}
          {p.brandMarks?.length ? (
            <Alert tone="warning">
              <strong>{t("brand.riskTitle", { marks: p.brandMarks.join(", ") })}</strong>
              <div className="ox-xs">{t("brand.riskBody")}</div>
            </Alert>
          ) : null}
        </div>
        <TableScroll label={t("facts.title")}>
          <table className="ox-table">
            <tbody>
              {facts.map(([k, v]) => (
                <tr key={k}>
                  <th scope="row" style={{ width: "36%" }}>{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </div>

      <div className="ox-chart-grid">
        <section className={cn("ox-chart", !hasSalesTrend && "is-wide")}>
          <div className="ox-chart__head">
            <div>
              <div className="ox-chart__title">{t("product.snapshotChart")}</div>
              <div className="ox-chart__sub">{periods.size > 1 ? t("product.snapshotMixed") : t("product.snapshotSub", { period: t(`period.${snapshots[0]?.soldPeriod ?? p.sold.period}`) })}</div>
            </div>
          </div>
          <div className="ox-chart__body">
            {snapData.length < 2 ? (
              <div className="ox-chart__empty ox-chart__empty--inline">{t("product.snapshotNeedMore", { n: formatNumber(t.locale, snapData.length) })}</div>
            ) : (
              <LineChart data={snapData} series={[{ key: "sold", label: t("facts.sold"), colorIndex: 0 }]} emptyText={t("chart.empty")} />
            )}
          </div>
        </section>
        {hasSalesTrend ? (
          <section className="ox-chart">
            <div className="ox-chart__head">
              <div>
                <div className="ox-chart__title">{t("product.salesTrend")}</div>
                <div className="ox-chart__sub">{t("product.salesTrendSub")}</div>
              </div>
            </div>
            <div className="ox-chart__body">
              <LineChart data={(salesTrend ?? []).map((d) => ({ date: d.date, units: d.units }))} series={[{ key: "units", label: t("product.units"), colorIndex: 0 }]} emptyText={t("product.salesTrendEmpty")} />
            </div>
          </section>
        ) : null}
      </div>

      <Card>
        <SectionTitle title={t("events.productTitle")} />
        {events.length ? <EventFeed t={t} events={events} pg={pg} from={href("/products", {})} /> : <div className="ox-muted ox-xs">{t("events.empty")}</div>}
      </Card>
    </>
  );
}
