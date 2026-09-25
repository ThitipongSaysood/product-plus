"use client";
// Keyword suggestion by AI (CONTEXT.md). The merchant types a product name; each suggestion is a whole
// line (keyword | Chinese term | English term) and tapping it adds that line to the keyword list above. Nothing is saved here — the list is saved as a whole.
import { useState } from "react";
import type { KeywordSuggestion, KeywordSuggestionsResponse } from "@pp/contracts";
import { useT } from "@/i18n/client";
import { send } from "@/lib/client-api";
import { AnalyseIcon } from "../icons";
import { Alert, Button, Chip, Field, TextInput } from "../ui";

export function KeywordSuggest({ pg, onPick }: { pg: string; onPick: (s: KeywordSuggestion) => void }) {
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
          <div className="ox-help">{t("kwsug.aiSub")}</div>
          <div className="ap-kwsug__chips" role="group" aria-label={t("kwsug.aiTitle")}>
            {res.suggestions.map((s) => (
              <Chip
                key={s.keyword}
                className="ap-kwsug__chip"
                active={added.has(s.keyword)}
                onClick={() => {
                  onPick(s);
                  setAdded((cur) => new Set(cur).add(s.keyword));
                }}
              >
                <span className="ap-kwsug__line">
                  <span>{s.keyword}</span>
                  <span className="ap-kwsug__hint" translate="no">{[s.zh, s.en].filter(Boolean).join(" · ")}</span>
                  {s.glossTh ? <span className="ap-kwsug__hint">{s.glossTh}</span> : null}
                </span>
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
