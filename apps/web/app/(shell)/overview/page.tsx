import type { Overview } from "@pp/contracts";
import { ScrollMemory } from "@/components/ScrollMemory";
import { ApiErrorAlert, noteToText, platformName } from "@/components/bits";
import { EventFeed, RunsTable } from "@/components/feeds";
import { Legend, LineChart, type Series } from "@/components/charts";
import { Alert, SectionTitle } from "@/components/ui";
import { formatDateTime, formatMoney, formatNumber } from "@/i18n";
import { getT } from "@/i18n/server";
import { api, qs } from "@/lib/api";
import { getPg, href } from "@/lib/params";
import { PLATFORM_CHART_INDEX } from "@/lib/platform";
import { loadGroup } from "@/lib/group";

export default async function OverviewPage(props: PageProps<"/overview">) {
  const sp = await props.searchParams;
  const pg = getPg(sp);
  const t = await getT();
  const [res, g] = await Promise.all([api<Overview>(`/overview${qs({ pg })}`), loadGroup(pg)]);

  const head = (
    <div className="ox-page-head">
      <div>
        <h1 className="ox-page-title">{t("overview.title")}</h1>
        <p className="ox-muted">{t("overview.sub")}</p>
      </div>
    </div>
  );
  if (res.error) return <>{head}<ApiErrorAlert t={t} error={res.error} /></>;
  const o = res.data;

  // one row per date, one column per platform
  const byDate = new Map<string, Record<string, string | number | null>>();
  const shown = o.series.filter((s) => g.platforms.includes(s.platform));
  for (const s of shown) for (const p of s.points) {
    const row = byDate.get(p.date) ?? { date: p.date };
    row[s.platform] = p.sold;
    byDate.set(p.date, row);
  }
  const chartData = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const series: Series[] = shown.map((s) => ({ key: s.platform, label: platformName(t, s.platform), colorIndex: PLATFORM_CHART_INDEX[s.platform] }));
  const from = href("/overview", sp);

  return (
    <>
      <ScrollMemory page={from} />
      {head}

      <div className="ap-summary">
        <span className="ap-summary__main">
          {o.summary.lastRunAt ? t("summary.lastRun", { at: formatDateTime(t.locale, o.summary.lastRunAt) }) : t("summary.noRun")}
        </span>
        <span className="ox-badge ox-badge--success ox-num">{t("summary.new", { n: formatNumber(t.locale, o.summary.newCount) })}</span>
        <span className="ox-badge ox-badge--danger ox-num">{t("summary.gone", { n: formatNumber(t.locale, o.summary.goneCount) })}</span>
        <span className="ox-badge ox-badge--accent ox-num">{t("summary.surge", { n: formatNumber(t.locale, o.summary.surgeCount) })}</span>
        <span className="ox-badge ox-badge--warning ox-num">{t("summary.priceDrop", { n: formatNumber(t.locale, o.summary.priceDropCount) })}</span>
      </div>

      {o.alerts.map((r) => (
        <Alert key={r.id} tone={r.status === "failed" ? "danger" : "warning"} title={`${r.platform ? platformName(t, r.platform) : "—"}${r.keyword ? ` · ${r.keyword}` : ""} — ${t(`run.status.${r.status}`)}`}>
          {noteToText(t, r.note) || t("alerts.noNote")} · {formatDateTime(t.locale, r.startedAt)}
        </Alert>
      ))}

      <div className="ox-kpi-grid">
        <div className="ox-kpi">
          <div className="ox-kpi__label">{t("kpi.tracked")}</div>
          <div className="ox-kpi__value">{formatNumber(t.locale, o.kpis.tracked)}</div>
          <div className="ox-kpi__delta">{t("kpi.trackedSub")}</div>
        </div>
        <div className="ox-kpi">
          <div className="ox-kpi__label">{t("kpi.sold30d")}</div>
          <div className="ox-kpi__value">{formatNumber(t.locale, o.kpis.sold30dTotal)}</div>
          <div className="ox-kpi__delta">{t("kpi.sold30dSub")}</div>
        </div>
        <div className="ox-kpi">
          <div className="ox-kpi__label">{t("kpi.rising")}</div>
          <div className="ox-kpi__value">{formatNumber(t.locale, o.kpis.rising)}</div>
          <div className="ox-kpi__delta">{t("kpi.risingSub")}</div>
        </div>
        <div className="ox-kpi">
          <div className="ox-kpi__label">{t("kpi.spend")}</div>
          <div className="ox-kpi__value">{formatMoney(t.locale, o.kpis.spendMonthUsd)}</div>
          <div className="ox-kpi__delta">{o.kpis.budgetUsd > 0 ? t("kpi.spendSub", { budget: formatMoney(t.locale, o.kpis.budgetUsd) }) : <span style={{ color: "var(--omnix-warning-fg)" }}>{t("budget.paused")}</span>}</div>
          {g.group ? <div className="ox-kpi__delta ox-num">{t("budget.runCap", { cap: formatMoney(t.locale, g.group.runCapUsd) })}</div> : null}
        </div>
      </div>

      <section className="ox-chart is-wide">
        <div className="ox-chart__head">
          <div>
            <div className="ox-chart__title">{t("overview.chartTitle")}</div>
            <div className="ox-chart__sub">{t("overview.chartSub")}</div>
          </div>
          <Legend series={series} />
        </div>
        <div className="ox-chart__body">
          <LineChart data={chartData} series={series} emptyText={t("chart.empty")} />
        </div>
      </section>

      <section className="ox-stack">
        <SectionTitle title={t("events.title")} sub={t("events.sub")} />
        <EventFeed t={t} events={o.events.slice(0, 12)} pg={pg} from={from} />
      </section>

      <section className="ox-stack">
        <SectionTitle title={t("runs.title")} />
        <RunsTable t={t} runs={o.runs} />
      </section>
    </>
  );
}
