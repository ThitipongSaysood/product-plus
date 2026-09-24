"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import type { JobStatus, Overview, SourceMode } from "@pp/contracts";
import { send } from "@/lib/client-api";
import { DEFAULT_PG } from "@/lib/platform";

export type ShellData = {
  pg: string;
  sourceMode: SourceMode | null;
  canFetchReal: boolean;
  spend: number | null;
  budget: number | null;
  lastRunAt: string | null;
  job: JobStatus | null;
};

const Ctx = createContext<ShellData | null>(null);

export function usePg(): string {
  return useSearchParams().get("pg") || DEFAULT_PG;
}

export function useShellData(): ShellData | null {
  return useContext(Ctx);
}

/**
 * The layout renders once per full request (layouts get no searchParams), so data for a ?pg= reached by
 * client navigation is fetched here. When the server data matches the current pg (first load, router.refresh) it wins.
 */
export function ShellDataProvider({ initial, children }: { initial: ShellData; children: ReactNode }) {
  const pg = usePg();
  const [fetched, setFetched] = useState<ShellData | null>(null);
  useEffect(() => {
    if (pg === initial.pg) return;
    let alive = true;
    const q = encodeURIComponent(pg);
    Promise.all([send<Overview>("GET", `/api/overview?pg=${q}`), send<JobStatus>("GET", `/api/jobs/status?pg=${q}&kind=pipeline`)]).then(([ov, job]) => {
      if (!alive) return;
      setFetched({
        pg,
        sourceMode: ov.data?.sourceMode ?? null,
        canFetchReal: ov.data?.canFetchReal ?? false,
        spend: ov.data?.kpis.spendMonthUsd ?? null,
        budget: ov.data?.kpis.budgetUsd ?? null,
        lastRunAt: ov.data?.summary.lastRunAt ?? null,
        job: job.data ?? null,
      });
    });
    return () => { alive = false; };
  }, [pg, initial.pg]);
  const value = pg === initial.pg ? initial : fetched?.pg === pg ? fetched : null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
