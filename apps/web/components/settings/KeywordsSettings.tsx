"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Group, Keyword, Platform, Schedule, TaxonomyEntry, UnmappedCategory } from "@pp/contracts";
import { formatNumber } from "@/i18n";
import { useT } from "@/i18n/client";
import { send } from "@/lib/client-api";
import { PLATFORM_LIST } from "@/lib/platform";
import { platformName } from "../bits";
import { PlusIcon, TrashIcon } from "../icons";
import { Alert, Button, Card, Checkbox, ComboBox, EmptyState, Field, SectionTitle, Select, TableScroll, TextArea, TextInput, Toggle } from "../ui";
import { GroupFields, useGroupEdit } from "./group-edit";
import { parseTaxonomy, taxonomyToText } from "./taxonomy";

type Msg = { tone: "success" | "danger" | "warning"; text: string } | null;

function useSaver() {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function run<R>(fn: () => Promise<{ data?: R; error?: string }>, okText: string) {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    if (r.error) { setMsg({ tone: "danger", text: t.or(r.error, t("errors.http")) }); return false; }
    setMsg({ tone: "success", text: okText });
    router.refresh();
    return true;
  }
  return { busy, msg, run, setMsg };
}

function Status({ msg }: { msg: Msg }) {
  return msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null;
}

// ---------- group ----------
/** The same editor the pencil in the groups list opens — see settings/group-edit.tsx. */
export function GroupForm({ group }: { group: Group }) {
  const t = useT();
  const s = useSaver();
  const e = useGroupEdit(group);
  return (
    <Card>
      <SectionTitle title={t("group.settingsTitle")} sub={group.name} />
      <form
        className="ox-stack"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (e.blocked) return;
          void s.run(() => send<Group>("PATCH", `/api/groups/${encodeURIComponent(group.slug)}`, e.body()), t("common.saved"));
        }}
      >
        <GroupFields e={e} id="g" />
        <div><Button type="submit" variant="primary" disabled={s.busy || e.blocked}>{t("group.save")}</Button></div>
        <Status msg={s.msg} />
      </form>
    </Card>
  );
}

// ---------- keywords ----------
export function KeywordsEditor({ pg, keywords, platforms }: { pg: string; keywords: Keyword[]; platforms: Platform[] }) {
  const t = useT();
  const s = useSaver();
  const [platform, setPlatform] = useState<Platform>(platforms[0] ?? "douyin");
  const [keyword, setKeyword] = useState("");
  const [region, setRegion] = useState("");
  const rows = keywords.filter((k) => platforms.includes(k.platform)).sort((a, b) => PLATFORM_LIST.indexOf(a.platform) - PLATFORM_LIST.indexOf(b.platform));

  return (
    <Card>
      <SectionTitle title={t("keywords.title")} sub={t("keywords.sub")} />
      {rows.length === 0 ? (
        <EmptyState title={t("keywords.empty")} body={t("keywords.emptyBody")} />
      ) : (
        <TableScroll label={t("keywords.title")}>
          <table className="ox-table ox-table--data">
            <thead>
              <tr>
                <th>{t("facts.platform")}</th>
                <th>{t("keywords.keyword")}</th>
                <th>{t("keywords.region")}</th>
                <th>{t("keywords.enabled")}</th>
                <th><span className="sr-only">{t("common.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.id}>
                  <td>{platformName(t, k.platform)}</td>
                  <td lang="zh-CN">{k.keyword}</td>
                  <td>{k.region ?? "—"}</td>
                  <td>
                    <Toggle
                      checked={k.enabled}
                      disabled={s.busy}
                      label={k.enabled ? t("keywords.on") : t("keywords.off")}
                      onChange={(v) => void s.run(() => send("PATCH", `/api/keywords/${encodeURIComponent(k.id)}`, { enabled: v }), t("common.saved"))}
                    />
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      aria-label={t("keywords.delete", { keyword: k.keyword })}
                      icon={<TrashIcon size={16} />}
                      disabled={s.busy}
                      onClick={() => {
                        if (window.confirm(t("keywords.deleteConfirm", { keyword: k.keyword }))) void s.run(() => send("DELETE", `/api/keywords/${encodeURIComponent(k.id)}`), t("common.deleted"));
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
      <form
        className="ap-form-row ap-form-row--level"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!keyword.trim()) return;
          const ok = await s.run(
            () => send<Keyword>("POST", `/api/groups/${encodeURIComponent(pg)}/keywords`, { platform, keyword: keyword.trim(), region: region.trim() || null, enabled: true }),
            t("keywords.added"),
          );
          if (ok) { setKeyword(""); setRegion(""); }
        }}
      >
        <Field label={t("facts.platform")} htmlFor="kw-platform">
          <Select id="kw-platform" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
            {platforms.map((p) => <option key={p} value={p}>{platformName(t, p)}</option>)}
          </Select>
        </Field>
        <Field label={t("keywords.keyword")} htmlFor="kw-keyword" required>
          <TextInput id="kw-keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="苹果手表表带" lang="zh-CN" required />
        </Field>
        <Field label={t("keywords.region")} htmlFor="kw-region" help={t("keywords.regionHelp")}>
          <TextInput id="kw-region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="us" />
        </Field>
        <Button type="submit" icon={<PlusIcon size={16} />} disabled={s.busy || !keyword.trim()}>{t("keywords.add")}</Button>
      </form>
      <Status msg={s.msg} />
    </Card>
  );
}

// ---------- taxonomy ----------
export function TaxonomyEditor({ pg, taxonomy }: { pg: string; taxonomy: TaxonomyEntry[] }) {
  const t = useT();
  const s = useSaver();
  const [text, setText] = useState(() => taxonomyToText(taxonomy));
  const parsed = parseTaxonomy(text);

  return (
    <Card>
      <SectionTitle title={t("taxonomy.title")} sub={t("taxonomy.sub")} />
      <form
        className="ox-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed.errors.length) return;
          void s.run(() => send<TaxonomyEntry[]>("PUT", `/api/groups/${encodeURIComponent(pg)}/taxonomy`, parsed.entries), t("taxonomy.saved", { n: parsed.entries.length }));
        }}
      >
        <Field
          label={t("taxonomy.label")}
          htmlFor="tx"
          help={t("taxonomy.help")}
          error={parsed.errors.length ? parsed.errors.map((er) => t("taxonomy.lineError", { line: er.line, reason: t(`taxonomy.err.${er.reason}`) })).join(" · ") : undefined}
        >
          <TextArea id="tx" rows={Math.min(18, Math.max(6, text.split("\n").length + 1))} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-invalid={parsed.errors.length > 0} style={{ fontFamily: "ui-monospace, Menlo, monospace" }} />
        </Field>
        <div className="ox-row">
          <Button type="submit" variant="secondary" disabled={s.busy || parsed.errors.length > 0}>{t("taxonomy.save")}</Button>
          <span className="ox-xs ox-muted">{t("taxonomy.count", { n: parsed.entries.length })}</span>
        </div>
        <Status msg={s.msg} />
      </form>
    </Card>
  );
}

// ---------- unmapped queue ----------
export function UnmappedQueue({ items: all, taxonomy, platforms }: { items: UnmappedCategory[]; taxonomy: TaxonomyEntry[]; platforms: Platform[] }) {
  const items = all.filter((u) => platforms.includes(u.platform));
  const t = useT();
  const s = useSaver();
  const [values, setValues] = useState<Record<string, string>>({});
  const options = taxonomy.map((c) => ({ value: c.key, label: `${c.key} — ${c[t.locale]}` }));
  const known = new Set(taxonomy.map((c) => c.key));

  return (
    <Card>
      <div id="unmapped">
        <SectionTitle title={t("unmapped.title")} sub={t("unmapped.sub")} />
      </div>
      {items.length === 0 ? (
        <EmptyState title={t("unmapped.empty")} body={t("unmapped.emptyBody")} />
      ) : (
        <TableScroll label={t("unmapped.title")}>
          <table className="ox-table ox-table--data">
            <thead>
              <tr>
                <th>{t("facts.platform")}</th>
                <th>{t("unmapped.path")}</th>
                <th className="is-num">{t("unmapped.count")}</th>
                <th>{t("unmapped.mapTo")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => {
                const id = `${u.platform}|${u.path}`;
                const v = values[id] ?? "";
                const bad = v !== "" && !known.has(v);
                return (
                  <tr key={id}>
                    <td>{platformName(t, u.platform)}</td>
                    <td lang="zh-CN" style={{ minWidth: 180 }}>{u.path}</td>
                    <td className="is-num">{formatNumber(t.locale, u.count)}</td>
                    <td style={{ minWidth: 260 }}>
                      <form
                        className="ox-row"
                        style={{ flexWrap: "nowrap" }}
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!v || bad) return;
                          void s.run(() => send("PUT", "/api/category-map", { platform: u.platform, path: u.path, categoryKey: v }), t("unmapped.saved"));
                        }}
                      >
                        <ComboBox value={v} onChange={(nv) => setValues((m) => ({ ...m, [id]: nv }))} options={options} placeholder={t("unmapped.placeholder")} aria-label={t("unmapped.mapToFor", { path: u.path })} />
                        <Button type="submit" size="sm" disabled={s.busy || !v || bad}>{t("unmapped.map")}</Button>
                      </form>
                      {bad ? <div className="ox-error">{t("unmapped.unknownKey")}</div> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      )}
      <Status msg={s.msg} />
    </Card>
  );
}
