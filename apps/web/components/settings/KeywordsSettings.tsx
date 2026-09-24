"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Group, Keyword, KeywordListResponse, Platform, Schedule, TaxonomyEntry, UnmappedCategory } from "@pp/contracts";
import { formatNumber } from "@/i18n";
import { useT } from "@/i18n/client";
import { send } from "@/lib/client-api";
import { PLATFORM_LIST } from "@/lib/platform";
import { platformName } from "../bits";

import { Alert, Button, Card, ComboBox, EmptyState, Field, SectionTitle, TableScroll, TextArea } from "../ui";
import { GroupFields, useGroupEdit } from "./group-edit";
import { keywordsToText, needsTranslation, parseKeywordList } from "./keyword-list";
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
// CONTEXT.md: a Keyword is typed once; each watched platform searches its own Platform term. Edited as
// text like the taxonomy below — one line per Keyword, saving replaces the whole list.
export function KeywordsEditor({ pg, keywords, platforms }: { pg: string; keywords: Keyword[]; platforms: Platform[] }) {
  const t = useT();
  const router = useRouter();
  const [text, setText] = useState(() => keywordsToText(keywords, platforms));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const parsed = parseKeywordList(text);
  const toTranslate = needsTranslation(parsed.items, platforms);

  /** A suggestion chip adds a line; the other language's term is left for AI to fill on save. */
  const addLine = (word: string, platform: Platform) =>
    setText((cur) => {
      const line = platform === "temu" ? `${word} |  | ${word}` : `${word} | ${word} |`;
      return parseKeywordList(cur).items.some((i) => i.keyword === word) ? cur : `${cur.trimEnd()}${cur.trim() ? "\n" : ""}${line}`;
    });

  return (
    <Card>
      <SectionTitle title={t("keywords.title")} sub={t("keywords.sub")} />
      <form
        className="ox-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (parsed.errors.length) return;
          setBusy(true);
          setMsg(null);
          const r = await send<KeywordListResponse>("PUT", `/api/groups/${encodeURIComponent(pg)}/keyword-list`, { items: parsed.items });
          setBusy(false);
          if (r.error || !r.data) return setMsg({ tone: "danger", text: t.or(r.error ?? "errors.http", t("errors.http")) });
          setText(keywordsToText(r.data.keywords, platforms));
          const skipped = r.data.skipped.map((x) => `${x.keyword} · ${platformName(t, x.platform)} (${t.or(x.reason, x.reason)})`).join(" — ");
          const parts = [t("keywords.listSaved", { n: formatNumber(t.locale, parsed.items.length) })];
          if (r.data.translated.length) parts.push(t("keywords.listTranslated", { keywords: r.data.translated.join(", ") }));
          if (skipped) parts.push(t("keywords.skippedTerms", { terms: skipped }));
          setMsg({ tone: skipped ? "warning" : "success", text: parts.join(" · ") });
          router.refresh();
        }}
      >
        <Field
          label={t("keywords.listLabel")}
          htmlFor="kw-list"
          help={t("keywords.listHelp")}
          error={parsed.errors.length ? parsed.errors.map((er) => t("taxonomy.lineError", { line: er.line, reason: t(`keywords.listErr.${er.reason}`) })).join(" · ") : undefined}
        >
          <TextArea
            id="kw-list"
            rows={Math.min(14, Math.max(4, text.split("\n").length + 1))}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            translate="no"
            aria-invalid={parsed.errors.length > 0}
            placeholder={t("keywords.listPh")}
            style={{ fontFamily: "ui-monospace, Menlo, monospace" }}
          />
        </Field>
        <div className="ox-row">
          <Button type="submit" variant="primary" disabled={busy || parsed.errors.length > 0} aria-busy={busy}>
            {busy ? (toTranslate ? t("keywords.translating") : t("common.saving")) : t("keywords.listSave")}
          </Button>
          <span className="ox-xs ox-muted">
            {t("keywords.listCount", { n: formatNumber(t.locale, parsed.items.length) })}
            {toTranslate ? ` · ${t("keywords.listWillTranslate", { n: formatNumber(t.locale, toTranslate) })}` : ""}
          </span>
        </div>
        <div aria-live="polite">{msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}</div>
      </form>
      <details className="ap-kwmore">
        <summary>{t("kwsug.title")}</summary>
        <KeywordSuggest pg={pg} platforms={platforms} onPick={addLine} />
      </details>
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
