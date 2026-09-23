"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { JobProgress, JobStatus, RunKind, TriggerResult } from "@pp/contracts";
import { formatAgo, formatNumber, type T } from "@/i18n";
import { useT } from "@/i18n/client";
import { send } from "@/lib/client-api";
import { noteToText, platformName } from "./bits";
import { Button, ProgressBar } from "./ui";

const POLL_MS = 5000;

/** One progress shape at a time — count, steps or time are never mixed (design-system §5). */
export function progressText(t: T, p: JobProgress): { pct: number | null; text: string } {
  if (p.shape === "count") {
    return { pct: p.total > 0 ? (p.done / p.total) * 100 : null, text: t("job.count", { done: formatNumber(t.locale, p.done), total: formatNumber(t.locale, p.total), label: t.or(`job.unit.${p.label}`, p.label) }) };
  }
  if (p.shape === "steps") {
    return { pct: p.total > 0 ? (p.done / p.total) * 100 : null, text: t("job.steps", { done: p.done, total: p.total, step: t.or(`job.step.${p.step}`, p.step) }) };
  }
  return { pct: p.pct, text: p.pct == null ? t("job.timeUnknown", { ago: formatAgo(t.locale, p.startedAt) }) : t("job.timeApprox", { pct: Math.round(p.pct) }) };
}

type Props = {
  kind: RunKind;
  pg?: string;
  path: string; // POST endpoint
  body?: unknown;
  label: string;
  icon?: ReactNode;
  variant?: "primary" | "secondary";
  size?: "sm";
  block?: boolean;
  initial?: JobStatus | null;
  /** a fixed message, or an async check returning the message to confirm (null = no dialog needed) */
  confirm?: string | (() => Promise<string | null>);
  disabled?: boolean;
};

export function JobButton({ kind, pg, path, body, label, icon, variant = "secondary", size, block, initial, confirm, disabled }: Props) {
  const t = useT();
  const router = useRouter();
  const [running, setRunning] = useState<JobStatus["running"]>(initial?.running ?? null);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const polling = useRef(Boolean(initial?.running));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const statusUrl = `/api/jobs/status?kind=${kind}${pg ? `&pg=${encodeURIComponent(pg)}` : ""}`;

  const poll = useCallback(async () => {
    const r = await send<JobStatus>("GET", statusUrl);
    if (r.error) {
      setMessage({ tone: "err", text: t.or(r.error, t("errors.http")) });
      polling.current = false;
      setRunning(null);
      return;
    }
    const s = r.data;
    if (s.running) {
      setRunning(s.running);
      timer.current = setTimeout(poll, POLL_MS);
      return;
    }
    polling.current = false;
    setRunning(null);
    if (s.last) {
      const ok = s.last.status === "succeeded";
      const note = noteToText(t, s.last.note);
      setMessage({ tone: ok ? "ok" : s.last.status === "suspect" ? "warn" : "err", text: `${t(`run.status.${s.last.status}`)}${note ? ` · ${note}` : ""}` });
    }
    router.refresh();
  }, [statusUrl, t, router]);

  useEffect(() => {
    if (initial?.running) timer.current = setTimeout(poll, POLL_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setBusy(true);
    setMessage(null);
    const msg = typeof confirm === "function" ? await confirm() : confirm;
    if (msg && !window.confirm(msg)) { setBusy(false); return; }
    const r = await send<TriggerResult | { runId: string }>("POST", path, body ?? (pg ? { pg } : {}));
    setBusy(false);
    if (r.error) {
      if (r.error === "errors.job.alreadyRunning") {
        polling.current = true;
        void poll();
        return;
      }
      setMessage({ tone: "err", text: t.or(r.error, t("errors.http")) });
      return;
    }
    const res = r.data;
    // Trigger results must be read for `skipped`, not just res.ok.
    if ("skipped" in res && res.skipped.length) {
      const why = res.skipped.map((s) => `${platformName(t, s.platform)} · ${s.keyword}: ${t.or(s.reason, s.reason)}`).join(" · ");
      if (!res.started.length) {
        setMessage({ tone: "warn", text: t("job.allSkipped", { why }) });
        return;
      }
      setMessage({ tone: "warn", text: t("job.someSkipped", { n: res.skipped.length, why }) });
    }
    polling.current = true;
    setRunning({ shape: "time", pct: null, startedAt: new Date().toISOString(), runId: res.runId ?? "" });
    timer.current = setTimeout(poll, 1000);
  }

  const prog = running ? progressText(t, running) : null;

  return (
    <div className="ap-jobstatus" style={block ? undefined : { display: "inline-flex" }}>
      <Button variant={variant} size={size} block={block} icon={icon} onClick={start} disabled={disabled || busy || Boolean(running)} aria-busy={busy || Boolean(running)}>
        {running ? t("job.running") : label}
      </Button>
      {prog ? (
        <>
          <ProgressBar pct={prog.pct} label={prog.text} />
          <span aria-live="polite">{prog.text}</span>
        </>
      ) : null}
      {message ? (
        <span role="status" aria-live="polite" style={{ color: message.tone === "ok" ? "var(--omnix-success-fg)" : message.tone === "warn" ? "var(--omnix-warning-fg)" : "var(--omnix-danger-fg)" }}>
          {message.text}
        </span>
      ) : null}
    </div>
  );
}
