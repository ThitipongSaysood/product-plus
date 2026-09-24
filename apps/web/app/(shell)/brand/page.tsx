import Link from "next/link";
import type { BrandItem, BrandResponse } from "@pp/contracts";
import { ApiErrorAlert, BrandMark, ProductImage, SoldBadge } from "@/components/bits";
import { JobButton } from "@/components/JobButton";
import { AnalyseIcon, CheckIcon, LinkExternalIcon, XIcon } from "@/components/icons";
import { categoryLabel } from "@/components/ProductCardView";
import { Alert, Badge, Card, EmptyState, SectionTitle } from "@/components/ui";
import { formatDateTime, formatMoney, formatNumber } from "@/i18n";
import { getT } from "@/i18n/server";
import { api, qs } from "@/lib/api";
import { loadGroup } from "@/lib/group";
import { getPg } from "@/lib/params";
import { qtyLabel } from "@/lib/supply";

const TONE = { high: "success", medium: "info", low: "warning" } as const;

export default async function BrandPage(props: PageProps<"/brand">) {
  const sp = await props.searchParams;
  const pg = getPg(sp);
  const t = await getT();
  const [res, job, g] = await Promise.all([
    api<BrandResponse>(`/brand${qs({ pg })}`),
    api<Parameters<typeof JobButton>[0]["initial"]>(`/jobs/status?kind=brand${pg ? `&pg=${encodeURIComponent(pg)}` : ""}`),
    loadGroup(pg),
  ]);

  const head = (
    <div className="ox-page-head">
      <div>
        <h1 className="ox-page-title">{t("brand.title")}</h1>
        <p className="ox-muted">{t("brand.sub")}</p>
      </div>
      <div className="ox-page-head__actions">
        {/* The report is written in whichever language the reader is using, so the request carries it. */}
        <JobButton kind="brand" pg={pg} path="/api/jobs/brand" body={{ pg, lang: t.locale }} label={t("brand.run")} icon={<AnalyseIcon size={16} />} initial={job.data ?? null} />
      </div>
    </div>
  );
  if (res.error) return <>{head}<ApiErrorAlert t={t} error={res.error} /></>;
  const r = res.data.report;
  if (!r) return <>{head}<EmptyState title={t("brand.empty")} body={t("brand.emptyBody")} /></>;

  const link = (id: string) => `/products/${encodeURIComponent(id)}${qs({ pg, from: "/brand" })}`;
  const taxonomy = g.group?.taxonomy ?? [];

  /** The numbers come from the database and sit beside the prose, so the model never has to restate them. */
  const facts = (it: BrandItem) => (
    <div className="ap-pick__facts">
      <span className="ap-pick__price ox-num">{it.buyPrice == null ? "—" : formatMoney(t.locale, it.buyPrice, it.currency ?? "CNY")}</span>
      <SoldBadge t={t} sold={it.sold} />
      {it.moq != null ? <span className="ox-badge">{t("brand.moqChip", { v: qtyLabel(t, it.moq, it.unit) })}</span> : null}
      <span className="ox-badge">{categoryLabel(t, it.categoryKey, taxonomy)}</span>
    </div>
  );

  return (
    <>
      {head}

      <Card>
        <p className="ox-prose">{r.summary}</p>
        <div className="ox-xs ox-muted" style={{ marginTop: "var(--omnix-space-3)" }}>
          {t("brand.generatedAt", { at: formatDateTime(t.locale, r.generatedAt), n: formatNumber(t.locale, r.candidateCount), model: r.model })}
        </div>
        {r.lang !== t.locale ? <div className="ox-xs ox-muted">{t("brand.otherLang", { lang: t(`lang.${r.lang}`) })}</div> : null}
      </Card>

      <Card>
        <SectionTitle title={t("brand.picks")} />
        {r.picks.length ? (
          <div className="ox-stack">
            {r.picks.map((p) => {
              const it = res.data.items[p.id];
              return (
                <article key={p.id} className="ap-pick">
                  <Link href={link(p.id)} className="ap-pick__thumb" aria-label={it?.title ?? p.id}>
                    {it ? <ProductImage t={t} product={it} alt={it.title} /> : null}
                  </Link>
                  <div className="ap-pick__body">
                    <div className="ap-pick__head">
                      <Link href={link(p.id)} className="ap-pick__title line-clamp-2">{it?.title ?? p.id}</Link>
                      <Badge tone={TONE[p.confidence]}>{t(`brand.confidence.${p.confidence}`)}</Badge>
                    </div>
                    {it ? (
                      <div className="ox-row">
                        <BrandMark t={t} platform={it.platform} />
                        {facts(it)}
                      </div>
                    ) : null}
                    <p className="ap-pick__why">{p.why}</p>
                    <div className="ap-pros-cons">
                      <ul className="ap-judge ap-judge--pro">
                        {p.pros.map((x) => <li key={x}><CheckIcon size={14} />{x}</li>)}
                      </ul>
                      <ul className="ap-judge ap-judge--con">
                        {p.cons.map((x) => <li key={x}><XIcon size={14} />{x}</li>)}
                      </ul>
                    </div>
                    {it?.productUrl ? (
                      <a className="ox-xs" href={it.productUrl} target="_blank" rel="noopener noreferrer">
                        <LinkExternalIcon size={14} />{t("product.open", { platform: t(`platform.${it.platform}`) })}
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="ox-muted ox-xs">{t("brand.noCandidates")}</div>
        )}
      </Card>

      {r.avoid.length ? (
        <Card>
          <SectionTitle title={t("brand.avoid")} />
          <div className="ap-avoid">
            {r.avoid.map((a) => {
              const it = res.data.items[a.id];
              return (
                <div key={a.id} className="ap-avoid__row">
                  <Link href={link(a.id)} className="ap-avoid__thumb" aria-label={it?.title ?? a.id}>
                    {it ? <ProductImage t={t} product={it} alt={it.title} /> : null}
                  </Link>
                  <div style={{ minWidth: 0 }}>
                    <Link href={link(a.id)} className="line-clamp-2">{it?.title ?? a.id}</Link>
                    <div className="ox-xs ox-muted">{a.reason}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {/* Kept last and quiet: the caveats must be reachable, but they are not what the page is for. */}
      <Alert tone="info" title={t("brand.limits")}>
        <ul className="ap-bullets ox-xs">{r.limits.map((l) => <li key={l}>{l}</li>)}</ul>
        {r.excluded.total ? (
          <div className="ox-xs" style={{ marginTop: "var(--omnix-space-2)" }}>
            {t("brand.excluded", {
              n: formatNumber(t.locale, r.excluded.total),
              noSold: formatNumber(t.locale, r.excluded.noSoldCount),
              noPrice: formatNumber(t.locale, r.excluded.noPrice),
            })}
          </div>
        ) : null}
      </Alert>
    </>
  );
}
