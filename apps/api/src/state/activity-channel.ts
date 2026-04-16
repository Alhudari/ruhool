/**
 * Activity-log SSE channel. Extracted from index.ts (REL-01 stage 2d).
 * Pure leaf channel around the `sse/broadcast` primitive.
 */
import type { ActivityRecord } from '../store/types.js';
import { createChannel } from '../sse/broadcast.js';

const channel = createChannel<ActivityRecord>('activity');

export function subscribeActivity(listener: (r: ActivityRecord) => void): () => void {
  return channel.subscribe(listener);
}

export function broadcastActivity(record: ActivityRecord): void {
  channel.publish(record);
}

export function activityListenerCount(): number {
  return channel.size();
}
