import type { SettingRow } from "@pp/contracts";
import { ApiErrorAlert } from "@/components/bits";
import { SettingsTable, TestConnection } from "@/components/settings/SystemSettings";
import { Card, SectionTitle } from "@/components/ui";
import { getT } from "@/i18n/server";
import { api } from "@/lib/api";

export default async function SystemSettingsPage() {
  const t = await getT();
  const res = await api<SettingRow[]>("/settings");
  return (
    <>
      <div className="ox-page-head">
        <div>
          <h1 className="ox-page-title">{t("system.title")}</h1>
          <p className="ox-muted">{t("system.sub")}</p>
        </div>
      </div>
      <Card>
        <SectionTitle title={t("system.testTitle")} sub={t("system.testSub")} />
        <div className="ox-row" style={{ alignItems: "flex-start", gap: 16 }}>
          <TestConnection service="apify" />
          <TestConnection service="anthropic" />
        </div>
      </Card>
      {res.error ? <ApiErrorAlert t={t} error={res.error} /> : <SettingsTable rows={res.data} />}
    </>
  );
}
