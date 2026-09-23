// Display pieces used by both server pages and client components (no hooks — pass `t`).
import type { ChangeEvent, Platform, ProductCard, SoldInfo, TrendLabel } from "@pp/contracts";
import { formatNumber, type T } from "@/i18n";
import { cn } from "@/lib/cn";
import { parseNote } from "@/lib/notes";
import { platformColorVar } from "@/lib/platform";
import { ImageLostIcon, ImageIcon, TrendingDownIcon, TrendingUpIcon } from "./icons";
import { Alert } from "./ui";
import { ReloadButton } from "./ReloadButton";
import { SafeImg } from "./SafeImg";

export function platformName(t: T, p: Platform | string): string {
  return t.or(`platform.${p}`, p);
}

export function BrandMark({ t, platform }: { t: T; platform: Platform }) {
  return (
    <span className="ap-brand-mark" style={{ "--c": platformColorVar(platform) } as React.CSSProperties}>
      {platformName(t, platform)}
    </span>
  );
}

/** Sold count ALWAYS states its period (handoff §10.1). */
export function SoldBadge({ t, sold }: { t: T; sold: SoldInfo }) {
  const n = formatNumber(t.locale, sold.count);
  if (sold.count == null) {
    return <span className="ox-badge" title={sold.text ?? undefined}>{t("sold.none")}</span>;
  }
  if (sold.period === "30d") {
    return <span className="ox-badge ox-badge--accent ox-num" title={sold.text ?? undefined}>{t(sold.lowerBound ? "sold.30dAtLeast" : "sold.30d", { n })}</span>;
  }
  if (sold.period === "lifetime") {
    return <span className="ox-badge ox-num" title={sold.text ?? undefined}>{t(sold.lowerBound ? "sold.lifetimeAtLeast" : "sold.lifetime", { n })}</span>;
  }
  return <span className="ox-badge ox-badge--warning ox-num" title={sold.text ?? undefined}>{t("sold.unknown", { n: sold.lowerBound ? `≥ ${n}` : n })}</span>;
}

export function TrendTile({ t, trend }: { t: T; trend: TrendLabel }) {
  if (trend === "insufficient_history") {
    return (
      <span className="ap-longevity ap-longevity--insufficient" title={t("trend.insufficient_history")}>
        <span className="ap-longevity__n" aria-hidden="true">—</span>
        <span className="ap-longevity__label">{t("trend.insufficientShort")}</span>
      </span>
    );
  }
  const Icon = trend === "rising" ? TrendingUpIcon : trend === "falling" ? TrendingDownIcon : null;
  return (
    <span className={cn("ap-longevity", `ap-longevity--${trend}`)}>
      <span className="ap-longevity__n" aria-hidden="true">{Icon ? <Icon size={26} /> : "→"}</span>
      <span className="ap-longevity__label">{t(`trend.${trend}`)}</span>
    </span>
  );
}

export function TrendBadge({ t, trend }: { t: T; trend: TrendLabel }) {
  const tone = trend === "rising" ? "ox-badge--accent" : trend === "falling" ? "ox-badge--danger" : "";
  return <span className={cn("ox-badge", tone)}>{t(`trend.${trend}`)}</span>;
}

export function imageSrc(p: { imageId: string | null; imageSourceUrl?: string | null; imageLost?: boolean }): string | null {
  if (p.imageId) return `/api/media/${encodeURIComponent(p.imageId)}`;
  if (p.imageLost) return null;
  return p.imageSourceUrl ?? null;
}

/** Image or an explicit "image lost / no image" state — never a silent empty box. */
export function ProductImage({ t, product, size = 32, alt = "" }: { t: T; product: Pick<ProductCard, "imageId" | "imageSourceUrl" | "imageLost">; size?: number; alt?: string }) {
  const src = imageSrc(product);
  if (src) {
    return <SafeImg src={src} alt={alt} lostLabel={t("image.lost")} size={size} />;
  }
  if (product.imageLost) {
    return (
      <span className="ap-wall__lost" role="img" aria-label={t("image.lost")}>
        <ImageLostIcon size={size} />
        {size >= 24 ? <span>{t("image.lost")}</span> : null}
      </span>
    );
  }
  return (
    <span className="ap-wall__lost is-none" role="img" aria-label={t("image.none")}>
      <ImageIcon size={size} />
      {size >= 24 ? <span>{t("image.none")}</span> : null}
    </span>
  );
}

export function noteToText(t: T, note: string | null | undefined): string {
  if (!note) return "";
  const asKey = t.or(note, "");
  if (asKey) return asKey;
  const p = parseNote(note);
  if (!p) return note;
  const vars = p.vars.platform ? { ...p.vars, platform: platformName(t, p.vars.platform) } : p.vars;
  return t(p.key, vars);
}

export function ApiErrorAlert({ t, error }: { t: T; error: string }) {
  return (
    <Alert tone="danger" title={t("errors.pageTitle")} action={<ReloadButton />}>
      {t.or(error, t("errors.http"))}
    </Alert>
  );
}

/** api stores detail {from, to, period?} for sales_surge / rank_up / price_drop (apps/api domain/trend.ts detectEvents). */
export function eventText(t: T, e: ChangeEvent): string {
  const d = (e.detail ?? {}) as Record<string, unknown>;
  const from = typeof d.from === "number" ? d.from : null;
  const to = typeof d.to === "number" ? d.to : null;
  const both = from != null && to != null;
  switch (e.kind) {
    case "sales_surge": return t("event.sales_surge.detail", { n: both ? formatNumber(t.locale, to - from) : "—" });
    case "rank_up": return t("event.rank_up.detail", { n: both ? formatNumber(t.locale, from - to) : "—" });
    case "price_drop": return t("event.price_drop.detail", { pct: both && from > 0 ? formatNumber(t.locale, ((from - to) / from) * 100, 1) : "—" });
    default: return t(`event.${e.kind}.detail`);
  }
}
