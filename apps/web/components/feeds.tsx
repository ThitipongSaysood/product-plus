import Link from "next/link";
import type { ChangeEvent, RunRow } from "@pp/contracts";
import { formatAgo, formatDateTime, formatMoney, formatNumber, type T } from "@/i18n";
import { cn } from "@/lib/cn";
import { BrandMark, eventText, noteToText, platformName, ProductImage } from "./bits";
import { EmptyState, TableScroll } from "./ui";

const EVENT_TONE = { new: "success", gone: "danger", sales_surge: "accent", price_drop: "warning", rank_up: "info" } as const;

export function EventFeed({ t, events, pg, from, emptyAction }: { t: T; events: ChangeEvent[]; pg: string; from: string; emptyAction?: React.ReactNode }) {
  if (!events.length) return <EmptyState title={t("events.empty")} body={t("events.emptyBody")} action={emptyAction} />;
  return (
    <div className="ap-feed">
      {events.map((e) => (
        <Link key={e.id} href={`/products/${encodeURIComponent(e.productId)}?pg=${encodeURIComponent(pg)}&from=${encodeURIComponent(from)}`} className={cn("ap-event", `ap-event--${e.kind}`)}>
          <span className={cn("ap-thumb", e.kind === "gone" && "is-retired")}>
            <ProductImage t={t} product={{ imageId: e.imageId, imageSourceUrl: null, imageLost: false }} size={20} />
          </span>
          <span className="ap-event__body">
            <span className="ox-row" style={{ gap: 6 }}>
              <span className={`ox-badge ox-badge--${EVENT_TONE[e.kind]}`}>{t(`event.${e.kind}`)}</span>
              <BrandMark t={t} platform={e.platform} />
              <span className="ox-xs ox-muted">{formatAgo(t.locale, e.occurredAt)}</span>
            </span>
            <span className="line-clamp-2" lang="zh-CN">{e.productTitle ?? t("product.untitled")}</span>
            <span className="ox-xs ox-muted">{eventText(t, e)}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

const RUN_TONE = { running: "info", succeeded: "success", failed: "danger", suspect: "warning" } as const;

export function RunsTable({ t, runs }: { t: T; runs: RunRow[] }) {
  if (!runs.length) return <EmptyState title={t("runs.empty")} body={t("runs.emptyBody")} />;
  return (
    <TableScroll label={t("runs.title")}>
      <table className="ox-table ox-table--data">
        <thead>
          <tr>
            <th>{t("runs.col.started")}</th>
            <th>{t("runs.col.kind")}</th>
            <th>{t("runs.col.target")}</th>
            <th>{t("runs.col.status")}</th>
            <th className="is-num">{t("runs.col.items")}</th>
            <th className="is-num">{t("runs.col.cost")}</th>
            <th>{t("runs.col.note")}</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td className="ox-num" style={{ whiteSpace: "nowrap" }}>{formatDateTime(t.locale, r.startedAt)}</td>
              <td>{t(`run.kind.${r.kind}`)}{r.step ? <div className="ox-xs ox-muted">{t.or(`job.step.${r.step}`, r.step)}</div> : null}</td>
              <td>{r.platform ? platformName(t, r.platform) : "—"}{r.keyword ? <div className="ox-xs ox-muted" lang="zh-CN">{r.keyword}</div> : null}</td>
              <td><span className={`ox-badge ox-badge--${RUN_TONE[r.status]}`}>{t(`run.status.${r.status}`)}</span></td>
              <td className="is-num">{r.itemsIn == null && r.itemsOut == null ? "—" : `${formatNumber(t.locale, r.itemsOut)} / ${formatNumber(t.locale, r.itemsIn)}`}</td>
              <td className="is-num">{formatMoney(t.locale, r.costUsd, "USD", 4)}</td>
              <td style={{ minWidth: 200 }}>{noteToText(t, r.note) || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
