// Automated digest notifications — extracted from index.ts (REL-01 stage 2d final trim).

import type { StoreData, NotificationRecord } from '../store/types.js';

export interface AutomatedNotificationsDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  createNotification: (input: {
    agentId: string;
    title: string;
    message: string;
    type?: NotificationRecord['type'];
    priority?: NotificationRecord['priority'];
    link?: string;
    linkLabel?: string;
  }) => NotificationRecord | null;
}

export function createAutomatedNotifications(deps: AutomatedNotificationsDeps) {
  const { getStore, saveStore, createNotification } = deps;

  function sendAutomatedNotifications() {
    const store = getStore();
    if (!store.agentNotificationSettings) store.agentNotificationSettings = [];
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    for (const settings of store.agentNotificationSettings) {
      if (!settings.enabled) continue;
      if (!settings.dailyDigestTime) continue;
      if (settings.dailyDigestTime !== currentHHMM) continue;
      if (settings.lastDigestAt && settings.lastDigestAt.startsWith(todayKey)) continue;

      if (settings.agentId === 'tasks-agent') {
        const tasks = store.tasks || [];
        const pending = tasks.filter(t => !t.completed);
        const today = now.toISOString().slice(0, 10);
        const overdue = pending.filter(t => t.dueDate && t.dueDate < today);
        const dueToday = pending.filter(t => t.dueDate === today);
        if (overdue.length > 0 || dueToday.length > 0) {
          const parts: string[] = [];
          if (overdue.length > 0) parts.push(`${overdue.length} \u0645\u062a\u0623\u062e\u0631\u0629`);
          if (dueToday.length > 0) parts.push(`${dueToday.length} \u0645\u0633\u062a\u062d\u0642\u0629 \u0627\u0644\u064a\u0648\u0645`);
          createNotification({
            agentId: 'tasks-agent',
            title: '\u062a\u0630\u0643\u064a\u0631 \u0628\u0627\u0644\u0645\u0647\u0627\u0645',
            message: `\u0639\u0646\u062f\u0643 ${parts.join(' \u0648 ')}`,
            type: 'reminder',
            link: '/tasks',
            priority: overdue.length > 0 ? 'high' : 'normal',
          });
        }
        settings.lastDigestAt = now.toISOString();
      } else if (settings.agentId === 'manager') {
        const recentErrors = (store.activityLog || []).filter(
          a => a.type === 'error' && new Date(a.timestamp).getTime() > now.getTime() - 24 * 3600 * 1000,
        );
        if (recentErrors.length > 0) {
          createNotification({
            agentId: 'manager',
            title: '\u0645\u0644\u062e\u0635 \u064a\u0648\u0645\u064a',
            message: `\u062d\u062f\u062b\u062a ${recentErrors.length} \u0623\u062e\u0637\u0627\u0621 \u0641\u064a \u0622\u062e\u0631 24 \u0633\u0627\u0639\u0629`,
            type: 'info',
            link: '/dashboard',
            priority: 'normal',
          });
        }
        settings.lastDigestAt = now.toISOString();
      } else {
        settings.lastDigestAt = now.toISOString();
      }
    }
    saveStore();
  }

  return { sendAutomatedNotifications };
}
