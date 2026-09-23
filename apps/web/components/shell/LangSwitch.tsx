"use client";
import { useRouter } from "next/navigation";
import { LANG_COOKIE, LOCALES, type Locale } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import { GlobeIcon } from "../icons";

const NAMES: Record<Locale, string> = { th: "ไทย", en: "English", zh: "中文" };

export function LangSwitch() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  return (
    <label className="ox-row ap-lang" style={{ gap: 4 }}>
      <GlobeIcon size={16} className="ox-muted" />
      <span className="sr-only">{t("lang.label")}</span>
      <select
        className="ox-control"
        style={{ width: "auto", height: 32, paddingRight: 28 }}
        aria-label={t("lang.label")}
        value={locale}
        onChange={(e) => {
          document.cookie = `${LANG_COOKIE}=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
          router.refresh();
        }}
      >
        {LOCALES.map((l) => <option key={l} value={l}>{NAMES[l]}</option>)}
      </select>
    </label>
  );
}
