'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

interface TimeData {
  primary: { tz: string; formatted: string; formattedAr: string };
  secondary: { tz: string; formatted: string; formattedAr: string } | null;
}

export function SidebarClock({ compact, language }: { compact: boolean; language: string }) {
  const [time, setTime] = useState<TimeData | null>(null);
  const isRTL = language === 'ar';

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      apiFetch<TimeData>('/api/time').then((t) => { if (!cancelled) setTime(t); }).catch(() => {});
    };
    load();
    const iv = setInterval(load, 30_000); // refresh every 30s (authoritative server time)
    const tick = setInterval(() => {
      // Between server polls, just add 1s locally to avoid 30s stale feel
      setTime((cur) => {
        if (!cur) return cur;
        const nowStr = new Intl.DateTimeFormat(isRTL ? 'ar' : 'en-US', {
          timeZone: cur.primary.tz, hour12: true,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: 'numeric', minute: '2-digit', second: '2-digit', weekday: 'long',
        }).format(new Date());
        const nowStrAr = new Intl.DateTimeFormat('ar', {
          timeZone: cur.primary.tz, hour12: true,
          year: 'numeric', month: 'long', day: 'numeric',
          weekday: 'long', hour: 'numeric', minute: '2-digit',
        }).format(new Date());
        const secStr = cur.secondary ? new Intl.DateTimeFormat('en-US', {
          timeZone: cur.secondary.tz, hour12: true,
          hour: 'numeric', minute: '2-digit', weekday: 'short',
        }).format(new Date()) : null;
        return {
          ...cur,
          primary: { ...cur.primary, formatted: nowStr, formattedAr: nowStrAr },
          secondary: cur.secondary && secStr ? { ...cur.secondary, formatted: secStr, formattedAr: secStr } : null,
        };
      });
    }, 1000);
    return () => { cancelled = true; clearInterval(iv); clearInterval(tick); };
  }, [isRTL]);

  if (!time) return null;

  // Matches "2:45 PM" / "02:45 PM" / "2:45" — captures hour:minute with optional AM/PM
  const HM_12H = /\d{1,2}:\d{2}(?:\s?(?:AM|PM|am|pm|ص|م))?/;

  // Compact mode: just the hour:minute
  if (compact) {
    const hm = time.primary.formatted.match(HM_12H)?.[0] || '';
    return (
      <div className="flex items-center justify-center py-1" title={time.primary.formatted}>
        <Clock size={14} className="text-on-sidebar-muted" />
        <span className="text-[9px] font-mono text-on-sidebar-muted ms-0.5">{hm}</span>
      </div>
    );
  }

  // Extract date + time parts for cleaner display
  const primaryDate = time.primary.formattedAr.split('،').slice(0, 2).join('،') || time.primary.formatted.split(',')[0];
  const primaryHM = time.primary.formatted.match(HM_12H)?.[0] || '';
  const secondaryHM = time.secondary?.formatted.match(HM_12H)?.[0] || '';
  const secondaryCity = time.secondary?.tz.split('/').pop()?.replace(/_/g, ' ') || '';
  const primaryCity = time.primary.tz.split('/').pop()?.replace(/_/g, ' ') || '';

  return (
    <div className="px-3 py-2 mb-1 rounded-[var(--radius)] bg-sidebar-hover/50 text-on-sidebar" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-2 mb-0.5">
        <Clock size={12} className="text-on-sidebar-muted" />
        <span className="text-[10px] text-on-sidebar-muted uppercase tracking-wide">{primaryCity}</span>
        <span className="ms-auto font-mono text-xs font-bold">{primaryHM}</span>
      </div>
      <div className="text-[10px] text-on-sidebar-muted line-clamp-1">{primaryDate}</div>
      {time.secondary && secondaryHM && (
        <div className={cn('flex items-center gap-2 mt-1 pt-1 border-t border-border/30')}>
          <span className="text-[9px] text-on-sidebar-muted uppercase">{secondaryCity}</span>
          <span className="ms-auto font-mono text-[10px] text-on-sidebar-muted">{secondaryHM}</span>
        </div>
      )}
    </div>
  );
}
