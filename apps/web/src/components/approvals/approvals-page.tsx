'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  Bot,
  Trash2,
  PenLine,
  Plus,
  Brain,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface ApprovalRecord {
  id: string;
  type: 'create_agent' | 'update_agent' | 'delete_agent' | 'update_memory' | 'delete_file' | 'other';
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  title: { en: string; ar: string };
  description: string;
  payload: Record<string, unknown>;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  rejectReason?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  create_agent: Plus,
  update_agent: PenLine,
  delete_agent: Trash2,
  update_memory: Brain,
  delete_file: Trash2,
  other: Bot,
};

const TYPE_COLORS: Record<string, string> = {
  create_agent: 'text-green-500 bg-green-500/10',
  update_agent: 'text-blue-500 bg-blue-500/10',
  delete_agent: 'text-red-500 bg-red-500/10',
  update_memory: 'text-purple-500 bg-purple-500/10',
  delete_file: 'text-red-500 bg-red-500/10',
  other: 'text-gray-500 bg-gray-500/10',
};

const AGENT_NAMES: Record<string, { en: string; ar: string }> = {
  architect: { en: 'Al-Ra\'i', ar: 'الراعي' },
  manager: { en: "Al-Ra'i", ar: 'الراعي' },
  research: { en: 'Al-Bahith', ar: 'عبدان' },
  'reading-helper': { en: 'Al-Mulakhkhis', ar: 'شواشة' },
  'writing-critic': { en: 'Al-Naqid', ar: 'الصفرا' },
  comparator: { en: 'Al-Muqarin', ar: 'رمّانة' },
};

export function ApprovalsPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<ApprovalRecord[]>('/api/approvals');
      setApprovals(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApprovals();
  }, [loadApprovals]);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      await apiFetch(`/api/approvals/${id}/approve`, { method: 'POST' });
      loadApprovals();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    try {
      await apiFetch(`/api/approvals/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      loadApprovals();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = approvals.filter((a) => a.status === activeTab);
  const pendingCount = approvals.filter((a) => a.status === 'pending').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-on-surface-tertiary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Bell size={24} className="text-on-surface-secondary" />
        <h1 className="text-xl font-semibold text-on-surface">
          {isRTL ? 'الموافقات' : 'Approvals'}
        </h1>
        {pendingCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold">
            {pendingCount}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {(['pending', 'approved', 'rejected'] as const).map((tab) => {
          const count = approvals.filter((a) => a.status === tab).length;
          const labels = {
            pending: { en: 'Pending', ar: 'قيد الانتظار' },
            approved: { en: 'Approved', ar: 'موافق عليها' },
            rejected: { en: 'Rejected', ar: 'مرفوضة' },
          };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px',
                activeTab === tab
                  ? 'border-accent text-accent'
                  : 'border-transparent text-on-surface-secondary hover:text-on-surface'
              )}
            >
              {labels[tab][language]}
              {count > 0 && (
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full',
                  tab === 'pending' && count > 0
                    ? 'bg-red-500 text-white'
                    : 'bg-surface-tertiary text-on-surface-tertiary'
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Bell size={32} className="mx-auto text-on-surface-tertiary mb-3 opacity-50" />
          <p className="text-sm text-on-surface-secondary">
            {activeTab === 'pending'
              ? (isRTL ? 'لا توجد موافقات معلقة' : 'No pending approvals')
              : activeTab === 'approved'
                ? (isRTL ? 'لا توجد موافقات سابقة' : 'No approved items')
                : (isRTL ? 'لا توجد مرفوضات' : 'No rejected items')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((approval) => {
            const TypeIcon = TYPE_ICONS[approval.type] || Bot;
            const colorClasses = TYPE_COLORS[approval.type] || TYPE_COLORS.other;
            const isExpanded = expandedId === approval.id;
            const agentName = AGENT_NAMES[approval.requestedBy]?.[language] || approval.requestedBy;

            return (
              <div
                key={approval.id}
                className="border border-border rounded-[var(--radius-lg)] bg-surface overflow-hidden"
              >
                <div className="flex items-start gap-3 p-4">
                  <div className={cn('p-2 rounded-[var(--radius)]', colorClasses)}>
                    <TypeIcon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-on-surface">
                      {approval.title[language]}
                    </p>
                    <p className="text-xs text-on-surface-tertiary mt-1 line-clamp-2">
                      {approval.description}
                    </p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                        {agentName}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-on-surface-tertiary">
                        <Clock size={10} />
                        {new Date(approval.createdAt).toLocaleString()}
                      </span>
                      {approval.resolvedAt && (
                        <span className="text-[10px] text-on-surface-tertiary">
                          {isRTL ? 'تم بتاريخ' : 'Resolved'}: {new Date(approval.resolvedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {approval.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(approval.id)}
                          disabled={actionLoading === approval.id}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-[var(--radius)] bg-green-600 text-white text-xs hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === approval.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}
                          {isRTL ? 'موافق' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleReject(approval.id)}
                          disabled={actionLoading === approval.id}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-[var(--radius)] bg-red-600 text-white text-xs hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          <X size={12} />
                          {isRTL ? 'رفض' : 'Reject'}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : approval.id)}
                      className="p-1.5 rounded-[var(--radius)] text-on-surface-tertiary hover:bg-surface-secondary transition-colors"
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border pt-3">
                    <p className="text-xs text-on-surface-tertiary mb-2 uppercase tracking-wider">
                      {isRTL ? 'تفاصيل الإجراء' : 'Action Details'}
                    </p>
                    <pre className="text-xs text-on-surface font-mono bg-surface-secondary rounded-[var(--radius)] p-3 overflow-auto max-h-64 whitespace-pre-wrap">
                      {JSON.stringify(approval.payload, null, 2)}
                    </pre>
                    {approval.rejectReason && (
                      <div className="mt-2 p-2 rounded-[var(--radius)] bg-red-500/10 text-red-600 dark:text-red-400 text-xs">
                        {isRTL ? 'سبب الرفض: ' : 'Reason: '}{approval.rejectReason}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
