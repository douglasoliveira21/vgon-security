'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { en, TranslationKey } from './locales/en';
import { pt } from './locales/pt';

export type Locale = 'pt-BR' | 'en';

const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = { 'pt-BR': pt, en };
const STORAGE_KEY = 'vgon_locale';

type Vars = Record<string, string | number>;

export interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey, vars?: Vars) => string;
  /** Like t(), but returns `fallback` instead of the key when the key doesn't exist (dynamic keys such as event types). */
  tOr: (key: string, fallback: string, vars?: Vars) => string;
  formatDateTime: (iso: string) => string;
  formatTime: (iso: string) => string;
  relativeTime: (iso: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function interpolate(template: string, vars?: Vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`));
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Portuguese first: this product is used mostly in Brazil. A stored choice always wins;
  // otherwise a browser that isn't Portuguese gets English.
  const [locale, setLocaleState] = useState<Locale>('pt-BR');

  useEffect(() => {
    let initial: Locale = 'pt-BR';
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'pt-BR' || stored === 'en') initial = stored;
      else if (!navigator.language.toLowerCase().startsWith('pt')) initial = 'en';
    } catch {
      /* storage unavailable — keep the default */
    }
    setLocaleState(initial);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* non-fatal */
    }
  }, []);

  const value = useMemo<I18nValue>(() => {
    const dict = DICTIONARIES[locale];
    const t = (key: TranslationKey, vars?: Vars) => interpolate(dict[key] ?? en[key] ?? key, vars);
    const tOr = (key: string, fallback: string, vars?: Vars) =>
      key in dict ? interpolate(dict[key as TranslationKey], vars) : fallback;
    return {
      locale,
      setLocale,
      t,
      tOr,
      formatDateTime: (iso) => new Date(iso).toLocaleString(locale),
      formatTime: (iso) => new Date(iso).toLocaleTimeString(locale),
      relativeTime: (iso) => {
        const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
        if (diff < 5) return t('common.rel.now');
        if (diff < 60) return t('common.rel.s', { n: diff });
        if (diff < 3600) return t('common.rel.min', { n: Math.floor(diff / 60) });
        if (diff < 86400) return t('common.rel.h', { n: Math.floor(diff / 3600) });
        return t('common.rel.d', { n: Math.floor(diff / 86400) });
      },
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
