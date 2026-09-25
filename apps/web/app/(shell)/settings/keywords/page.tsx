import type { CategoriesResponse, Group, Keyword, RoundEstimate, TaxonomyEntry, UnmappedCategory } from "@pp/contracts";
import { ApiErrorAlert } from "@/components/bits";
import { GroupForm, KeywordsEditor, TaxonomyEditor } from "@/components/settings/KeywordsSettings";
import { getT } from "@/i18n/server";
import { api, qs } from "@/lib/api";
import { getPg } from "@/lib/params";
import { groupPlatforms } from "@/lib/group";

export default async function KeywordsSettingsPage(props: PageProps<"/settings/keywords">) {
  const sp = await props.searchParams;
  const t = await getT();
  // These endpoints take the slug in the path, so an absent ?pg= has to be resolved before they are called.
  const groups = await api<Group[]>("/groups");
  const pg = getPg(sp) || groups.data?.[0]?.slug || "";
  const slug = encodeURIComponent(pg);
  const [keywords, taxonomy, unmapped, broad, estimate, cats] = await Promise.all([
    api<Keyword[]>(`/groups/${slug}/keywords`),
    api<TaxonomyEntry[]>(`/groups/${slug}/taxonomy`),
    api<UnmappedCategory[]>(`/category-map/unmapped${qs({ pg })}`),
    api<UnmappedCategory[]>(`/category-map/broad${qs({ pg })}`),
    api<RoundEstimate>(`/groups/${slug}/round-estimate`),
    api<CategoriesResponse>(`/categories${qs({ pg })}`),
  ]);
  const counts = Object.fromEntries((cats.data?.lanes ?? []).map((l) => [l.key, l.count]));
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
      {keywords.data ? <KeywordsEditor key={`k-${pg}-${groupPlatforms(group).join()}`} pg={pg} keywords={keywords.data} platforms={groupPlatforms(group)} estimate={estimate.data ?? null} /> : null}
      {taxonomy.data ? <TaxonomyEditor
          key={`t-${pg}`}
          pg={pg}
          taxonomy={taxonomy.data}
          counts={counts}
          unclassified={counts.unclassified ?? 0}
          unmapped={unmapped.data ?? []}
          broad={broad.data ?? []}
          platforms={groupPlatforms(group)}
        /> : null}
    </>
  );
}
