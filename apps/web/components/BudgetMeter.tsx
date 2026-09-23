import { formatMoney, formatPercent, type T } from "@/i18n";
import { cn } from "@/lib/cn";
import { Alert, ProgressBar } from "./ui";

/** Warn at 80 %; level told by colour AND text. No budget = "unlimited" warning, never 0 %. */
export function BudgetMeter({ t, spent, budget, runCap, variant = "card" }: { t: T; spent: number | null; budget: number | null; runCap?: number | null; variant?: "card" | "mini" }) {
  const cap = runCap != null ? <span className="ox-xs ox-muted ox-num">{t("budget.runCap", { cap: formatMoney(t.locale, runCap) })}</span> : null;
  if (budget == null || budget <= 0) {
    return variant === "mini"
      ? <div className="ap-budget ap-budget--mini"><span className="ap-budget__text is-warn">{t("budget.unlimited")}</span>{cap}</div>
      : <Alert tone="warning">{t("budget.unlimited")}{cap ? <> · {cap}</> : null}</Alert>;
  }
  const s = spent ?? 0;
  const ratio = s / budget;
  const level = ratio >= 1 ? "over" : ratio >= 0.8 ? "warn" : "ok";
  const text = t("budget.text", { spent: formatMoney(t.locale, s), budget: formatMoney(t.locale, budget), pct: formatPercent(t.locale, ratio) });
  return (
    <div className={cn("ap-budget", variant === "mini" && "ap-budget--mini", `is-${level}`)}>
      <div className="ox-row" style={{ justifyContent: "space-between" }}>
        <span className="ox-xs ox-muted">{t("budget.title")}</span>
        <span className={cn("ox-xs ap-budget__text", `is-${level}`)}>{t(`budget.level.${level}`)}</span>
      </div>
      <ProgressBar pct={Math.min(100, ratio * 100)} label={text} />
      <span className="ox-xs ox-num">{text}</span>
      {cap}
    </div>
  );
}
