'use client';

import { AppShell } from '@/components/layout/app-shell';
import { AuditLogTable } from '@/components/audit/AuditLogTable';
import { useAppStore } from '@/store/app';
import { ScrollText } from 'lucide-react';

export default function AuditPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-6 py-8" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="flex items-center gap-3 mb-6">
          <ScrollText size={22} className="text-on-surface-secondary" />
          <div>
            <h1 className="text-xl font-semibold text-on-surface">
              {isRTL ? 'سجلّ التدقيق' : 'Audit Log'}
            </h1>
            <p className="text-xs text-on-surface-tertiary mt-0.5">
              {isRTL
                ? 'سجل كامل للأحداث الحساسة في المنصة — إضافة أو حذف الملاحظات، مزامنة زوتيرو، الإرسال بين الوكلاء.'
                : 'Complete record of material events — note changes, Zotero sync, agent dispatches.'}
            </p>
          </div>
        </div>
        <AuditLogTable />
      </div>
    </AppShell>
  );
}
