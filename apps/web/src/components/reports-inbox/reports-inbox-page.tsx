'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail, Star, Trash2, CheckCheck, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/store/app';
import { cn } from '@/lib/utils';

interface InboxListItem {
  id: string;
  reportId: string | null;
  runId?: string | null;
  subject: string;
  from: string;
  sentAt: string;
  read: boolean;
  starred: boolean;
  tags: string[];
  preview: string;
}

interface InboxFullItem extends InboxListItem {
  html: string;
  bodyMarkdown?: string;
}

const AGENT_DISPLAY: Record<string, { ar: string; en: string }> = {
  manager: { ar: 'الراعي', en: "Al-Ra'i" },
  doctor: { ar: 'الدكتور', en: 'Al-Duktor' },
  architect: { ar: 'المصمم', en: 'Al-Musammim' },
  research: { ar: 'الباحث', en: 'Al-Bahith' },
  'reading-helper': { ar: 'المُلخِّص', en: 'Al-Mulakhkhis' },
  'writing-critic': { ar: 'الناقد', en: 'Al-Naqid' },
  comparator: { ar: 'المُقارِن', en: 'Al-Muqarin' },
  'content-creator': { ar: 'السارد', en: 'Al-Sarid' },
  creative: { ar: 'المبدع', en: 'Al-Mubdi' },
  sayyaq: { ar: 'الكاتب', en: 'Al-Katib' },
  mudawwin: { ar: 'المُدوِّن', en: 'Al-Mudawwin' },
  'research-companion': { ar: 'الخوي', en: 'Al-Khuwy' },
  system: { ar: 'رُحول', en: 'Ruhool' },
};

function formatDate(iso: string, isRTL: boolean): string {
  try {
    return new Date(iso).toLocaleString(isRTL ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return iso; }
}

/**
 * Inject <base href={origin}> into the head of an email HTML so
 * relative URLs (@font-face src, img src, links) resolve against the
 * web app's origin when rendered inside an iframe srcDoc. Without
 * this, srcDoc creates an opaque origin where /fonts/* return 404
 * and Thmanyah never loads.
 */
function injectBase(html: string): string {
  if (typeof window === 'undefined') return html;
  const origin = window.location.origin;
  // If the HTML already has a <base>, don't double up.
  if (/<base\s/i.test(html)) return html;
  const baseTag = `<base href="${origin}/">`;
  // Prefer inserting right after <head>; fall back to prepending if
  // the HTML has no <head> (shouldn't happen with our template).
  return /<head[^>]*>/i.test(html)
    ? html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`)
    : baseTag + html;
}

export function ReportsInboxPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [items, setItems] = useState<InboxListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [offset, setOffset] = useState(0);
  const [openItem, setOpenItem] = useState<InboxFullItem | null>(null);
  const [loading, setLoading] = useState(true);
  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch<{ items: InboxListItem[]; total: number; unread: number }>(
        `/api/reports/inbox?offset=${offset}&limit=${LIMIT}`,
      );
      setItems(r.items);
      setTotal(r.total);
      setUnread(r.unread);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => { void load(); }, [load]);

  const openMail = async (id: string) => {
    try {
      const full = await apiFetch<InboxFullItem>(`/api/reports/inbox/${id}`);
      setOpenItem(full);
      if (!full.read) {
        await apiFetch(`/api/reports/inbox/${id}`, { method: 'PATCH', body: JSON.stringify({ read: true }) });
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read: true } : i)));
        setUnread((u) => Math.max(0, u - 1));
      }
    } catch { /* silent */ }
  };

  const toggleStar = async (id: string, next: boolean) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, starred: next } : i)));
    try {
      await apiFetch(`/api/reports/inbox/${id}`, { method: 'PATCH', body: JSON.stringify({ starred: next }) });
    } catch { /* revert on failure */
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, starred: !next } : i)));
    }
  };

  const removeItem = async (id: string) => {
    const before = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await apiFetch(`/api/reports/inbox/${id}`, { method: 'DELETE' });
      setTotal((t) => Math.max(0, t - 1));
      if (openItem?.id === id) setOpenItem(null);
    } catch {
      setItems(before);
    }
  };

  const markAllRead = async () => {
    try {
      await apiFetch('/api/reports/inbox/mark-all-read', { method: 'POST' });
      setItems((prev) => prev.map((i) => ({ ...i, read: true })));
      setUnread(0);
    } catch { /* silent */ }
  };

  return (
    <div className="flex h-full">
      {/* List pane */}
      <div className="w-96 border-e border-border bg-surface overflow-y-auto shrink-0">
        <div className="sticky top-0 z-10 px-4 py-3 bg-surface border-b border-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-on-surface-secondary" />
            <h1 className="text-lg font-semibold text-on-surface">{isRTL ? 'صندوق التقارير' : 'Reports Inbox'}</h1>
            {unread > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-on-accent">{unread}</span>
            )}
          </div>
          {unread > 0 && (
            <button onClick={markAllRead} title={isRTL ? 'اعتبر الكل مقروءاً' : 'Mark all read'} className="p-1.5 rounded-[var(--radius)] text-on-surface-secondary hover:bg-surface-secondary">
              <CheckCheck size={16} />
            </button>
          )}
        </div>
        {loading ? (
          <div className="p-8 text-sm text-on-surface-secondary text-center">{isRTL ? 'جاري التحميل...' : 'Loading...'}</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-sm text-on-surface-secondary text-center">
            {isRTL ? 'لا رسائل بعد. التقارير المُرسلة ستظهر هنا.' : 'No messages yet. Sent reports will land here.'}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((i) => {
              const sender = AGENT_DISPLAY[i.from]?.[language] ?? i.from;
              const selected = openItem?.id === i.id;
              return (
                <li
                  key={i.id}
                  onClick={() => openMail(i.id)}
                  className={cn(
                    'px-4 py-3 cursor-pointer flex gap-2 items-start hover:bg-surface-secondary/60 transition-colors',
                    selected && 'bg-surface-secondary',
                    !i.read && 'border-s-2 border-accent',
                  )}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleStar(i.id, !i.starred); }}
                    className={cn('shrink-0 mt-0.5', i.starred ? 'text-amber-500' : 'text-on-surface-muted hover:text-amber-400')}
                    aria-label={i.starred ? 'إلغاء النجمة' : 'إضافة نجمة'}
                  >
                    <Star size={14} fill={i.starred ? 'currentColor' : 'none'} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm truncate', !i.read ? 'font-semibold text-on-surface' : 'text-on-surface-secondary')}>{sender}</span>
                      <span className="text-[11px] text-on-surface-muted ms-auto whitespace-nowrap">{formatDate(i.sentAt, isRTL)}</span>
                    </div>
                    <div className={cn('text-sm truncate mt-0.5', !i.read && 'font-medium')}>{i.subject}</div>
                    <div className="text-xs text-on-surface-muted truncate mt-0.5">{i.preview}</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeItem(i.id); }}
                    className="shrink-0 p-1 text-on-surface-muted hover:text-red-600"
                    aria-label="حذف"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {total > LIMIT && (
          <div className="sticky bottom-0 p-2 bg-surface border-t border-border flex items-center justify-between text-xs text-on-surface-secondary">
            <span>{offset + 1}–{Math.min(offset + LIMIT, total)} من {total}</span>
            <div className="flex gap-1">
              <button onClick={() => setOffset((o) => Math.max(0, o - LIMIT))} disabled={offset === 0} className="px-2 py-0.5 rounded-[var(--radius)] bg-surface-secondary hover:bg-surface-tertiary disabled:opacity-30">الأحدث</button>
              <button onClick={() => setOffset((o) => o + LIMIT)} disabled={offset + LIMIT >= total} className="px-2 py-0.5 rounded-[var(--radius)] bg-surface-secondary hover:bg-surface-tertiary disabled:opacity-30">الأقدم</button>
            </div>
          </div>
        )}
      </div>

      {/* Reading pane */}
      <div className="flex-1 min-w-0 overflow-y-auto bg-surface-secondary">
        {!openItem ? (
          <div className="h-full flex items-center justify-center text-sm text-on-surface-secondary">
            {isRTL ? 'اختر رسالة من القائمة لقراءتها' : 'Pick a message from the list'}
          </div>
        ) : (
          <div className="h-full flex flex-col">
            <div className="sticky top-0 bg-surface border-b border-border px-6 py-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-on-surface truncate">{openItem.subject}</h2>
                <div className="text-xs text-on-surface-secondary mt-1">
                  {isRTL ? 'من' : 'From'}: <span className="font-medium">{AGENT_DISPLAY[openItem.from]?.[language] ?? openItem.from}</span>
                  {'  ·  '}
                  <span>{formatDate(openItem.sentAt, isRTL)}</span>
                </div>
              </div>
              <button onClick={() => setOpenItem(null)} className="p-1.5 rounded text-on-surface-secondary hover:bg-surface-secondary">
                <X size={16} />
              </button>
            </div>
            <iframe
              // Inject a <base href> into the HTML so relative URLs
              // inside @font-face (and any other asset) resolve back
              // to the web app's origin — without this, srcDoc
              // creates an opaque origin where /fonts/* 404s.
              srcDoc={injectBase(openItem.html)}
              title={openItem.subject}
              className="flex-1 w-full bg-white"
            />
          </div>
        )}
      </div>
    </div>
  );
}
