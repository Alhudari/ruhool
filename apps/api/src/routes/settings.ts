import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';
import {
  buildApiKeysMaskedPayload,
  applyApiKeysUpdate,
  isKnownApiKeyField,
} from '../services/api-keys.js';
import type { CapabilityResult } from '../services/capability-checkers.js';

export interface SettingsRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

export interface ApiKeysSettingsDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  capabilityCheckers: Record<string, (key: string) => Promise<Record<string, CapabilityResult>>>;
  getApiKey: (field: string) => string | undefined;
}

export interface NotificationsSettingsDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

/**
 * All /api/settings/api-keys* routes (merged here per REL-01 stage 2d):
 *   GET   /api/settings/api-keys              (masked list)
 *   PUT   /api/settings/api-keys              (write-through)
 *   DELETE /api/settings/api-keys/:name
 *   POST  /api/settings/api-keys/:name/check  (single capability check)
 *   GET   /api/settings/api-keys/capabilities (all-keys check)
 */
export function registerApiKeysSettingsRoutes(app: Hono, deps: ApiKeysSettingsDeps): void {
  const { getStore, saveStore, capabilityCheckers, getApiKey } = deps;

  app.get('/api/settings/api-keys', (c) => c.json(buildApiKeysMaskedPayload(getStore())));

  app.put('/api/settings/api-keys', async (c) => {
    const body = await c.req.json<Record<string, string>>();
    applyApiKeysUpdate(getStore(), body);
    saveStore();
    return c.json({ ok: true });
  });

  app.delete('/api/settings/api-keys/:name', (c) => {
    const store = getStore() as unknown as { apiKeys?: Record<string, unknown> };
    const n = c.req.param('name');
    if (!store.apiKeys) store.apiKeys = {};
    if (!isKnownApiKeyField(n)) return c.json({ error: 'Unknown key' }, 400);
    delete store.apiKeys[n];
    saveStore();
    return c.json({ ok: true });
  });

  app.post('/api/settings/api-keys/:name/check', async (c) => {
    const name = c.req.param('name');
    const checker = capabilityCheckers[name];
    if (!checker) return c.json({ error: 'No checker for this key' }, 400);
    const value = getApiKey(name);
    if (!value) return c.json({ ok: false, capabilities: {}, message: 'Key not set' });
    const caps = await checker(value);
    const anyOk = Object.values(caps).some((cap) => cap.ok);
    return c.json({ ok: anyOk, capabilities: caps });
  });

  app.get('/api/settings/api-keys/capabilities', async (c) => {
    const store = getStore() as unknown as { apiKeys?: Record<string, string> };
    const k = (store.apiKeys || {}) as Record<string, string>;
    const out: Record<string, { ok: boolean; capabilities: Record<string, CapabilityResult> }> = {};
    await Promise.all(Object.entries(capabilityCheckers).map(async ([field, fn]) => {
      const v = k[field];
      if (!v) { out[field] = { ok: false, capabilities: {} }; return; }
      const caps = await fn(v);
      out[field] = { ok: Object.values(caps).some((cap) => cap.ok), capabilities: caps };
    }));
    return c.json(out);
  });
}

type NotificationsShape = {
  smtpHost?: string; smtpPort?: number; smtpUser?: string; smtpPass?: string; smtpFrom?: string;
  slackWebhookUrl?: string; desktopEnabled?: boolean;
};

/**
 * /api/settings/notifications GET + PUT — notification channel config
 * (SMTP + Slack + desktop toggle).
 */
export function registerNotificationsSettingsRoutes(app: Hono, deps: NotificationsSettingsDeps): void {
  const { getStore, saveStore } = deps;

  app.get('/api/settings/notifications', (c) => {
    const store = getStore() as unknown as { notifications?: NotificationsShape };
    const settings = store.notifications || {};
    return c.json({
      smtpHost: settings.smtpHost || '',
      smtpPort: settings.smtpPort || 587,
      smtpUser: settings.smtpUser || '',
      smtpFrom: settings.smtpFrom || '',
      slackWebhookUrl: settings.slackWebhookUrl || '',
      desktopEnabled: settings.desktopEnabled ?? true,
      hasSmtpPass: !!settings.smtpPass,
    });
  });

  app.put('/api/settings/notifications', async (c) => {
    const store = getStore() as unknown as { notifications?: NotificationsShape };
    const body = await c.req.json<NotificationsShape>();
    if (!store.notifications) store.notifications = {};
    const n = store.notifications;
    if (body.smtpHost !== undefined) n.smtpHost = body.smtpHost;
    if (body.smtpPort !== undefined) n.smtpPort = body.smtpPort;
    if (body.smtpUser !== undefined) n.smtpUser = body.smtpUser;
    if (body.smtpPass !== undefined && body.smtpPass !== '') n.smtpPass = body.smtpPass;
    if (body.smtpFrom !== undefined) n.smtpFrom = body.smtpFrom;
    if (body.slackWebhookUrl !== undefined) n.slackWebhookUrl = body.slackWebhookUrl;
    if (body.desktopEnabled !== undefined) n.desktopEnabled = body.desktopEnabled;
    saveStore();
    return c.json({ ok: true });
  });
}

/**
 * Simple settings endpoints: budget, cost-tier, allowed-services,
 * approval-level. Complex key management (api-keys, voice, notifications,
 * etc.) remains in index.ts for this pass.
 */
export function registerSettingsRoutes(app: Hono, deps: SettingsRoutesDeps): void {
  const { getStore, saveStore } = deps;

  // Budget
  app.get('/api/settings/budget', (c) => {
    const store = getStore();
    return c.json(store.budget || { monthlyBudget: 0, budgetAlertPercent: 75 });
  });

  app.put('/api/settings/budget', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ monthlyBudget: number; budgetAlertPercent: number }>();
    store.budget = { monthlyBudget: body.monthlyBudget || 0, budgetAlertPercent: body.budgetAlertPercent || 75 };
    saveStore();
    return c.json(store.budget);
  });

  // Cost tier
  app.get('/api/settings/cost-tier', (c) => {
    const store = getStore();
    return c.json({ tier: (store.costTier as string) || 'saving' });
  });

  app.put('/api/settings/cost-tier', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ tier: 'zero-cost' | 'saving' | 'medium' | 'max' }>();
    const allowed = ['zero-cost', 'saving', 'medium', 'max'];
    if (!allowed.includes(body.tier)) return c.json({ error: 'Invalid tier' }, 400);
    store.costTier = body.tier;
    saveStore();
    return c.json({ ok: true, tier: body.tier });
  });

  // Allowed services per tier
  app.get('/api/settings/allowed-services', (c) => {
    const store = getStore();
    const tier = (store.costTier as string) || 'saving';
    const rules: Record<string, { maxPerVideoUSD: number; audio: boolean; premiumMaps: boolean; luma: boolean; elevenlabsModel: string; stableAudio: boolean }> = {
      'zero-cost': { maxPerVideoUSD: 0,    audio: false, premiumMaps: false, luma: false, elevenlabsModel: '',                    stableAudio: false },
      'saving':    { maxPerVideoUSD: 0.01, audio: true,  premiumMaps: false, luma: false, elevenlabsModel: 'eleven_flash_v2_5',   stableAudio: false },
      'medium':    { maxPerVideoUSD: 0.05, audio: true,  premiumMaps: true,  luma: false, elevenlabsModel: 'eleven_multilingual_v2', stableAudio: true  },
      'max':       { maxPerVideoUSD: 0.50, audio: true,  premiumMaps: true,  luma: true,  elevenlabsModel: 'eleven_multilingual_v2', stableAudio: true  },
    };
    return c.json({ tier, ...rules[tier] });
  });

  // Approval level
  app.get('/api/settings/approval-level', (c) => {
    const store = getStore();
    return c.json({ level: store.approvalLevel || 'normal' });
  });

  app.put('/api/settings/approval-level', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ level: 'strict' | 'normal' | 'relaxed' }>();
    store.approvalLevel = body.level;
    saveStore();
    return c.json({ level: store.approvalLevel });
  });
}
