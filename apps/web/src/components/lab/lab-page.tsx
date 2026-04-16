'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FlaskConical,
  Video,
  Palette,
  Network,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  Bot,
  Film,
  Music,
  Image as ImageIcon,
  Paintbrush,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { LibraryGrid, type LibraryItem } from '@/components/library/library-grid';

interface CreativeAgent {
  id: string;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  avatar: string;
  href: string;
}

const CREATIVE_AGENTS: CreativeAgent[] = [
  {
    id: 'creative',
    nameAr: 'الكرييتف',
    nameEn: 'The Creative',
    descAr: 'إخراج فيديوهات وإعلانات قصيرة',
    descEn: 'Video production and short ads',
    avatar: '🎬',
    href: '/chat?agent=creative',
  },
  {
    id: 'content-creator',
    nameAr: 'الدبسا',
    nameEn: 'Al-Dabsa',
    descAr: 'كاروسيل، ريلز، مواضيع سوشال',
    descEn: 'Carousels, reels, social threads',
    avatar: '✍️',
    href: '/chat?agent=content-creator',
  },
];

interface LabTool {
  id: string;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  href: string;
  accent: string;
}

const TOOLS: LabTool[] = [
  {
    id: 'studio',
    nameAr: 'الاستديو',
    nameEn: 'Studio',
    descAr: 'إنشاء فيديوهات بالكود والتصيير',
    descEn: 'Code-based video creation and rendering',
    icon: Video,
    href: '/studio',
    accent: 'from-purple-500/20 to-pink-500/20',
  },
  {
    id: 'content',
    nameAr: 'المحتوى',
    nameEn: 'Content',
    descAr: 'كاروسيل، سكربتات ريلز، ثريدز',
    descEn: 'Carousels, reel scripts, threads',
    icon: Palette,
    href: '/content',
    accent: 'from-blue-500/20 to-cyan-500/20',
  },
  {
    id: 'graph',
    nameAr: 'خريطة المعرفة',
    nameEn: 'Knowledge Graph',
    descAr: 'تصور العلاقات والمفاهيم',
    descEn: 'Visualise concepts and links',
    icon: Network,
    href: '/graph',
    accent: 'from-emerald-500/20 to-teal-500/20',
  },
  {
    id: 'papers',
    nameAr: 'الأوراق البحثية',
    nameEn: 'Papers',
    descAr: 'قراءة وتحليل الأوراق العلمية',
    descEn: 'Research paper reading and analysis',
    icon: BookOpen,
    href: '/papers',
    accent: 'from-amber-500/20 to-orange-500/20',
  },
];

type FilterType = 'all' | 'demo' | 'video' | 'image' | 'design' | 'audio';

const FILTER_CHIPS: { id: FilterType; labelAr: string; labelEn: string }[] = [
  { id: 'all', labelAr: 'الكل', labelEn: 'All' },
  { id: 'demo', labelAr: 'عروض توضيحية', labelEn: 'Demos' },
  { id: 'video', labelAr: 'فيديو', labelEn: 'Video' },
  { id: 'image', labelAr: 'صور', labelEn: 'Images' },
  { id: 'design', labelAr: 'تصاميم', labelEn: 'Designs' },
  { id: 'audio', labelAr: 'صوت', labelEn: 'Audio' },
];

export function LabPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const router = useRouter();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    let qs = '';
    if (filter === 'demo') qs = '?source=demo';
    else if (filter !== 'all') qs = `?type=${filter}`;
    setLoading(true);
    apiFetch<LibraryItem[]>(`/api/library${qs}`)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [filter]);

  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-[var(--radius-lg)] bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-on-accent">
          <FlaskConical size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-on-surface">
            {isRTL ? 'المعمل' : 'The Lab'}
          </h1>
          <p className="text-sm text-on-surface-tertiary">
            {isRTL
              ? 'مساحة العمل الإبداعية الموحدة: وكلاء، أدوات، ومكتبة'
              : 'Unified creative workspace: agents, tools, and library'}
          </p>
        </div>
      </div>

      {/* Section 1: Specialized Agents */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
            <Bot size={16} className="text-accent" />
            {isRTL ? 'وكلاء متخصصون' : 'Specialized Agents'}
          </h2>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
          {CREATIVE_AGENTS.map((a) => (
            <div
              key={a.id}
              className="shrink-0 w-64 rounded-[var(--radius-lg)] border border-border bg-surface p-4 snap-start hover:border-accent/40 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-surface-secondary flex items-center justify-center text-xl">
                  {a.avatar}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-on-surface truncate">
                    {isRTL ? a.nameAr : a.nameEn}
                  </div>
                  <div className="text-xs text-on-surface-tertiary">
                    {isRTL ? a.nameEn : a.nameAr}
                  </div>
                </div>
              </div>
              <p className="text-xs text-on-surface-secondary mb-3 line-clamp-2">
                {isRTL ? a.descAr : a.descEn}
              </p>
              <button
                onClick={() => router.push(a.href)}
                className="w-full px-3 py-1.5 rounded-[var(--radius)] bg-accent text-on-accent text-sm hover:bg-accent-hover transition-colors flex items-center justify-center gap-1.5"
              >
                {isRTL ? 'فتح' : 'Open'}
                <Arrow size={14} />
              </button>
            </div>
          ))}
          {/* Future agents placeholder */}
          <div className="shrink-0 w-64 rounded-[var(--radius-lg)] border border-dashed border-border bg-surface/50 p-4 flex flex-col items-center justify-center text-on-surface-tertiary text-xs">
            <Bot size={24} className="mb-2 opacity-40" />
            {isRTL ? 'وكلاء إبداعيون قادمون' : 'More creative agents soon'}
          </div>
        </div>
      </section>

      {/* Section 2: Tools */}
      <section>
        <h2 className="text-base font-semibold text-on-surface mb-3 flex items-center gap-2">
          <Paintbrush size={16} className="text-accent" />
          {isRTL ? 'الأدوات' : 'Tools'}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => router.push(t.href)}
                className="group text-start rounded-[var(--radius-lg)] border border-border bg-surface p-4 hover:border-accent/40 hover:shadow-md transition-all relative overflow-hidden"
              >
                <div className={cn('absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity', t.accent)} />
                <div className="relative">
                  <div className="w-10 h-10 rounded-[var(--radius)] bg-surface-secondary flex items-center justify-center mb-3">
                    <Icon size={18} className="text-accent" />
                  </div>
                  <div className="font-semibold text-on-surface mb-1">
                    {isRTL ? t.nameAr : t.nameEn}
                  </div>
                  <p className="text-xs text-on-surface-tertiary line-clamp-2 mb-3">
                    {isRTL ? t.descAr : t.descEn}
                  </p>
                  <div className="text-xs text-accent flex items-center gap-1 font-medium">
                    {isRTL ? 'دخول' : 'Enter'}
                    <Arrow size={12} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Section 3: Library Preview */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
            <Film size={16} className="text-accent" />
            {isRTL ? 'المكتبة' : 'Library'}
          </h2>
          <button
            onClick={() => router.push('/library')}
            className="text-xs text-accent hover:underline flex items-center gap-1"
          >
            {isRTL ? 'عرض الكل' : 'Show all'}
            <Arrow size={12} />
          </button>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {FILTER_CHIPS.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className={cn(
                'shrink-0 px-3 py-1 rounded-full text-xs border transition-colors',
                filter === c.id
                  ? 'bg-accent text-on-accent border-accent'
                  : 'bg-surface text-on-surface-secondary border-border hover:border-accent/40'
              )}
            >
              {isRTL ? c.labelAr : c.labelEn}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-12 text-center text-on-surface-tertiary text-sm">
            {isRTL ? 'جاري التحميل…' : 'Loading…'}
          </div>
        ) : (
          <LibraryGrid items={items} limit={8} language={language} />
        )}
      </section>
    </div>
  );
}
