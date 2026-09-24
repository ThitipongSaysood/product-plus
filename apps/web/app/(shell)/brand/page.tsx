import Link from "next/link";
import type { BrandResponse } from "@pp/contracts";
import { ApiErrorAlert } from "@/components/bits";
import { JobButton } from "@/components/JobButton";
import { AnalyseIcon } from "@/components/icons";
import { Alert, Badge, Card, EmptyState, SectionTitle } from "@/components/ui";
import { formatDateTime, formatNumber } from "@/i18n";
import { getT } from "@/i18n/server";
import { api, qs } from "@/lib/api";
import { getPg } from "@/lib/params";

const TONE = { high: "success", medium: "info", low: "warning" } as const;

export default async function BrandPage(props: PageProps<"/brand">) {
  const sp = await props.searchParams;
  const pg = getPg(sp);
  const t = await getT();
  const [res, job] = await Promise.all([
    api<BrandResponse>(`/brand${qs({ pg })}`),
    api<Parameters<typeof JobButton>[0]["initial"]>(`/jobs/status?kind=brand${pg ? `&pg=${encodeURIComponent(pg)}` : ""}`),
  ]);

  const head = (
    <div className="ox-page-head">
      <div>
        <h1 className="ox-page-title">{t("brand.title")}</h1>
        <p className="ox-muted">{t("brand.sub")}</p>
      </div>
      <div className="ox-page-head__actions">
        <JobButton kind="brand" pg={pg} path="/api/jobs/brand" body={{ pg }} label={t("brand.run")} icon={<AnalyseIcon size={16} />} initial={job.data ?? null} />
      </div>
    </div>
  );
  if (res.error) return <>{head}<ApiErrorAlert t={t} error={res.error} /></>;
  const r = res.data.report;
  if (!r) return <>{head}<EmptyState title={t("brand.empty")} body={t("brand.emptyBody")} /></>;

  const productLink = (id: string) => `/products/${id}${qs({ pg, from: "/brand" })}`;

  return (
    <>
      {head}

      <Card>
        <p className="ox-prose">{r.summary}</p>
        <div className="ox-xs ox-muted" style={{ marginTop: "var(--omnix-space-3)" }}>
          {t("brand.generatedAt", { at: formatDateTime(t.locale, r.generatedAt), n: formatNumber(t.locale, r.candidateCount), model: r.model })}
        </div>
      </Card>

      {/* Shown to the reader, not just to the model: a shortlist without its caveats invites more
          confidence than the numbers behind it can carry. */}
      <Alert tone="info" title={t("brand.limits")}>
        <ul className="ap-bullets">{r.limits.map((l) => <li key={l}>{l}</li>)}</ul>
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

      <Card>
        <SectionTitle title={t("brand.picks")} />
        {r.picks.length ? (
          <div className="ox-stack">
            {r.picks.map((p) => (
              <section key={p.id} className="ap-pick">
                <div className="ox-row">
                  <Link href={productLink(p.id)} className="ap-pick__title">{res.data.titles[p.id] ?? p.id}</Link>
                  <Badge tone={TONE[p.confidence]}>{`${t("brand.confidence")}: ${t(`brand.confidence.${p.confidence}`)}`}</Badge>
                </div>
                <p className="ox-prose">{p.why}</p>
                <div className="ap-pros-cons">
                  <div>
                    <div className="ox-label-caps">{t("brand.pros")}</div>
                    <ul className="ap-bullets">{p.pros.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                  <div>
                    <div className="ox-label-caps">{t("brand.cons")}</div>
                    <ul className="ap-bullets">{p.cons.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="ox-muted ox-xs">{t("brand.noCandidates")}</div>
        )}
      </Card>

      {r.avoid.length ? (
        <Card>
          <SectionTitle title={t("brand.avoid")} />
          <ul className="ap-bullets">
            {r.avoid.map((a) => (
              <li key={a.id}>
                <Link href={productLink(a.id)}>{res.data.titles[a.id] ?? a.id}</Link>
                {" — "}
                {a.reason}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
