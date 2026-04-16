'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Plus, ExternalLink, CreditCard, Calendar, DollarSign, Sparkles, Bell, Pencil, Trash2, Link2, LayoutDashboard, ListOrdered, Activity, Wallet, FolderTree } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { SubscriptionForm } from './subscription-form';
import { CardForm } from './card-form';
import { AnalystChatDrawer } from './analyst-chat-drawer';
import { UsagePage } from '@/components/usage/usage-page';
import { BudgetSettings } from '@/components/settings/budget-settings';

// ─── Shared types (also imported by sub-components) ───
export type BillingCycle = 'monthly' | 'yearly' | 'quarterly' | 'one-time' | 'pay-as-you-go';
export interface NotificationRule {
  id: string;
  type: 'percent_used' | 'days_before_renewal' | 'days_before_eom_with_remaining' | 'on_date' | 'price_change';
  threshold?: number;
  days?: number;
  minRemaining?: number;
  date?: string;
  message?: string;
  enabled: boolean;
  lastFiredAt?: string;
}
export interface SubscriptionRecord {
  id: string;
  name: string;
  provider?: string;
  categoryId?: string;
  billingCycle: BillingCycle;
  amount: number;
  currency: string;
  startDate?: string;
  nextBillingDate?: string;
  dashboardUrl?: string;
  paymentCardId?: string;
  notes?: string;
  status: 'active' | 'cancelled' | 'paused';
  priceHistory?: Array<{ date: string; amount: number; currency: string; reason?: string }>;
  linkedApiField?: string;
  attachments?: Array<{ id: string; filename: string; uploadedAt: string }>;
  email?: string;
  externalAccount?: string;
  notifications?: NotificationRule[];
  createdAt: string;
  updatedAt: string;
}
export interface PaymentCardRecord {
  id: string;
  label: string;
  last4?: string;
  color?: string;
  notes?: string;
}
export interface SubCategoryRecord {
  id: string;
  name: { ar: string; en: string };
  icon?: string;
  color?: string;
  builtin?: boolean;
}
interface Stats {
  totalMonthly: number;
  totalYearly: number;
  count: number;
  byCategory: Record<string, number>;
  byCard: Record<string, number>;
  byCycle: Record<string, number>;
  upcoming: Array<{ id: string; name: string; date: string; amount: number; currency: string }>;
}

const CYCLE_LABEL: Record<string, { ar: string; en: string }> = {
  monthly: { ar: 'شهري', en: 'Monthly' },
  yearly: { ar: 'سنوي', en: 'Yearly' },
  quarterly: { ar: 'ربعي', en: 'Quarterly' },
  'one-time': { ar: 'مرة واحدة', en: 'One-time' },
  'pay-as-you-go': { ar: 'حسب الاستخدام', en: 'Pay-as-you-go' },
};

export function AnalystPageView() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [subs, setSubs] = useState<SubscriptionRecord[]>([]);
  const [cats, setCats] = useState<SubCategoryRecord[]>([]);
  const [cards, setCards] = useState<PaymentCardRecord[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [suggestions, setSuggestions] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  const [editingSub, setEditingSub] = useState<SubscriptionRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);
  const [editingCard, setEditingCard] = useState<PaymentCardRecord | null>(null);
  const [filterCat, setFilterCat] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'paused' | 'cancelled'>('active');
  const [tab, setTab] = useState<'overview' | 'subscriptions' | 'usage' | 'budget' | 'categories' | 'statement'>('overview');

  const reload = async () => {
    try {
      const [s, c, k, st, sg] = await Promise.all([
        apiFetch<SubscriptionRecord[]>('/api/subscriptions'),
        apiFetch<SubCategoryRecord[]>('/api/subscriptions/categories'),
        apiFetch<PaymentCardRecord[]>('/api/subscriptions/cards'),
        apiFetch<Stats>('/api/subscriptions/stats'),
        apiFetch<Array<Record<string, unknown>>>('/api/subscriptions/suggestions'),
      ]);
      setSubs(s); setCats(c); setCards(k); setStats(st); setSuggestions(sg);
    } finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => {
    return subs.filter((s) => {
      if (filterCat !== 'all' && s.categoryId !== filterCat) return false;
      if (filterStatus !== 'all' && s.status !== filterStatus) return false;
      return true;
    });
  }, [subs, filterCat, filterStatus]);

  const catMap = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c])), [cats]);
  const cardMap = useMemo(() => Object.fromEntries(cards.map((c) => [c.id, c])), [cards]);

  const addSuggestion = async (s: Record<string, unknown>) => {
    await apiFetch('/api/subscriptions', { method: 'POST', body: JSON.stringify({
      name: s.name, provider: s.provider, categoryId: s.categoryHint,
      billingCycle: s.cycle, amount: s.amount, currency: s.currency,
      dashboardUrl: s.dashboardUrl, status: 'active', startDate: new Date().toISOString().slice(0, 10),
    }) });
    reload();
  };

  if (loading) return <div className="p-12 text-center text-on-surface-tertiary">…</div>;

  return (
    <div className={cn('max-w-7xl mx-auto px-6 py-6 space-y-6', isRTL && 'rtl')} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-[var(--radius-lg)] bg-teal-500/10 text-teal-500 flex items-center justify-center">
            <BarChart3 size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-on-surface">{isRTL ? 'المحلل' : 'Analyst'}</h1>
            <p className="text-xs text-on-surface-tertiary">
              {isRTL ? 'متابعة الاشتراكات والتكاليف' : 'Track subscriptions and costs'}
            </p>
          </div>
        </div>
        <button onClick={() => { setEditingSub(null); setShowForm(true); }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius)] bg-accent text-on-accent text-sm font-semibold hover:opacity-90">
          <Plus size={14} /> {isRTL ? 'إضافة اشتراك' : 'Add subscription'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {([
          { id: 'overview', icon: LayoutDashboard, label: { ar: 'نظرة عامة', en: 'Overview' } },
          { id: 'subscriptions', icon: ListOrdered, label: { ar: 'الاشتراكات', en: 'Subscriptions' } },
          { id: 'usage', icon: Activity, label: { ar: 'سجل الاستخدام', en: 'Usage' } },
          { id: 'budget', icon: Wallet, label: { ar: 'الميزانية', en: 'Budget' } },
          { id: 'categories', icon: FolderTree, label: { ar: 'التصنيفات', en: 'Categories' } },
          { id: 'statement', icon: CreditCard, label: { ar: 'كشف حساب', en: 'Statement' } },
        ] as const).map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn('px-4 py-2.5 text-sm border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap',
                tab === t.id ? 'border-accent text-accent font-medium' : 'border-transparent text-on-surface-secondary hover:text-on-surface')}>
              <Icon size={14} /> {t.label[language]}
            </button>
          );
        })}
      </div>

      {/* Other tabs content */}
      {tab === 'usage' && <UsagePage />}
      {tab === 'budget' && <BudgetSettings />}
      {tab === 'categories' && <CategoryManager cats={cats} onChange={reload} isRTL={isRTL} language={language} />}
      {tab === 'statement' && <BankStatementPanel isRTL={isRTL} />}

      {tab === 'overview' && stats && Object.keys(stats.byCycle).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <CycleDonut stats={stats} isRTL={isRTL} language={language} />
          <TopExpensiveBars subs={subs} isRTL={isRTL} />
        </div>
      )}

      {tab === 'overview' && <UsageMeters isRTL={isRTL} language={language} />}

      {/* Metric cards (overview only) */}
      {tab === 'overview' && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: DollarSign, label: { ar: 'إجمالي شهري', en: 'Monthly total' }, value: `$${stats.totalMonthly.toFixed(2)}`, color: 'text-emerald-500 bg-emerald-500/10' },
            { icon: Calendar,  label: { ar: 'سنوي مكافئ',  en: 'Yearly equiv' }, value: `$${stats.totalYearly.toFixed(2)}`, color: 'text-blue-500 bg-blue-500/10' },
            { icon: Sparkles,  label: { ar: 'اشتراكات نشطة', en: 'Active subs' }, value: stats.count.toString(), color: 'text-purple-500 bg-purple-500/10' },
            { icon: Bell,      label: { ar: 'تجديدات قريبة', en: 'Upcoming (30d)' }, value: stats.upcoming.length.toString(), color: 'text-amber-500 bg-amber-500/10' },
          ].map((m, i) => {
            const Icon = m.icon;
            return (
              <div key={i} className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-2', m.color)}>
                  <Icon size={16} />
                </div>
                <div className="text-xs text-on-surface-tertiary">{m.label[language]}</div>
                <div className="text-2xl font-bold text-on-surface mt-0.5">{m.value}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Charts row (overview only) */}
      {tab === 'overview' && stats && Object.keys(stats.byCategory).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <CategoryPie stats={stats} cats={cats} isRTL={isRTL} />
          <CardBars stats={stats} cards={cards} isRTL={isRTL} />
        </div>
      )}

      {/* Suggestions row (overview only) */}
      {tab === 'overview' && suggestions.length > 0 && subs.filter((s) => !s.linkedApiField).length < 3 && (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-on-surface mb-2">
            {isRTL ? 'اشتراكات شائعة (انقر للإضافة بسرعة)' : 'Popular subscriptions (click to add)'}
          </p>
          <div className="flex gap-2 flex-wrap">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => addSuggestion(s)}
                className="px-3 py-1.5 rounded-full text-xs border border-border hover:border-accent hover:bg-accent/5">
                + {s.name as string} <span className="text-on-surface-tertiary">${s.amount as number}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {(tab === 'overview' || tab === 'subscriptions') && (
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
        {/* Sidebar: categories + cards */}
        <aside className="space-y-4">
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wide">{isRTL ? 'التصنيفات' : 'Categories'}</p>
            </div>
            <div className="space-y-1">
              <button onClick={() => setFilterCat('all')}
                className={cn('w-full text-start px-3 py-1.5 rounded text-sm', filterCat === 'all' ? 'bg-accent/10 text-accent font-medium' : 'text-on-surface hover:bg-surface-secondary')}>
                {isRTL ? 'كل التصنيفات' : 'All categories'} <span className="text-xs text-on-surface-tertiary ms-1">({subs.length})</span>
              </button>
              {cats.map((c) => {
                const count = subs.filter((s) => s.categoryId === c.id).length;
                return (
                  <button key={c.id} onClick={() => setFilterCat(c.id)}
                    className={cn('w-full text-start px-3 py-1.5 rounded text-sm flex items-center gap-2', filterCat === c.id ? 'bg-accent/10 text-accent font-medium' : 'text-on-surface hover:bg-surface-secondary')}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color || '#9ca3af' }} />
                    <span className="flex-1 truncate">{c.name[language]}</span>
                    <span className="text-xs text-on-surface-tertiary">{count}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wide">{isRTL ? 'البطاقات' : 'Cards'}</p>
              <button onClick={() => { setEditingCard(null); setShowCardForm(true); }} className="text-xs text-accent hover:underline">+ {isRTL ? 'إضافة' : 'Add'}</button>
            </div>
            <div className="space-y-1.5">
              {cards.length === 0 && <p className="text-xs text-on-surface-tertiary px-2 py-3">{isRTL ? 'لا توجد بطاقات' : 'No cards yet'}</p>}
              {cards.map((c) => (
                <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded border border-border hover:border-accent/40 group">
                  <CreditCard size={14} style={{ color: c.color || '#6366f1' }} />
                  <span className="flex-1 text-sm text-on-surface truncate">{c.label} {c.last4 && <span className="text-on-surface-tertiary">···{c.last4}</span>}</span>
                  <button onClick={() => { setEditingCard(c); setShowCardForm(true); }}
                    className="opacity-0 group-hover:opacity-100 text-on-surface-tertiary hover:text-on-surface">
                    <Pencil size={11} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </aside>

        {/* Subscriptions table */}
        <main>
          <div className="flex items-center gap-2 mb-3">
            {(['all', 'active', 'paused', 'cancelled'] as const).map((s) => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={cn('px-3 py-1.5 rounded-full text-xs', filterStatus === s ? 'bg-accent text-on-accent' : 'bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary')}>
                {s === 'all' ? (isRTL ? 'الكل' : 'All') : s === 'active' ? (isRTL ? 'نشط' : 'Active') : s === 'paused' ? (isRTL ? 'موقّف' : 'Paused') : (isRTL ? 'ملغى' : 'Cancelled')}
              </button>
            ))}
          </div>

          <div className="rounded-[var(--radius-lg)] border border-border overflow-hidden">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-on-surface-tertiary text-sm">{isRTL ? 'لا توجد اشتراكات بهذا الفلتر' : 'No subscriptions match'}</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface-secondary">
                  <tr className="text-xs text-on-surface-tertiary">
                    <th className="text-start px-3 py-2 font-medium">{isRTL ? 'الاسم' : 'Name'}</th>
                    <th className="text-start px-3 py-2 font-medium">{isRTL ? 'التصنيف' : 'Category'}</th>
                    <th className="text-start px-3 py-2 font-medium">{isRTL ? 'الدورة' : 'Cycle'}</th>
                    <th className="text-end px-3 py-2 font-medium">{isRTL ? 'المبلغ' : 'Amount'}</th>
                    <th className="text-start px-3 py-2 font-medium">{isRTL ? 'التجديد' : 'Renews'}</th>
                    <th className="text-start px-3 py-2 font-medium">{isRTL ? 'البطاقة' : 'Card'}</th>
                    <th className="text-end px-3 py-2 font-medium">{isRTL ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const cat = s.categoryId ? catMap[s.categoryId] : null;
                    const card = s.paymentCardId ? cardMap[s.paymentCardId] : null;
                    return (
                      <tr key={s.id} className="border-t border-border hover:bg-surface-secondary cursor-pointer"
                        onClick={() => { setEditingSub(s); setShowForm(true); }}>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-on-surface">{s.name}</span>
                            {s.linkedApiField && <Link2 size={11} className="text-teal-500" />}
                            {s.notifications && s.notifications.length > 0 && <Bell size={11} className="text-amber-500" />}
                          </div>
                          {s.provider && <div className="text-xs text-on-surface-tertiary">{s.provider}</div>}
                        </td>
                        <td className="px-3 py-2.5">
                          {cat ? (
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              <span className="w-2 h-2 rounded-full" style={{ background: cat.color || '#9ca3af' }} />
                              {cat.name[language]}
                            </span>
                          ) : <span className="text-xs text-on-surface-tertiary">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs">{CYCLE_LABEL[s.billingCycle][language]}</td>
                        <td className="px-3 py-2.5 text-end font-mono font-semibold">{s.amount > 0 ? `$${s.amount.toFixed(2)}` : '—'}</td>
                        <td className="px-3 py-2.5 text-xs text-on-surface-secondary">{s.nextBillingDate || '—'}</td>
                        <td className="px-3 py-2.5 text-xs">{card?.label || '—'}</td>
                        <td className="px-3 py-2.5 text-end" onClick={(e) => e.stopPropagation()}>
                          {s.dashboardUrl && (
                            <a href={s.dashboardUrl} target="_blank" rel="noreferrer" className="inline-block p-1.5 rounded text-on-surface-tertiary hover:text-accent hover:bg-surface-tertiary" title={isRTL ? 'فتح لوحة التحكم' : 'Open dashboard'}>
                              <ExternalLink size={12} />
                            </a>
                          )}
                          <button onClick={() => { setEditingSub(s); setShowForm(true); }} className="p-1.5 rounded text-on-surface-tertiary hover:text-accent hover:bg-surface-tertiary">
                            <Pencil size={12} />
                          </button>
                          <button onClick={async () => {
                            if (!confirm(isRTL ? `حذف ${s.name}؟` : `Delete ${s.name}?`)) return;
                            await apiFetch(`/api/subscriptions/${s.id}`, { method: 'DELETE' });
                            reload();
                          }} className="p-1.5 rounded text-on-surface-tertiary hover:text-red-500 hover:bg-red-500/10">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>

      )}

      {showForm && (
        <SubscriptionForm
          isRTL={isRTL}
          categories={cats}
          cards={cards}
          initial={editingSub}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); reload(); }}
          onDeleted={() => { setShowForm(false); reload(); }}
        />
      )}
      {showCardForm && (
        <CardForm
          isRTL={isRTL}
          initial={editingCard}
          onClose={() => setShowCardForm(false)}
          onSaved={() => { setShowCardForm(false); reload(); }}
        />
      )}
      <AnalystChatDrawer />
    </div>
  );
}

// Simple SVG pie for category breakdown
function CategoryPie({ stats, cats, isRTL }: { stats: Stats; cats: SubCategoryRecord[]; isRTL: boolean }) {
  const total = Object.values(stats.byCategory).reduce((s, v) => s + v, 0) || 1;
  const entries = Object.entries(stats.byCategory).map(([id, v]) => {
    const cat = cats.find((c) => c.id === id);
    return { id, label: cat ? (isRTL ? cat.name.ar : cat.name.en) : id, value: v, color: cat?.color || '#9ca3af' };
  });
  let cumulative = 0;
  const slices = entries.map((e) => {
    const start = (cumulative / total) * 2 * Math.PI;
    cumulative += e.value;
    const end = (cumulative / total) * 2 * Math.PI;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = 80 + 70 * Math.sin(start);
    const y1 = 80 - 70 * Math.cos(start);
    const x2 = 80 + 70 * Math.sin(end);
    const y2 = 80 - 70 * Math.cos(end);
    const d = `M 80 80 L ${x1} ${y1} A 70 70 0 ${large} 1 ${x2} ${y2} Z`;
    return { ...e, d };
  });
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <p className="text-sm font-semibold text-on-surface mb-3">{isRTL ? 'حسب التصنيف' : 'By category'}</p>
      <div className="flex items-center gap-4">
        <svg width={160} height={160} viewBox="0 0 160 160">
          {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} stroke="var(--surface)" strokeWidth={1.5} />)}
        </svg>
        <div className="flex-1 space-y-1.5">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: e.color }} />
              <span className="text-on-surface flex-1 truncate">{e.label}</span>
              <span className="font-mono text-on-surface-secondary">${e.value.toFixed(2)}/mo</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Live usage meters for free/trial subs with known limits
function UsageMeters({ isRTL, language }: { isRTL: boolean; language: 'ar' | 'en' }) {
  const [data, setData] = useState<Array<{ id: string; name: string; tier: string; used: number; limit: number; unit: string; pct: number; status: 'ok' | 'warn' | 'critical' }>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiFetch<typeof data>('/api/subscriptions/usage-overview')
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);
  if (loading) return null;
  if (data.length === 0) return null;
  const tierLabel: Record<string, { ar: string; en: string; color: string }> = {
    free:  { ar: 'مجاني',   en: 'Free',  color: 'bg-emerald-500/15 text-emerald-600' },
    trial: { ar: 'تجريبي', en: 'Trial', color: 'bg-blue-500/15 text-blue-600' },
    paid:  { ar: 'مدفوع',  en: 'Paid',  color: 'bg-purple-500/15 text-purple-600' },
  };
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-on-surface">{isRTL ? 'الاستخدام مقابل الحدود (تجريبي/مدفوع)' : 'Usage vs limits (trial/paid)'}</p>
        <span className="text-[10px] text-on-surface-tertiary">{isRTL ? 'محدّث الآن' : 'Live'}</span>
      </div>
      <div className="space-y-2.5">
        {data.map((u) => {
          const color = u.status === 'critical' ? '#ef4444' : u.status === 'warn' ? '#f59e0b' : '#10b981';
          const t = tierLabel[u.tier] || tierLabel.trial;
          return (
            <div key={u.id} className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-on-surface flex-1">{u.name}</span>
                <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-semibold', t.color)}>{language === 'ar' ? t.ar : t.en}</span>
                <span className="font-mono text-on-surface-secondary">{u.used.toLocaleString()} / {u.limit.toLocaleString()} {u.unit}</span>
                <span className="font-mono font-bold w-12 text-end" style={{ color }}>{u.pct.toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full bg-surface-secondary overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, u.pct)}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-on-surface-tertiary mt-3">
        {isRTL ? 'أخضر < 70% · أصفر 70-90% · أحمر > 90%' : 'Green < 70% · Yellow 70-90% · Red > 90%'}
      </p>
    </div>
  );
}

// Donut chart for billing cycle distribution
function CycleDonut({ stats, isRTL, language }: { stats: Stats; isRTL: boolean; language: 'ar' | 'en' }) {
  const total = Object.values(stats.byCycle).reduce((s, v) => s + v, 0);
  if (total === 0) return null;
  const colors: Record<string, string> = { monthly: '#3b82f6', yearly: '#8b5cf6', quarterly: '#ec4899', 'one-time': '#f59e0b', 'pay-as-you-go': '#10b981' };
  let cum = 0;
  const slices = Object.entries(stats.byCycle).filter(([, v]) => v > 0).map(([k, v]) => {
    const start = (cum / total) * 2 * Math.PI; cum += v;
    const end = (cum / total) * 2 * Math.PI;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = 80 + 70 * Math.sin(start), y1 = 80 - 70 * Math.cos(start);
    const x2 = 80 + 70 * Math.sin(end), y2 = 80 - 70 * Math.cos(end);
    const x3 = 80 + 38 * Math.sin(end), y3 = 80 - 38 * Math.cos(end);
    const x4 = 80 + 38 * Math.sin(start), y4 = 80 - 38 * Math.cos(start);
    const d = `M ${x1} ${y1} A 70 70 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A 38 38 0 ${large} 0 ${x4} ${y4} Z`;
    return { k, v, d, color: colors[k] || '#9ca3af' };
  });
  const cycleLabel: Record<string, { ar: string; en: string }> = {
    monthly: { ar: 'شهري', en: 'Monthly' }, yearly: { ar: 'سنوي', en: 'Yearly' },
    quarterly: { ar: 'ربعي', en: 'Quarterly' }, 'one-time': { ar: 'مرة واحدة', en: 'One-time' },
    'pay-as-you-go': { ar: 'حسب الاستخدام', en: 'Pay-as-you-go' },
  };
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <p className="text-sm font-semibold text-on-surface mb-3">{isRTL ? 'حسب نوع الدورة' : 'By billing cycle'}</p>
      <div className="flex items-center gap-4">
        <svg width={160} height={160} viewBox="0 0 160 160">
          {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} />)}
          <text x={80} y={75} textAnchor="middle" fontSize={11} fill="var(--on-surface-tertiary)">{isRTL ? 'الإجمالي' : 'Total'}</text>
          <text x={80} y={92} textAnchor="middle" fontSize={18} fontWeight={700} fill="var(--on-surface)">${total.toFixed(0)}/mo</text>
        </svg>
        <div className="flex-1 space-y-1.5">
          {slices.map((s) => (
            <div key={s.k} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
              <span className="flex-1">{cycleLabel[s.k][language]}</span>
              <span className="font-mono text-on-surface-secondary">${s.v.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Top-N most expensive subs
function TopExpensiveBars({ subs, isRTL }: { subs: SubscriptionRecord[]; isRTL: boolean }) {
  const top = [...subs.filter((s) => s.status === 'active' && s.amount > 0)]
    .sort((a, b) => b.amount - a.amount).slice(0, 5);
  if (top.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-on-surface mb-3">{isRTL ? 'أعلى الاشتراكات تكلفة' : 'Top by cost'}</p>
        <p className="text-xs text-on-surface-tertiary">{isRTL ? 'لا توجد اشتراكات مدفوعة بعد' : 'No paid subscriptions yet'}</p>
      </div>
    );
  }
  const max = top[0].amount;
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <p className="text-sm font-semibold text-on-surface mb-3">{isRTL ? 'أعلى ٥ اشتراكات' : 'Top 5 by cost'}</p>
      <div className="space-y-2">
        {top.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <span className="text-xs text-on-surface w-28 truncate">{s.name}</span>
            <div className="flex-1 h-5 rounded bg-surface-secondary overflow-hidden">
              <div className="h-full bg-gradient-to-r from-rose-500 to-amber-500" style={{ width: `${(s.amount / max) * 100}%` }} />
            </div>
            <span className="text-xs font-mono text-on-surface-secondary w-16 text-end">${s.amount.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Inline category CRUD
function CategoryManager({ cats, onChange, isRTL, language }: { cats: SubCategoryRecord[]; onChange: () => void; isRTL: boolean; language: 'ar' | 'en' }) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6366f1');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const create = async () => {
    if (!newName.trim()) return;
    await apiFetch('/api/subscriptions/categories', { method: 'POST', body: JSON.stringify({ name: { ar: newName, en: newName }, color: newColor }) });
    setNewName(''); onChange();
  };
  const save = async (id: string) => {
    if (!editName.trim()) { setEditingId(null); return; }
    await apiFetch(`/api/subscriptions/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name: { ar: editName, en: editName } }) });
    setEditingId(null); onChange();
  };
  const remove = async (id: string) => {
    if (!confirm(isRTL ? 'حذف هذا التصنيف؟ الاشتراكات ستصبح بدون تصنيف.' : 'Delete this category? Subscriptions will become uncategorized.')) return;
    await apiFetch(`/api/subscriptions/categories/${id}`, { method: 'DELETE' });
    onChange();
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 space-y-3">
      <p className="text-sm font-semibold text-on-surface">{isRTL ? 'إدارة تصنيفات الاشتراكات' : 'Manage subscription categories'}</p>
      <div className="space-y-1.5">
        {cats.map((c) => (
          <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded border border-border group">
            <span className="w-3 h-3 rounded-full" style={{ background: c.color || '#9ca3af' }} />
            {editingId === c.id ? (
              <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save(c.id)} onBlur={() => save(c.id)}
                className="flex-1 h-7 px-2 rounded bg-surface-secondary border border-accent text-sm" />
            ) : (
              <span className="flex-1 text-sm">{c.name[language]} {c.builtin && <span className="text-[10px] text-on-surface-tertiary ms-1">(مدمج)</span>}</span>
            )}
            {!c.builtin && (
              <>
                <button onClick={() => { setEditingId(c.id); setEditName(c.name[language]); }} className="p-1 text-on-surface-tertiary hover:text-accent opacity-0 group-hover:opacity-100"><Pencil size={11} /></button>
                <button onClick={() => remove(c.id)} className="p-1 text-on-surface-tertiary hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={11} /></button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-2 border-t border-border">
        <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="w-9 h-9 rounded cursor-pointer" />
        <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
          placeholder={isRTL ? 'اسم تصنيف جديد' : 'New category name'}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          className="flex-1 h-9 px-3 rounded bg-surface-secondary border border-border text-sm" />
        <button onClick={create} disabled={!newName.trim()}
          className="h-9 px-4 rounded bg-accent text-on-accent text-sm font-semibold disabled:opacity-40">
          + {isRTL ? 'إضافة' : 'Add'}
        </button>
      </div>
    </div>
  );
}

// Simple SVG bars for card breakdown
function CardBars({ stats, cards, isRTL }: { stats: Stats; cards: PaymentCardRecord[]; isRTL: boolean }) {
  const entries = Object.entries(stats.byCard).map(([id, v]) => {
    const card = cards.find((c) => c.id === id);
    return { id, label: card?.label || (isRTL ? 'بطاقة محذوفة' : 'Removed card'), value: v, color: card?.color || '#9ca3af' };
  });
  if (entries.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-on-surface mb-3">{isRTL ? 'حسب البطاقة' : 'By card'}</p>
        <p className="text-xs text-on-surface-tertiary">{isRTL ? 'لا توجد اشتراكات مربوطة ببطاقات بعد' : 'No subscriptions linked to cards yet'}</p>
      </div>
    );
  }
  const max = Math.max(...entries.map((e) => e.value));
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <p className="text-sm font-semibold text-on-surface mb-3">{isRTL ? 'حسب البطاقة' : 'By card'}</p>
      <div className="space-y-2">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center gap-2">
            <span className="text-xs text-on-surface w-24 truncate">{e.label}</span>
            <div className="flex-1 h-5 rounded bg-surface-secondary overflow-hidden">
              <div className="h-full" style={{ width: `${(e.value / max) * 100}%`, background: e.color }} />
            </div>
            <span className="text-xs font-mono text-on-surface-secondary w-16 text-end">${e.value.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BankStatementPanel({ isRTL }: { isRTL: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    summary: { totalTransactions: number; matched: number; discrepancies: number; unknown: number; pages: number };
    transactions: Array<{ date: string; description: string; amount: number; status: 'match' | 'discrepancy' | 'unknown'; subscriptionName?: string; expectedAmount?: number }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001'}/api/analyst/parse-bank-statement`, {
        method: 'POST', body: fd,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <div>
        <h3 className="text-sm font-semibold text-on-surface mb-1">
          {isRTL ? 'تحليل كشف حساب بنكي' : 'Bank statement analysis'}
        </h3>
        <p className="text-xs text-on-surface-tertiary">
          {isRTL ? 'ارفع PDF — سنستخرج المعاملات ونقارنها باشتراكاتك' : 'Upload a PDF — we extract transactions and match against your subscriptions'}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="text-xs"
        />
        <button
          onClick={upload}
          disabled={!file || busy}
          className="px-3 py-1.5 rounded-[var(--radius)] bg-accent text-on-accent text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1.5"
        >
          {busy ? '⏳' : '⬆'} {isRTL ? 'حلّل' : 'Analyze'}
        </button>
      </div>

      {error && <div className="text-xs text-red-500">{error}</div>}

      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-[var(--radius)] bg-surface-secondary p-3">
              <div className="text-[10px] text-on-surface-tertiary">{isRTL ? 'معاملات' : 'Transactions'}</div>
              <div className="text-xl font-bold">{result.summary.totalTransactions}</div>
            </div>
            <div className="rounded-[var(--radius)] bg-emerald-500/10 p-3">
              <div className="text-[10px] text-emerald-700 dark:text-emerald-400">{isRTL ? 'مطابقة' : 'Matched'}</div>
              <div className="text-xl font-bold text-emerald-600">{result.summary.matched}</div>
            </div>
            <div className="rounded-[var(--radius)] bg-amber-500/10 p-3">
              <div className="text-[10px] text-amber-700 dark:text-amber-400">{isRTL ? 'تباين' : 'Discrepancy'}</div>
              <div className="text-xl font-bold text-amber-600">{result.summary.discrepancies}</div>
            </div>
            <div className="rounded-[var(--radius)] bg-surface-secondary p-3">
              <div className="text-[10px] text-on-surface-tertiary">{isRTL ? 'غير معروف' : 'Unknown'}</div>
              <div className="text-xl font-bold">{result.summary.unknown}</div>
            </div>
          </div>

          <div className="rounded-[var(--radius)] border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-surface-secondary">
                <tr>
                  <th className="text-start px-2 py-1.5">{isRTL ? 'التاريخ' : 'Date'}</th>
                  <th className="text-start px-2 py-1.5">{isRTL ? 'الوصف' : 'Description'}</th>
                  <th className="text-end px-2 py-1.5">{isRTL ? 'المبلغ' : 'Amount'}</th>
                  <th className="text-start px-2 py-1.5">{isRTL ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody>
                {result.transactions.map((tx, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2 py-1.5 font-mono text-on-surface-secondary">{tx.date}</td>
                    <td className="px-2 py-1.5 text-on-surface">{tx.description}</td>
                    <td className="px-2 py-1.5 font-mono text-end">{tx.amount.toFixed(2)}</td>
                    <td className="px-2 py-1.5">
                      {tx.status === 'match' && <span className="text-emerald-600">✓ {tx.subscriptionName}</span>}
                      {tx.status === 'discrepancy' && <span className="text-amber-600" title={`Expected ${tx.expectedAmount}`}>⚠ {tx.subscriptionName}</span>}
                      {tx.status === 'unknown' && <span className="text-on-surface-tertiary">🆕 {isRTL ? 'غير معروف' : 'unknown'}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
