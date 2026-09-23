import type { Group, Keyword, TaxonomyEntry, UnmappedCategory } from "@pp/contracts";
import { ApiErrorAlert } from "@/components/bits";
import { GroupForm, KeywordsEditor, TaxonomyEditor, UnmappedQueue } from "@/components/settings/KeywordsSettings";
import { getT } from "@/i18n/server";
import { api, qs } from "@/lib/api";
import { getPg } from "@/lib/params";
import { groupPlatforms } from "@/lib/group";

export default async function KeywordsSettingsPage(props: PageProps<"/settings/keywords">) {
  const sp = await props.searchParams;
  const pg = getPg(sp);
  const t = await getT();
  const slug = encodeURIComponent(pg);
  const [groups, keywords, taxonomy, unmapped] = await Promise.all([
    api<Group[]>("/groups"),
    api<Keyword[]>(`/groups/${slug}/keywords`),
    api<TaxonomyEntry[]>(`/groups/${slug}/taxonomy`),
    api<UnmappedCategory[]>(`/category-map/unmapped${qs({ pg })}`),
  ]);
  const group = groups.data?.find((g) => g.slug === pg);
  const err = groups.error ?? keywords.error ?? taxonomy.error ?? unmapped.error ?? (group ? null : "errors.group.notFound");

  return (
    <>
      <div className="ox-page-head">
        <div>
          <h1 className="ox-page-title">{t("settingsKw.title")}</h1>
          <p className="ox-muted">{t("settingsKw.sub")}</p>
        </div>
      </div>
      {err ? <ApiErrorAlert t={t} error={err} /> : null}
      {group ? <GroupForm key={`g-${group.slug}-${group.platforms.join()}`} group={group} /> : null}
      {keywords.data ? <KeywordsEditor key={`k-${pg}-${groupPlatforms(group).join()}`} pg={pg} keywords={keywords.data} platforms={groupPlatforms(group)} /> : null}
      {taxonomy.data ? <TaxonomyEditor key={`t-${pg}-${taxonomy.data.length}`} pg={pg} taxonomy={taxonomy.data} /> : null}
      {unmapped.data ? <UnmappedQueue key={`u-${pg}`} items={unmapped.data} taxonomy={taxonomy.data ?? []} platforms={groupPlatforms(group)} /> : null}
    </>
  );
}
