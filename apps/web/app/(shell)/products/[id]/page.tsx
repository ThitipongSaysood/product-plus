import Link from "next/link";
import type { ProductDetail } from "@pp/contracts";
import { ApiErrorAlert, BrandMark, ProductImage, SoldBadge, TrendBadge } from "@/components/bits";
import { LineChart } from "@/components/charts";
import { EventFeed } from "@/components/feeds";
import { ArrowBackIcon, LinkExternalIcon } from "@/components/icons";
import { categoryLabel } from "@/components/ProductCardView";
import { Alert, SectionTitle, TableScroll } from "@/components/ui";
import { formatDateTime, formatMoney, formatNumber, formatPercent } from "@/i18n";
import { getT } from "@/i18n/server";
import { api, qs } from "@/lib/api";
import { safeFrom } from "@/lib/back-link";
import { getPg, href } from "@/lib/params";
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

  const facts: [string, React.ReactNode][] = [
    [t("facts.platform"), <BrandMark key="p" t={t} platform={p.platform} />],
    [t("facts.price"), <span key="pr" className="ox-num">{formatMoney(t.locale, p.price, p.currency ?? "CNY")}{p.originalPrice != null && p.originalPrice !== p.price ? <span className="ox-muted"> · {t("facts.originalPrice", { v: formatMoney(t.locale, p.originalPrice, p.currency ?? "CNY") })}</span> : null}</span>],
    [t("facts.sold"), <span key="s" className="ox-row"><SoldBadge t={t} sold={p.sold} />{p.sold.text ? <span className="ox-xs ox-muted" lang="zh-CN">{t("facts.rawText", { v: p.sold.text })}</span> : null}</span>],
    [t("facts.rank"), <span key="r" className="ox-num">{formatNumber(t.locale, p.rank)}</span>],
    [t("facts.category"), <span key="c" className="ox-row">{categoryLabel(t, p.categoryKey, taxonomy)}{p.categorySource ? <span className="ox-badge">{t(`categorySource.${p.categorySource}`)}</span> : null}</span>],
    [t("facts.platformCategory"), p.platformCategoryPath?.length ? <span key="pc" lang="zh-CN">{p.platformCategoryPath.join(" › ")}</span> : "—"],
    [t("facts.shop"), p.shopName ? (p.shopUrl ? <a key="sh" href={p.shopUrl} target="_blank" rel="noopener noreferrer" lang="zh-CN">{p.shopName}</a> : <span key="sh" lang="zh-CN">{p.shopName}</span>) : "—"],
    [t("facts.keyword"), p.keyword ? <span key="k" lang="zh-CN">{p.keyword}</span> : "—"],
    [t("facts.sizes"), p.attrs.sizes?.length ? p.attrs.sizes.join(", ") : "—"],
    [t("facts.models"), p.attrs.models?.length ? p.attrs.models.join(", ") : "—"],
    [t("facts.trend"), <span key="t" className="ox-row"><TrendBadge t={t} trend={td.label} />{td.label === "insufficient_history" ? <span className="ox-xs ox-muted">{t("trend.insufficient_history")}</span> : null}</span>],
    [t("facts.deltaSold"), <span key="ds" className="ox-num">{td.deltaSold == null ? "—" : formatNumber(t.locale, td.deltaSold)}</span>],
    [t("facts.deltaRank"), <span key="dr" className="ox-num">{td.deltaRank == null ? "—" : formatNumber(t.locale, td.deltaRank)}</span>],
    ...(p.platform === "douyin" ? [[t("facts.douyinRatio"), <span key="dy" className="ox-num">{td.douyinRatio == null ? "—" : formatPercent(t.locale, td.douyinRatio)}</span>] as [string, React.ReactNode]] : []),
    [t("facts.snapshots"), <span key="sc" className="ox-num">{formatNumber(t.locale, td.snapshotCount)}</span>],
    [t("facts.firstSeen"), formatDateTime(t.locale, p.firstSeenAt)],
    [t("facts.lastSeen"), formatDateTime(t.locale, p.lastSeenAt)],
    ...(p.platformSignals ? [[t("facts.platformSignals"), <span key="ps">{p.platformSignals.isTrending ? t("facts.temuTrending") : t("facts.temuNotTrending")}{p.platformSignals.demandScore != null ? ` · ${t("facts.demandScore", { v: formatNumber(t.locale, p.platformSignals.demandScore, 1) })}` : ""}</span>] as [string, React.ReactNode]] : []),
  ];

  return (
    <>
      {backLink}
      <div className="ox-page-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="ox-page-title" lang="zh-CN" style={{ overflowWrap: "anywhere" }}>{p.title ?? t("product.untitled")}</h1>
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
          <div className="ap-media-full"><ProductImage t={t} product={p} size={40} alt={p.title ?? ""} /></div>
          {gallery.length > 1 ? (
            <div className="ap-gallery" aria-label={t("product.gallery")}>
              {gallery.map((u, i) => (
                <a key={i} className="ap-gallery__thumb" href={u} target="_blank" rel="noopener noreferrer" aria-label={t("product.galleryImage", { n: i + 1 })}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" loading="lazy" referrerPolicy="no-referrer" />
                </a>
              ))}
            </div>
          ) : null}
          {p.imageLost ? <Alert tone="warning">{t("image.lostBody")}</Alert> : null}
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
        <section className="ox-chart">
          <div className="ox-chart__head">
            <div>
              <div className="ox-chart__title">{t("product.snapshotChart")}</div>
              <div className="ox-chart__sub">{periods.size > 1 ? t("product.snapshotMixed") : t("product.snapshotSub", { period: t(`period.${snapshots[0]?.soldPeriod ?? p.sold.period}`) })}</div>
            </div>
          </div>
          <div className="ox-chart__body">
            {snapData.length < 2 ? (
              <div className="ox-chart__canvas"><div className="ox-chart__empty">{t("trend.insufficient_history")}</div></div>
            ) : (
              <LineChart data={snapData} series={[{ key: "sold", label: t("facts.sold"), colorIndex: 0 }]} emptyText={t("chart.empty")} />
            )}
          </div>
        </section>
        {p.platform === "douyin" ? (
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

      <section className="ox-stack">
        <SectionTitle title={t("events.productTitle")} />
        <EventFeed t={t} events={events} pg={pg} from={href("/products", {})} />
      </section>
    </>
  );
}
