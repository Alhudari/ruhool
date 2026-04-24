'use client';

import { useState, useEffect } from 'react';
import { Languages, Sun, Moon, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { GlobalSearch } from './global-search';
import { WorkspaceSwitcher } from './workspace-switcher';
import { NotificationBell } from '@/components/notifications/notification-bell';

// Vintage analog-style digital clock — monospace + accent dot blinker
function VintageClock({ language }: { language: 'en' | 'ar' }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  // 12-hour format with AM/PM
  let h12 = now.getHours() % 12;
  if (h12 === 0) h12 = 12;
  const hh = String(h12).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const ampm = now.getHours() >= 12 ? (language === 'ar' ? 'م' : 'PM') : (language === 'ar' ? 'ص' : 'AM');
  const date = now.toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'short' });
  return (
    <div
      className="flex items-center gap-2 px-3 h-8 rounded-lg border border-border bg-surface text-on-surface"
      style={{
        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
        background: 'linear-gradient(180deg, var(--color-surface-secondary), var(--color-surface))',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)',
      }}
    >
      {/* Time block — always LTR, fixed-width digits via tabular-nums */}
      <span
        dir="ltr"
        className="font-semibold tracking-wider tabular-nums"
        style={{ fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}
      >
        <span className="text-[11px]">{hh}</span>
        <span className="text-accent animate-pulse text-[11px]">:</span>
        <span className="text-[11px]">{mm}</span>
        <span className="text-on-surface-tertiary text-[9px]">:{ss}</span>
        <span className="ms-1 text-[9px] text-on-surface-tertiary uppercase">{ampm}</span>
      </span>
      <span className="text-[10px] text-on-surface-tertiary border-s border-border ps-2 whitespace-nowrap">
        {now.toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-GB', { weekday: 'short' })} · {date}
      </span>
    </div>
  );
}

const THEMES = [
  { id: 'claude-clean',  label: { en: 'Theme 1', ar: 'سمة 1' } },
  { id: 'desert-caravan', label: { en: 'Theme 2', ar: 'سمة 2' } },
  { id: 'academic',      label: { en: 'Theme 3', ar: 'سمة 3' } },
];

export function TopToolbar() {
  const { language, setLanguage, theme, setTheme, themeVariant, setThemeVariant } = useAppStore();
  const isRTL = language === 'ar';
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  const toggleLang = () => {
    const next = language === 'en' ? 'ar' : 'en';
    setLanguage(next);
    try { localStorage.setItem('ruhool-language', next); } catch {}
  };

  return (
    <div className={cn(
      'hidden md:flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface-secondary shrink-0',
      isRTL ? 'justify-start flex-row-reverse' : 'justify-end'
    )}>
      <WorkspaceSwitcher />
      <VintageClock language={language} />
      <GlobalSearch />

      {/* Language */}
      <button
        onClick={toggleLang}
        title={language === 'en' ? 'العربية' : 'English'}
        className="flex items-center gap-1 h-8 px-2 rounded-lg bg-surface border border-border hover:border-border-hover text-on-surface-secondary hover:text-on-surface text-xs"
      >
        <Languages className="h-3.5 w-3.5" />
        <span className="font-mono">{language === 'en' ? 'EN' : 'ع'}</span>
      </button>

      {/* Light/Dark */}
      <div className="flex items-center gap-0 h-8 rounded-lg bg-surface border border-border overflow-hidden">
        <button
          onClick={() => setThemeVariant('light')}
          title="Light"
          className={cn('h-full px-2 flex items-center transition-colors',
            themeVariant === 'light' ? 'bg-accent text-on-accent' : 'text-on-surface-tertiary hover:bg-surface-tertiary')}
        ><Sun className="h-3.5 w-3.5" /></button>
        <button
          onClick={() => setThemeVariant('dark')}
          title="Dark"
          className={cn('h-full px-2 flex items-center transition-colors',
            themeVariant === 'dark' ? 'bg-accent text-on-accent' : 'text-on-surface-tertiary hover:bg-surface-tertiary')}
        ><Moon className="h-3.5 w-3.5" /></button>
      </div>

      {/* Theme picker */}
      <div className="relative">
        <button
          onClick={() => setShowThemeMenu((v) => !v)}
          title={isRTL ? 'تبديل السمة' : 'Switch theme'}
          className="flex items-center gap-1 h-8 px-2 rounded-lg bg-surface border border-border hover:border-border-hover text-on-surface-secondary hover:text-on-surface text-xs"
        >
          <Palette className="h-3.5 w-3.5" />
          <span>{THEMES.find((t) => t.id === theme)?.label[language] ?? 'Theme'}</span>
        </button>
        {showThemeMenu && (
          <div className={cn(
            'absolute top-full mt-1 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[140px] z-50',
            isRTL ? 'left-0' : 'right-0'
          )}>
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => { setTheme(t.id); setShowThemeMenu(false); }}
                className={cn(
                  'w-full px-3 py-1.5 text-xs text-start hover:bg-surface-secondary',
                  theme === t.id ? 'text-accent font-semibold' : 'text-on-surface-secondary'
                )}
              >
                {t.label[language]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-border mx-1" />
      <NotificationBell />
    </div>
  );
}
