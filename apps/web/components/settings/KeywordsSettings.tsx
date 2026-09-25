"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Group, Keyword, KeywordListResponse, KeywordSuggestion, Platform, RoundEstimate, Schedule, TaxonomyEntry, UnmappedCategory } from "@pp/contracts";
import { formatMoney, formatNumber } from "@/i18n";
import { useT } from "@/i18n/client";
import { send } from "@/lib/client-api";
import { PLATFORM_LIST } from "@/lib/platform";
import { platformName } from "../bits";
import { AnalyseIcon } from "../icons";
import { JobButton } from "../JobButton";

import { Alert, Badge, Button, Card, ComboBox, ConfirmSubmit, Field, SectionTitle, TableScroll, TextArea } from "../ui";
import { BroadPaths } from "./category-map-ai";
import { GroupFields, useGroupEdit } from "./group-edit";
import { keywordsToText, needsTranslation, parseKeywordList, wrongLanguage } from "./keyword-list";
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
export function KeywordsEditor({ pg, keywords, platforms, estimate }: { pg: string; keywords: Keyword[]; platforms: Platform[]; estimate: RoundEstimate | null }) {
  const t = useT();
  const router = useRouter();
  const [text, setText] = useState(() => keywordsToText(keywords, platforms));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const parsed = parseKeywordList(text);
  const toTranslate = needsTranslation(parsed.items, platforms);
  const wrong = wrongLanguage(text);
  // Said before saving, not after the round is skipped: every Keyword is searched on every platform.
  const roundUsd = estimate?.perKeywordUsd != null ? estimate.perKeywordUsd * parsed.items.length : null;
  const overCap = estimate?.mode === "apify" && roundUsd != null && roundUsd > estimate.runCapUsd;

  /** A suggestion is a whole line; tapping it again does nothing once the keyword is in the list. */
  const addLine = (s: KeywordSuggestion) =>
    setText((cur) =>
      parseKeywordList(cur).items.some((i) => i.keyword === s.keyword)
        ? cur
        : `${cur.trimEnd()}${cur.trim() ? "\n" : ""}${[s.keyword, s.zh ?? "", s.en ?? ""].join(" | ")}`,
    );

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
        {wrong.length ? (
          <div className="ox-help">
            {t("keywords.listWrongLang", {
              lines: wrong.map((w) => `${w.line} (${t(w.field === "zh" ? "keywords.listFieldZh" : "keywords.listFieldEn")})`).join(", "),
            })}
          </div>
        ) : null}
        {roundUsd != null && estimate?.mode === "apify" ? (
          <Alert tone={overCap ? "warning" : "info"}>
            {t("keywords.listCost", {
              n: formatNumber(t.locale, parsed.items.length),
              cost: formatMoney(t.locale, roundUsd, "USD"),
              cap: formatMoney(t.locale, estimate.runCapUsd, "USD"),
            })}
            {overCap ? ` ${t("keywords.listOverCap")}` : ""}
          </Alert>
        ) : null}
        <div aria-live="polite">{msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}</div>
      </form>
      <details className="ap-kwmore">
        <summary>{t("kwsug.title")}</summary>
        <KeywordSuggest pg={pg} onPick={addLine} />
      </details>
    </Card>
  );
}

// ---------- taxonomy ----------
// The table is what a merchant reads; the one button lets AI do the sorting (jobs/auto-categorize.ts in the api).
// The text box stays for exact edits, folded under "advanced". The card itself is keyed on the group only, so the
// AI button keeps its result message when the page refreshes with the categories it added.
export function TaxonomyEditor({ pg, taxonomy, counts, unclassified, unmapped: allUnmapped, broad, platforms }: {
  pg: string;
  taxonomy: TaxonomyEntry[];
  counts: Record<string, number>;
  unclassified: number;
  unmapped: UnmappedCategory[];
  broad: UnmappedCategory[];
  platforms: Platform[];
}) {
  const t = useT();
  const s = useSaver();
  const sorted = taxonomy.reduce((n, c) => n + (counts[c.key] ?? 0), 0);
  const unmapped = allUnmapped.filter((u) => platforms.includes(u.platform));
  const put = (entries: TaxonomyEntry[]) => send<TaxonomyEntry[]>("PUT", `/api/groups/${encodeURIComponent(pg)}/taxonomy`, entries);

  return (
    <Card>
      <SectionTitle title={t("taxonomy.title")} sub={t("taxonomy.subAi")} />
      {/* The category agent: one press runs all three steps (api jobs/auto-categorize.ts). Each step shows what
          is waiting for it, so the merchant can see what pressing will do before pressing. */}
      <section id="ai-sort" className="ap-taxo__ai" aria-labelledby="ai-sort-title">
        <h3 id="ai-sort-title" className="ap-taxo__ai-title">{t("agent.title")}</h3>
        <ol className="ap-taxo__steps">
          <li>
            <span>{t("agent.step1")}</span>
            <span className="ox-xs ox-muted ox-num">{unmapped.length ? t("agent.step1Todo", { n: formatNumber(t.locale, unmapped.length) }) : t("agent.nothing")}</span>
          </li>
          <li>
            <span>{t("agent.step2")}</span>
            <span className="ox-xs ox-muted ox-num">{unclassified ? t("agent.step2Todo", { n: formatNumber(t.locale, unclassified) }) : t("agent.nothing")}</span>
          </li>
          <li>
            <span>{t("agent.step3")}</span>
            <span className="ox-xs ox-muted ox-num">{t("agent.step3Todo")}</span>
          </li>
        </ol>
        <div className="ox-row">
          <JobButton
            kind="categorize"
            pg={pg}
            path="/api/jobs/categorize"
            body={{ pg, mode: "auto" }}
            label={t("agent.run")}
            icon={<AnalyseIcon size={16} />}
            variant="primary"
            confirm={t("taxonomy.autoConfirm")}
          />
          <span className="ox-num ox-xs ox-muted">
            {t("taxonomy.summary", { n: formatNumber(t.locale, taxonomy.length), sorted: formatNumber(t.locale, sorted), left: formatNumber(t.locale, unclassified) })}
          </span>
        </div>
        <div className="ox-help">{t("agent.help")}</div>
      </section>

      <TableScroll label={t("taxonomy.title")}>
        <table className="ox-table ox-table--data">
          <thead>
            <tr>
              <th>{t("taxonomy.colName")}</th>
              <th>{t("taxonomy.colKeywords")}</th>
              <th className="is-num">{t("taxonomy.colCount")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {taxonomy.map((c) => (
              <tr key={c.key}>
                <td style={{ minWidth: 180 }}>
                  <div className="ox-row" style={{ gap: "var(--omnix-space-1)" }}>
                    <span>{c[t.locale]}</span>
                    {c.addedBy === "ai" ? <Badge tone="accent">{t("taxonomy.aiAdded")}</Badge> : null}
                  </div>
                  <div className="ox-xs ox-muted" translate="no">{c.key}</div>
                </td>
                <td style={{ minWidth: 200 }}>
                  <span className="ox-xs line-clamp-2" lang="zh-CN" translate="no">{c.keywords.join(", ") || "—"}</span>
                </td>
                <td className="is-num">{formatNumber(t.locale, counts[c.key] ?? 0)}</td>
                <td>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void s.run(() => put(taxonomy.filter((x) => x.key !== c.key)), t("taxonomy.deleted", { name: c[t.locale] }));
                    }}
                  >
                    <ConfirmSubmit size="sm" variant="secondary" disabled={s.busy} message={t("taxonomy.deleteConfirm", { name: c[t.locale], n: formatNumber(t.locale, counts[c.key] ?? 0) })} aria-label={t("taxonomy.deleteFor", { name: c[t.locale] })}>
                      {t("taxonomy.delete")}
                    </ConfirmSubmit>
                  </form>
                </td>
              </tr>
            ))}
            <tr>
              <td className="ox-muted">{t("taxonomy.unclassifiedRow")}</td>
              <td className="ox-xs ox-muted">{t("taxonomy.unclassifiedHint")}</td>
              <td className="is-num">{formatNumber(t.locale, unclassified)}</td>
              <td>
                <a className="ox-xs" href={`/categories?pg=${encodeURIComponent(pg)}`}>{t("taxonomy.viewProducts")}</a>
              </td>
            </tr>
          </tbody>
        </table>
      </TableScroll>
      <Status msg={s.msg} />

      <details className="ap-kwmore" id="unmapped">
        <summary>{t("taxonomy.advanced")}</summary>
        <div className="ox-stack">
          <h3 className="ap-taxo__sub">{t("unmapped.title")}</h3>
          <UnmappedTable items={unmapped} taxonomy={taxonomy} />
          <BroadPaths items={broad} platforms={platforms} />
          <h3 className="ap-taxo__sub">{t("taxonomy.textTitle")}</h3>
          <TaxonomyText key={taxonomy.map((c) => c.key).join()} pg={pg} taxonomy={taxonomy} />
        </div>
      </details>
    </Card>
  );
}

/** Exact edits as text, one line per category. Keyed on the key list so it re-reads after AI or a delete. */
function TaxonomyText({ pg, taxonomy }: { pg: string; taxonomy: TaxonomyEntry[] }) {
  const t = useT();
  const s = useSaver();
  const [text, setText] = useState(() => taxonomyToText(taxonomy));
  const parsed = parseTaxonomy(text);

  return (
    <div className="ox-stack">
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
    </div>
  );
}

// ---------- unmapped queue ----------
// Matching a platform path by hand. The category agent does this too; this is for overriding it.
function UnmappedTable({ items, taxonomy }: { items: UnmappedCategory[]; taxonomy: TaxonomyEntry[] }) {
  const t = useT();
  const s = useSaver();
  const [values, setValues] = useState<Record<string, string>>({});
  const options = taxonomy.map((c) => ({ value: c.key, label: `${c.key} — ${c[t.locale]}` }));
  const known = new Set(taxonomy.map((c) => c.key));

  return (
    <div className="ox-stack">
      <div className="ox-help">{t("unmapped.sub")}</div>
      {items.length === 0 ? (
        <div className="ox-help">{t("unmapped.empty")} · {t("unmapped.emptyBody")}</div>
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
    </div>
  );
}
