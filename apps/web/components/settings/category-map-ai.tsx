"use client";
// AI matching for platform category paths. Each unmapped path is either mapped to one of our keys or marked
// too broad — a path like "smartwatch bands" holds every material, and mapping it would move all of them into
// one category ahead of the keyword rules. Decisions are saved at once; a broad mark can be undone below.
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AutoMapResponse, Platform, TaxonomyEntry, UnmappedCategory } from "@pp/contracts";
import { formatNumber } from "@/i18n";
import { useT } from "@/i18n/client";
import { send } from "@/lib/client-api";
import { platformName } from "../bits";
import { AnalyseIcon } from "../icons";
import { Alert, Button, TableScroll } from "../ui";

export function AutoMapButton({ pg, taxonomy }: { pg: string; taxonomy: TaxonomyEntry[] }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<AutoMapResponse | null>(null);
  const nameOf = (key: string) => taxonomy.find((c) => c.key === key)?.[t.locale] ?? key;

  async function run() {
    setBusy(true);
    setError(null);
    const r = await send<AutoMapResponse>("POST", "/api/category-map/auto", { pg });
    setBusy(false);
    if (r.error || !r.data) return setError(r.error ?? "errors.http");
    setRes(r.data);
    router.refresh();
  }

  const mapped = res?.decisions.filter((d) => d.categoryKey) ?? [];
  const broad = res?.decisions.filter((d) => !d.categoryKey) ?? [];
  return (
    <div className="ox-stack">
      <div className="ox-row">
        <Button icon={<AnalyseIcon size={16} />} disabled={busy} aria-busy={busy} onClick={() => void run()}>
          {busy ? t("catmap.thinking") : t("catmap.run")}
        </Button>
        <span className="ox-help">{t("catmap.help")}</span>
      </div>
      <div aria-live="polite" className="ox-stack">
        {error ? <Alert tone="danger">{t.or(error, t("errors.http"))}</Alert> : null}
        {res ? (
          <Alert tone="success" title={t("catmap.done", { mapped: formatNumber(t.locale, mapped.length), broad: formatNumber(t.locale, broad.length) })}>
            <ul className="ap-catmap__list">
              {res.decisions.map((d) => (
                <li key={`${d.platform}|${d.path}`}>
                  <span lang="zh-CN">{platformName(t, d.platform)} · {d.path}</span>
                  {" → "}
                  <strong>{d.categoryKey ? nameOf(d.categoryKey) : t("catmap.broad")}</strong>
                  {d.reasonTh ? <span className="ox-xs"> — {t.or(d.reasonTh, d.reasonTh)}</span> : null}
                </li>
              ))}
            </ul>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}

/** Paths marked too broad. Undoing one puts it back in the queue above. */
export function BroadPaths({ items: all, platforms }: { items: UnmappedCategory[]; platforms: Platform[] }) {
  const t = useT();
  const router = useRouter();
  const items = all.filter((u) => platforms.includes(u.platform));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!items.length) return null;

  async function undo(u: UnmappedCategory) {
    const id = `${u.platform}|${u.path}`;
    setBusy(id);
    setError(null);
    const r = await send<{ ok: boolean }>("DELETE", `/api/category-map?platform=${encodeURIComponent(u.platform)}&path=${encodeURIComponent(u.path)}`);
    setBusy(null);
    if (r.error) return setError(r.error);
    router.refresh();
  }

  return (
    <details className="ap-kwmore">
      <summary>{t("catmap.broadTitle", { n: formatNumber(t.locale, items.length) })}</summary>
      <div className="ox-stack">
        <div className="ox-help">{t("catmap.broadSub")}</div>
        <TableScroll label={t("catmap.broadTitle", { n: formatNumber(t.locale, items.length) })}>
          <table className="ox-table ox-table--data">
            <thead>
              <tr>
                <th>{t("facts.platform")}</th>
                <th>{t("unmapped.path")}</th>
                <th className="is-num">{t("unmapped.count")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => {
                const id = `${u.platform}|${u.path}`;
                return (
                  <tr key={id}>
                    <td>{platformName(t, u.platform)}</td>
                    <td lang="zh-CN" style={{ minWidth: 180 }}>{u.path}</td>
                    <td className="is-num">{formatNumber(t.locale, u.count)}</td>
                    <td>
                      <Button size="sm" variant="secondary" disabled={busy !== null} aria-busy={busy === id} onClick={() => void undo(u)} aria-label={t("catmap.undoFor", { path: u.path })}>
                        {t("catmap.undo")}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
        <div aria-live="polite">{error ? <Alert tone="danger">{t.or(error, t("errors.http"))}</Alert> : null}</div>
      </div>
    </details>
  );
}
