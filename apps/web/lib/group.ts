import type { Group, Platform } from "@pp/contracts";
import { api } from "./api";
import { PLATFORM_LIST } from "./platform";

/** The UI only shows platforms the group watches (group.platforms), in a stable order. */
export function groupPlatforms(group: Group | null | undefined): Platform[] {
  const on = new Set(group?.platforms ?? []);
  return PLATFORM_LIST.filter((p) => on.has(p));
}

export async function loadGroup(pg: string) {
  const r = await api<Group[]>("/groups");
  const group = r.data?.find((g) => g.slug === pg) ?? null;
  return { group, platforms: groupPlatforms(group), error: r.error ?? (r.data && !group ? ("errors.group.notFound" as const) : undefined) };
}
