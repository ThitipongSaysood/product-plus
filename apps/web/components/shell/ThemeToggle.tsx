"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { THEME_COOKIE } from "@/i18n";
import { useT } from "@/i18n/client";
import { MoonIcon, SunIcon } from "../icons";

export function ThemeToggle({ initial }: { initial: "light" | "dark" | "system" }) {
  const t = useT();
  const router = useRouter();
  // Resolve "system" only after mount so SSR and first client render match.
  const [dark, setDark] = useState<boolean | null>(initial === "system" ? null : initial === "dark");
  useEffect(() => {
    if (dark === null) setDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, [dark]);

  function toggle() {
    const next = dark ? "light" : "dark";
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    const el = document.documentElement;
    el.classList.toggle("dark", next === "dark");
    el.classList.toggle("light", next === "light");
    el.dataset.theme = next;
    setDark(next === "dark");
    router.refresh();
  }

  const label = dark ? t("theme.toLight") : t("theme.toDark");
  return (
    <button type="button" className="ox-btn ox-btn--ghost ox-btn--icon" aria-label={label} title={label} onClick={toggle}>
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
