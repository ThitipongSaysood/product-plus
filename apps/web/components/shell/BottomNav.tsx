"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { DotsIcon } from "../icons";
import { NAV, PRIMARY_MOBILE, isActive } from "./nav";
import { NavIcon } from "./NavIcon";
import { usePg } from "./ShellData";
import { withPg } from "./Sidebar";

export function BottomNav() {
  const t = useT();
  const pathname = usePathname();
  const pg = usePg();
  // "open at which path" — navigating closes it without an effect.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const items = NAV.flatMap((g) => g.items);
  const primary = items.filter((i) => PRIMARY_MOBILE.includes(i.href));
  const more = items.filter((i) => !PRIMARY_MOBILE.includes(i.href));
  const moreActive = more.some((i) => isActive(pathname, i.href));

  return (
    <>
      {open ? <button type="button" className="ap-bottomnav__scrim" aria-label={t("common.close")} onClick={() => setOpenedAt(null)} /> : null}
      {open ? (
        <div className="ap-bottomnav__sheet" id="pp-more-sheet">
          {more.map((it) => (
            <Link key={it.href} href={withPg(it.href, pg)} className={cn("ox-nav-item", isActive(pathname, it.href) && "is-active")} aria-current={isActive(pathname, it.href) ? "page" : undefined}>
              <NavIcon name={it.icon} size={18} />
              {t(it.key)}
            </Link>
          ))}
        </div>
      ) : null}
      <nav className="ap-bottomnav" aria-label={t("nav.label")}>
        {primary.map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <Link key={it.href} href={withPg(it.href, pg)} className={cn("ap-bottomnav__item", active && "is-active")} aria-current={active ? "page" : undefined}>
              <NavIcon name={it.icon} size={20} />
              <span className="ap-bottomnav__label">{t(it.short)}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={cn("ap-bottomnav__item", (open || moreActive) && "is-active")}
          aria-expanded={open}
          aria-controls="pp-more-sheet"
          onClick={() => setOpenedAt(open ? null : pathname)}
        >
          <DotsIcon size={20} />
          <span className="ap-bottomnav__label">{t("nav.short.more")}</span>
        </button>
      </nav>
    </>
  );
}
