"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Localized, Platform } from "@pp/contracts";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { csv } from "@/lib/platform";
import { FilterIcon, GridIcon, ListUlIcon, SearchIcon } from "./icons";
import { platformName } from "./bits";
import { Button, Chip, Dropdown } from "./ui";

const TRENDS = ["rising", "flat", "falling", "insufficient_history"] as const;
const PERIODS = ["30d", "lifetime", "unknown"] as const;
const SORTS = ["sold", "rank", "price", "new"] as const;

/** All filter state lives in the URL (design-system §0.8). Changing a filter resets page. */
export function ProductFilters({ categories, platforms }: { categories: { key: string; label: Localized }[]; platforms: Platform[] }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  // Phones only (CSS): the dropdowns fold behind one button so the products start on the first screen.
  const [open, setOpen] = useState(false);

  function set(patch: Record<string, string | null>) {
    const u = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) v ? u.set(k, v) : u.delete(k);
    if (!("page" in patch)) u.delete("page");
    router.push(`${pathname}?${u.toString()}`);
  }
  function toggleCsv(key: string, value: string) {
    const cur = csv(sp.get(key) ?? "");
    const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
    set({ [key]: next.join(",") || null });
  }

  const selPlatforms = csv(sp.get("platform") ?? "");
  const cats = csv(sp.get("category") ?? "");
  const trend = sp.get("trend");
  const period = sp.get("period");
  const sort = sp.get("sort") ?? "sold";
  const density = sp.get("density") === "compact" ? "compact" : "grid";
  const count = (n: number) => (n ? ` · ${n}` : "");
  const activeCount = selPlatforms.length + cats.length + (trend ? 1 : 0) + (period ? 1 : 0) + (sort !== "sold" ? 1 : 0);
  const catLabel = (k: string) => categories.find((c) => c.key === k)?.label[t.locale] ?? (k === "unclassified" ? t("category.unclassified") : k === "offtopic" ? t("category.offtopic") : k);

  return (
    <div className="ap-sticky">
      <div className="ox-filter-bar" role="search">
        <form
          className="ox-row"
          style={{ flex: "1 1 220px" }}
          onSubmit={(e) => { e.preventDefault(); set({ q: q.trim() || null }); }}
        >
          <input
            className="ox-control"
            type="search"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("products.searchPlaceholder")}
            aria-label={t("products.search")}
            style={{ flex: 1 }}
          />
          <Button type="submit" iconOnly aria-label={t("products.search")} icon={<SearchIcon />} />
        </form>

        <Button
          className="ap-filters__toggle"
          icon={<FilterIcon />}
          aria-expanded={open}
          aria-controls="pp-filters-more"
          onClick={() => setOpen((v) => !v)}
        >
          {`${t("filter.toggle")}${count(activeCount)}`}
        </Button>

        <div id="pp-filters-more" className={cn("ap-filters__more", open && "is-open")}>
          <Dropdown label={`${t("filter.platform")}${count(selPlatforms.length)}`} active={selPlatforms.length > 0}>
            {() => platforms.map((p) => (
              <button key={p} type="button" role="menuitemcheckbox" aria-checked={selPlatforms.includes(p)} className="ap-dropdown__item" onClick={() => toggleCsv("platform", p)}>
                {platformName(t, p)}
              </button>
            ))}
          </Dropdown>

          <Dropdown label={`${t("filter.category")}${count(cats.length)}`} active={cats.length > 0} width={220}>
            {() => [...categories.map((c) => c.key), "unclassified", "offtopic"].map((k) => (
              <button key={k} type="button" role="menuitemcheckbox" aria-checked={cats.includes(k)} className="ap-dropdown__item" onClick={() => toggleCsv("category", k)}>
                {catLabel(k)}
              </button>
            ))}
          </Dropdown>

          <Dropdown label={trend ? `${t("filter.trend")}: ${t(`trend.${trend as (typeof TRENDS)[number]}`)}` : t("filter.trend")} active={Boolean(trend)}>
            {(close) => [null, ...TRENDS].map((v) => (
              <button key={v ?? "all"} type="button" role="menuitemradio" aria-checked={trend === v} className="ap-dropdown__item" onClick={() => { close(); set({ trend: v }); }}>
                {v ? t(`trend.${v}`) : t("filter.all")}
              </button>
            ))}
          </Dropdown>

          <Dropdown label={period ? `${t("filter.period")}: ${t(`period.${period as (typeof PERIODS)[number]}`)}` : t("filter.period")} active={Boolean(period)}>
            {(close) => [null, ...PERIODS].map((v) => (
              <button key={v ?? "all"} type="button" role="menuitemradio" aria-checked={period === v} className="ap-dropdown__item" onClick={() => { close(); set({ period: v }); }}>
                {v ? t(`period.${v}`) : t("filter.all")}
              </button>
            ))}
          </Dropdown>

          <Dropdown label={`${t("filter.sort")}: ${t(`sort.${sort as (typeof SORTS)[number]}`)}`}>
            {(close) => SORTS.map((v) => (
              <button key={v} type="button" role="menuitemradio" aria-checked={sort === v} className="ap-dropdown__item" onClick={() => { close(); set({ sort: v === "sold" ? null : v }); }}>
                {t(`sort.${v}`)}
              </button>
            ))}
          </Dropdown>

          <span className="ox-filter-bar__spacer" />
          <div className="ox-row" role="group" aria-label={t("density.label")} style={{ gap: 4 }}>
            <Chip active={density === "grid"} onClick={() => set({ density: null, page: sp.get("page") })} aria-label={t("density.grid")} title={t("density.grid")}>
              <GridIcon size={16} />{t("density.grid")}
            </Chip>
            <Chip active={density === "compact"} onClick={() => set({ density: "compact", page: sp.get("page") })} aria-label={t("density.compact")} title={t("density.compact")}>
              <ListUlIcon size={16} />{t("density.compact")}
            </Chip>
          </div>
        </div>
      </div>
    </div>
  );
}
