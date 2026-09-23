import type { ActorEvaluation, ActorsResponse, JobStatus, SourceMode } from "@pp/contracts";
import { ActorActions } from "@/components/ActorActions";
import { ApiErrorAlert, BrandMark, noteToText, platformName } from "@/components/bits";
import { AnalyseIcon, CheckIcon, XIcon } from "@/components/icons";
import { JobButton } from "@/components/JobButton";
import { Alert, EmptyState, TableScroll } from "@/components/ui";
import { formatDateTime, formatMoney, formatNumber, formatPercent, type T } from "@/i18n";
import { getT } from "@/i18n/server";
import { api, qs } from "@/lib/api";
import { PLATFORM_CHART_INDEX } from "@/lib/platform";
import { loadGroup } from "@/lib/group";
import { getPg } from "@/lib/params";

type Health = { ok: boolean; db: unknown; sourceMode: SourceMode };

function Has({ t, v }: { t: T; v: boolean }) {
  return v
    ? <span className="ox-row" style={{ gap: 2, color: "var(--omnix-success-fg)", flexWrap: "nowrap" }}><CheckIcon size={16} />{t("common.yes")}</span>
    : <span className="ox-row ox-muted" style={{ gap: 2, flexWrap: "nowrap" }}><XIcon size={16} />{t("common.no")}</span>;
}

export default async function ActorsPage(props: PageProps<"/actors">) {
  const pg = getPg(await props.searchParams);
  const t = await getT();
  const [res, health, job, g] = await Promise.all([
    api<ActorsResponse>("/actors"),
    api<Health>("/health"),
    api<JobStatus>(`/jobs/status${qs({ kind: "evaluate" })}`),
    loadGroup(pg),
  ]);
  const mock = health.data?.sourceMode !== "apify";

  const head = (
    <div className="ox-page-head">
      <div>
        <h1 className="ox-page-title">{t("actors.title")}</h1>
        <p className="ox-muted">{t("actors.sub")}</p>
      </div>
      <div className="ox-page-head__actions">
        <JobButton kind="evaluate" path="/api/actors/evaluate" body={{}} label={t("actors.evaluate")} icon={<AnalyseIcon size={16} />} initial={job.data ?? null} />
      </div>
    </div>
  );
  if (res.error) return <>{head}<ApiErrorAlert t={t} error={res.error} /></>;
  const { evaluatedAt, planTier } = res.data;
  // only platforms this group watches (Temu dropped for now — group.platforms decides)
  const evaluations = res.data.evaluations.filter((e) => g.platforms.includes(e.platform));

  const rows = evaluations.slice().sort((a, b) =>
    PLATFORM_CHART_INDEX[a.platform] - PLATFORM_CHART_INDEX[b.platform]
    || Number(b.chosen) - Number(a.chosen)
    || Number(Boolean(a.excluded)) - Number(Boolean(b.excluded))
    || a.costPerResult50 - b.costPerResult50);
  const noneWorking = g.platforms.filter((p) => !evaluations.some((e) => e.platform === p && e.chosen));

  return (
    <>
      {head}
      <p className="ox-xs ox-muted">
        {t("actors.meta", { at: formatDateTime(t.locale, evaluatedAt), tier: planTier || "—" })} · {t("actors.freeNote")}
      </p>
      {mock ? <Alert tone="info">{t("actors.mockNote")}</Alert> : null}
      {noneWorking.length > 0 ? (
        <Alert tone="warning" title={t("actors.noneWorkingTitle")}>
          {noneWorking.map((p) => {
            const why = evaluations.find((e) => e.platform === p && e.reason)?.reason;
            return <div key={p}>{platformName(t, p)}: {why ? noteToText(t, why) : t("actors.reason.noneWorking")}</div>;
          })}
        </Alert>
      ) : null}
      {evaluations.length === 0 ? (
        <EmptyState title={t("actors.empty")} body={t("actors.emptyBody")} />
      ) : (
        <TableScroll label={t("actors.title")}>
          <table className="ox-table ox-table--data">
            <thead>
              <tr>
                <th>{t("facts.platform")}</th>
                <th>{t("actors.col.actor")}</th>
                <th>{t("actors.col.tier")}</th>
                <th className="is-num">{t("actors.col.startFee")}</th>
                <th className="is-num">{t("actors.col.perResult")}</th>
                <th className="is-num">{t("actors.col.est50")}</th>
                <th>{t("actors.col.sold30d")}</th>
                <th>{t("actors.col.category")}</th>
                <th>{t("actors.col.image")}</th>
                <th>{t("actors.col.link")}</th>
                <th>{t("actors.col.trend")}</th>
                <th className="is-num">{t("actors.col.failRate")}</th>
                <th className="is-num">{t("actors.col.runs30d")}</th>
                <th className="is-num">{t("actors.col.smokeItems")}</th>
                <th className="is-num">{t("actors.col.smokeCost")}</th>
                <th>{t("actors.col.status")}</th>
                <th>{t("actors.col.reason")}</th>
                <th>{t("actors.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => <ActorRow key={e.id} t={t} e={e} mock={mock} />)}
            </tbody>
          </table>
        </TableScroll>
      )}
    </>
  );
}

function ActorRow({ t, e, mock }: { t: T; e: ActorEvaluation; mock: boolean }) {
  const estSmoke = e.startFee + 5 * e.pricePerResult;
  return (
    <tr>
      <td><BrandMark t={t} platform={e.platform} /></td>
      <td style={{ minWidth: 200 }}>
        <a href={`https://apify.com/${e.actorId}`} target="_blank" rel="noopener noreferrer"><code>{e.actorId}</code></a>
        {e.title ? <div className="ox-xs ox-muted">{e.title}</div> : null}
        {e.needsCookie ? <div><span className="ox-badge ox-badge--warning">{t("actors.needsCookie")}</span></div> : null}
      </td>
      <td>{e.planTier}</td>
      <td className="is-num">{formatMoney(t.locale, e.startFee, "USD", 4)}</td>
      <td className="is-num">{formatMoney(t.locale, e.costPerResult50, "USD", 4)}</td>
      <td className="is-num">{formatMoney(t.locale, e.estCost50, "USD", 4)}</td>
      <td><Has t={t} v={e.hasSold30d} />{!e.hasSold30d && e.hasSold ? <div className="ox-xs ox-muted">{t("actors.hasSoldOther")}</div> : null}</td>
      <td><Has t={t} v={e.hasCategory} /></td>
      <td><Has t={t} v={e.hasImage} /></td>
      <td><Has t={t} v={e.hasLink} /></td>
      <td><Has t={t} v={e.hasTrend} /></td>
      <td className="is-num">{formatPercent(t.locale, e.failRate30d)}</td>
      <td className="is-num">{formatNumber(t.locale, e.runs30d)}</td>
      <td className="is-num">{e.smokeItemsIn == null && e.smokeItemsOut == null ? <span className="ox-muted">{t("actors.smokeNotRun")}</span> : `${formatNumber(t.locale, e.smokeItemsOut)} / ${formatNumber(t.locale, e.smokeItemsIn)}`}</td>
      <td className="is-num">{formatMoney(t.locale, e.smokeCostUsd, "USD", 4)}</td>
      <td>
        {e.chosen ? <span className="ox-badge ox-badge--success">{t("actors.chosen")}</span> : null}
        {e.excluded ? <span className="ox-badge ox-badge--danger" title={e.excluded}>{t.or(e.excluded, e.excluded)}</span> : null}
        {!e.chosen && !e.excluded ? <span className="ox-badge">{t("actors.candidate")}</span> : null}
        <div className="ox-xs ox-muted ox-num">{t("actors.completeness", { n: e.completeness })}</div>
      </td>
      <td style={{ minWidth: 220 }}>{e.reason ? noteToText(t, e.reason) : "—"}</td>
      <td><ActorActions platform={e.platform} actorId={e.actorId} estSmoke={estSmoke} mock={mock} chosen={e.chosen} excluded={Boolean(e.excluded)} /></td>
    </tr>
  );
}
