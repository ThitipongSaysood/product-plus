"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Platform, TriggerResult } from "@pp/contracts";
import { formatMoney } from "@/i18n";
import { useT } from "@/i18n/client";
import { send } from "@/lib/client-api";
import { CheckIcon, TestTubeIcon } from "./icons";
import { Button, ConfirmSubmit } from "./ui";

export function ActorActions({ platform, actorId, estSmoke, mock, chosen, excluded }: {
  platform: Platform; actorId: string; estSmoke: number; mock: boolean; chosen: boolean; excluded: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function smoke(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await send<TriggerResult>("POST", "/api/actors/smoke", { platform, actorId, confirm: true });
    setBusy(false);
    if (r.error) return setMsg({ ok: false, text: t.or(r.error, t("errors.http")) });
    if (r.data.skipped.length && !r.data.started.length) {
      return setMsg({ ok: false, text: r.data.skipped.map((s) => t.or(s.reason, s.reason)).join(" · ") });
    }
    setMsg({ ok: true, text: t("actors.smokeStarted") });
    router.refresh();
  }

  async function choose() {
    setBusy(true);
    const r = await send<{ ok: boolean }>("PUT", "/api/actors/choose", { platform, actorId });
    setBusy(false);
    if (r.error) return setMsg({ ok: false, text: t.or(r.error, t("errors.http")) });
    setMsg({ ok: true, text: t("actors.chosenSaved") });
    router.refresh();
  }

  const cost = formatMoney(t.locale, estSmoke, "USD", 4);
  return (
    <div className="ox-stack" style={{ gap: 6, minWidth: 180 }}>
      <form onSubmit={smoke}>
        <ConfirmSubmit
          variant="secondary"
          size="sm"
          icon={<TestTubeIcon size={16} />}
          message={t("actors.smokeConfirm", { actor: actorId, cost })}
          disabled={busy || mock}
          aria-describedby={mock ? `mock-${actorId}` : undefined}
        >
          {t("actors.smoke", { cost })}
        </ConfirmSubmit>
      </form>
      {mock ? <span id={`mock-${actorId}`} className="ox-xs ox-muted">{t("actors.smokeMockDisabled")}</span> : null}
      {chosen ? null : (
        <Button size="sm" variant="ghost" icon={<CheckIcon size={16} />} onClick={choose} disabled={busy} title={excluded ? t("actors.chooseExcludedHint") : undefined}>
          {t("actors.choose")}
        </Button>
      )}
      {msg ? <span role="status" className="ox-xs" style={{ color: msg.ok ? "var(--omnix-success-fg)" : "var(--omnix-danger-fg)" }}>{msg.text}</span> : null}
    </div>
  );
}
