import type { Hono } from 'hono';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { StoreData } from '../store/types.js';
import type { CapabilityResult } from '../services/capability-checkers.js';

export type BillingCycle = 'monthly' | 'yearly' | 'quarterly' | 'one-time' | 'pay-as-you-go';
export interface PriceHistoryEntry { date: string; amount: number; currency: string; reason?: string }
export type NotificationRuleType =
  | 'percent_used'
  | 'days_before_renewal'
  | 'days_before_eom_with_remaining'
  | 'on_date'
  | 'price_change';
export interface NotificationRule {
  id: string;
  type: NotificationRuleType;
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
  tier?: 'free' | 'trial' | 'paid';
  monthlyLimit?: number;
  limitUnit?: string;
  billingCycle: BillingCycle;
  amount: number;
  currency: string;
  startDate?: string;
  nextBillingDate?: string;
  dashboardUrl?: string;
  paymentCardId?: string;
  notes?: string;
  status: 'active' | 'cancelled' | 'paused';
  priceHistory?: PriceHistoryEntry[];
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
  createdAt: string;
}
export interface SubCategoryRecord {
  id: string;
  name: { ar: string; en: string };
  icon?: string;
  color?: string;
  builtin?: boolean;
}

export interface SubscriptionsRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  capabilityCheckers: Record<string, (key: string) => Promise<Record<string, CapabilityResult>>>;
  subFilesDir: string;
}

type StoreSubs = Omit<StoreData, 'subscriptions'> & {
  subscriptionCategories?: SubCategoryRecord[];
  subscriptions?: SubscriptionRecord[];
  paymentCards?: PaymentCardRecord[];
  apiKeys?: Record<string, string>;
};

/**
 * Seed default categories + auto-provision platform API subscriptions
 * for any connected API key. Idempotent — safe to call on every GET.
 */
export function makeEnsureSubscriptionDefaults(deps: { getStore: () => StoreData; saveStore: () => void }): () => void {
  const { getStore, saveStore } = deps;
  return function ensureSubscriptionDefaults() {
    const store = getStore() as StoreSubs;
    if (!store.subscriptionCategories || (store.subscriptionCategories).length === 0) {
      store.subscriptionCategories = [
        { id: 'cat-platform', name: { ar: 'خدمات المنصة (API)', en: 'Platform APIs' },     icon: 'cloud',     color: '#06b6d4', builtin: true },
        { id: 'cat-iphone',   name: { ar: 'تطبيقات iPhone',   en: 'iPhone apps' },         icon: 'smartphone', color: '#8b5cf6' },
        { id: 'cat-cloud',    name: { ar: 'تخزين سحابي',     en: 'Cloud storage' },       icon: 'hard-drive', color: '#10b981' },
        { id: 'cat-ai',       name: { ar: 'ذكاء اصطناعي',    en: 'AI services' },         icon: 'sparkles',  color: '#ec4899' },
        { id: 'cat-club',     name: { ar: 'اشتراكات نادي',   en: 'Club memberships' },    icon: 'users',     color: '#f59e0b' },
        { id: 'cat-other',    name: { ar: 'أخرى',           en: 'Other' },               icon: 'more-horizontal', color: '#6b7280' },
      ];
    }
    if (!store.subscriptions) store.subscriptions = [];
    if (!store.paymentCards) store.paymentCards = [];
    const apiKeyToSub: Record<string, { name: string; provider: string; dashboardUrl: string; cycle: BillingCycle; amount: number }> = {
      mapboxToken:      { name: 'Mapbox',         provider: 'Mapbox',        dashboardUrl: 'https://account.mapbox.com/',                 cycle: 'pay-as-you-go', amount: 0 },
      maptilerKey:      { name: 'MapTiler',       provider: 'MapTiler',      dashboardUrl: 'https://cloud.maptiler.com/account/keys/',     cycle: 'monthly',       amount: 0 },
      geoapifyKey:      { name: 'Geoapify',       provider: 'Geoapify',      dashboardUrl: 'https://myprojects.geoapify.com/',             cycle: 'monthly',       amount: 0 },
      thunderforestKey: { name: 'Thunderforest',  provider: 'Thunderforest', dashboardUrl: 'https://www.thunderforest.com/dashboard/',     cycle: 'monthly',       amount: 0 },
      elevenlabsApiKey: { name: 'ElevenLabs',     provider: 'ElevenLabs',    dashboardUrl: 'https://elevenlabs.io/app/subscription',       cycle: 'monthly',       amount: 22 },
      stableAudioKey:   { name: 'Stable Audio',   provider: 'Stability AI',  dashboardUrl: 'https://platform.stability.ai/account/billing', cycle: 'pay-as-you-go', amount: 0 },
      groqApiKey:       { name: 'Groq Whisper',   provider: 'Groq',          dashboardUrl: 'https://console.groq.com/keys',                cycle: 'pay-as-you-go', amount: 0 },
      lumaApiKey:       { name: 'Luma AI',        provider: 'Luma Labs',     dashboardUrl: 'https://lumalabs.ai/api/keys',                 cycle: 'pay-as-you-go', amount: 0 },
    };
    const apiKeys = (store.apiKeys || {}) as Record<string, string>;
    for (const [field, meta] of Object.entries(apiKeyToSub)) {
      if (!apiKeys[field]) continue;
      const existing = (store.subscriptions as SubscriptionRecord[]).find((s) => s.linkedApiField === field);
      if (existing) continue;
      const today = new Date().toISOString().slice(0, 10);
      let amount = 0;
      let cycle: BillingCycle = 'pay-as-you-go';
      let nextBilling: string | undefined;
      let startDate: string | undefined;
      let tier: 'free' | 'trial' | 'paid' = 'trial';
      let monthlyLimit: number | undefined;
      let limitUnit = '';
      if (field === 'mapboxToken')        { monthlyLimit = 50000;  limitUnit = 'static maps'; }
      else if (field === 'maptilerKey')   { monthlyLimit = 100000; limitUnit = 'tiles'; }
      else if (field === 'geoapifyKey')   { monthlyLimit = 90000;  limitUnit = 'requests'; }
      else if (field === 'thunderforestKey') { monthlyLimit = 150000; limitUnit = 'tiles'; }
      else if (field === 'groqApiKey')    { monthlyLimit = 432000; limitUnit = 'requests'; }
      else if (field === 'stableAudioKey'){ monthlyLimit = 25;    limitUnit = 'credits'; }
      else if (field === 'lumaApiKey')    { tier = 'paid'; }
      else if (field === 'elevenlabsApiKey') {
        amount = 22; cycle = 'monthly';
        startDate = '2026-04-15';
        nextBilling = '2026-05-14';
        tier = 'paid';
        monthlyLimit = 100000; limitUnit = 'characters';
      }
      const sub: SubscriptionRecord = {
        id: 'sub-' + crypto.randomUUID().slice(0, 8),
        name: meta.name, provider: meta.provider, categoryId: 'cat-platform',
        tier, monthlyLimit, limitUnit,
        billingCycle: cycle, amount, currency: 'USD',
        startDate, nextBillingDate: nextBilling, dashboardUrl: meta.dashboardUrl,
        status: 'active', linkedApiField: field,
        priceHistory: [{ date: today, amount, currency: 'USD', reason: 'Initial' }],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      (store.subscriptions as SubscriptionRecord[]).push(sub);
    }
    saveStore();
  };
}

/**
 * All /api/subscriptions/* handlers + /api/subscriptions/usage-overview,
 * /api/subscriptions/stats, /api/subscriptions/:id/usage,
 * /api/subscriptions/:id/action/:action, /api/subscriptions/suggestions.
 *
 * NOTE: The 30-minute scheduler (`checkSubscriptionRules` + setInterval) stays
 * inline in index.ts per REL-01 stage 2d task notes.
 */
export function registerSubscriptionsRoutes(
  app: Hono,
  deps: SubscriptionsRoutesDeps,
  ensureSubscriptionDefaults: () => void
): void {
  const { getStore, saveStore, capabilityCheckers, subFilesDir } = deps;
  fs.mkdirSync(subFilesDir, { recursive: true });

  // Suggestions
  app.get('/api/subscriptions/suggestions', (c) => {
    return c.json([
      { name: 'Claude (Anthropic)', provider: 'Anthropic',   categoryHint: 'cat-ai',       cycle: 'monthly',       amount: 20, currency: 'USD', dashboardUrl: 'https://console.anthropic.com/settings/billing' },
      { name: 'ChatGPT Plus',       provider: 'OpenAI',      categoryHint: 'cat-ai',       cycle: 'monthly',       amount: 20, currency: 'USD', dashboardUrl: 'https://chat.openai.com/#settings/Subscription' },
      { name: 'OpenAI API',         provider: 'OpenAI',      categoryHint: 'cat-platform', cycle: 'pay-as-you-go', amount: 0,  currency: 'USD', dashboardUrl: 'https://platform.openai.com/account/billing' },
      { name: 'Gemini Advanced',    provider: 'Google',      categoryHint: 'cat-ai',       cycle: 'monthly',       amount: 20, currency: 'USD', dashboardUrl: 'https://one.google.com/about' },
      { name: 'Cursor',             provider: 'Cursor',      categoryHint: 'cat-ai',       cycle: 'monthly',       amount: 20, currency: 'USD', dashboardUrl: 'https://cursor.com/settings' },
      { name: 'GitHub Copilot',     provider: 'GitHub',      categoryHint: 'cat-platform', cycle: 'monthly',       amount: 10, currency: 'USD', dashboardUrl: 'https://github.com/settings/billing' },
      { name: 'Vercel Pro',         provider: 'Vercel',      categoryHint: 'cat-platform', cycle: 'monthly',       amount: 20, currency: 'USD', dashboardUrl: 'https://vercel.com/account/billing' },
      { name: 'iCloud+',            provider: 'Apple',       categoryHint: 'cat-cloud',    cycle: 'monthly',       amount: 0.99, currency: 'USD', dashboardUrl: 'https://support.apple.com/icloud' },
      { name: 'Google One',         provider: 'Google',      categoryHint: 'cat-cloud',    cycle: 'monthly',       amount: 1.99, currency: 'USD', dashboardUrl: 'https://one.google.com/' },
      { name: 'Spotify Premium',    provider: 'Spotify',     categoryHint: 'cat-other',    cycle: 'monthly',       amount: 9.99, currency: 'USD', dashboardUrl: 'https://www.spotify.com/account/subscription/' },
      { name: 'Netflix',            provider: 'Netflix',     categoryHint: 'cat-other',    cycle: 'monthly',       amount: 15.49, currency: 'USD', dashboardUrl: 'https://www.netflix.com/youraccount' },
      { name: 'YouTube Premium',    provider: 'YouTube',     categoryHint: 'cat-other',    cycle: 'monthly',       amount: 13.99, currency: 'USD', dashboardUrl: 'https://www.youtube.com/paid_memberships' },
    ]);
  });

  // Categories
  app.get('/api/subscriptions/categories', (c) => {
    ensureSubscriptionDefaults();
    return c.json((getStore() as StoreSubs).subscriptionCategories || []);
  });
  app.post('/api/subscriptions/categories', async (c) => {
    const store = getStore() as StoreSubs;
    const body = await c.req.json<Partial<SubCategoryRecord>>();
    if (!body.name?.ar) return c.json({ error: 'name.ar required' }, 400);
    if (!store.subscriptionCategories) store.subscriptionCategories = [];
    const cat: SubCategoryRecord = { id: 'cat-' + crypto.randomUUID().slice(0, 6), name: { ar: body.name.ar, en: body.name.en || body.name.ar }, icon: body.icon, color: body.color };
    store.subscriptionCategories.push(cat);
    saveStore();
    return c.json(cat);
  });
  app.put('/api/subscriptions/categories/:id', async (c) => {
    const store = getStore() as StoreSubs;
    const id = c.req.param('id');
    const body = await c.req.json<Partial<SubCategoryRecord>>();
    const cat = (store.subscriptionCategories || []).find((x) => x.id === id);
    if (!cat) return c.json({ error: 'not found' }, 404);
    if (cat.builtin) return c.json({ error: 'built-in category cannot be modified' }, 400);
    if (body.name) cat.name = { ar: body.name.ar || cat.name.ar, en: body.name.en || cat.name.en };
    if (body.icon !== undefined) cat.icon = body.icon;
    if (body.color !== undefined) cat.color = body.color;
    saveStore();
    return c.json(cat);
  });
  app.delete('/api/subscriptions/categories/:id', (c) => {
    const store = getStore() as StoreSubs;
    const id = c.req.param('id');
    const idx = (store.subscriptionCategories || []).findIndex((x) => x.id === id);
    if (idx === -1) return c.json({ error: 'not found' }, 404);
    if ((store.subscriptionCategories as SubCategoryRecord[])[idx].builtin) return c.json({ error: 'built-in' }, 400);
    for (const s of (store.subscriptions || []) as SubscriptionRecord[]) { if (s.categoryId === id) s.categoryId = undefined; }
    (store.subscriptionCategories as SubCategoryRecord[]).splice(idx, 1);
    saveStore();
    return c.json({ ok: true });
  });

  // Cards
  app.get('/api/subscriptions/cards', (c) => {
    ensureSubscriptionDefaults();
    return c.json((getStore() as StoreSubs).paymentCards || []);
  });
  app.post('/api/subscriptions/cards', async (c) => {
    const store = getStore() as StoreSubs;
    const body = await c.req.json<Partial<PaymentCardRecord>>();
    if (!body.label) return c.json({ error: 'label required' }, 400);
    const card: PaymentCardRecord = { id: 'card-' + crypto.randomUUID().slice(0, 6), label: body.label, last4: body.last4, color: body.color || '#6366f1', notes: body.notes, createdAt: new Date().toISOString() };
    if (!store.paymentCards) store.paymentCards = [];
    store.paymentCards.push(card);
    saveStore();
    return c.json(card);
  });
  app.put('/api/subscriptions/cards/:id', async (c) => {
    const store = getStore() as StoreSubs;
    const id = c.req.param('id');
    const body = await c.req.json<Partial<PaymentCardRecord>>();
    const card = (store.paymentCards || []).find((x) => x.id === id);
    if (!card) return c.json({ error: 'not found' }, 404);
    Object.assign(card, body, { id: card.id, createdAt: card.createdAt });
    saveStore();
    return c.json(card);
  });
  app.delete('/api/subscriptions/cards/:id', (c) => {
    const store = getStore() as StoreSubs;
    const id = c.req.param('id');
    const idx = (store.paymentCards || []).findIndex((x) => x.id === id);
    if (idx === -1) return c.json({ error: 'not found' }, 404);
    for (const s of (store.subscriptions || []) as SubscriptionRecord[]) { if (s.paymentCardId === id) s.paymentCardId = undefined; }
    (store.paymentCards as PaymentCardRecord[]).splice(idx, 1);
    saveStore();
    return c.json({ ok: true });
  });

  // Subscriptions CRUD
  app.get('/api/subscriptions', (c) => {
    ensureSubscriptionDefaults();
    return c.json((getStore() as StoreSubs).subscriptions || []);
  });
  app.post('/api/subscriptions', async (c) => {
    ensureSubscriptionDefaults();
    const store = getStore() as StoreSubs;
    const body = await c.req.json<Partial<SubscriptionRecord>>();
    if (!body.name) return c.json({ error: 'name required' }, 400);
    const now = new Date().toISOString();
    const sub: SubscriptionRecord = {
      id: 'sub-' + crypto.randomUUID().slice(0, 8),
      name: body.name, provider: body.provider, categoryId: body.categoryId,
      billingCycle: body.billingCycle || 'monthly',
      amount: body.amount ?? 0, currency: body.currency || 'USD',
      startDate: body.startDate, nextBillingDate: body.nextBillingDate,
      dashboardUrl: body.dashboardUrl, paymentCardId: body.paymentCardId,
      notes: body.notes, status: body.status || 'active',
      priceHistory: [{ date: now.slice(0, 10), amount: body.amount ?? 0, currency: body.currency || 'USD', reason: 'Initial' }],
      attachments: [],
      createdAt: now, updatedAt: now,
    };
    (store.subscriptions as SubscriptionRecord[]).push(sub);
    saveStore();
    return c.json(sub);
  });
  app.put('/api/subscriptions/:id', async (c) => {
    const store = getStore() as StoreSubs;
    const id = c.req.param('id');
    const body = await c.req.json<Partial<SubscriptionRecord>>();
    const sub = (store.subscriptions || []).find((x) => x.id === id);
    if (!sub) return c.json({ error: 'not found' }, 404);
    if (body.amount !== undefined && body.amount !== sub.amount) {
      if (!sub.priceHistory) sub.priceHistory = [];
      sub.priceHistory.push({ date: new Date().toISOString().slice(0, 10), amount: body.amount, currency: body.currency || sub.currency, reason: 'Price change' });
    }
    Object.assign(sub, body, { id: sub.id, createdAt: sub.createdAt, updatedAt: new Date().toISOString() });
    saveStore();
    return c.json(sub);
  });
  app.delete('/api/subscriptions/:id', (c) => {
    const store = getStore() as StoreSubs;
    const id = c.req.param('id');
    const idx = (store.subscriptions || []).findIndex((x) => x.id === id);
    if (idx === -1) return c.json({ error: 'not found' }, 404);
    (store.subscriptions as SubscriptionRecord[]).splice(idx, 1);
    saveStore();
    return c.json({ ok: true });
  });

  // Attachments
  app.post('/api/subscriptions/:id/attachments', async (c) => {
    const store = getStore() as StoreSubs;
    const id = c.req.param('id');
    const sub = (store.subscriptions || []).find((x) => x.id === id);
    if (!sub) return c.json({ error: 'not found' }, 404);
    const body = await c.req.parseBody();
    const file = body.file;
    if (!file || typeof file === 'string') return c.json({ error: 'file required' }, 400);
    const f = file as File;
    const attId = crypto.randomUUID().slice(0, 8);
    const safeName = `${attId}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    fs.writeFileSync(path.join(subFilesDir, safeName), Buffer.from(await f.arrayBuffer()));
    if (!sub.attachments) sub.attachments = [];
    sub.attachments.push({ id: attId, filename: safeName, uploadedAt: new Date().toISOString() });
    sub.updatedAt = new Date().toISOString();
    saveStore();
    return c.json(sub);
  });
  app.get('/api/subscriptions/attachments/:filename', (c) => {
    const filename = c.req.param('filename');
    if (filename.includes('..') || filename.includes('/')) return c.json({ error: 'bad name' }, 400);
    const p = path.join(subFilesDir, filename);
    if (!fs.existsSync(p)) return c.json({ error: 'not found' }, 404);
    return new Response(fs.readFileSync(p), { headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${filename}"` } });
  });

  // Per-sub notification rules
  app.post('/api/subscriptions/:id/notifications', async (c) => {
    const store = getStore() as StoreSubs;
    const id = c.req.param('id');
    const sub = (store.subscriptions || []).find((x) => x.id === id);
    if (!sub) return c.json({ error: 'not found' }, 404);
    const body = await c.req.json<Partial<NotificationRule>>();
    if (!body.type) return c.json({ error: 'type required' }, 400);
    const rule: NotificationRule = {
      id: 'rule-' + crypto.randomUUID().slice(0, 6),
      type: body.type as NotificationRuleType,
      threshold: body.threshold,
      days: body.days,
      minRemaining: body.minRemaining,
      date: body.date,
      message: body.message,
      enabled: body.enabled !== false,
    };
    if (!sub.notifications) sub.notifications = [];
    sub.notifications.push(rule);
    sub.updatedAt = new Date().toISOString();
    saveStore();
    return c.json(rule);
  });
  app.put('/api/subscriptions/:id/notifications/:ruleId', async (c) => {
    const store = getStore() as StoreSubs;
    const sub = (store.subscriptions || []).find((x) => x.id === c.req.param('id'));
    if (!sub || !sub.notifications) return c.json({ error: 'not found' }, 404);
    const r = sub.notifications.find((n) => n.id === c.req.param('ruleId'));
    if (!r) return c.json({ error: 'rule not found' }, 404);
    const body = await c.req.json<Partial<NotificationRule>>();
    Object.assign(r, body, { id: r.id });
    sub.updatedAt = new Date().toISOString();
    saveStore();
    return c.json(r);
  });
  app.delete('/api/subscriptions/:id/notifications/:ruleId', (c) => {
    const store = getStore() as StoreSubs;
    const sub = (store.subscriptions || []).find((x) => x.id === c.req.param('id'));
    if (!sub || !sub.notifications) return c.json({ error: 'not found' }, 404);
    sub.notifications = sub.notifications.filter((n) => n.id !== c.req.param('ruleId'));
    saveStore();
    return c.json({ ok: true });
  });

  // Usage overview
  app.get('/api/subscriptions/usage-overview', async (c) => {
    ensureSubscriptionDefaults();
    const store = getStore() as StoreSubs;
    const subs = ((store.subscriptions || []) as SubscriptionRecord[]).filter((s) => s.status === 'active' && s.monthlyLimit && s.linkedApiField);
    const apiKeys = (store.apiKeys || {}) as Record<string, string>;
    const results: Array<{ id: string; name: string; tier: string; used: number; limit: number; unit: string; pct: number; status: 'ok' | 'warn' | 'critical' }> = [];
    await Promise.all(subs.map(async (s) => {
      const key = apiKeys[s.linkedApiField!];
      if (!key) return;
      const checker = capabilityCheckers[s.linkedApiField!];
      if (!checker) return;
      try {
        const caps = await checker(key);
        let used = 0;
        const limit = s.monthlyLimit!;
        for (const cap of Object.values(caps)) {
          const m = cap.message?.match(/(\d+(?:[.,]\d+)*)\s*(?:characters?|credits?|tiles?|requests?)\s*remaining/i);
          if (m) {
            const remaining = parseFloat(m[1].replace(/,/g, ''));
            used = Math.max(0, limit - remaining);
            break;
          }
          const m2 = cap.message?.match(/(\d+(?:[.,]\d+)*)\s*credits?\s*available/i);
          if (m2) {
            const avail = parseFloat(m2[1].replace(/,/g, ''));
            used = Math.max(0, limit - avail);
            break;
          }
        }
        const pct = limit > 0 ? (used / limit) * 100 : 0;
        const status = pct >= 90 ? 'critical' : pct >= 70 ? 'warn' : 'ok';
        results.push({ id: s.id, name: s.name, tier: s.tier || 'trial', used, limit, unit: s.limitUnit || '', pct, status });
      } catch { /* ignore */ }
    }));
    results.sort((a, b) => b.pct - a.pct);
    return c.json(results);
  });

  // Quick action
  app.post('/api/subscriptions/:id/action/:action', async (c) => {
    const store = getStore() as StoreSubs;
    const id = c.req.param('id');
    const action = c.req.param('action');
    const sub = (store.subscriptions || []).find((x) => x.id === id);
    if (!sub) return c.json({ error: 'not found' }, 404);
    const body = await c.req.json<{ amount?: number; nextBillingDate?: string }>().catch(() => ({} as { amount?: number; nextBillingDate?: string }));
    const today = new Date().toISOString().slice(0, 10);
    if (action === 'pause') sub.status = 'paused';
    else if (action === 'cancel') sub.status = 'cancelled';
    else if (action === 'renew') {
      sub.status = 'active';
      if (sub.billingCycle === 'monthly') {
        const d = new Date(sub.nextBillingDate || today);
        d.setMonth(d.getMonth() + 1);
        sub.nextBillingDate = d.toISOString().slice(0, 10);
      } else if (sub.billingCycle === 'yearly') {
        const d = new Date(sub.nextBillingDate || today);
        d.setFullYear(d.getFullYear() + 1);
        sub.nextBillingDate = d.toISOString().slice(0, 10);
      }
    } else if (action === 'topup') {
      const amt = body.amount ?? 0;
      if (amt <= 0) return c.json({ error: 'amount required for top-up' }, 400);
      if (!sub.priceHistory) sub.priceHistory = [];
      sub.priceHistory.push({ date: today, amount: amt, currency: sub.currency, reason: 'Top-up' });
    } else {
      return c.json({ error: 'unknown action' }, 400);
    }
    sub.updatedAt = new Date().toISOString();
    saveStore();
    return c.json(sub);
  });

  // Per-sub usage
  app.get('/api/subscriptions/:id/usage', async (c) => {
    const store = getStore() as StoreSubs;
    const id = c.req.param('id');
    const sub = (store.subscriptions || []).find((x) => x.id === id);
    if (!sub) return c.json({ error: 'not found' }, 404);
    if (!sub.linkedApiField) return c.json({ usage: null });
    const apiKeys = (store.apiKeys || {}) as Record<string, string>;
    const key = apiKeys[sub.linkedApiField];
    if (!key) return c.json({ usage: null });
    const checker = capabilityCheckers[sub.linkedApiField];
    if (!checker) return c.json({ usage: null });
    const caps = await checker(key);
    let used: number | null = null;
    let limit: number | null = null;
    let unit = '';
    for (const cap of Object.values(caps)) {
      const m = cap.message?.match(/(\d+(?:[.,]\d+)*)\s*(characters?|credits?|tiles?|requests?)/i);
      if (m) {
        const num = parseFloat(m[1].replace(/,/g, ''));
        unit = m[2];
        if (cap.message.includes('remaining')) {
          if (cap.message.includes('creator')) limit = 100000;
          else if (sub.linkedApiField === 'elevenlabsApiKey') limit = 10000;
          else limit = num + 100;
          used = limit - num;
        } else if (cap.message.includes('available')) {
          limit = num;
          used = 0;
        }
        break;
      }
    }
    return c.json({ usage: { used, limit, unit, capabilities: caps } });
  });

  // Stats
  app.get('/api/subscriptions/stats', (c) => {
    ensureSubscriptionDefaults();
    const store = getStore() as StoreSubs;
    const subs = ((store.subscriptions || []) as SubscriptionRecord[]).filter((s) => s.status === 'active');
    const monthlyEq = (s: SubscriptionRecord): number => {
      if (s.billingCycle === 'monthly') return s.amount;
      if (s.billingCycle === 'yearly') return s.amount / 12;
      if (s.billingCycle === 'quarterly') return s.amount / 3;
      return 0;
    };
    const totalMonthly = subs.reduce((sum, s) => sum + monthlyEq(s), 0);
    const totalYearly = totalMonthly * 12;
    const byCategory: Record<string, number> = {};
    const byCard: Record<string, number> = {};
    const byCycle: Record<string, number> = {};
    for (const s of subs) {
      const m = monthlyEq(s);
      if (s.categoryId) byCategory[s.categoryId] = (byCategory[s.categoryId] || 0) + m;
      if (s.paymentCardId) byCard[s.paymentCardId] = (byCard[s.paymentCardId] || 0) + m;
      byCycle[s.billingCycle] = (byCycle[s.billingCycle] || 0) + m;
    }
    const upcoming = subs
      .filter((s) => s.nextBillingDate)
      .map((s) => ({ id: s.id, name: s.name, date: s.nextBillingDate!, amount: s.amount, currency: s.currency }))
      .filter((s) => {
        const d = new Date(s.date).getTime() - Date.now();
        return d >= 0 && d <= 30 * 24 * 60 * 60 * 1000;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return c.json({ totalMonthly, totalYearly, count: subs.length, byCategory, byCard, byCycle, upcoming });
  });
}
