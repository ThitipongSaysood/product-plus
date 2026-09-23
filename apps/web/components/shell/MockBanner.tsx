"use client";
import { useT } from "@/i18n/client";
import { Alert } from "../ui";
import { useShellData } from "./ShellData";

/** Shown on every page of a group whose data is mock — never on the real group. */
export function MockBanner() {
  const t = useT();
  const d = useShellData();
  if (d?.sourceMode !== "mock") return null;
  return <Alert tone="warning" title={t("mock.title")}>{t("mock.body")}</Alert>;
}
