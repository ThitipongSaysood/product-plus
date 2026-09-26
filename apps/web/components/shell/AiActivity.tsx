"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AiActivity as Activity, AiActivityItem, AiRunKind } from "@pp/contracts";
import { formatAgo } from "@/i18n";
import { useT } from "@/i18n/client";
import { send } from "@/lib/client-api";
import { JOBS_CHANGED } from "@/lib/job-events";
import { storage } from "@/lib/storage";
import { cn } from "@/lib/cn";
import { AnalyseIcon, CategoryIcon, GlobeIcon, XIcon } from "../icons";
import { progressText } from "../JobButton";
import { Badge, Button, ProgressBar } from "../ui";

const FAST_MS = 5_000; // while something runs
const SLOW_MS = 30_000; // otherwise — catches jobs started from another tab

const KIND: Record<AiRunKind, { href: string; icon: typeof GlobeIcon }> = {
  translate: { href: "/products", icon: GlobeIcon },
  categorize: { href: "/categories", icon: CategoryIcon },
  brand: { href: "/brand", icon: AnalyseIcon },
};

/** Finished runs this browser has closed with ×. Per viewer on purpose: closing is "I have seen it", not a
 *  change to the run. A newer run of the same job has a new id, so it shows again. */
const SEEN_KEY = "aijobs:dismissed";
const readSeen = (): string[] => {
  try {
    const v = JSON.parse(storage.get(SEEN_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

const TONE = { running: "info", succeeded: "success", failed: "danger", suspect: "warning" } as const;

/** Sidebar list of the group's background AI jobs: what is running, what finished, what needs a look. */
export function AiActivity({ pg }: { pg: string }) {
  const t = useT();
  const [items, setItems] = useState<AiActivityItem[] | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => setSeen(readSeen()), []);

  function dismiss(runId: string) {
    // keep only ids still listed, so the stored list never grows past a handful
    const next = [...seen.filter((id) => items?.some((i) => i.runId === id)), runId];
    setSeen(next);
    storage.set(SEEN_KEY, JSON.stringify(next));
  }

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      clearTimeout(timer);
      let running = false;
      if (!document.hidden) {
        const r = await send<Activity>("GET", `/api/jobs/activity?pg=${encodeURIComponent(pg)}`);
        if (!alive) return;
        if (r.data) {
          setItems(r.data.items);
          running = r.data.items.some((i) => i.status === "running");
        }
      }
      timer = setTimeout(tick, running ? FAST_MS : SLOW_MS);
    };
    // a job was just started here: look again shortly, once the api has written its run row
    const nudge = () => { clearTimeout(timer); timer = setTimeout(tick, 800); };
    void tick();
    window.addEventListener(JOBS_CHANGED, nudge);
    document.addEventListener("visibilitychange", nudge);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener(JOBS_CHANGED, nudge);
      document.removeEventListener("visibilitychange", nudge);
    };
  }, [pg]);

  if (items === null) return null;
  const shown = items.filter((i) => i.status === "running" || !seen.includes(i.runId));
  return (
    <section className="ap-aijobs" aria-label={t("aijobs.title")}>
      <span className="ox-label-caps">{t("aijobs.title")}</span>
      {shown.length === 0 ? <span className="ap-aijobs__empty">{t(items.length ? "aijobs.allSeen" : "aijobs.empty")}</span> : null}
      <ul>
        {shown.map((it) => {
          const k = KIND[it.kind];
          const Icon = k.icon;
          const prog = it.progress ? progressText(t, it.progress) : null;
          const when = it.finishedAt ? formatAgo(t.locale, it.finishedAt) : formatAgo(t.locale, it.startedAt);
          return (
            <li key={it.runId} className={cn(it.status !== "running" && "is-done")}>
              <Link href={`${k.href}?pg=${encodeURIComponent(pg)}`} className="ap-aijob">
                <Icon size={16} />
                <span className="ap-aijob__body">
                  <span className="ap-aijob__head">
                    <span className="ap-aijob__name">{t(`aijobs.kind.${it.kind}`)}</span>
                    <Badge tone={TONE[it.status]}>{t(`run.status.${it.status}`)}</Badge>
                  </span>
                  {prog ? (
                    <>
                      <ProgressBar pct={prog.pct} label={prog.text} />
                      <span className="ap-aijob__meta">{prog.text}</span>
                    </>
                  ) : (
                    <span className="ap-aijob__meta">{t("aijobs.finished", { ago: when })}</span>
                  )}
                </span>
              </Link>
              {it.status !== "running" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  className="ap-aijob__close"
                  icon={<XIcon size={14} />}
                  aria-label={t("aijobs.dismiss", { name: t(`aijobs.kind.${it.kind}`) })}
                  onClick={() => dismiss(it.runId)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
