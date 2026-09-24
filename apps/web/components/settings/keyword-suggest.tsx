"use client";
// Keyword suggestion by AI (CONTEXT.md). The merchant types a product name, picks from the proposed
// words, and only the picked word × platform pairs are saved — each word is proposed for specific
// platforms in their own language, so it is never crossed with every ticked platform like the box below.
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Keyword, KeywordSuggestionsResponse, Platform } from "@pp/contracts";
import { formatMoney, formatNumber } from "@/i18n";
import { useT } from "@/i18n/client";
import { send } from "@/lib/client-api";
import { PLATFORM_LIST } from "@/lib/platform";
import { BrandMark, platformName } from "../bits";
import { AnalyseIcon, PlusIcon } from "../icons";
import { Alert, Button, Chip, Field, TextInput } from "../ui";

const pairKey = (platform: Platform, keyword: string) => `${platform}|${keyword}`;

export function KeywordSuggest({ pg, platforms }: { pg: string; platforms: Platform[] }) {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<KeywordSuggestionsResponse | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<{ added: number; skipped: number } | null>(null);

  async function suggest() {
    setBusy(true);
    setError(null);
    setDone(null);
    const r = await send<KeywordSuggestionsResponse>("POST", `/api/groups/${encodeURIComponent(pg)}/keyword-suggestions`, { productName: name.trim() });
    setBusy(false);
    if (r.error || !r.data) return setError(r.error ?? "errors.http");
    setRes(r.data);
    setPicked(new Set());
  }

  async function addPicked() {
    const pairs = (res?.suggestions ?? []).filter((s) => picked.has(pairKey(s.platform, s.keyword)));
    setBusy(true);
    setError(null);
    let added = 0;
    let skipped = 0;
    for (const s of pairs) {
      const r = await send<Keyword>("POST", `/api/groups/${encodeURIComponent(pg)}/keywords`, {
        platform: s.platform,
        keyword: s.keyword,
        region: s.platform === "temu" ? "us" : null,
        enabled: true,
      });
      if (!r.error) added++;
      else if (r.error === "errors.keyword.duplicate") skipped++;
      else {
        setBusy(false);
        return setError(r.error);
      }
    }
    setBusy(false);
    setDone({ added, skipped });
    // Added words leave the list: they are keywords now, not suggestions.
    setRes((cur) => (cur ? { ...cur, suggestions: cur.suggestions.filter((s) => !picked.has(pairKey(s.platform, s.keyword))) } : cur));
    setPicked(new Set());
    router.refresh();
  }

  const toggle = (k: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const order = PLATFORM_LIST.filter((p) => platforms.includes(p));
  const by = (p: Platform) => (res?.suggestions ?? []).filter((s) => s.platform === p);

  return (
    <div className="ox-stack ap-kwsug">
      <form
        className="ox-stack"
        style={{ gap: "var(--omnix-space-1)" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void suggest();
        }}
      >
        <div className="ap-form-row">
          <Field label={t("kwsug.productName")} htmlFor="kw-product">
            <TextInput id="kw-product" name="productName" autoComplete="off" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("kwsug.productNamePh")} aria-describedby="kw-product-help" />
          </Field>
          <Button type="submit" icon={<AnalyseIcon size={16} />} disabled={busy || !name.trim()} aria-busy={busy}>
            {busy && !res ? t("kwsug.thinking") : t("kwsug.suggest")}
          </Button>
        </div>
        <div className="ox-help" id="kw-product-help">{t("kwsug.productNameHelp")}</div>
      </form>

      <div aria-live="polite" className="ox-stack">
        {error ? <Alert tone="danger">{t.or(error, t("errors.http"))}</Alert> : null}
        {done ? (
          <Alert tone={done.skipped ? "warning" : "success"}>
            {done.skipped
              ? t("keywords.addedNSkipped", { added: formatNumber(t.locale, done.added), skipped: formatNumber(t.locale, done.skipped) })
              : t("keywords.addedN", { added: formatNumber(t.locale, done.added) })}
          </Alert>
        ) : null}
        {res && !res.suggestions.length && !done ? <div className="ox-help">{t("kwsug.none")}</div> : null}
      </div>

      {res && res.suggestions.length ? (
        <div className="ox-stack">
          <div>
            <div className="ox-label">{t("kwsug.aiTitle")}</div>
            <div className="ox-help">{res.costUsd != null ? t("kwsug.aiCost", { cost: formatMoney(t.locale, res.costUsd, "USD") }) : t("kwsug.aiSub")}</div>
          </div>
          {order.filter((p) => by(p).length).map((p) => (
            <div key={p} className="ap-kwsug__group" role="group" aria-label={`${t("kwsug.aiTitle")} — ${platformName(t, p)}`}>
              <BrandMark t={t} platform={p} />
              <div className="ap-kwsug__chips">
                {by(p).map((s) => {
                  const k = pairKey(p, s.keyword);
                  return (
                    <Chip key={k} className="ap-kwsug__chip" active={picked.has(k)} onClick={() => toggle(k)}>
                      <span lang={p === "temu" ? "en" : "zh-CN"} translate="no">{s.keyword}</span>
                      {s.glossTh ? <span className="ap-kwsug__hint" lang="th">{s.glossTh}</span> : null}
                    </Chip>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="ox-row">
            <Button variant="primary" icon={<PlusIcon size={16} />} disabled={busy || picked.size === 0} aria-busy={busy} onClick={() => void addPicked()}>
              {t("kwsug.addPicked", { n: formatNumber(t.locale, picked.size) })}
            </Button>
            <span className="ox-xs ox-muted">{t("keywords.costNote")}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
