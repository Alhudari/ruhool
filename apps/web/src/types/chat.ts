/**
 * Chat v2 types — shared between `chat-view`, `use-chat-stream`,
 * `chat-group-header`, `typing-indicator` and anything else that consumes
 * the Wave B SSE contract.
 *
 * These mirror the backend `messages` row shape plus the transient
 * streaming flags we track on the client.
 */

import type { WorkflowArtifact } from '@/hooks/use-workflow-sse';

export type Artifact = WorkflowArtifact;

export type MessageKind = 'text' | 'progress' | 'artifact' | 'handoff';
export type MessageRole = 'user' | 'assistant' | 'system';

export interface AgentDisplay {
  ar: string;
  en: string;
}

export interface Message {
  id: string;
  conversationId?: string;
  role: MessageRole;
  agentId?: string;
  agentDisplay?: AgentDisplay;
  kind?: MessageKind;
  content: string;
  createdAt?: string;
  artifacts?: Artifact[];
  workflowStepId?: string;
  /** Transient — true while a delta is still open for this message. */
  streaming?: boolean;
  /** Transient — true if the server emitted an error event for this message. */
  errored?: boolean;
  /** Legacy field used by existing chat-view for reply targeting. */
  replyToAgentId?: string;
}

/** Wave B SSE event payloads, as produced by `apps/api` /api/chat. */
export interface MessageStartEvent {
  messageId: string;
  agentId: string;
  agentDisplay?: AgentDisplay;
  kind?: MessageKind;
  createdAt?: string;
  replyToAgentId?: string;
}

export interface MessageDeltaEvent {
  messageId: string;
  text: string;
}

export interface MessageDoneEvent {
  messageId: string;
  usage?: Record<string, unknown>;
  artifacts?: Artifact[];
}

export interface ParticipantsUpdateEvent {
  conversationId: string;
  participantAgentIds: string[];
}

export interface ChatErrorEvent {
  messageId?: string;
  error: string;
}
