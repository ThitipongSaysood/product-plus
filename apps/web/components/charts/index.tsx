"use client";
// Recharts wrappers (design-system §6). Colours come from CSS tokens, read after paint and on theme change.
import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart as RLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatCompact, formatDate, formatNumber } from "@/i18n";
import { useLocale } from "@/i18n/client";

const TOKENS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-other", "chart-grid", "chart-axis", "surface", "border", "fg", "fg-muted"] as const;
export type ChartColors = Record<(typeof TOKENS)[number], string>;

const EMPTY = Object.fromEntries(TOKENS.map((k) => [k, "currentColor"])) as ChartColors;

export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(EMPTY);
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      setColors(Object.fromEntries(TOKENS.map((k) => [k, cs.getPropertyValue(`--omnix-${k}`).trim() || "currentColor"])) as ChartColors);
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", read);
    return () => { mo.disconnect(); mq.removeEventListener("change", read); };
  }, []);
  return colors;
}

/** index ≥ 5 → "other" */
export function seriesColor(c: ChartColors, i: number): string {
  return [c["chart-1"], c["chart-2"], c["chart-3"], c["chart-4"], c["chart-5"]][i] ?? c["chart-other"];
}

export type Series = { key: string; label: string; colorIndex: number };

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="ox-legend">
      {series.map((s) => (
        <span className="ox-legend__item" key={s.key}>
          <span className="ox-legend__swatch" style={{ "--c": `var(--omnix-${s.colorIndex >= 5 ? "chart-other" : `chart-${s.colorIndex + 1}`})` } as React.CSSProperties} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function useTooltipStyle(c: ChartColors) {
  return {
    contentStyle: { background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, color: c.fg, fontSize: 12 },
    labelStyle: { color: c.fg, fontWeight: 600 },
    itemStyle: { color: c.fg },
  };
}

/** Time series: one line per series, ≤ 4 lines, single axis. data rows: { date, [series.key]: number|null } */
export function LineChart({ data, series, height = 260, emptyText }: {
  data: Record<string, string | number | null>[]; series: Series[]; height?: number; emptyText: string;
}) {
  const c = useChartColors();
  const locale = useLocale();
  const tip = useTooltipStyle(c);
  if (!data.length) {
    return <div className="ox-chart__canvas" style={{ height }}><div className="ox-chart__empty">{emptyText}</div></div>;
  }
  return (
    <div className="ox-chart__canvas" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RLineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={c["chart-grid"]} />
          <XAxis dataKey="date" tickFormatter={(v: string) => formatDate(locale, v, true)} tick={{ fill: c["chart-axis"], fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis tickFormatter={(v: number) => formatCompact(locale, v)} tick={{ fill: c["chart-axis"], fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
          <Tooltip
            {...tip}
            labelFormatter={(v) => formatDate(locale, String(v))}
            formatter={(v) => formatNumber(locale, typeof v === "number" ? v : null)}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stroke={seriesColor(c, s.colorIndex)}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bars sorted desc (caller sorts). data rows: { label, [series.key]: number } */
export function HBarChart({ data, series, height, emptyText, percent }: {
  data: Record<string, string | number | null>[]; series: Series[]; height?: number; emptyText: string; percent?: boolean;
}) {
  const c = useChartColors();
  const locale = useLocale();
  const tip = useTooltipStyle(c);
  const h = height ?? Math.max(160, data.length * 32 + 24);
  if (!data.length) {
    return <div className="ox-chart__canvas" style={{ height: 160 }}><div className="ox-chart__empty">{emptyText}</div></div>;
  }
  return (
    <div className="ox-chart__canvas" style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid horizontal={false} vertical={false} />
          <XAxis type="number" hide domain={[0, "auto"]} />
          <YAxis
            type="category"
            dataKey="label"
            width={150}
            interval={0}
            tick={{ fill: c["chart-axis"], fontSize: 12, width: 1000 }}
            tickFormatter={(v: string) => (v.length > 10 ? `${v.slice(0, 9)}…` : v)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip {...tip} cursor={{ fill: c["chart-grid"] }} formatter={(v) => (percent ? `${formatNumber(locale, Number(v) * 100, 1)}%` : formatNumber(locale, typeof v === "number" ? v : null))} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={seriesColor(c, s.colorIndex)} radius={[0, 4, 4, 0]} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
