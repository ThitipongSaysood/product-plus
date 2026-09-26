"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Group, Overview } from "@pp/contracts";
import { send } from "@/lib/client-api";
import { formatAgo } from "@/i18n";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { BudgetMeter } from "../BudgetMeter";
import { AiActivity } from "./AiActivity";
import { RefreshIcon } from "../icons";
import { JobButton } from "../JobButton";
import { Badge, Select } from "../ui";
import { NAV, isActive } from "./nav";
import { NavIcon } from "./NavIcon";
import { usePg, useShellData } from "./ShellData";

export function withPg(href: string, pg: string) {
  return pg ? `${href}?pg=${encodeURIComponent(pg)}` : href;
}

/** Sentinel value of the last <option>. Underscores cannot appear in a slug
 *  (^[a-z0-9]([a-z0-9-]*[a-z0-9])?$), so this can never collide with a real group.
 *  It must also survive HTML parsing: the previous sentinel was a literal NUL, which the
 *  parser rewrites to U+FFFD per spec, so the value coming back from the <select> no longer
 *  matched and the app navigated to ?pg=%EF%BF%BDnew instead of the new-group page. */
const NEW_GROUP = "__new-group__";

export function Sidebar({ groups }: { groups: Group[] }) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const pg = usePg();
  const d = useShellData();
  // No ?pg= means "whichever group the api answers for" — show that one selected instead of a blank box.
  const current = pg || groups[0]?.slug || "";
  const known = groups.some((g) => g.slug === current);

  return (
    <aside className="ox-sidebar" aria-label={t("nav.label")}>
      <div className="ox-field ox-sidebar__group">
        <label className="ox-label" htmlFor="pp-group">{t("group.label")}</label>
        <Select
          id="pp-group"
          value={current}
          // Allow-list rather than a single sentinel comparison: only a slug we actually rendered
          // becomes a ?pg=, so no future mangled value can turn into a broken url either.
          onChange={(e) => {
            const v = e.target.value;
            const isGroup = v === current || groups.some((g) => g.slug === v);
            router.push(isGroup ? withPg(pathname, v) : "/settings/groups");
          }}
        >
          {!known && current ? <option value={current}>{current}</option> : null}
          {groups.map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}
          <option value={NEW_GROUP}>{t("groups.newOption")}</option>
        </Select>
        {d?.sourceMode ? (
          <span className="ox-row">{d.sourceMode === "mock" ? <Badge tone="warning">{t("mock.badge")}</Badge> : <Badge tone="success" title={t("mock.realHelp")}>{t("mock.realBadge")}</Badge>}
            {/* Set to real but no token: the stored data IS real, yet nothing new can be pulled. Saying only
                "real data" here read as reassurance on a system that could not fetch at all. */}
            {d.sourceMode !== "mock" && !d.canFetchReal ? <Badge tone="warning">{t("mock.cannotFetch")}</Badge> : null}</span>
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
        {current ? <AiActivity pg={current} /> : null}
        <div className="ap-jobstatus">
          <span className="ox-label-caps">{t("sync.title")}</span>
          <span>{t("sync.last", { ago: d?.lastRunAt ? formatAgo(t.locale, d.lastRunAt) : t("sync.never") })}</span>
          <JobButton
            key={current}
            kind="pipeline"
            pg={current}
            path="/api/jobs/pipeline"
            label={t("sync.run")}
            icon={<RefreshIcon size={16} />}
            size="sm"
            block
            disabled={!current} // the api refuses a pipeline without an explicit group — never guess one
            initial={d?.job ?? null}
            body={{ pg: current, confirm: true }}
            confirm={async () => {
              // fresh mode per click — never trust cached state for a paid run; unknown counts as paid
              const r = await send<Overview>("GET", `/api/overview?pg=${encodeURIComponent(current)}`);
              return r.data?.sourceMode === "mock" ? null : t("sync.confirmPaid");
            }}
          />
        </div>
        {d ? <BudgetMeter t={t} spent={d.spend} budget={d.budget} runCap={groups.find((g) => g.slug === current)?.runCapUsd ?? null} variant="mini" /> : null}
      </div>
    </aside>
  );
}
