"use client";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { send } from "@/lib/client-api";
import { LogInIcon } from "@/components/icons";
import { Alert, Button, Field, TextInput } from "@/components/ui";

export function LoginForm() {
  const t = useT();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="ox-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const r = await send("POST", "/api/auth", { password });
        setBusy(false);
        if (r.error) return setError(t.or(r.error, t("login.failed")));
        window.location.assign("/overview");
      }}
    >
      <Field label={t("login.password")} htmlFor="pw" required>
        <TextInput id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
      </Field>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button type="submit" variant="primary" block icon={<LogInIcon size={16} />} disabled={busy || !password}>{t("login.submit")}</Button>
    </form>
  );
}
