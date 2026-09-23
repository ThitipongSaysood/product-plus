import { LangSwitch } from "@/components/shell/LangSwitch";
import { getT } from "@/i18n/server";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const t = await getT();
  return (
    <main className="ox-app" style={{ display: "grid", placeItems: "center", padding: 16 }}>
      <div className="ox-card" style={{ width: "100%", maxWidth: 380 }}>
        <div className="ox-card__body">
          <div className="ox-row" style={{ justifyContent: "space-between" }}>
            <span className="ox-brand"><span className="ox-brand__mark" aria-hidden="true">P+</span>{t("app.name")}</span>
            <LangSwitch />
          </div>
          <h1 className="ox-h2">{t("login.title")}</h1>
          <p className="ox-muted">{t("login.sub")}</p>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
