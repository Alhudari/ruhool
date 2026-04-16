/**
 * Central SSE client registry + broadcast helper (REL-01 stage 2c).
 *
 * The API currently uses two in-memory listener arrays (`activitySSEListeners`,
 * `notificationSSEListeners`) defined inline in `index.ts`. This module provides
 * typed registries that any route can import, so the monolith doesn't need to
 * re-export listener arrays.
 *
 * Usage:
 *   const channel = createChannel<ActivityRecord>();
 *   channel.subscribe(fn);      // returns unsubscribe()
 *   channel.publish(record);    // fan-out, catches per-listener errors
 */

import { logger } from '../server/logging.js';

export interface Channel<T> {
  subscribe(listener: (payload: T) => void): () => void;
  publish(payload: T): void;
  size(): number;
}

export function createChannel<T>(name?: string): Channel<T> {
  const listeners: Array<(payload: T) => void> = [];
  return {
    subscribe(listener) {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    publish(payload) {
      for (const listener of listeners) {
        try {
          listener(payload);
        } catch (err) {
          logger.warn({ err, channel: name }, 'sse listener threw');
        }
      }
    },
    size() {
      return listeners.length;
    },
  };
}
