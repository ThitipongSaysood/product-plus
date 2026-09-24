"use client";
// Helpers around the keyword form (CONTEXT.md: Keyword suggestion · Keyword trial). Neither saves a
// Keyword: suggestions only fill the form, and a trial's listings never enter the Group.
import { useCallback, useEffect, useState } from "react";
import type {
  FrequentTermsResponse,
  KeywordSuggestion,
  KeywordSuggestionsResponse,
  KeywordTrialResult,
  KeywordTrialsResponse,
  Platform,
  TrialRun,
} from "@pp/contracts";
import { formatMoney, formatNumber } from "@/i18n";
import { useT } from "@/i18n/client";
import { send } from "@/lib/client-api";
import { PLATFORM_LIST } from "@/lib/platform";
import { BrandMark, noteToText, platformName, ProductImage, SoldBadge } from "../bits";
import { AnalyseIcon, LinkExternalIcon } from "../icons";
import { Alert, Button, Chip, Field, Modal, ProgressBar, TextInput } from "../ui";

/** Whether a word is in the keyword box AND ticked for this platform; toggle adds or removes it. */
export type Picker = { isOn: (word: string, p: Platform) => boolean; toggle: (word: string, platforms: Platform[]) => void };

const TERM_LANG = (p: Platform) => (p === "temu" ? "en" : "zh-CN");

function ChipGroup({ t, title, sub, groups, picker, wordPlatforms }: {
  t: ReturnType<typeof useT>;
  title: string;
  sub?: string;
  groups: { platform: Platform; chips: { word: string; hint?: string }[] }[];
  picker: Picker;
  wordPlatforms: (word: string, p: Platform) => Platform[];
}) {
  if (!groups.some((g) => g.chips.length)) return null;
  return (
    <div className="ox-stack ap-kwsug">
      <div>
        <div className="ox-label">{title}</div>
        {sub ? <div className="ox-help">{sub}</div> : null}
      </div>
      {groups.filter((g) => g.chips.length).map((g) => (
        <div key={g.platform} className="ap-kwsug__group" role="group" aria-label={`${title} — ${platformName(t, g.platform)}`}>
          <BrandMark t={t} platform={g.platform} />
          <div className="ap-kwsug__chips">
            {g.chips.map((c) => (
              <Chip
                key={c.word}
                className="ap-kwsug__chip"
                active={picker.isOn(c.word, g.platform)}
                onClick={() => picker.toggle(c.word, wordPlatforms(c.word, g.platform))}
                title={c.hint}
              >
                <span lang={TERM_LANG(g.platform)}>{c.word}</span>
                {c.hint ? <span className="ap-kwsug__hint" lang="th">{c.hint}</span> : null}
              </Chip>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Keyword suggestion ----------
export function KeywordSuggestions({ pg, platforms, picker }: { pg: string; platforms: Platform[]; picker: Picker }) {
  const t = useT();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ai, setAi] = useState<KeywordSuggestionsResponse | null>(null);
  const [data, setData] = useState<FrequentTermsResponse | null>(null);
  const order = PLATFORM_LIST.filter((p) => platforms.includes(p));

  useEffect(() => {
    let live = true;
    void send<FrequentTermsResponse>("GET", `/api/groups/${encodeURIComponent(pg)}/keyword-suggestions/frequent`).then((r) => live && r.data && setData(r.data));
    return () => { live = false; };
  }, [pg]);

  async function suggest() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const r = await send<KeywordSuggestionsResponse>("POST", `/api/groups/${encodeURIComponent(pg)}/keyword-suggestions`, { productName: name.trim() });
    setBusy(false);
    if (r.error) return setError(r.error);
    setAi(r.data);
  }

  const aiBy = (p: Platform) => (ai?.suggestions ?? []).filter((s) => s.platform === p);
  // The same word suggested for several platforms ticks all of them in one click.
  const aiPlatforms = (word: string) => [...new Set((ai?.suggestions ?? []).filter((s: KeywordSuggestion) => s.keyword === word).map((s) => s.platform))];

  return (
    <div className="ox-stack">
      <form
        className="ox-stack"
        style={{ gap: "var(--omnix-space-1)" }}
        onSubmit={(e) => {
          e.preventDefault();
          void suggest();
        }}
      >
        {/* help sits under the whole row so the button lines up with the input, not with the help text */}
        <div className="ap-form-row">
          <Field label={t("kwsug.productName")} htmlFor="kw-product">
            <TextInput id="kw-product" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("kwsug.productNamePh")} maxLength={120} name="productName" autoComplete="off" aria-describedby="kw-product-help" />
          </Field>
          <Button type="submit" icon={<AnalyseIcon size={16} />} disabled={busy || !name.trim()} aria-busy={busy}>
            {busy ? t("kwsug.thinking") : t("kwsug.suggest")}
          </Button>
        </div>
        <div className="ox-help" id="kw-product-help">{t("kwsug.productNameHelp")}</div>
      </form>
      <div aria-live="polite" className="ox-stack">
      {error ? <Alert tone="danger">{t.or(error, t("errors.http"))}</Alert> : null}
      {ai && !ai.suggestions.length ? <div className="ox-help">{t("kwsug.none")}</div> : null}
      {ai ? (
        <ChipGroup
          t={t}
          title={t("kwsug.aiTitle")}
          sub={ai.costUsd != null ? t("kwsug.aiCost", { cost: formatMoney(t.locale, ai.costUsd, "USD", 4) }) : t("kwsug.aiSub")}
          groups={order.map((p) => ({ platform: p, chips: aiBy(p).map((s) => ({ word: s.keyword, hint: s.glossTh || undefined })) }))}
          picker={picker}
          wordPlatforms={(w) => aiPlatforms(w)}
        />
      ) : null}
      </div>
      {data ? (
        <>
          <ChipGroup
            t={t}
            title={t("kwsug.frequentTitle")}
            sub={t("kwsug.frequentSub")}
            groups={order.map((p) => ({ platform: p, chips: (data.frequent[p] ?? []).map((f) => ({ word: f.term, hint: t("kwsug.seenIn", { n: formatNumber(t.locale, f.count) }) })) }))}
            picker={picker}
            wordPlatforms={(_, p) => [p]}
          />
          {platforms.includes("xhs") ? (
            <ChipGroup
              t={t}
              title={t("kwsug.relatedTitle")}
              sub={t("kwsug.relatedSub")}
              groups={[{ platform: "xhs", chips: data.related.map((f) => ({ word: f.term })) }]}
              picker={picker}
              wordPlatforms={() => ["xhs"]}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// ---------- Keyword trial ----------
const MAX_TRIALS = 8; // same limit as the api (errors.keyword.trialTooMany)
const POLL_MS = 4000;

export function KeywordTrials({ pg, terms, platforms, disabled }: { pg: string; terms: string[]; platforms: Platform[]; disabled?: boolean }) {
  const t = useT();
  const [info, setInfo] = useState<KeywordTrialsResponse | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "danger" | "warning"; text: string } | null>(null);
  const url = `/api/groups/${encodeURIComponent(pg)}/keyword-trials`;

  const load = useCallback(async () => {
    const r = await send<KeywordTrialsResponse>("GET", url);
    if (r.data) setInfo(r.data);
  }, [url]);
  useEffect(() => { void load(); }, [load]);

  // The newest request's rows share one start time; older previews stay out of the way.
  const batch = info?.trials.length ? info.trials.filter((x) => x.startedAt === info.trials[0].startedAt) : [];
  const running = batch.some((x) => x.status === "running");
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [running, load]);

  const items = terms.flatMap((keyword) => platforms.map((platform) => ({ platform, keyword })));
  const tooMany = items.length > MAX_TRIALS;
  const est = (p: Platform) => info?.estimates[p] ?? null;
  const priced = items.filter((i) => est(i.platform) !== null);
  const noActor = [...new Set(items.filter((i) => est(i.platform) === null).map((i) => i.platform))];
  const total = priced.reduce((s, i) => s + (est(i.platform) ?? 0), 0);

  async function start() {
    setBusy(true);
    setMsg(null);
    const r = await send<KeywordTrialResult>("POST", url, { items, confirm: true });
    setBusy(false);
    setAsking(false);
    if (r.error) return setMsg({ tone: "danger", text: t.or(r.error, t("errors.http")) });
    if (r.data.skipped.length)
      setMsg({
        tone: "warning",
        text: r.data.skipped.map((s) => `${platformName(t, s.platform)} · ${s.keyword}: ${t.or(s.reason, s.reason)}`).join(" / "),
      });
    await load();
  }

  return (
    <div className="ox-stack">
      <div className="ox-row">
        <Button icon={<AnalyseIcon size={16} />} disabled={disabled || busy || running || !items.length || tooMany || !info} onClick={() => setAsking(true)}>
          {t("trial.button")}
        </Button>
        <span className="ox-xs ox-muted">{tooMany ? t("errors.keyword.trialTooMany") : t("trial.hint")}</span>
      </div>
      {asking && info ? (
        <Modal
          title={t("trial.confirmTitle")}
          closeLabel={t("common.close")}
          onClose={() => setAsking(false)}
          foot={
            <>
              <Button variant="ghost" onClick={() => setAsking(false)}>{t("common.cancel")}</Button>
              <Button variant="primary" onClick={() => void start()} disabled={busy || !priced.length} aria-busy={busy}>
                {t("trial.confirmGo", { n: formatNumber(t.locale, priced.length) })}
              </Button>
            </>
          }
        >
          <p>
            {t("trial.confirmBody", {
              k: formatNumber(t.locale, terms.length),
              p: formatNumber(t.locale, platforms.length),
              n: formatNumber(t.locale, items.length),
              cost: formatMoney(t.locale, total, "USD", 2),
            })}
          </p>
          <p className="ox-muted ox-xs">{info.mode === "mock" ? t("trial.mockNote") : t("trial.costNote")}</p>
          {noActor.length ? <Alert tone="warning">{t("trial.noActor", { platforms: noActor.map((p) => platformName(t, p)).join(", ") })}</Alert> : null}
          <p className="ox-xs">{t("trial.notAdded")}</p>
        </Modal>
      ) : null}
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {batch.length ? <TrialResults runs={batch} /> : null}
    </div>
  );
}

/** A listing opens on its platform when it has a URL; without one it is plain text, not a dead link. */
function TrialRow({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  if (!href) return <div className="ap-trial__row">{children}</div>;
  return (
    <a className="ap-trial__row" href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
      {children}
      <LinkExternalIcon size={16} aria-hidden="true" />
    </a>
  );
}

function TrialResults({ runs }: { runs: TrialRun[] }) {
  const t = useT();
  const sorted = [...runs].sort((a, b) => PLATFORM_LIST.indexOf(a.platform) - PLATFORM_LIST.indexOf(b.platform) || a.keyword.localeCompare(b.keyword));
  return (
    <section className="ox-stack" aria-labelledby="trial-results" aria-live="polite">
      <div>
        <h3 id="trial-results" className="ox-label-caps">{t("trial.resultsTitle")}</h3>
        <div className="ox-help">{t("trial.resultsSub")}</div>
      </div>
      <div className="ap-trial-grid">
        {sorted.map((r) => (
          <article key={r.id} className="ap-trial" aria-busy={r.status === "running"}>
            <header className="ap-trial__head">
              <BrandMark t={t} platform={r.platform} />
              <span className="ap-trial__kw" lang={TERM_LANG(r.platform)}>{r.keyword}</span>
              <span className="ox-xs ox-muted ox-num">{r.costUsd != null && r.status !== "running" ? formatMoney(t.locale, r.costUsd, "USD", 4) : ""}</span>
            </header>
            {r.status === "running" ? (
              <ProgressBar pct={null} label={t("trial.running")} />
            ) : r.items?.length ? (
              <ul className="ap-trial__list">
                {r.items.map((it) => (
                  <li key={`${it.rank}-${it.productUrl ?? it.title}`}>
                    <TrialRow href={it.productUrl} label={t("trial.open", { title: it.title ?? "" })}>
                      <span className="ap-lane__thumb"><ProductImage t={t} product={{ imageId: null, imageSourceUrl: it.imageUrl, imageLost: false }} size={20} /></span>
                      <span className="ap-trial__text">
                        <span className="line-clamp-2" lang={TERM_LANG(r.platform)}>{it.title ?? t("product.untitled")}</span>
                        <span className="ap-trial__facts">
                          <span className="ox-num">{it.price == null ? "—" : formatMoney(t.locale, it.price, it.currency ?? "CNY")}</span>
                          <SoldBadge t={t} sold={it.sold} />
                        </span>
                      </span>
                    </TrialRow>
                  </li>
                ))}
              </ul>
            ) : (
              <Alert tone={r.status === "failed" ? "danger" : "warning"}>
                {r.items === null && r.status === "succeeded" ? t("trial.expired") : noteToText(t, r.note) || t("trial.empty")}
              </Alert>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
