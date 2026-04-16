import { useCallback } from 'react';
import { useAppStore } from '@/store/app';
import en from './en.json';
import ar from './ar.json';

const translations: Record<string, Record<string, string>> = { en, ar };

/**
 * Translation hook for the Ruhool platform.
 * Returns a `t(key)` function that resolves strings based on current language.
 *
 * Usage:
 *   const { t, lang, isRTL } = useT();
 *   <h1>{t('nav.home')}</h1>
 */
export function useT() {
  const language = useAppStore((s) => s.language);
  const isRTL = language === 'ar';

  const t = useCallback(
    (key: string, fallback?: string): string => {
      const dict = translations[language] || translations.en;
      return dict[key] ?? translations.en[key] ?? fallback ?? key;
    },
    [language]
  );

  return { t, lang: language, isRTL };
}
