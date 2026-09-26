"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SettingRow } from "@pp/contracts";
import { useT } from "@/i18n/client";
import { send } from "@/lib/client-api";
import { EditIcon, ServerIcon } from "../icons";
import { Alert, Button, Field, Modal, TableScroll, TextInput } from "../ui";

const SOURCE_TONE = { db: "ox-badge--accent", env: "ox-badge--info", fallback: "", unset: "ox-badge--warning" } as const;

export function SettingsTable({ rows }: { rows: SettingRow[] }) {
  const t = useT();
  const router = useRouter();
  const [edit, setEdit] = useState<SettingRow | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const groups = [...new Set(rows.map((r) => r.group))];

  async function save() {
    if (!edit) return;
    setBusy(true);
    const r = await send("PUT", "/api/settings", { key: edit.key, value });
    setBusy(false);
    if (r.error) return setMsg({ tone: "danger", text: t.or(r.error, t("errors.http")) });
    setMsg({ tone: "success", text: t("system.saved", { key: edit.key }) });
    setEdit(null);
    router.refresh();
  }

  return (
    <div className="ox-stack">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {groups.map((g) => (
        <section key={g} className="ox-stack">
          <h2 className="ox-h2">{t(`system.group.${g}`)}</h2>
          <TableScroll label={t(`system.group.${g}`)}>
            <table className="ox-table ox-table--data">
              <thead>
                <tr>
                  <th>{t("system.key")}</th>
                  <th>{t("system.value")}</th>
                  <th>{t("system.source")}</th>
                  <th><span className="sr-only">{t("common.actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.filter((r) => r.group === g).map((r) => (
                  <tr key={r.key}>
                    <td><code>{r.key}</code><div className="ox-xs ox-muted">{t.or(`system.desc.${r.key}`, "")}</div></td>
                    <td style={{ minWidth: 160 }}>{r.value != null
                      ? <code>{r.secret ? `••••${r.value.slice(-4)}` : r.value}</code>
                      // env-only secrets come back null: say whether it is set, never show a value
                      : r.source === "env" ? <span className="ox-badge ox-badge--success">{t("system.envSet")}</span>
                      : <span className="ox-muted">{t("system.unset")}</span>}</td>
                    <td><span className={`ox-badge ${SOURCE_TONE[r.source]}`}>{t(`system.src.${r.source}`)}</span></td>
                    <td>
                      <Button size="sm" variant="ghost" icon={<EditIcon size={16} />} onClick={() => { setEdit(r); setValue(r.secret ? "" : r.value ?? ""); setMsg(null); }}>
                        {t("system.edit")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </section>
      ))}
      {edit ? (
        <Modal
          title={t("system.editTitle", { key: edit.key })}
          closeLabel={t("common.close")}
          onClose={() => setEdit(null)}
          foot={<>
            <Button variant="ghost" onClick={() => setEdit(null)}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={save} disabled={busy}>{t("system.saveValue")}</Button>
          </>}
        >
          <Field label={edit.key} htmlFor="set-val" help={edit.secret ? t("system.secretHelp") : t("system.emptyHelp")}>
            <TextInput id="set-val" type={edit.secret ? "password" : "text"} autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          </Field>
        </Modal>
      ) : null}
    </div>
  );
}

/** The three values AI_BACKEND accepts, and the key each one needs (the cli needs none). */
const ENGINES = [
  { id: "cli", key: null },
  { id: "openrouter", key: "OPENROUTER_API_KEY" },
  { id: "sdk", key: "ANTHROPIC_API_KEY" },
] as const;
type EngineId = (typeof ENGINES)[number]["id"];

/** Picks AI_BACKEND from a list instead of typing it; an engine whose key is not set cannot be picked. */
export function AiEngineChooser({ rows }: { rows: SettingRow[] }) {
  const t = useT();
  const router = useRouter();
  const value = rows.find((r) => r.key === "AI_BACKEND")?.value;
  // Same reading as the api's aiBackend(): anything it does not know means "sdk".
  const current: EngineId = ENGINES.find((e) => e.id === value)?.id ?? "sdk";
  const [pick, setPick] = useState<EngineId>(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const hasKey = (key: string | null) => key === null || rows.some((r) => r.key === key && r.source !== "unset");

  async function save() {
    setBusy(true);
    const r = await send("PUT", "/api/settings", { key: "AI_BACKEND", value: pick });
    setBusy(false);
    if (r.error) return setMsg({ tone: "danger", text: t.or(r.error, t("errors.http")) });
    setMsg({ tone: "success", text: t("system.ai.saved", { name: t(`system.ai.${pick}.name`) }) });
    router.refresh();
  }

  return (
    <fieldset className="ap-choices">
      <legend className="sr-only">{t("system.ai.title")}</legend>
      {ENGINES.map((e) => {
        const ready = hasKey(e.key);
        return (
          <label key={e.id} className={`ap-choice${pick === e.id ? " is-active" : ""}${ready ? "" : " is-disabled"}`}>
            <input type="radio" name="ai-engine" value={e.id} checked={pick === e.id} disabled={!ready} onChange={() => { setPick(e.id); setMsg(null); }} />
            <span className="ox-stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
              <span className="ox-row" style={{ gap: 8 }}>
                <strong>{t(`system.ai.${e.id}.name`)}</strong>
                {current === e.id ? <span className="ox-badge ox-badge--success">{t("system.ai.inUse")}</span> : null}
                {!ready ? <span className="ox-badge ox-badge--warning">{t("system.ai.needsKey", { key: e.key ?? "" })}</span> : null}
              </span>
              <span className="ox-xs ox-muted">{t(`system.ai.${e.id}.desc`)}</span>
            </span>
          </label>
        );
      })}
      <div className="ox-row">
        <Button variant="primary" onClick={save} disabled={busy || pick === current}>{t("system.ai.use")}</Button>
        {msg ? <span role="status" className="ox-xs" style={{ color: msg.tone === "success" ? "var(--omnix-success-fg)" : "var(--omnix-danger-fg)" }}>{msg.text}</span> : null}
      </div>
    </fieldset>
  );
}

export function TestConnection({ service }: { service: "apify" | "anthropic" | "openrouter" }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; detail: string } | null>(null);
  return (
    <div className="ox-stack" style={{ gap: 6 }}>
      <Button
        icon={<ServerIcon size={16} />}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await send<{ ok: boolean; detail: string }>("POST", "/api/settings/test", { service });
          setBusy(false);
          setRes(r.error ? { ok: false, detail: t.or(r.error, t("errors.http")) } : { ok: r.data.ok, detail: t.or(r.data.detail, r.data.detail) });
        }}
      >
        {busy ? t("system.testing") : t(`system.test.${service}`)}
      </Button>
      {res ? <span role="status" className="ox-xs" style={{ color: res.ok ? "var(--omnix-success-fg)" : "var(--omnix-danger-fg)" }}>{res.ok ? t("system.testOk") : t("system.testFail")}{res.detail ? ` · ${res.detail}` : ""}</span> : null}
    </div>
  );
}
