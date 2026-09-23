"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Group } from "@pp/contracts";
import { formatAgo } from "@/i18n";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { BudgetMeter } from "../BudgetMeter";
import { RefreshIcon } from "../icons";
import { JobButton } from "../JobButton";
import { Badge, Select } from "../ui";
import { NAV, isActive } from "./nav";
import { NavIcon } from "./NavIcon";
import { usePg, useShellData } from "./ShellData";

export function withPg(href: string, pg: string) {
  return `${href}?pg=${encodeURIComponent(pg)}`;
}

export function Sidebar({ groups }: { groups: Group[] }) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const pg = usePg();
  const d = useShellData();
  const known = groups.some((g) => g.slug === pg);

  return (
    <aside className="ox-sidebar" aria-label={t("nav.label")}>
      <div className="ox-field ox-sidebar__group">
        <label className="ox-label" htmlFor="pp-group">{t("group.label")}</label>
        <Select id="pp-group" value={pg} onChange={(e) => router.push(withPg(pathname, e.target.value))}>
          {!known ? <option value={pg}>{pg}</option> : null}
          {groups.map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}
        </Select>
        {d?.sourceMode ? (
          <span>{d.sourceMode === "mock" ? <Badge tone="warning">{t("mock.badge")}</Badge> : <Badge tone="success">{t("mock.realBadge")}</Badge>}</span>
        ) : null}
      </div>
      <nav className="ox-nav-list">
        {NAV.map((g) => (
          <div key={g.key} style={{ display: "contents" }}>
            <div className="ox-label-caps ox-nav-group__label">{t(g.key)}</div>
            {g.items.map((it) => {
              const active = isActive(pathname, it.href);
              return (
                <Link key={it.href} href={withPg(it.href, pg)} className={cn("ox-nav-item", active && "is-active")} aria-current={active ? "page" : undefined}>
                  <NavIcon name={it.icon} size={16} />
                  {t(it.key)}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="ox-sidebar__foot">
        <div className="ap-jobstatus">
          <span className="ox-label-caps">{t("sync.title")}</span>
          <span>{t("sync.last", { ago: d?.lastRunAt ? formatAgo(t.locale, d.lastRunAt) : t("sync.never") })}</span>
          <JobButton
            key={pg}
            kind="pipeline"
            pg={pg}
            path="/api/jobs/pipeline"
            label={t("sync.run")}
            icon={<RefreshIcon size={16} />}
            size="sm"
            block
            initial={d?.job ?? null}
            confirm={d?.sourceMode === "mock" ? undefined : t("sync.confirmPaid")}
          />
        </div>
        {d ? <BudgetMeter t={t} spent={d.spend} budget={d.budget} runCap={groups.find((g) => g.slug === pg)?.runCapUsd ?? null} variant="mini" /> : null}
      </div>
    </aside>
  );
}
