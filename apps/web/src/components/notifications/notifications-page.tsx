'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, Trash2, CheckCheck, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import type { NotificationRecord } from './notification-bell';

const AGENT_NAMES: Record<string, { en: string; ar: string }> = {
  manager: { en: "Al-Ra'i", ar: 'الراعي' },
  research: { en: 'Al-Bahith', ar: 'الباحث' },
  'reading-helper': { en: 'Al-Mulakhkhis', ar: 'المُلخِّص' },
  'writing-critic': { en: 'Al-Naqid', ar: 'الناقد' },
  comparator: { en: 'Al-Muqarin', ar: 'المُقارِن' },
  architect: { en: "Al-Musammim", ar: "المصمم" },
  'content-creator': { en: 'Al-Sarid', ar: 'السارد' },
  creative: { en: "Al-Mubdi'", ar: 'المبدع' },
  'tasks-agent': { en: 'Maham', ar: 'مهام' },
};

const TYPE_STYLES: Record<string, string> = {
  info: 'bg-blue-500/10 text-blue-500',
  success: 'bg-green-500/10 text-green-500',
  warning: 'bg-amber-500/10 text-amber-500',
  error: 'bg-red-500/10 text-red-500',
  reminder: 'bg-purple-500/10 text-purple-500',
};

type Filter = 'all' | 'unread' | string; // or agent:{id} or type:{type}

function timeAgo(iso: string, isRTL: boolean): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return isRTL ? 'الآن' : 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return isRTL ? `قبل ${m} دقيقة` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return isRTL ? `قبل ${h} ساعة` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return isRTL ? `قبل ${d} يوم` : `${d}d ago`;
}

export function NotificationsPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const router = useRouter();
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<NotificationRecord[]>('/api/notifications?limit=500');
      setItems(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const agents = useMemo(() => {
    const s = new Set<string>();
    items.forEach(i => s.add(i.agentId));
    return Array.from(s);
  }, [items]);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'unread') return items.filter(i => !i.read);
    if (filter.startsWith('agent:')) return items.filter(i => i.agentId === filter.slice(6));
    if (filter.startsWith('type:')) return items.filter(i => i.type === filter.slice(5));
    return items;
  }, [items, filter]);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    await Promise.all(Array.from(selected).map(id => apiFetch(`/api/notifications/${id}`, { method: 'DELETE' }).catch(() => null)));
    setSelected(new Set());
    fetchAll();
  }

  async function bulkMarkRead() {
    if (selected.size === 0) return;
    await Promise.all(Array.from(selected).map(id => apiFetch(`/api/notifications/${id}/read`, { method: 'PUT' }).catch(() => null)));
    setSelected(new Set());
    fetchAll();
  }

  async function markAllRead() {
    await apiFetch('/api/notifications/read-all', { method: 'PUT' });
    fetchAll();
  }

  async function clearAll() {
    if (!confirm(isRTL ? 'حذف جميع التنبيهات؟' : 'Delete all notifications?')) return;
    await apiFetch('/api/notifications', { method: 'DELETE' });
    fetchAll();
  }

  async function handleClickItem(n: NotificationRecord) {
    if (!n.read) {
      await apiFetch(`/api/notifications/${n.id}/read`, { method: 'PUT' }).catch(() => null);
    }
    if (n.link) router.push(n.link);
    else fetchAll();
  }

  const TYPES = ['info', 'success', 'warning', 'error', 'reminder'];

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Bell size={22} className="text-on-surface-secondary" />
        <h1 className="text-xl font-semibold text-on-surface">
          {isRTL ? 'التنبيهات' : 'Notifications'}
        </h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { id: 'all', label: isRTL ? 'الكل' : 'All' },
          { id: 'unread', label: isRTL ? 'غير مقروء' : 'Unread' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'px-3 py-1.5 text-xs rounded-full border transition-colors',
              filter === f.id ? 'bg-accent text-on-accent border-accent' : 'border-border text-on-surface-secondary hover:bg-surface-secondary'
            )}
          >
            {f.label}
          </button>
        ))}
        {agents.map((a) => (
          <button
            key={a}
            onClick={() => setFilter(`agent:${a}`)}
            className={cn(
              'px-3 py-1.5 text-xs rounded-full border transition-colors',
              filter === `agent:${a}` ? 'bg-accent text-on-accent border-accent' : 'border-border text-on-surface-secondary hover:bg-surface-secondary'
            )}
          >
            {AGENT_NAMES[a]?.[language] || a}
          </button>
        ))}
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(`type:${t}`)}
            className={cn(
              'px-3 py-1.5 text-xs rounded-full border transition-colors',
              filter === `type:${t}` ? 'bg-accent text-on-accent border-accent' : 'border-border text-on-surface-secondary hover:bg-surface-secondary'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Bulk actions */}
      <div className="flex items-center gap-2 mb-4 text-xs">
        {selected.size > 0 ? (
          <>
            <span className="text-on-surface-secondary">
              {isRTL ? `محدد: ${selected.size}` : `${selected.size} selected`}
            </span>
            <button onClick={bulkMarkRead} className="px-3 py-1.5 rounded-[var(--radius)] bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary flex items-center gap-1.5">
              <Check size={12} /> {isRTL ? 'قراءة' : 'Mark read'}
            </button>
            <button onClick={bulkDelete} className="px-3 py-1.5 rounded-[var(--radius)] bg-red-500/10 text-red-500 hover:bg-red-500/20 flex items-center gap-1.5">
              <Trash2 size={12} /> {isRTL ? 'حذف' : 'Delete'}
            </button>
            <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 rounded-[var(--radius)] text-on-surface-tertiary hover:bg-surface-secondary">
              {isRTL ? 'إلغاء' : 'Cancel'}
            </button>
          </>
        ) : (
          <>
            <button onClick={markAllRead} className="px-3 py-1.5 rounded-[var(--radius)] bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary flex items-center gap-1.5">
              <CheckCheck size={12} /> {isRTL ? 'قراءة الكل' : 'Mark all read'}
            </button>
            <button onClick={clearAll} className="px-3 py-1.5 rounded-[var(--radius)] bg-red-500/10 text-red-500 hover:bg-red-500/20 flex items-center gap-1.5">
              <Trash2 size={12} /> {isRTL ? 'مسح الكل' : 'Clear all'}
            </button>
          </>
        )}
      </div>

      {/* List */}
      <div className="border border-border rounded-[var(--radius-lg)] overflow-hidden">
        {loading && <div className="p-8 text-center text-sm text-on-surface-tertiary">{isRTL ? 'جارٍ التحميل...' : 'Loading...'}</div>}
        {!loading && filtered.length === 0 && (
          <div className="p-12 text-center text-sm text-on-surface-tertiary">
            {isRTL ? 'لا توجد تنبيهات' : 'No notifications'}
          </div>
        )}
        {!loading && filtered.map((n) => {
          const agentName = AGENT_NAMES[n.agentId]?.[language] || n.agentId;
          return (
            <div
              key={n.id}
              className={cn(
                'flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface-secondary transition-colors',
                !n.read && 'bg-accent/5'
              )}
            >
              <input
                type="checkbox"
                checked={selected.has(n.id)}
                onChange={() => toggleSelect(n.id)}
                className="mt-1.5"
              />
              <button onClick={() => handleClickItem(n)} className="flex-1 text-start">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', TYPE_STYLES[n.type] || TYPE_STYLES.info)}>
                    {agentName}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-secondary text-on-surface-tertiary">
                    {n.type}
                  </span>
                  {n.priority === 'high' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 font-medium">
                      {isRTL ? 'عاجل' : 'urgent'}
                    </span>
                  )}
                  <span className="text-[10px] text-on-surface-tertiary mr-auto">
                    {timeAgo(n.createdAt, isRTL)}
                  </span>
                </div>
                <p className="text-sm font-medium text-on-surface">{n.title}</p>
                <p className="text-xs text-on-surface-secondary mt-0.5">{n.message}</p>
                {n.link && (
                  <div className="flex items-center gap-1 mt-1.5 text-[11px] text-accent">
                    <ExternalLink size={10} />
                    <span>{n.linkLabel || n.link}</span>
                  </div>
                )}
              </button>
              {!n.read && <span className="shrink-0 w-2 h-2 rounded-full bg-accent mt-2" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
