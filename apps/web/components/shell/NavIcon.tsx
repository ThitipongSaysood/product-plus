import { AnalyseIcon, CategoryIcon, CogIcon, PackageIcon, PulseIcon, TagIcon, TrendingUpIcon, type IconProps } from "../icons";

const ICONS = { Pulse: PulseIcon, Package: PackageIcon, Category: CategoryIcon, TrendingUp: TrendingUpIcon, Analyse: AnalyseIcon, Tag: TagIcon, Cog: CogIcon };

export function NavIcon({ name, ...rest }: { name: string } & IconProps) {
  const I = ICONS[name as keyof typeof ICONS] ?? PulseIcon;
  return <I {...rest} />;
}
