/**
 * Per-conversation SSE channel registry (CHAT_V2 P2 / Wave C).
 *
 * Provides a lazy-initialized `Channel<ConversationSseEvent>` for each
 * conversationId. Used by the workflow orchestrator's `conversationPoster`
 * hook to fan-out progress/text/artifact bubbles live into the chat UI.
 *
 * The chat UI subscribes via `GET /api/conversations/:id/stream` (Wave D) and
 * receives `message.start` + `message.done` event pairs matching the contract
 * already emitted by Wave B's POST /api/chat route.
 */
import { createChannel, type Channel } from '../sse/broadcast.js';

export interface ConversationSseEvent {
  /** SSE `event:` field (e.g. `message.start`, `message.done`). */
  event: string;
  /** Parsed JSON payload — the stream endpoint stringifies it. */
  data: Record<string, unknown>;
}

const channels = new Map<string, Channel<ConversationSseEvent>>();

export function getConversationChannel(conversationId: string): Channel<ConversationSseEvent> {
  let ch = channels.get(conversationId);
  if (!ch) {
    ch = createChannel<ConversationSseEvent>(`conversation:${conversationId}`);
    channels.set(conversationId, ch);
  }
  return ch;
}

export function broadcastToConversation(conversationId: string, ev: ConversationSseEvent): void {
  getConversationChannel(conversationId).publish(ev);
}

export function conversationChannelCount(): number {
  return channels.size;
}

/** Test-only reset. */
export function __resetConversationChannels(): void {
  channels.clear();
}
