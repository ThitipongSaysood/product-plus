"use client";
// Category suggestion by AI: reads the listings no category caught and proposes whole taxonomy lines.
// Tapping one adds that line to the taxonomy text above; nothing is saved until the taxonomy is saved,
// and saving re-sorts the unclassified listings with the new lines (free — rules only).
import { useState } from "react";
import type { CategorySuggestion, CategorySuggestionsResponse } from "@pp/contracts";
import { formatNumber } from "@/i18n";
import { useT } from "@/i18n/client";
import { send } from "@/lib/client-api";
import { AnalyseIcon } from "../icons";
import { Alert, Button, Chip } from "../ui";

export function CategorySuggest({ pg, onPick }: { pg: string; onPick: (s: CategorySuggestion) => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<CategorySuggestionsResponse | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  async function suggest() {
    setBusy(true);
    setError(null);
    const r = await send<CategorySuggestionsResponse>("POST", `/api/groups/${encodeURIComponent(pg)}/category-suggestions`, {});
    setBusy(false);
    if (r.error || !r.data) return setError(r.error ?? "errors.http");
    setRes(r.data);
    setAdded(new Set());
  }

  return (
    <div className="ox-stack ap-kwsug">
      <div className="ox-help">{t("catsug.help")}</div>
      <div className="ox-row">
        <Button type="button" icon={<AnalyseIcon size={16} />} disabled={busy} aria-busy={busy} onClick={() => void suggest()}>
          {busy ? t("catsug.thinking") : t("catsug.suggest")}
        </Button>
      </div>

      <div aria-live="polite" className="ox-stack">
        {error ? <Alert tone="danger">{t.or(error, t("errors.http"))}</Alert> : null}
        {res && !res.unclassified ? <div className="ox-help">{t("catsug.allSorted")}</div> : null}
        {res && res.unclassified > 0 && !res.suggestions.length ? <div className="ox-help">{t("catsug.none", { n: formatNumber(t.locale, res.unclassified) })}</div> : null}
      </div>

      {res && res.suggestions.length ? (
        <div className="ox-stack">
          <div className="ox-help">
            {t("catsug.read", { n: formatNumber(t.locale, res.unclassified) })}
          </div>
          <div className="ap-kwsug__chips" role="group" aria-label={t("catsug.aiTitle")}>
            {res.suggestions.map((s) => (
              <Chip
                key={s.key}
                className="ap-kwsug__chip"
                active={added.has(s.key)}
                onClick={() => {
                  onPick(s);
                  setAdded((cur) => new Set(cur).add(s.key));
                }}
              >
                <span className="ap-kwsug__line">
                  <span>
                    {s[t.locale]} · <span className="ox-num">{t("catsug.matches", { n: formatNumber(t.locale, s.matches) })}</span>
                  </span>
                  <span className="ap-kwsug__hint" translate="no">{s.keywords.join(", ")}</span>
                  <span className="ap-kwsug__hint line-clamp-2" translate="no">{s.examples[0]}</span>
                </span>
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
