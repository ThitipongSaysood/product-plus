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
import { KeywordSuggest } from "./keyword-suggest";
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
  // One box, one keyword per line: the same term normally has to go on several platforms, and adding
  // it one platform at a time is four submits for what is one decision.
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Platform[]>(platforms);
  const [region, setRegion] = useState("");
  const rows = keywords.filter((k) => platforms.includes(k.platform)).sort((a, b) => PLATFORM_LIST.indexOf(a.platform) - PLATFORM_LIST.indexOf(b.platform));
  // Deduplicated here as well as on the server, so a list pasted with repeats does not send the same
  // row twice and count one of them as "already there".
  const terms = [...new Set(text.split(/[\n,]/).map((x) => x.trim()).filter(Boolean))];
  const chosen = PLATFORM_LIST.filter((p) => platforms.includes(p) && picked.includes(p));
  const pending = terms.length * chosen.length;

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
      <SectionTitle title={t("kwsug.title")} />
      <KeywordSuggest pg={pg} platforms={platforms} />
      <form
        className="ox-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!pending) return;
          let added = 0;
          let skipped = 0;
          const ok = await s.run(async () => {
            for (const keyword of terms) {
              for (const platform of chosen) {
                const r = await send<Keyword>("POST", `/api/groups/${encodeURIComponent(pg)}/keywords`, {
                  platform,
                  keyword,
                  // Only Temu reads a region; storing one against the others would be a value that
                  // nothing acts on and that reads as though it did something.
                  region: platform === "temu" ? region.trim() || null : null,
                  enabled: true,
                });
                if (!r.error) added++;
                else if (r.error === "errors.keyword.duplicate") skipped++;
                else return { error: r.error };
              }
            }
            return { data: true };
          }, t("keywords.added"));
          if (ok) {
            setText("");
            s.setMsg({
              tone: skipped ? "warning" : "success",
              text: skipped
                ? t("keywords.addedNSkipped", { added: formatNumber(t.locale, added), skipped: formatNumber(t.locale, skipped) })
                : t("keywords.addedN", { added: formatNumber(t.locale, added) }),
            });
          }
        }}
      >
        <Field label={t("keywords.keywordsMulti")} htmlFor="kw-keyword" required help={t("keywords.multiHelp")}>
          <TextArea id="kw-keyword" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={"苹果手表钢化膜\n苹果手表保护膜"} lang="zh-CN" />
        </Field>
        <fieldset className="ox-field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="ox-label">{t("group.platforms")}</legend>
          <div className="ox-row" style={{ gap: 16 }}>
            {platforms.map((p) => (
              <Checkbox key={p} checked={picked.includes(p)} label={platformName(t, p)} onChange={(v) => setPicked((cur) => (v ? [...cur, p] : cur.filter((x) => x !== p)))} />
            ))}
          </div>
          {chosen.length === 0 ? <div className="ox-error" role="alert">{t("group.platformsRequired")}</div> : null}
        </fieldset>
        <div className="ap-form-row ap-form-row--level">
          <Field label={t("keywords.region")} htmlFor="kw-region" help={t("keywords.regionTemuOnly")}>
            <TextInput id="kw-region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="us" disabled={!chosen.includes("temu")} />
          </Field>
        </div>
        {/* Said before the click, not after: keywords multiply the bill for every round from here on. */}
        {pending ? (
          <div className="ox-xs ox-muted">
            {t("keywords.willAdd", { n: formatNumber(t.locale, pending), k: formatNumber(t.locale, terms.length), p: formatNumber(t.locale, chosen.length) })}
            {" — "}
            {t("keywords.costNote")}
          </div>
        ) : null}
        <div>
          <Button type="submit" icon={<PlusIcon size={16} />} disabled={s.busy || !pending}>
            {pending > 1 ? t("keywords.addN", { n: formatNumber(t.locale, pending) }) : t("keywords.add")}
          </Button>
        </div>
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
