/**
 * Shared LLM provider types — extracted for REL-01 stage 2d (AGT-05 wiring).
 *
 * The unified provider contract is streaming-only and produces a tagged-union
 * of chunks. This file adds two new frames (`tool_use`, `tool_use_end`) so the
 * chat SSE loop can surface Anthropic tool calls to callers.
 */
import type Anthropic from '@anthropic-ai/sdk';

/** Tool definition passed through to the Anthropic SDK. */
export type AnthropicTool = Anthropic.Tool;

export interface ChatMessage {
  role: string;
  content:
    | string
    | Array<{ type: string; [k: string]: unknown }>;
}

export interface ChatCallOptions {
  model: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  /** Optional tool definitions (Anthropic only for now; others ignore). */
  tools?: AnthropicTool[];
  /** F-008: abort signal — providers should pass this to fetch/SDK calls
   *  so timeouts/disconnects actually cancel the upstream request. */
  signal?: AbortSignal;
}

export type TextChunk = { type: 'text'; content: string };
export type UsageChunk = {
  type: 'usage';
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number };
};
export type ErrorChunk = { type: 'error'; error: string };
export type DoneChunk = { type: 'done' };

/** Fired when a `tool_use` content block completes with its full input JSON. */
export type ToolUseChunk = {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ChatChunk =
  | TextChunk
  | UsageChunk
  | ErrorChunk
  | DoneChunk
  | ToolUseChunk;
