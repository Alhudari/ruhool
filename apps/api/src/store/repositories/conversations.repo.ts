/**
 * Conversations + messages repository — dual-mode.
 *
 * Only a small surface is exposed (list/get/create/appendMessage) — enough for
 * routes extracted in stage 2 of REL-01 to call without knowing whether Postgres
 * is wired up.
 */
import { getRepoDb } from './db.js';
import { logger } from '../../server/logging.js';

export interface ConvRecord {
  id: string;
  title?: string | null;
  language?: string;
  agentId?: string | null;
  archived?: boolean;
  /** CHAT_V2 P1: participant set for WhatsApp-group conversations. */
  participantAgentIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MsgRecord {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  agentId?: string | null;
  createdAt: string;
  toolCalls?: unknown[];
  toolResults?: unknown[];
  /** CHAT_V2 P1: bubble kind ('text' default). */
  kind?: 'text' | 'progress' | 'artifact' | 'handoff';
  /** CHAT_V2 P2: link to workflow step that produced this bubble. */
  workflowStepId?: string | null;
  /** CHAT_V2 P1: agent-to-agent reply threading. */
  replyToAgentId?: string | null;
  /** CHAT_V2 P1: optional attachments. */
  artifacts?: Array<{ type: string; url: string; meta?: Record<string, unknown> }>;
}

export interface JsonConvStoreLike {
  conversations: ConvRecord[];
  messages: MsgRecord[];
}

export async function listConversations(json: JsonConvStoreLike): Promise<ConvRecord[]> {
  const db = getRepoDb();
  if (!db) return json.conversations;
  try {
    const { conversations } = await import('@ruhool/db');
    const rows = await db.select().from(conversations);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      language: r.language,
      agentId: r.agentId,
      archived: r.archived,
      participantAgentIds: r.participantAgentIds ?? [],
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  } catch {
    return json.conversations;
  }
}

export async function createConversation(json: JsonConvStoreLike, c: ConvRecord): Promise<void> {
  json.conversations.push(c);
  const db = getRepoDb();
  if (!db) return;
  try {
    const { conversations } = await import('@ruhool/db');
    await db.insert(conversations).values({
      id: c.id,
      title: c.title ?? null,
      language: c.language ?? 'en',
      agentId: c.agentId ?? null,
      archived: c.archived ?? false,
      participantAgentIds: c.participantAgentIds ?? [],
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt),
    });
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, '[conversations.repo] DB insert failed (JSON OK)');
  }
}

export async function appendMessage(json: JsonConvStoreLike, m: MsgRecord): Promise<void> {
  json.messages.push(m);
  const db = getRepoDb();
  if (!db) return;
  try {
    const { messages } = await import('@ruhool/db');
    await db.insert(messages).values({
      id: m.id,
      conversationId: m.conversationId,
      role: m.role,
      content: m.content,
      agentId: m.agentId ?? null,
      toolCallsJson: m.toolCalls ?? null,
      toolResultsJson: m.toolResults ?? null,
      kind: m.kind ?? 'text',
      workflowStepId: m.workflowStepId ?? null,
      replyToAgentId: m.replyToAgentId ?? null,
      artifactsJson: m.artifacts ?? null,
      createdAt: new Date(m.createdAt),
    });
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, '[conversations.repo] DB message insert failed (JSON OK)');
  }
}

export async function listMessages(json: JsonConvStoreLike, conversationId: string): Promise<MsgRecord[]> {
  const db = getRepoDb();
  if (!db) return json.messages.filter((m) => m.conversationId === conversationId);
  try {
    const { messages } = await import('@ruhool/db');
    const { eq, asc } = await import('drizzle-orm');
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));
    return rows.map((r) => ({
      id: r.id,
      conversationId: r.conversationId,
      role: r.role,
      content: r.content,
      agentId: r.agentId,
      createdAt: r.createdAt.toISOString(),
      toolCalls: r.toolCallsJson ?? undefined,
      toolResults: r.toolResultsJson ?? undefined,
      kind: (r.kind as 'text' | 'progress' | 'artifact' | 'handoff' | undefined) ?? 'text',
      workflowStepId: r.workflowStepId ?? null,
      replyToAgentId: r.replyToAgentId ?? null,
      artifacts: r.artifactsJson ?? undefined,
    }));
  } catch {
    return json.messages.filter((m) => m.conversationId === conversationId);
  }
}
