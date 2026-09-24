import type { Group } from "@pp/contracts";
import { ApiErrorAlert } from "@/components/bits";
import { GroupsTable, NewGroupForm } from "@/components/settings/GroupsSettings";
import { getT } from "@/i18n/server";
import { api } from "@/lib/api";
import { getPg } from "@/lib/params";

export default async function GroupsSettingsPage(props: PageProps<"/settings/groups">) {
  const sp = await props.searchParams;
  const t = await getT();
  const groups = await api<Group[]>("/groups");
  const list = groups.data ?? [];
  const pg = getPg(sp) || list[0]?.slug || "";

  return (
    <>
      <div className="ox-page-head">
        <div>
          <h1 className="ox-page-title">{t("settingsGroups.title")}</h1>
          <p className="ox-muted">{t("settingsGroups.sub")}</p>
        </div>
      </div>
      {groups.error ? <ApiErrorAlert t={t} error={groups.error} /> : null}
      <GroupsTable key={`gt-${list.length}`} groups={list} pg={pg} />
      <NewGroupForm key={`nf-${list.length}`} groups={list} />
    </>
  );
}
