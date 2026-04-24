'use client';

import { BookOpen, ClipboardList, PenTool, Video, Search, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Template {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: { ar: string; en: string };
  message: { ar: string; en: string };
  agentId: string;
  color: string;
}

const TEMPLATES: Template[] = [
  {
    id: 'supervision-meeting',
    icon: ClipboardList,
    label: { ar: 'اجتماع إشراف', en: 'Supervision Meeting' },
    message: {
      ar: '@المُدوّن جهّز توثيق اجتماع إشراف جديد — تاريخ اليوم، الحضور: عبدالله + د. ريتشارد. ما النقاط المقترحة للأجندة؟',
      en: '@mudawwin Prepare a supervision meeting writeup for today. Attendees: Abdullah + Dr. Richard. What agenda points do you suggest?',
    },
    agentId: 'mudawwin',
    color: 'amber',
  },
  {
    id: 'paper-summary',
    icon: BookOpen,
    label: { ar: 'تلخيص ورقة', en: 'Summarize Paper' },
    message: {
      ar: '@المُلخِّص لخّص الورقة المرفقة بالتركيز على: المنهجية، النتائج الرئيسية، الفجوات البحثية، وارتباطها ببحثي في BIM.',
      en: '@reading-helper Summarize the attached paper focusing on: methodology, key findings, research gaps, and its relevance to my BIM research.',
    },
    agentId: 'reading-helper',
    color: 'blue',
  },
  {
    id: 'draft-review',
    icon: PenTool,
    label: { ar: 'مراجعة مسودة', en: 'Review Draft' },
    message: {
      ar: '@الناقد راجع هذه الفقرات الأكاديمية: هل الحجة متماسكة؟ هل المصطلحات دقيقة؟ اقترح تحسينات محددة.',
      en: "@naqid Review these academic paragraphs: Is the argument coherent? Are the terms precise? Suggest specific improvements.",
    },
    agentId: 'writing-critic',
    color: 'green',
  },
  {
    id: 'bim-research',
    icon: Search,
    label: { ar: 'بحث BIM', en: 'BIM Research' },
    message: {
      ar: '@الباحث ابحث عن أحدث الدراسات في تبنّي BIM في قطاع البناء الكويتي أو الخليجي — ركّز على العوائق والعوامل المحفّزة.',
      en: '@research Find the latest studies on BIM adoption in the Kuwaiti or GCC construction sector — focus on barriers and enabling factors.',
    },
    agentId: 'research',
    color: 'purple',
  },
  {
    id: 'content-reel',
    icon: Video,
    label: { ar: 'محتوى تعليمي', en: 'Educational Content' },
    message: {
      ar: '@السارد اصنع نص ريل تعليمي بالعربية عن موضوع BIM — 60 ثانية، أسلوب شبابي وسهل، مع خطوات عملية.',
      en: '@content-creator Create an Arabic educational reel script about BIM — 60 seconds, engaging and accessible, with practical steps.',
    },
    agentId: 'content-creator',
    color: 'pink',
  },
  {
    id: 'team-dispatch',
    icon: Users,
    label: { ar: 'فريق البحث', en: 'Research Team' },
    message: {
      ar: 'ابحث عن التحديات الرئيسية في تبنّي BIM بالكويت، ثم لخّص الأوراق ذات الصلة، ثم راجع ما كتبته عنها.',
      en: "Research the main challenges of BIM adoption in Kuwait, then summarize the relevant papers, then review what I've written about them.",
    },
    agentId: 'manager',
    color: 'amber',
  },
];

const COLOR_CLASSES: Record<string, string> = {
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20',
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20',
  green: 'bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20',
  pink: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 hover:bg-pink-500/20',
};

interface QuickStartProps {
  language: 'ar' | 'en';
  onSelect: (message: string, agentId: string) => void;
}

export function QuickStart({ language, onSelect }: QuickStartProps) {
  const isRTL = language === 'ar';
  return (
    <div className={cn('w-full', isRTL && 'rtl')}>
      <p className="text-xs text-muted-foreground mb-2 px-1">
        {language === 'ar' ? 'ابدأ من هنا' : 'Quick start'}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {TEMPLATES.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.message[language], t.agentId)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors text-left',
                COLOR_CLASSES[t.color] ?? COLOR_CLASSES.amber,
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate font-medium">{t.label[language]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
