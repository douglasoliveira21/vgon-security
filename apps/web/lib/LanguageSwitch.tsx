'use client';

import { Locale, useI18n } from '@/lib/i18n';

const OPTIONS: Array<{ value: Locale; label: string; title: string }> = [
  { value: 'pt-BR', label: 'PT', title: 'Português (Brasil)' },
  { value: 'en', label: 'EN', title: 'English' },
];

export function LanguageSwitch({ dark = false }: { dark?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t('lang.label')}
      className={`inline-flex rounded-lg p-0.5 text-xs font-semibold ${dark ? 'bg-white/10' : 'bg-slate-100'}`}
    >
      {OPTIONS.map((o) => {
        const active = locale === o.value;
        return (
          <button
            key={o.value}
            type="button"
            title={o.title}
            aria-pressed={active}
            onClick={() => setLocale(o.value)}
            className={`rounded-md px-2.5 py-1 transition-colors ${
              active
                ? dark
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'bg-white text-brand shadow-sm'
                : dark
                  ? 'text-slate-300 hover:text-white'
                  : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
