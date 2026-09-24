"use client";
// Keyword suggestion by AI (CONTEXT.md). The merchant types a product name; tapping a proposed word adds
// it as a line to the keyword list above. Nothing is saved here — the list is saved as a whole.
import { useState } from "react";
import type { KeywordSuggestionsResponse, Platform } from "@pp/contracts";
import { formatMoney } from "@/i18n";
import { useT } from "@/i18n/client";
import { send } from "@/lib/client-api";
import { PLATFORM_LIST } from "@/lib/platform";
import { BrandMark, platformName } from "../bits";
import { AnalyseIcon } from "../icons";
import { Alert, Button, Chip, Field, TextInput } from "../ui";

export function KeywordSuggest({ pg, platforms, onPick }: { pg: string; platforms: Platform[]; onPick: (word: string, platform: Platform) => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<KeywordSuggestionsResponse | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  async function suggest() {
    setBusy(true);
    setError(null);
    const r = await send<KeywordSuggestionsResponse>("POST", `/api/groups/${encodeURIComponent(pg)}/keyword-suggestions`, { productName: name.trim() });
    setBusy(false);
    if (r.error || !r.data) return setError(r.error ?? "errors.http");
    setRes(r.data);
    setAdded(new Set());
  }

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
            {busy ? t("kwsug.thinking") : t("kwsug.suggest")}
          </Button>
        </div>
        <div className="ox-help" id="kw-product-help">{t("kwsug.productNameHelp")}</div>
      </form>

      <div aria-live="polite" className="ox-stack">
        {error ? <Alert tone="danger">{t.or(error, t("errors.http"))}</Alert> : null}
        {res && !res.suggestions.length ? <div className="ox-help">{t("kwsug.none")}</div> : null}
      </div>

      {res && res.suggestions.length ? (
        <div className="ox-stack">
          <div className="ox-help">{res.costUsd != null ? t("kwsug.aiCost", { cost: formatMoney(t.locale, res.costUsd, "USD") }) : t("kwsug.aiSub")}</div>
          {PLATFORM_LIST.filter((p) => platforms.includes(p) && by(p).length).map((p) => (
            <div key={p} className="ap-kwsug__group" role="group" aria-label={`${t("kwsug.aiTitle")} — ${platformName(t, p)}`}>
              <BrandMark t={t} platform={p} />
              <div className="ap-kwsug__chips">
                {by(p).map((s) => {
                  const k = `${p}|${s.keyword}`;
                  return (
                    <Chip
                      key={k}
                      className="ap-kwsug__chip"
                      active={added.has(k)}
                      onClick={() => {
                        onPick(s.keyword, p);
                        setAdded((cur) => new Set(cur).add(k));
                      }}
                    >
                      <span lang={p === "temu" ? "en" : "zh-CN"} translate="no">{s.keyword}</span>
                      {s.glossTh ? <span className="ap-kwsug__hint" lang="th">{s.glossTh}</span> : null}
                    </Chip>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
