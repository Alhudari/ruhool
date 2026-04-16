// Subscription notification engine — extracted from index.ts (REL-01 stage 2d final trim).
// Evaluates sub.notifications rules and fires notifications via injected createNotification.

import type { StoreData } from '../store/types.js';
import type { SubscriptionRecord } from '../routes/subscriptions.js';
import type { CapabilityResult } from './capability-checkers.js';

export interface SubscriptionsEngineDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  capabilityCheckers: Record<string, (apiKey: string) => Promise<Record<string, CapabilityResult>>>;
  createNotification: (input: {
    agentId: string;
    title: string;
    message: string;
    type?: 'info' | 'reminder' | 'error' | 'success';
    priority?: 'low' | 'normal' | 'high';
    link?: string;
    linkLabel?: string;
  }) => unknown;
}

export function createSubscriptionsEngine(deps: SubscriptionsEngineDeps) {
  const { getStore, saveStore, capabilityCheckers, createNotification } = deps;

  async function checkSubscriptionRules() {
    const store = getStore() as StoreData & { subscriptions?: SubscriptionRecord[] };
    const subs = (store.subscriptions || []).filter(
      (s) => s.status === 'active' && s.notifications?.length,
    );
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const apiKeys = store.apiKeys || {};
    for (const sub of subs) {
      for (const rule of sub.notifications!) {
        if (!rule.enabled) continue;
        if (rule.lastFiredAt && rule.lastFiredAt.slice(0, 10) === today) continue;
        let shouldFire = false;
        let title = '';
        let body = '';
        if (rule.type === 'percent_used' && sub.linkedApiField && apiKeys[sub.linkedApiField]) {
          try {
            const checker = capabilityCheckers[sub.linkedApiField];
            if (checker) {
              const caps = await checker(apiKeys[sub.linkedApiField]);
              const msg = JSON.stringify(caps);
              const m = msg.match(/(\d+(?:,\d+)*)\s*characters?\s*remaining/i);
              if (m && rule.threshold) {
                const remaining = parseInt(m[1].replace(/,/g, ''));
                const monthLimit = sub.name.includes('ElevenLabs') ? 100000 : 10000;
                const usedPct = ((monthLimit - remaining) / monthLimit) * 100;
                if (usedPct >= rule.threshold) {
                  shouldFire = true;
                  title = `${sub.name}: \u0627\u0633\u062a\u062e\u062f\u0627\u0645 ${Math.round(usedPct)}%`;
                  body = `\u0648\u0635\u0644\u062a \u0644\u0640${Math.round(usedPct)}% \u0645\u0646 \u0627\u0644\u062d\u0635\u0629. \u0645\u062a\u0628\u0642\u064a ${remaining.toLocaleString()}.`;
                }
              }
            }
          } catch { /* ignore */ }
        } else if (rule.type === 'days_before_renewal' && sub.nextBillingDate && rule.days !== undefined) {
          const dayDiff = Math.floor((new Date(sub.nextBillingDate).getTime() - now.getTime()) / (24 * 3600 * 1000));
          if (dayDiff >= 0 && dayDiff <= rule.days) {
            shouldFire = true;
            title = `${sub.name}: \u062a\u062c\u062f\u064a\u062f \u062e\u0644\u0627\u0644 ${dayDiff} \u064a\u0648\u0645`;
            body = `\u0633\u064a\u062a\u0645 \u062a\u062c\u062f\u064a\u062f ${sub.name} \u064a\u0648\u0645 ${sub.nextBillingDate} \u0628\u0645\u0628\u0644\u063a ${sub.amount} ${sub.currency}.`;
          }
        } else if (rule.type === 'on_date' && rule.date) {
          if (rule.date === today) {
            shouldFire = true;
            title = `\u062a\u0630\u0643\u064a\u0631: ${sub.name}`;
            body = rule.message || '\u062a\u0630\u0643\u064a\u0631 \u0645\u062c\u062f\u0648\u0644.';
          }
        }
        if (shouldFire) {
          try {
            await createNotification({
              agentId: 'analyst',
              title,
              message: body,
              type: 'reminder',
              priority: 'normal',
              link: '/analyst',
              linkLabel: '\u0641\u062a\u062d \u0627\u0644\u0645\u062d\u0644\u0644',
            });
            rule.lastFiredAt = now.toISOString();
          } catch { /* ignore */ }
        }
      }
    }
    saveStore();
  }

  return { checkSubscriptionRules };
}
