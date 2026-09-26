import Link from "next/link";
import { ScrollMemory } from "@/components/ScrollMemory";
import type { TrendRow, TrendsResponse } from "@pp/contracts";
import { ApiErrorAlert, BrandMark, shownTitle, SoldBadge } from "@/components/bits";
import { HBarChart } from "@/components/charts";
import { PlatformFilter } from "@/components/PlatformFilter";
import { Alert, EmptyState, SectionTitle, TableScroll } from "@/components/ui";
import { formatNumber, formatPercent, type T } from "@/i18n";
import { getT } from "@/i18n/server";
import { api, qs } from "@/lib/api";
import { getPg, href } from "@/lib/params";
import { first } from "@/lib/platform";
import { loadGroup } from "@/lib/group";

export default async function TrendsPage(props: PageProps<"/trends">) {
  const sp = await props.searchParams;
  const pg = getPg(sp);
  const t = await getT();
  const [res, g] = await Promise.all([api<TrendsResponse>(`/trends${qs({ pg, platform: first(sp.platform) })}`), loadGroup(pg)]);
  const from = href("/trends", sp);

  return (
    <>
      <ScrollMemory page={from} />
      <div className="ox-page-head">
        <div>
          <h1 className="ox-page-title">{t("trends.title")}</h1>
          <p className="ox-muted">{t("trends.sub")}</p>
        </div>
      </div>
      <PlatformFilter t={t} path="/trends" sp={sp} platforms={g.platforms} />
      {res.error ? <ApiErrorAlert t={t} error={res.error} /> : (
        <>
          {res.data.insufficient > 0 ? <Alert tone="info">{t("trends.insufficient", { n: formatNumber(t.locale, res.data.insufficient) })}</Alert> : null}
          <TrendSection t={t} kind="rising" rows={res.data.rising} pg={pg} from={from} />
          <TrendSection t={t} kind="falling" rows={res.data.falling} pg={pg} from={from} />
        </>
      )}
    </>
  );
}

function TrendSection({ t, kind, rows, pg, from }: { t: T; kind: "rising" | "falling"; rows: TrendRow[]; pg: string; from: string }) {
  const pct = (r: TrendRow) => Math.abs(r.changePct ?? 0) * 100;
  const sorted = rows.slice().sort((a, b) => pct(b) - pct(a));
  const max = Math.max(1, ...sorted.map(pct));
  const top = sorted.slice(0, 10).map((r) => {
    const delta = Math.round(pct(r) * 10) / 10;
    // Bar length is a magnitude, so a falling row would read as growth without its sign. The sign
    // carries the direction in the value itself; the grey bar is a second cue, never the only one.
    // Formatted here, on the server, where the locale lives — the chart is a client component and a
    // formatter function cannot cross that boundary.
    return { label: shownTitle(t, r).text, delta, deltaLabel: `${kind === "rising" ? "+" : "\u2212"}${formatNumber(t.locale, delta, 1)}%` };
  });
  const title = t(kind === "rising" ? "trends.rising" : "trends.falling");
  return (
    <section className="ox-stack">
      <SectionTitle title={title} sub={t("trends.count", { n: formatNumber(t.locale, rows.length) })} />
      {rows.length === 0 ? <EmptyState title={t("trends.empty")} body={t("trends.emptyBody")} /> : (
        <>
          <section className="ox-chart ap-wide-only">
            <div className="ox-chart__head">
              <div>
                <div className="ox-chart__title">{t("trends.topN", { n: formatNumber(t.locale, top.length), title })}</div>
                <div className="ox-chart__sub">{t("trends.top10Sub")}</div>
              </div>
            </div>
            <div className="ox-chart__body">
              <HBarChart
                data={top}
                series={[{ key: "delta", label: t("trends.col.changePct"), colorIndex: kind === "rising" ? 0 : 5 }]}
                emptyText={t("chart.empty")}
                labelWidth={300}
                maxLabelChars={34}
                valueKey="deltaLabel"
              />
            </div>
          </section>
          <TableScroll label={title}>
            <table className="ox-table ox-table--data">
              <thead>
                <tr>
                  <th>{t("trends.col.product")}</th>
                  <th>{t("facts.platform")}</th>
                  <th>{t("facts.sold")}</th>
                  <th className="is-num">{t("trends.col.deltaSold")}</th>
                  <th className="is-num">{t("trends.col.deltaRank")}</th>
                  <th className="is-num">{t("trends.col.douyin7d")}</th>
                  <th>{t("trends.col.bar")}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id}>
                    <td style={{ minWidth: 220 }}>
                      <Link href={`/products/${encodeURIComponent(r.id)}?pg=${encodeURIComponent(pg)}&from=${encodeURIComponent(from)}`} className="line-clamp-2" lang={shownTitle(t, r).lang} title={r.title ?? undefined}>{shownTitle(t, r).text}</Link>
                    </td>
                    <td><BrandMark t={t} platform={r.platform} /></td>
                    <td><SoldBadge t={t} sold={r.sold} /></td>
                    <td className="is-num">{r.deltaSold == null ? "—" : `${r.deltaSold > 0 ? "+" : ""}${formatNumber(t.locale, r.deltaSold)}`}</td>
                    <td className="is-num">{r.deltaRank == null ? "—" : `${r.deltaRank > 0 ? "+" : ""}${formatNumber(t.locale, r.deltaRank)}`}</td>
                    <td className="is-num">{r.douyinRatio == null ? "—" : `${r.douyinRatio >= 1 ? "+" : ""}${formatPercent(t.locale, r.douyinRatio - 1)}`}</td>
                    <td>
                      <span className="ox-bar-cell">
                        <span className="ox-bar" style={{ width: `${(pct(r) / max) * 100}px`, "--c": kind === "falling" ? "var(--omnix-chart-other)" : "var(--omnix-chart-1)" } as React.CSSProperties} aria-hidden="true" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </>
      )}
    </section>
  );
}
