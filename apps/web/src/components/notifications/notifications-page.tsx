'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, Trash2, CheckCheck, ExternalLink, Settings2, Plus, Clock, X, ToggleLeft, ToggleRight } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'notifications' | 'rules'>('notifications');

  // J-13: Notification rules
  interface NotificationRule {
    id: string; titleEn: string; titleAr: string; enabled: boolean; isBuiltIn: boolean;
    trigger: { type: string; timeOfDay?: string; offsetHours?: number };
    snoozedUntil?: string;
  }
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRuleForm, setNewRuleForm] = useState({ titleEn: '', titleAr: '', triggerType: 'daily-morning', timeOfDay: '08:00', messageEn: '', messageAr: '' });

  const fetchRules = useCallback(async () => {
    setRulesLoading(true);
    try { setRules(await apiFetch<NotificationRule[]>('/api/notifications/rules')); }
    catch { /* ignore */ } finally { setRulesLoading(false); }
  }, []);

  const toggleRule = async (id: string, enabled: boolean) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled } : r));
    await apiFetch(`/api/notifications/rules/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }).catch(() => fetchRules());
  };

  const snoozeRule = async (id: string) => {
    await apiFetch(`/api/notifications/rules/${id}/snooze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hours: 24 }),
    }).catch(() => {});
    fetchRules();
  };

  const createRule = async () => {
    if (!newRuleForm.titleEn.trim()) return;
    await apiFetch('/api/notifications/rules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titleEn: newRuleForm.titleEn, titleAr: newRuleForm.titleAr,
        trigger: { type: newRuleForm.triggerType, timeOfDay: newRuleForm.timeOfDay },
        messageTemplate: { en: newRuleForm.messageEn, ar: newRuleForm.messageAr },
        enabled: true,
      }),
    }).catch(() => {});
    setShowAddRule(false);
    setNewRuleForm({ titleEn: '', titleAr: '', triggerType: 'daily-morning', timeOfDay: '08:00', messageEn: '', messageAr: '' });
    fetchRules();
  };

  useEffect(() => { if (activeTab === 'rules') fetchRules(); }, [activeTab, fetchRules]);

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
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Bell size={22} className="text-on-surface-secondary" />
          <h1 className="text-xl font-semibold text-on-surface">
            {isRTL ? 'التنبيهات' : 'Notifications'}
          </h1>
        </div>
        {/* Tab switcher */}
        <div className="flex gap-1">
          {([{ id: 'notifications', en: 'Inbox', ar: 'الصندوق' }, { id: 'rules', en: 'Rules', ar: 'القواعد' }] as const).map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors',
                activeTab === t.id ? 'bg-accent text-on-accent border-accent' : 'border-border text-on-surface-secondary hover:bg-surface-secondary'
              )}>
              {t.id === 'rules' ? <Settings2 size={12} /> : <Bell size={12} />}
              {isRTL ? t.ar : t.en}
            </button>
          ))}
        </div>
      </div>

      {/* ── Rules tab ─────────────────────────────────────── */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-on-surface-secondary">
              {isRTL ? `${rules.length} قاعدة` : `${rules.length} rules`}
            </p>
            <button onClick={() => setShowAddRule(v => !v)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent text-on-accent hover:opacity-90">
              <Plus size={12} />
              {isRTL ? 'قاعدة جديدة' : 'New rule'}
            </button>
          </div>

          {/* Add rule form */}
          {showAddRule && (
            <div className="rounded-xl border border-border bg-surface-secondary p-4 space-y-3">
              <h3 className="text-sm font-semibold text-on-surface">{isRTL ? 'قاعدة جديدة' : 'New Rule'}</h3>
              <div className="grid grid-cols-2 gap-2">
                <input value={newRuleForm.titleEn} onChange={e => setNewRuleForm(f => ({ ...f, titleEn: e.target.value }))}
                  placeholder="Title (English)"
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-accent" />
                <input value={newRuleForm.titleAr} onChange={e => setNewRuleForm(f => ({ ...f, titleAr: e.target.value }))}
                  placeholder="العنوان (عربي)" dir="rtl"
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-accent" />
              </div>
              <div className="flex gap-2">
                <select value={newRuleForm.triggerType} onChange={e => setNewRuleForm(f => ({ ...f, triggerType: e.target.value }))}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none flex-1">
                  <option value="daily-morning">Daily morning</option>
                  <option value="daily-evening">Daily evening</option>
                  <option value="cron">Cron</option>
                </select>
                <input type="time" value={newRuleForm.timeOfDay} onChange={e => setNewRuleForm(f => ({ ...f, timeOfDay: e.target.value }))}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none w-32" />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAddRule(false)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border text-on-surface-secondary hover:bg-surface-tertiary">
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
                <button onClick={createRule} disabled={!newRuleForm.titleEn.trim()}
                  className="text-xs px-3 py-1.5 rounded-lg bg-accent text-on-accent hover:opacity-90 disabled:opacity-50">
                  {isRTL ? 'إنشاء' : 'Create'}
                </button>
              </div>
            </div>
          )}

          {/* Rules list */}
          {rulesLoading ? (
            <div className="text-center py-8 text-on-surface-tertiary text-sm">{isRTL ? 'جاري التحميل...' : 'Loading...'}</div>
          ) : (
            <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
              {rules.length === 0 ? (
                <p className="py-12 text-center text-sm text-on-surface-tertiary">{isRTL ? 'لا قواعد' : 'No rules'}</p>
              ) : (
                <div className="divide-y divide-border">
                  {rules.map(rule => {
                    const isSnoozed = rule.snoozedUntil && new Date(rule.snoozedUntil) > new Date();
                    return (
                      <div key={rule.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-tertiary transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-on-surface">
                            {isRTL && rule.titleAr ? rule.titleAr : rule.titleEn}
                          </p>
                          <p className="text-[11px] text-on-surface-tertiary mt-0.5">
                            {rule.trigger.type}
                            {rule.trigger.timeOfDay && ` @ ${rule.trigger.timeOfDay}`}
                            {rule.isBuiltIn && <span className="ms-2 px-1 rounded bg-surface-tertiary">built-in</span>}
                            {isSnoozed && <span className="ms-2 text-warning">snoozed</span>}
                          </p>
                        </div>
                        {/* Snooze */}
                        <button onClick={() => snoozeRule(rule.id)} title={isRTL ? 'تأجيل 24 ساعة' : 'Snooze 24h'}
                          className="p-1.5 text-on-surface-tertiary hover:text-warning rounded hover:bg-warning/10 transition-colors">
                          <Clock size={14} />
                        </button>
                        {/* Enable toggle */}
                        <button onClick={() => toggleRule(rule.id, !rule.enabled)}
                          className={cn('p-1.5 rounded transition-colors', rule.enabled ? 'text-success hover:text-success/70' : 'text-on-surface-tertiary hover:text-on-surface')}>
                          {rule.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        </button>
                        {/* Delete (non-builtins only) */}
                        {!rule.isBuiltIn && (
                          <button onClick={async () => {
                            await apiFetch(`/api/notifications/rules/${rule.id}`, { method: 'DELETE' }).catch(() => {});
                            fetchRules();
                          }} className="p-1.5 text-on-surface-tertiary hover:text-error rounded transition-colors">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Notifications inbox tab ───────────────────────── */}
      {activeTab === 'notifications' && (<div>

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
      </div>)} {/* end notifications tab */}
    </div>
  );
}
