"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Group, Keyword, KeywordAddResponse, Platform, Schedule, TaxonomyEntry, UnmappedCategory } from "@pp/contracts";
import { formatNumber } from "@/i18n";
import { useT } from "@/i18n/client";
import { send } from "@/lib/client-api";
import { PLATFORM_LIST } from "@/lib/platform";
import { platformName } from "../bits";
import { EditIcon, PlusIcon, TrashIcon } from "../icons";
import { Alert, Button, Card, Checkbox, ComboBox, Modal, EmptyState, Field, SectionTitle, Select, TableScroll, TextArea, TextInput, Toggle } from "../ui";
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
// CONTEXT.md: a Keyword is typed once; each watched platform searches its own Platform term.
type TermGroup = { term: string; items: Keyword[] };
type KeywordRow = { label: string; items: Keyword[]; terms: TermGroup[] };

const byPlatform = (a: Keyword, b: Keyword) => PLATFORM_LIST.indexOf(a.platform) - PLATFORM_LIST.indexOf(b.platform);

/** One row per Keyword (rows sharing `concept`; rows without one stand alone by their text), and inside
 *  it one line per distinct Platform term — the three Chinese platforms usually share one. */
export function groupKeywordRows(keywords: Keyword[], platforms: Platform[]): KeywordRow[] {
  const byLabel = new Map<string, Keyword[]>();
  for (const k of keywords) {
    if (!platforms.includes(k.platform)) continue;
    const label = k.concept ?? k.keyword;
    byLabel.set(label, [...(byLabel.get(label) ?? []), k]);
  }
  return [...byLabel.entries()].map(([label, items]) => {
    const sorted = items.sort(byPlatform);
    const terms = new Map<string, Keyword[]>();
    for (const k of sorted) terms.set(k.keyword, [...(terms.get(k.keyword) ?? []), k]);
    return { label, items: sorted, terms: [...terms.entries()].map(([term, its]) => ({ term, items: its })) };
  });
}

function AddKeyword({ pg, platforms }: { pg: string; platforms: Platform[] }) {
  const t = useT();
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="ap-kwbox">
      <form
        className="ox-stack"
        style={{ gap: "var(--omnix-space-1)" }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          setBusy(true);
          setMsg(null);
          const r = await send<KeywordAddResponse>("POST", `/api/groups/${encodeURIComponent(pg)}/keyword-concepts`, { keyword: text.trim() });
          setBusy(false);
          if (r.error || !r.data) return setMsg({ tone: "danger", text: t.or(r.error ?? "errors.http", t("errors.http")) });
          const made = r.data.created.map((k) => `${platformName(t, k.platform)} ${k.keyword}`).join(" · ");
          const skip = r.data.skipped.map((x) => `${platformName(t, x.platform)} (${t.or(x.reason, x.reason)})`).join(" · ");
          setMsg({
            tone: r.data.skipped.length ? "warning" : "success",
            text: [made && t("keywords.addedTerms", { terms: made }), skip && t("keywords.skippedTerms", { terms: skip })].filter(Boolean).join(" — "),
          });
          if (r.data.created.length) setText("");
          router.refresh();
        }}
      >
        <div className="ap-form-row">
          <Field label={t("keywords.addLabel")} htmlFor="kw-add" required>
            <TextInput id="kw-add" name="keyword" autoComplete="off" maxLength={100} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("keywords.addPh")} aria-describedby="kw-add-help" />
          </Field>
          <Button type="submit" variant="primary" icon={<PlusIcon size={16} />} disabled={busy || !text.trim()} aria-busy={busy}>
            {busy ? t("keywords.translating") : t("keywords.add")}
          </Button>
        </div>
        <div className="ox-help" id="kw-add-help">{t("keywords.addHelp", { n: formatNumber(t.locale, platforms.length) })}</div>
      </form>
      <div aria-live="polite">{msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}</div>
      <details className="ap-kwmore">
        <summary>{t("kwsug.title")}</summary>
        <KeywordSuggest pg={pg} platforms={platforms} />
      </details>
    </div>
  );
}

/** Correct the AI's Platform terms, one field per platform. Only changed rows are sent. */
function EditTerms({ row, onClose }: { row: KeywordRow; onClose: () => void }) {
  const t = useT();
  const s = useSaver();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(row.items.map((k) => [k.id, k.keyword])));
  const changed = row.items.filter((k) => (vals[k.id] ?? "").trim() && vals[k.id].trim() !== k.keyword);
  return (
    <Modal
      title={t("keywords.editTitle", { keyword: row.label })}
      onClose={onClose}
      closeLabel={t("common.close")}
      foot={
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            variant="primary"
            disabled={s.busy || changed.length === 0}
            onClick={async () => {
              const ok = await s.run(async () => {
                for (const k of changed) {
                  const r = await send("PATCH", `/api/keywords/${encodeURIComponent(k.id)}`, { keyword: vals[k.id].trim() });
                  if (r.error) return { error: r.error };
                }
                return { data: true };
              }, t("common.saved"));
              if (ok) onClose();
            }}
          >
            {t("keywords.saveTerms")}
          </Button>
        </>
      }
    >
      <p className="ox-help">{t("keywords.editHelp")}</p>
      {row.items.map((k) => (
        <Field key={k.id} label={platformName(t, k.platform)} htmlFor={`term-${k.id}`}>
          <TextInput
            id={`term-${k.id}`}
            value={vals[k.id] ?? ""}
            onChange={(e) => setVals((v) => ({ ...v, [k.id]: e.target.value }))}
            lang={k.platform === "temu" ? "en" : "zh-CN"}
            translate="no"
            autoComplete="off"
          />
        </Field>
      ))}
      <Status msg={s.msg} />
    </Modal>
  );
}

export function KeywordsEditor({ pg, keywords, platforms }: { pg: string; keywords: Keyword[]; platforms: Platform[] }) {
  const t = useT();
  const s = useSaver();
  const [editing, setEditing] = useState<string | null>(null);
  const rows = groupKeywordRows(keywords, platforms);
  const editRow = rows.find((r) => r.label === editing) ?? null;

  return (
    <Card>
      <SectionTitle title={t("keywords.title")} sub={t("keywords.sub")} />
      <AddKeyword pg={pg} platforms={platforms} />
      {rows.length === 0 ? (
        <EmptyState title={t("keywords.empty")} body={t("keywords.emptyBody")} />
      ) : (
        <TableScroll label={t("keywords.title")}>
          <table className="ox-table ox-table--data">
            <thead>
              <tr>
                <th>{t("keywords.keyword")}</th>
                <th><span className="sr-only">{t("common.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td>
                    {/* Which platforms are searched is the group's setting; here the merchant sees the
                        Keyword, and the terms only as a check that the translation is right. */}
                    <div className="ap-kwrow__word">{r.label}</div>
                    <div className="ox-xs ox-muted" translate="no">
                      {r.terms.map((g) => g.term).join(" · ")}
                    </div>
                  </td>
                  <td className="ap-row-actions">
                    <div className="ox-row">
                      <Button size="sm" variant="ghost" iconOnly aria-label={t("keywords.editTerms", { keyword: r.label })} title={t("keywords.editTerms", { keyword: r.label })} icon={<EditIcon size={16} />} disabled={s.busy} onClick={() => setEditing(r.label)} />
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        aria-label={t("keywords.delete", { keyword: r.label })}
                        title={t("keywords.delete", { keyword: r.label })}
                        icon={<TrashIcon size={16} />}
                        disabled={s.busy}
                        onClick={() => {
                          if (!window.confirm(t("keywords.deleteAllConfirm", { keyword: r.label, n: formatNumber(t.locale, r.items.length) }))) return;
                          void s.run(async () => {
                            for (const k of r.items) {
                              const res = await send("DELETE", `/api/keywords/${encodeURIComponent(k.id)}`);
                              if (res.error) return { error: res.error };
                            }
                            return { data: true };
                          }, t("common.deleted"));
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
      {editRow ? <EditTerms key={editRow.label} row={editRow} onClose={() => setEditing(null)} /> : null}
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
