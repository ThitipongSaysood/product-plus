"use client";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { RefreshIcon } from "./icons";

export function ReloadButton() {
  const t = useT();
  const router = useRouter();
  return (
    <button type="button" className="ox-btn ox-btn--secondary ox-btn--sm" onClick={() => router.refresh()}>
      <RefreshIcon size={16} />
      {t("common.reload")}
    </button>
  );
}
