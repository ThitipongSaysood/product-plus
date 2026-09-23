import Link from "next/link";
import { cookies, headers } from "next/headers";
import type { Group, JobStatus, Overview } from "@pp/contracts";
import { BottomNav } from "@/components/shell/BottomNav";
import { LangSwitch } from "@/components/shell/LangSwitch";
import { MockBanner } from "@/components/shell/MockBanner";
import { ShellDataProvider, type ShellData } from "@/components/shell/ShellData";
import { Sidebar } from "@/components/shell/Sidebar";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { THEME_COOKIE } from "@/i18n";
import { getT } from "@/i18n/server";
import { api, qs } from "@/lib/api";
import { DEFAULT_PG } from "@/lib/platform";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  const pg = new URLSearchParams((await headers()).get("x-pp-search") ?? "").get("pg") || DEFAULT_PG;
  const rawTheme = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = rawTheme === "light" || rawTheme === "dark" ? rawTheme : "system";
  const [groups, ov, job] = await Promise.all([
    api<Group[]>("/groups"),
    api<Overview>(`/overview${qs({ pg })}`),
    api<JobStatus>(`/jobs/status${qs({ pg, kind: "pipeline" })}`),
  ]);
  const initial: ShellData = {
    pg,
    sourceMode: ov.data?.sourceMode ?? null,
    spend: ov.data?.kpis.spendMonthUsd ?? null,
    budget: ov.data?.kpis.budgetUsd ?? null,
    lastRunAt: ov.data?.summary.lastRunAt ?? null,
    job: job.data ?? null,
  };

  return (
    <ShellDataProvider initial={initial}>
      <div className="ox-app">
        <header className="ox-topbar">
          <Link href={`/overview${qs({ pg })}`} className="ox-brand">
            <span className="ox-brand__mark" aria-hidden="true">P+</span>
            <span className="ap-brandname">{t("app.name")}</span>
          </Link>
          <span className="ox-topbar__spacer" />
          <LangSwitch />
          <ThemeToggle initial={theme} />
        </header>
        <div className="ox-shell">
          <Sidebar groups={groups.data ?? []} />
          <main className="ox-main" id="main">
            <div className="ox-main__inner">
              <MockBanner />
              {children}
            </div>
          </main>
        </div>
        <BottomNav />
      </div>
    </ShellDataProvider>
  );
}
