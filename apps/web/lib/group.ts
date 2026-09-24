import type { Group, Platform } from "@pp/contracts";
import { api } from "./api";
import { PLATFORM_LIST } from "./platform";

/** The UI only shows platforms the group watches (group.platforms), in a stable order. */
export function groupPlatforms(group: Group | null | undefined): Platform[] {
  const on = new Set(group?.platforms ?? []);
  return PLATFORM_LIST.filter((p) => on.has(p));
}

/** An empty `pg` means "no ?pg= in the url" — the api answers for its oldest group, so resolve to the same
 *  one here. Without this the page loses the group's taxonomy and prints raw category keys. */
export async function loadGroup(pg: string) {
  const r = await api<Group[]>("/groups");
  const group = (pg ? r.data?.find((g) => g.slug === pg) : r.data?.[0]) ?? null;
  return { group, platforms: groupPlatforms(group), error: r.error ?? (r.data && !group ? ("errors.group.notFound" as const) : undefined) };
}
