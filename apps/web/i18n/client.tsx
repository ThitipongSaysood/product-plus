"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { makeT, type Locale, type T } from "./index";

const Ctx = createContext<Locale>("th");

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useLocale(): Locale {
  return useContext(Ctx);
}

export function useT(): T {
  const locale = useLocale();
  return useMemo(() => makeT(locale), [locale]);
}
