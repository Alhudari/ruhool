// Notification service — extracted from index.ts (REL-01 stage 2d final trim).
// Provides createNotification/getAgentNotificationSettings/isInQuietHours plus
// the DEFAULT_NOTIFICATION_SETTINGS table. All deps injected.

import crypto from 'node:crypto';
import type {
  NotificationRecord,
  AgentNotificationSettings,
  StoreData,
} from '../store/types.js';

export const DEFAULT_NOTIFICATION_SETTINGS: Record<string, Partial<AgentNotificationSettings>> = {
  manager: { enabled: true, instructions: '\u0627\u0644\u0645\u0646\u0628\u0647 \u0627\u0644\u0639\u0627\u0645 \u2014 \u0627\u0644\u0631\u062d\u0648\u0644 \u062a\u0646\u0628\u0647 \u0639\u0646 \u0627\u0644\u0645\u0647\u0645 \u0641\u0642\u0637', triggers: { onAgentFinish: true, onError: true } },
  'tasks-agent': { enabled: true, instructions: '\u062a\u0630\u0643\u064a\u0631 \u0628\u0627\u0644\u0645\u0647\u0627\u0645 \u0627\u0644\u0645\u0639\u0644\u0642\u0629', triggers: { onTaskOverdue: true }, dailyDigestTime: '09:00' },
  research: { enabled: false, instructions: '', triggers: {} },
  'reading-helper': { enabled: false, instructions: '', triggers: {} },
  'writing-critic': { enabled: false, instructions: '', triggers: {} },
  comparator: { enabled: false, instructions: '', triggers: {} },
  architect: { enabled: true, instructions: '\u062a\u0646\u0628\u064a\u0647\u0627\u062a \u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0648\u0643\u0644\u0627\u0621', triggers: { onError: true } },
  'content-creator': { enabled: false, instructions: '', triggers: {} },
  creative: { enabled: true, instructions: '\u0639\u0646\u062f \u0627\u0646\u062a\u0647\u0627\u0621 \u062a\u0635\u062f\u064a\u0631 \u0641\u064a\u062f\u064a\u0648', triggers: { onAgentFinish: true } },
};

export interface NotificationServiceDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  broadcastNotification: (record: NotificationRecord) => void;
  logActivity: (...args: unknown[]) => unknown;
}

export interface NotificationService {
  getAgentNotificationSettings: (agentId: string) => AgentNotificationSettings;
  isInQuietHours: (settings: AgentNotificationSettings, date?: Date) => boolean;
  createNotification: (input: {
    agentId: string;
    title: string;
    message: string;
    type?: NotificationRecord['type'];
    link?: string;
    linkLabel?: string;
    priority?: NotificationRecord['priority'];
    relatedId?: string;
    metadata?: Record<string, unknown>;
    bypassSettings?: boolean;
  }) => NotificationRecord | null;
}

export function isInQuietHours(settings: AgentNotificationSettings, date: Date = new Date()): boolean {
  if (!settings.quietHoursStart || !settings.quietHoursEnd) return false;
  const [sH, sM] = settings.quietHoursStart.split(':').map(Number);
  const [eH, eM] = settings.quietHoursEnd.split(':').map(Number);
  const now = date.getHours() * 60 + date.getMinutes();
  const start = sH * 60 + sM;
  const end = eH * 60 + eM;
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

export function createNotificationService(deps: NotificationServiceDeps): NotificationService {
  const { getStore, saveStore, broadcastNotification, logActivity } = deps;

  function getAgentNotificationSettings(agentId: string): AgentNotificationSettings {
    const store = getStore();
    if (!store.agentNotificationSettings) store.agentNotificationSettings = [];
    let settings = store.agentNotificationSettings.find(s => s.agentId === agentId);
    if (!settings) {
      const defaults = DEFAULT_NOTIFICATION_SETTINGS[agentId] || { enabled: false, instructions: '', triggers: {} };
      settings = {
        agentId,
        enabled: defaults.enabled ?? false,
        instructions: defaults.instructions ?? '',
        triggers: defaults.triggers ?? {},
        dailyDigestTime: defaults.dailyDigestTime,
        schedule: defaults.schedule,
        quietHoursStart: defaults.quietHoursStart,
        quietHoursEnd: defaults.quietHoursEnd,
      };
      store.agentNotificationSettings.push(settings);
    }
    return settings;
  }

  function createNotification(input: {
    agentId: string;
    title: string;
    message: string;
    type?: NotificationRecord['type'];
    link?: string;
    linkLabel?: string;
    priority?: NotificationRecord['priority'];
    relatedId?: string;
    metadata?: Record<string, unknown>;
    bypassSettings?: boolean;
  }): NotificationRecord | null {
    const store = getStore();
    if (!store.notificationRecords) store.notificationRecords = [];
    if (!input.bypassSettings) {
      const settings = getAgentNotificationSettings(input.agentId);
      if (!settings.enabled) return null;
      if (isInQuietHours(settings) && input.priority !== 'high') return null;
    }
    if (!input.title || !input.message) return null;
    const record: NotificationRecord = {
      id: crypto.randomUUID(),
      agentId: input.agentId,
      title: input.title,
      message: input.message,
      type: input.type || 'info',
      link: input.link,
      linkLabel: input.linkLabel,
      read: false,
      priority: input.priority || 'normal',
      createdAt: new Date().toISOString(),
      relatedId: input.relatedId,
      metadata: input.metadata,
    };
    store.notificationRecords.push(record);
    if (store.notificationRecords.length > 500) {
      store.notificationRecords = store.notificationRecords.slice(-500);
    }
    saveStore();
    (logActivity as (...args: unknown[]) => unknown)('system', `Notification: ${record.title}`, record.message, {
      agentId: record.agentId,
      metadata: { notificationId: record.id, type: record.type },
    });
    broadcastNotification(record);
    return record;
  }

  return {
    getAgentNotificationSettings,
    isInQuietHours: (s, d) => isInQuietHours(s, d),
    createNotification,
  };
}
