import type { DictKey } from "@/i18n";

export type NavItem = { href: string; key: DictKey; short: DictKey; icon: string };
export type NavGroup = { key: DictKey; items: NavItem[] };

export const NAV: NavGroup[] = [
  { key: "nav.group.watch", items: [
    { href: "/overview", key: "nav.overview", short: "nav.short.overview", icon: "Pulse" },
    { href: "/products", key: "nav.products", short: "nav.short.products", icon: "Package" },
    { href: "/categories", key: "nav.categories", short: "nav.short.categories", icon: "Category" },
    { href: "/trends", key: "nav.trends", short: "nav.short.trends", icon: "TrendingUp" },
  ] },
  { key: "nav.group.analyse", items: [
    { href: "/actors", key: "nav.actors", short: "nav.short.actors", icon: "Analyse" },
  ] },
  { key: "nav.group.settings", items: [
    { href: "/settings/groups", key: "nav.groups", short: "nav.short.groups", icon: "Package" },
    { href: "/settings/keywords", key: "nav.keywords", short: "nav.short.keywords", icon: "Tag" },
    { href: "/settings/system", key: "nav.system", short: "nav.short.system", icon: "Cog" },
  ] },
];

export const PRIMARY_MOBILE = ["/overview", "/products", "/categories", "/trends"];

export function isActive(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(base + "/");
}
