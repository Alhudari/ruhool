'use client';

import Link from 'next/link';
import { Network, PlayCircle, FileText, BarChart2, Zap, Eye, Sparkles, Image as ImageIcon } from 'lucide-react';
import { useAppStore } from '@/store/app';

const FEATURES = [
  { href: '/runs', icon: PlayCircle, color: 'blue', title: { ar: 'حلقات الوكلاء', en: 'Agent Runs' }, desc: { ar: 'شغّل هدفاً معقداً — الوكلاء يتناوبون حتى الإنجاز', en: 'Run complex goals — agents chain until done' } },
  { href: '/memory', icon: Network, color: 'violet', title: { ar: 'الرسم المعرفي', en: 'Memory Graph' }, desc: { ar: 'كيانات وعلاقات يستخرجها النظام تلقائياً', en: 'Entities and relations auto-extracted' } },
  { href: '/artifacts', icon: FileText, color: 'emerald', title: { ar: 'المستندات', en: 'Artifacts' }, desc: { ar: 'مستندات قابلة للتحرير المشترك', en: 'Co-edited with agents' } },
  { href: '/watcher', icon: Eye, color: 'rose', title: { ar: 'الحارس', en: 'Watcher' }, desc: { ar: 'تنبيهات استباقية كل 10 دقائق', en: 'Proactive alerts every 10 min' } },
  { href: '/evaluator', icon: BarChart2, color: 'teal', title: { ar: 'المُقيّم', en: 'Evaluator' }, desc: { ar: 'جودة الوكلاء عبر التقييمات', en: 'Agent quality via ratings' } },
  { href: '/triggers', icon: Zap, color: 'amber', title: { ar: 'المحفّزات', en: 'Triggers' }, desc: { ar: 'أحداث خارجية تشغّل وكيلاً', en: 'External events fire agents' } },
  { href: '/library', icon: ImageIcon, color: 'sky', title: { ar: 'المكتبة الموحدة', en: 'Unified Library' }, desc: { ar: 'فيديو + صور + مستندات', en: 'Videos + images + docs' } },
  { href: '/analyst', icon: Sparkles, color: 'pink', title: { ar: 'المحلل', en: 'Analyst' }, desc: { ar: 'اشتراكات + كشوف بنكية', en: 'Subs + bank statements' } },
];

const COLORS: Record<string, string> = {
  blue: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  violet: 'bg-violet-500/10 text-violet-500 border-violet-500/30',
  emerald: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  rose: 'bg-rose-500/10 text-rose-500 border-rose-500/30',
  teal: 'bg-teal-500/10 text-teal-500 border-teal-500/30',
  amber: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  sky: 'bg-sky-500/10 text-sky-500 border-sky-500/30',
  pink: 'bg-pink-500/10 text-pink-500 border-pink-500/30',
};

export function FeatureShowcaseWidget() {
  const { language } = useAppStore();
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 md:col-span-2">
      <h3 className="text-sm font-semibold text-on-surface mb-3">
        {language === 'ar' ? 'المميزات الحديثة' : 'New capabilities'}
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <Link key={f.href} href={f.href} className={`rounded-[var(--radius)] p-3 border transition-colors hover:opacity-80 ${COLORS[f.color]}`}>
              <Icon size={16} className="mb-1" />
              <div className="text-xs font-semibold">{f.title[language]}</div>
              <div className="text-[10px] opacity-80 line-clamp-2">{f.desc[language]}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
