'use client';

import { cn } from '@/lib/utils';

const SPECIALISTS: Record<string, { ar: string; en: string; color: string; initial: string }> = {
  manager: { ar: 'الراعي', en: "Al-Ra'i", color: 'bg-emerald-500/15 text-emerald-400', initial: 'ر' },
  architect: { ar: 'المصمم', en: 'Al-Musammim', color: 'bg-indigo-500/15 text-indigo-400', initial: 'م' },
  research: { ar: 'عبدان', en: 'Abdan', color: 'bg-amber-500/15 text-amber-400', initial: 'ع' },
  'reading-helper': { ar: 'شواشة', en: 'Shwasha', color: 'bg-pink-500/15 text-pink-400', initial: 'ش' },
  'writing-critic': { ar: 'الصفرا', en: 'Al-Safra', color: 'bg-yellow-500/15 text-yellow-400', initial: 'ص' },
  comparator: { ar: 'رمّانة', en: 'Rammana', color: 'bg-rose-500/15 text-rose-400', initial: 'ر' },
  'content-creator': { ar: 'الدبسا', en: 'Al-Dabsa', color: 'bg-orange-500/15 text-orange-400', initial: 'د' },
  creative: { ar: 'الكرييتف', en: 'The Creative', color: 'bg-fuchsia-500/15 text-fuchsia-400', initial: 'ك' },
  'tasks-agent': { ar: 'مهام', en: 'Maham', color: 'bg-cyan-500/15 text-cyan-400', initial: 'م' },
  analyst: { ar: 'المحلل', en: 'Al-Muhalil', color: 'bg-sky-500/15 text-sky-400', initial: 'ح' },
  organizer: { ar: 'المنظّم', en: 'Al-Munazzim', color: 'bg-teal-500/15 text-teal-400', initial: 'ن' },
  diagnostician: { ar: 'المشخّص', en: 'Al-Mushakhis', color: 'bg-violet-500/15 text-violet-400', initial: 'خ' },
};

const FALLBACK = { ar: 'وكيل', en: 'Agent', color: 'bg-surface-secondary text-on-surface-secondary', initial: '؟' };

export function specialistInfo(id: string) {
  return SPECIALISTS[id] || FALLBACK;
}

export function SpecialistAvatar({
  specialistId,
  size = 'md',
}: {
  specialistId: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const info = specialistInfo(specialistId);
  const dim = size === 'sm' ? 'w-6 h-6 text-xs' : size === 'lg' ? 'w-12 h-12 text-lg' : 'w-8 h-8 text-sm';
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold shrink-0',
        dim,
        info.color,
      )}
      title={`${info.ar} / ${info.en}`}
    >
      {info.initial}
    </div>
  );
}

export function specialistLabel(specialistId: string, isRTL: boolean) {
  const info = specialistInfo(specialistId);
  return isRTL ? info.ar : info.en;
}

export function specialistBilingual(specialistId: string) {
  const info = specialistInfo(specialistId);
  return `${info.ar} / ${info.en}`;
}
