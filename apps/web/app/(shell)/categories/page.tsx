import Link from "next/link";
import type { CategoriesResponse } from "@pp/contracts";
import { ApiErrorAlert, platformName, ProductImage, shownTitle, SoldBadge } from "@/components/bits";
import { PlatformFilter } from "@/components/PlatformFilter";
import { Alert, EmptyState } from "@/components/ui";
import { formatNumber, formatPercent } from "@/i18n";
import { getT } from "@/i18n/server";
import { api, qs } from "@/lib/api";
import { getPg, href } from "@/lib/params";
import { first } from "@/lib/platform";
import { loadGroup } from "@/lib/group";

export default async function CategoriesPage(props: PageProps<"/categories">) {
  const sp = await props.searchParams;
  const pg = getPg(sp);
  const t = await getT();
  const [res, g] = await Promise.all([api<CategoriesResponse>(`/categories${qs({ pg, platform: first(sp.platform) })}`), loadGroup(pg)]);
  const from = href("/categories", sp);

  return (
    <>
      <div className="ox-page-head">
        <div>
          <h1 className="ox-page-title">{t("categories.title")}</h1>
          <p className="ox-muted">{t("categories.sub")}</p>
        </div>
      </div>
      <PlatformFilter t={t} path="/categories" sp={sp} platforms={g.platforms} />
      {res.error ? <ApiErrorAlert t={t} error={res.error} /> : (
        <>
          {res.data.unmappedCount > 0 ? (
            <Alert tone="info" action={<Link className="ox-btn ox-btn--secondary ox-btn--sm" href={`/settings/keywords${qs({ pg })}#ai-sort`}>{t("categories.mapNow")}</Link>}>
              {t("categories.unmapped", { n: formatNumber(t.locale, res.data.unmappedCount) })}
            </Alert>
          ) : null}
          {res.data.lanes.length === 0 ? (
            <EmptyState title={t("categories.empty")} body={t("categories.emptyBody")} action={<Link className="ox-btn ox-btn--secondary" href={`/settings/keywords${qs({ pg })}`}>{t("categories.goTaxonomy")}</Link>} />
          ) : (
            <div className="ap-board" role="list" aria-label={t("categories.title")}>
              {res.data.lanes.map((lane) => (
                <section key={lane.key} className="ap-lane" role="listitem" aria-label={lane.label[t.locale]}>
                  <div className="ap-lane__head">
                    <strong>{lane.key === "unclassified" ? t("category.unclassified") : lane.label[t.locale]}</strong>
                    <div className="ox-row ox-xs ox-muted ox-num">
                      <span>{t("categories.count", { n: formatNumber(t.locale, lane.count) })}</span>
                      <span aria-hidden="true">·</span>
                      <span>{t("categories.sold30d", { n: formatNumber(t.locale, lane.soldTotal) })}</span>
                      <span aria-hidden="true">·</span>
                      <span>{t("categories.share", { pct: formatPercent(t.locale, lane.share) })}</span>
                    </div>
                    {lane.share != null ? <span className="ox-bar" style={{ width: `${Math.max(2, lane.share * 100)}%` }} aria-hidden="true" /> : null}
                  </div>
                  <div className="ap-lane__list">
                    {lane.products.length === 0 ? <p className="ox-xs ox-muted" style={{ padding: 8 }}>{t("categories.laneEmpty")}</p> : null}
                    {lane.products.map((p) => (
                      <Link key={p.id} className="ap-lane__row" href={`/products/${encodeURIComponent(p.id)}?pg=${encodeURIComponent(pg)}&from=${encodeURIComponent(from)}`}>
                        <span className="ap-lane__thumb"><ProductImage t={t} product={p} size={20} /></span>
                        <span style={{ minWidth: 0 }}>
                          <span className="line-clamp-2 ox-xs" lang={shownTitle(t, p).lang} title={p.title ?? undefined}>{shownTitle(t, p).text}</span>
                          <span className="ox-xs ox-muted">{platformName(t, p.platform)}</span>
                        </span>
                        <SoldBadge t={t} sold={p.sold} />
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
