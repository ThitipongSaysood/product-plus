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
export function GroupForm({ group }: { group: Group }) {
  const t = useT();
  const s = useSaver();
  const [budget, setBudget] = useState(String(group.monthlyBudgetUsd));
  const [limit, setLimit] = useState(String(group.resultLimit));
  const [schedule, setSchedule] = useState<Schedule>(group.schedule);
  const [runCap, setRunCap] = useState(String(group.runCapUsd ?? 1));
  const runCapN = Number(runCap);
  const runCapBad = !Number.isFinite(runCapN) || runCapN < 0.1;
  const [platforms, setPlatforms] = useState<Platform[]>(group.platforms);
  const noPlatform = platforms.length === 0;
  const limitN = Number(limit);
  const limitBad = !Number.isInteger(limitN) || limitN < 1 || limitN > 50;
  const budgetN = Number(budget);
  const budgetBad = budget.trim() === "" || !Number.isFinite(budgetN) || budgetN < 0;
  const capOverBudget = !runCapBad && !budgetBad && budgetN > 0 && runCapN > budgetN;

  return (
    <Card>
      <SectionTitle title={t("group.settingsTitle")} sub={group.name} />
      <form
        className="ox-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (limitBad || budgetBad || runCapBad || capOverBudget || noPlatform) return;
          void s.run(() => send<Group>("PATCH", `/api/groups/${encodeURIComponent(group.slug)}`, { monthlyBudgetUsd: budgetN, runCapUsd: runCapN, resultLimit: limitN, schedule, platforms: PLATFORM_LIST.filter((p) => platforms.includes(p)) }), t("common.saved"));
        }}
      >
        <div className="ap-form-row ap-form-row--level">
          <Field label={t("group.budget")} htmlFor="g-budget" help={t("group.budgetHelp")} error={budgetBad ? t("group.budgetInvalid") : undefined}>
            <TextInput id="g-budget" type="number" min={0} step="0.5" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} aria-invalid={budgetBad} />
          </Field>
          <Field label={t("group.runCap")} htmlFor="g-runcap" help={t("group.runCapHelp")} error={runCapBad ? t("group.runCapInvalid") : capOverBudget ? t("group.runCapOverBudget") : undefined}>
            <TextInput id="g-runcap" type="number" min={0.1} step={0.05} inputMode="decimal" value={runCap} onChange={(e) => setRunCap(e.target.value)} aria-invalid={runCapBad || capOverBudget} />
          </Field>
          <Field label={t("group.limit")} htmlFor="g-limit" help={t("group.limitHelp")} error={limitBad ? t("group.limitInvalid") : undefined}>
            <TextInput id="g-limit" type="number" min={1} max={50} step={1} inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} aria-invalid={limitBad} />
          </Field>
          <Field label={t("group.schedule")} htmlFor="g-schedule" help={t("group.scheduleHelp")}>
            <Select id="g-schedule" value={schedule} onChange={(e) => setSchedule(e.target.value as Schedule)}>
              {(["weekly", "daily", "manual"] as const).map((v) => <option key={v} value={v}>{t(`schedule.${v}`)}</option>)}
            </Select>
          </Field>
        </div>
        <fieldset className="ox-field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="ox-label">{t("group.platforms")}</legend>
          <div className="ox-row" style={{ gap: 16 }}>
            {PLATFORM_LIST.map((p) => (
              <Checkbox key={p} checked={platforms.includes(p)} label={platformName(t, p)} onChange={(v) => setPlatforms((cur) => (v ? [...cur, p] : cur.filter((x) => x !== p)))} />
            ))}
          </div>
          {noPlatform ? <div className="ox-error" role="alert">{t("group.platformsRequired")}</div> : <div className="ox-help">{t("group.platformsHelp")}</div>}
        </fieldset>
        <div><Button type="submit" variant="primary" disabled={s.busy || limitBad || budgetBad || runCapBad || capOverBudget || noPlatform}>{t("group.save")}</Button></div>
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
