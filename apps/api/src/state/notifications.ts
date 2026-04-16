/**
 * Notification SSE channel. Extracted from index.ts (REL-01 stage 2d).
 *
 * Uses the `sse/broadcast` Channel pattern: subscribers register listeners
 * that will be invoked on every `broadcastNotification(record)` call.
 */
import type { NotificationRecord } from '../store/types.js';
import { createChannel } from '../sse/broadcast.js';

const channel = createChannel<NotificationRecord>('notifications');

export function addNotificationListener(listener: (record: NotificationRecord) => void): () => void {
  return channel.subscribe(listener);
}

export function removeNotificationListener(listener: (record: NotificationRecord) => void): void {
  // Legacy-style: caller passes the same function ref. Walk subscribers by
  // re-subscribing then immediately un-subscribing is not possible here, so
  // we expose the unsubscribe function returned from subscribe() as the
  // preferred API (see addNotificationListener). This is a best-effort shim.
  const dispose = channel.subscribe(listener);
  dispose();
  // Note: We cannot remove a previously-subscribed listener without its
  // dispose handle; callers should retain the unsubscribe fn.
}

export function broadcastNotification(record: NotificationRecord): void {
  channel.publish(record);
}

export function notificationListenerCount(): number {
  return channel.size();
}
