import Link from "next/link";
import type { T } from "@/i18n";
import { cn } from "@/lib/cn";
import { href, type SP } from "@/lib/params";
import type { Platform } from "@pp/contracts";
import { csv } from "@/lib/platform";
import { platformName } from "./bits";
import { CheckIcon } from "./icons";

/** Multi-select platform filter as links (?platform=a,b) — state lives in the URL. */
export function PlatformFilter({ t, path, sp, platforms }: { t: T; path: string; sp: SP; platforms: Platform[] }) {
  if (platforms.length < 2) return null;
  const cur = csv(sp.platform);
  return (
    <div className="ox-filter-bar" role="group" aria-label={t("filter.platform")}>
      <span className="ox-label">{t("filter.platform")}</span>
      <Link className={cn("ox-chip", cur.length === 0 && "is-active")} href={href(path, sp, { platform: null })} aria-current={cur.length === 0 ? "true" : undefined}>
        {cur.length === 0 ? <CheckIcon size={16} /> : null}{t("filter.all")}
      </Link>
      {platforms.map((p) => {
        const on = cur.includes(p);
        const next = on ? cur.filter((x) => x !== p) : [...cur, p];
        return (
          <Link key={p} className={cn("ox-chip", on && "is-active")} href={href(path, sp, { platform: next.join(",") || null })} aria-current={on ? "true" : undefined}>
            {on ? <CheckIcon size={16} /> : null}{platformName(t, p)}
          </Link>
        );
      })}
    </div>
  );
}
