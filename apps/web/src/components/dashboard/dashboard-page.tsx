'use client';

import { useAppStore } from '@/store/app';
import { ActiveAgentsWidget } from './widgets/active-agents';
import { RecentConversationsWidget } from './widgets/recent-conversations';
import { ApiUsageWidget } from './widgets/api-usage';
import { SystemStatusWidget } from './widgets/system-status';
import { EmployeeOfMonthWidget } from './widgets/employee-of-month';
import { FeatureShowcaseWidget } from './widgets/feature-showcase';
import { ClippyHelp } from '@/components/help/clippy-help';

const DASH_HELP = [
  { illustration: '🎛️', title: { ar: 'لوحة التحكم', en: 'Dashboard' }, body: { ar: 'نظرة شاملة على النظام: الوكلاء، المحادثات، الاستخدام، وأفضل موظف.', en: 'System overview: agents, conversations, usage, and top employees.' } },
  { illustration: '🏆', title: { ar: 'وكيل الشهر/اليوم', en: 'Employee of Month/Day' }, body: { ar: 'الوكيل الأعلى تقييماً من تقييماتك (👍) + المهام المنجزة + تشغيلات ناجحة.', en: 'Highest-rated agent — based on your 👍 + completed tasks + successful runs.' } },
  { illustration: '🧭', title: { ar: 'اكتشف الميزات', en: 'Explore features' }, body: { ar: 'بطاقات الأسفل تأخذك لكل صفحة جديدة: حلقات، رسم معرفي، مستندات، حارس...', en: 'The cards below take you to every new page: runs, memory graph, artifacts, watcher...' } },
];

export function DashboardPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <div className="mb-6 md:mb-8 flex items-start gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-on-surface mb-1">
            {isRTL ? 'لوحة التحكم' : 'Dashboard'}
          </h1>
          <p className="text-sm text-on-surface-secondary">
            {isRTL ? 'نظرة عامة على النظام' : 'System overview'}
          </p>
        </div>
        <ClippyHelp steps={DASH_HELP} title={{ ar: 'لوحة التحكم', en: 'Dashboard' }} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <EmployeeOfMonthWidget />
        <ActiveAgentsWidget />
        <FeatureShowcaseWidget />
        <RecentConversationsWidget />
        <ApiUsageWidget />
        <SystemStatusWidget />
      </div>
    </div>
  );
}
