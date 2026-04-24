'use client';

import { useEffect, useState } from 'react';
import { Flame, TrendingUp, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface HabitStats {
  habitId: string;
  totalInstances: number;
  completedDays: number;
  expectedDays: number;
  completionRate: number;
  currentStreak: number;
  longestStreak: number;
  history: Array<{ date: string; done: boolean; expected: boolean }>;
}

export function HabitStatsRing({ habitId, compact }: { habitId: string; compact?: boolean }) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [stats, setStats] = useState<HabitStats | null>(null);

  useEffect(() => {
    apiFetch<HabitStats>(`/api/tasks/habits/${habitId}/stats`)
      .then(setStats)
      .catch(() => setStats(null));
  }, [habitId]);

  if (!stats) return null;

  // SVG ring showing completion rate. Animated stroke on first mount.
  const size = compact ? 44 : 64;
  const strokeWidth = compact ? 4 : 6;
  const radius = size / 2 - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, stats.completionRate));
  const dash = circumference * pct;

  return (
    <div className="flex items-center gap-3" aria-label={isRTL ? `إحصائيات العادة: ${Math.round(pct * 100)}%` : `Habit stats: ${Math.round(pct * 100)}%`}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="var(--color-border)"
            strokeWidth={strokeWidth}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="var(--color-accent)"
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            className="transition-[stroke-dasharray] duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn('font-semibold text-on-surface', compact ? 'text-[10px]' : 'text-sm')}>
            <bdi>{Math.round(pct * 100)}%</bdi>
          </span>
        </div>
      </div>

      {!compact && (
        <div className="flex flex-col gap-1 text-xs">
          <span className="inline-flex items-center gap-1.5 text-on-surface">
            <Flame size={12} className="text-warning" />
            <bdi className="font-mono">{stats.currentStreak}</bdi>
            <span className="text-on-surface-tertiary">
              {isRTL ? 'يوم متتالي' : 'day streak'}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-on-surface-secondary">
            <Target size={12} className="text-success" />
            <bdi className="font-mono">{stats.completedDays}/{stats.expectedDays}</bdi>
            <span className="text-on-surface-tertiary">
              {isRTL ? 'آخر 30 يوم' : 'last 30 days'}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-on-surface-secondary">
            <TrendingUp size={12} className="text-info" />
            <bdi className="font-mono">{stats.longestStreak}</bdi>
            <span className="text-on-surface-tertiary">
              {isRTL ? 'أطول سلسلة' : 'longest streak'}
            </span>
          </span>
        </div>
      )}

      {/* 30-day dots grid */}
      {!compact && (
        <div className="grid grid-cols-10 gap-0.5" role="img" aria-label={isRTL ? 'آخر 30 يوم' : 'Last 30 days'}>
          {stats.history.map((h, i) => (
            <div
              key={h.date}
              title={`${h.date} — ${h.done ? (isRTL ? 'أُنجز' : 'done') : h.expected ? (isRTL ? 'فائت' : 'missed') : (isRTL ? 'لا يُتوقع' : 'not expected')}`}
              className={cn(
                'w-2 h-2 rounded-sm transition-colors duration-500',
                !h.expected
                  ? 'bg-surface-tertiary'
                  : h.done
                    ? 'bg-success'
                    : 'bg-error/30',
              )}
              style={{ animationDelay: `${i * 15}ms` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
