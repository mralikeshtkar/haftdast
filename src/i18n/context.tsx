"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  type Dictionary,
  type Locale,
  dirFor,
  fmt,
  getDictionary,
  num,
} from "./dictionaries";

interface I18n {
  locale: Locale;
  dir: "rtl" | "ltr";
  t: Dictionary;
  /** Format a template string with {placeholders}. */
  f: (template: string, vars: Record<string, string | number>) => string;
  /** Localise digits. */
  n: (value: number | string) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value: I18n = {
    locale,
    dir: dirFor(locale),
    t: getDictionary(locale),
    f: fmt,
    n: (v) => num(v, locale),
  };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
