/**
 * Notify action parser. Extracted from index.ts (REL-01 stage 2d).
 *
 * Parses [NOTIFY] {...} markers from assistant output and creates notification
 * records via the injected `createNotification` dep.
 */
import type { NotificationRecord } from '../../store/types.js';

export interface NotifyActionsDeps {
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

export function createNotifyActions(deps: NotifyActionsDeps) {
  const { createNotification } = deps;
  return function parseNotifyActions(response: string, agentId: string): NotificationRecord[] {
    const created: NotificationRecord[] = [];
    const matches = response.matchAll(/\[NOTIFY\]\s*(\{[\s\S]*?\})/g);
    for (const match of matches) {
      try {
        const data = JSON.parse(match[1]);
        const rec = createNotification({
          agentId,
          title: data.title || '',
          message: data.message || '',
          type: data.type || 'info',
          link: data.link,
          linkLabel: data.linkLabel,
          priority: data.priority || 'normal',
          relatedId: data.relatedId,
          metadata: data.metadata,
        });
        if (rec) created.push(rec);
      } catch { /* skip malformed */ }
    }
    return created;
  };
}
