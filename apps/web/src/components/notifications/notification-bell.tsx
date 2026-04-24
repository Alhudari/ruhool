'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, CheckCheck, Trash2, ExternalLink, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

export interface NotificationRecord {
  id: string;
  agentId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'reminder';
  link?: string;
  linkLabel?: string;
  read: boolean;
  priority: 'low' | 'normal' | 'high';
  createdAt: string;
  readAt?: string;
}

const AGENT_NAMES: Record<string, { en: string; ar: string }> = {
  manager: { en: "Al-Ra'i", ar: 'الراعي' },
  research: { en: 'Al-Bahith', ar: 'الباحث' },
  'reading-helper': { en: 'Al-Mulakhkhis', ar: 'المُلخِّص' },
  'writing-critic': { en: 'Al-Naqid', ar: 'الناقد' },
  comparator: { en: 'Al-Muqarin', ar: 'المُقارِن' },
  architect: { en: "Al-Al-Musammim", ar: "المصمم" },
  'content-creator': { en: 'Al-Sarid', ar: 'السارد' },
  creative: { en: 'Creative', ar: 'الكرييتف' },
  'tasks-agent': { en: 'Maham', ar: 'مهام' },
};

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

const TYPE_STYLES: Record<string, string> = {
  info: 'bg-blue-500/10 text-blue-500',
  success: 'bg-green-500/10 text-green-500',
  warning: 'bg-amber-500/10 text-amber-500',
  error: 'bg-red-500/10 text-red-500',
  reminder: 'bg-purple-500/10 text-purple-500',
};

export function NotificationBell() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [pulse, setPulse] = useState(false);
  const prevCountRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchCount = useCallback(async () => {
    try {
      const r = await apiFetch<{ count: number }>('/api/notifications/unread-count');
      setCount((prev) => {
        if (r.count > prev) {
          setPulse(true);
          try {
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              new Notification(isRTL ? 'تنبيه جديد' : 'New notification', { body: isRTL ? 'لديك تنبيه جديد من الرحول' : 'You have a new notification' });
            }
          } catch { /* ignore */ }
          setTimeout(() => setPulse(false), 2000);
        }
        prevCountRef.current = r.count;
        return r.count;
      });
    } catch { /* ignore */ }
  }, [isRTL]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<NotificationRecord[]>('/api/notifications?limit=25');
      setItems(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const i = setInterval(fetchCount, 30_000);
    return () => clearInterval(i);
  }, [fetchCount]);

  useEffect(() => {
    if (open) fetchItems();
  }, [open, fetchItems]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  async function markRead(id: string) {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PUT' });
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      fetchCount();
    } catch { /* ignore */ }
  }

  async function deleteOne(id: string) {
    try {
      await apiFetch(`/api/notifications/${id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((n) => n.id !== id));
      fetchCount();
    } catch { /* ignore */ }
  }

  async function markAllRead() {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'PUT' });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setCount(0);
    } catch { /* ignore */ }
  }

  async function clearAll() {
    if (!window.confirm(isRTL ? 'حذف جميع التنبيهات؟' : 'Delete all notifications?')) return;
    try {
      await apiFetch('/api/notifications', { method: 'DELETE' });
      setItems([]);
      setCount(0);
    } catch { /* ignore */ }
  }

  async function handleClickItem(n: NotificationRecord) {
    if (!n.read) await markRead(n.id);
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => {
          const wasClosed = !open;
          setOpen((o) => !o);
          // Auto mark all as read when opening — red badge disappears
          if (wasClosed && count > 0) {
            apiFetch('/api/notifications/read-all', { method: 'PUT' }).catch(() => {});
            setCount(0);
          }
        }}
        className={cn(
          'relative p-2 rounded-[var(--radius)] text-on-surface-secondary hover:bg-surface-secondary transition-colors',
          pulse && 'animate-bounce'
        )}
        aria-label="notifications"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            'absolute top-full mt-2 w-[360px] max-h-[480px] flex flex-col bg-surface border border-border rounded-[var(--radius-lg)] shadow-xl z-50',
            isRTL ? 'left-0' : 'right-0'
          )}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-sm font-semibold text-on-surface">
              {isRTL ? 'التنبيهات' : 'Notifications'}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={markAllRead}
                className="text-xs px-2 py-1 rounded-[var(--radius-sm)] text-on-surface-secondary hover:bg-surface-secondary"
                title={isRTL ? 'قراءة الكل' : 'Mark all read'}
              >
                <CheckCheck size={14} />
              </button>
              <button
                onClick={clearAll}
                className="text-xs px-2 py-1 rounded-[var(--radius-sm)] text-on-surface-secondary hover:bg-red-500/10 hover:text-red-500"
                title={isRTL ? 'حذف الكل' : 'Clear all'}
              >
                <Trash2 size={14} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-[var(--radius-sm)] text-on-surface-tertiary hover:bg-surface-secondary"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {loading && (
              <div className="p-6 text-center text-sm text-on-surface-tertiary">
                {isRTL ? 'جارٍ التحميل...' : 'Loading...'}
              </div>
            )}
            {!loading && items.length === 0 && (
              <div className="p-8 text-center text-sm text-on-surface-tertiary">
                {isRTL ? 'لا توجد تنبيهات' : 'No notifications'}
              </div>
            )}
            {!loading && items.map((n) => {
              const agentName = AGENT_NAMES[n.agentId]?.[language] || n.agentId;
              return (
                <div
                  key={n.id}
                  className={cn(
                    'group px-3 py-2.5 border-b border-border last:border-b-0 cursor-pointer hover:bg-surface-secondary transition-colors',
                    !n.read && 'bg-accent/5'
                  )}
                  onClick={() => handleClickItem(n)}
                >
                  <div className="flex items-start gap-2">
                    <span className={cn('shrink-0 w-2 h-2 rounded-full mt-1.5', !n.read ? 'bg-accent' : 'bg-transparent')} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', TYPE_STYLES[n.type] || TYPE_STYLES.info)}>
                          {agentName}
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
                      <p className="text-sm font-medium text-on-surface truncate">{n.title}</p>
                      <p className="text-xs text-on-surface-secondary line-clamp-2 mt-0.5">{n.message}</p>
                      {n.link && (
                        <div className="flex items-center gap-1 mt-1.5 text-[11px] text-accent">
                          <ExternalLink size={10} />
                          <span>{n.linkLabel || n.link}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!n.read && (
                        <button
                          onClick={(e) => { e.stopPropagation(); markRead(n.id); }}
                          className="p-1 rounded text-on-surface-tertiary hover:bg-surface-tertiary"
                          title={isRTL ? 'قراءة' : 'Mark read'}
                        >
                          <Check size={12} />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteOne(n.id); }}
                        className="p-1 rounded text-on-surface-tertiary hover:bg-red-500/10 hover:text-red-500"
                        title={isRTL ? 'حذف' : 'Delete'}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-3 py-2 border-t border-border">
            <button
              onClick={() => { setOpen(false); router.push('/notifications'); }}
              className="w-full text-center text-xs text-accent hover:underline"
            >
              {isRTL ? 'عرض الكل' : 'View all'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
