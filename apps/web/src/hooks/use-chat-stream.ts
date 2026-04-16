'use client';

/**
 * CHAT_V2 Wave D — unified SSE stream hook.
 *
 * Consumes the Wave B contract:
 *   message.start · message.delta · message.done ·
 *   participants.update · error
 *
 * Legacy fallback: if no `message.start` is observed within the first
 * 2 seconds after we open a stream, we downgrade to the pre-v2 single-
 * bubble path (token/content/delegations/done) and funnel everything
 * into one synthetic assistant message with `agentId='manager'`.
 *
 * NOTE: This hook is standalone — `chat-view.tsx` still drives the main
 * UI today. It is exported so new surfaces (and Wave E tests) can bind to
 * a clean stream shape without wading through the mega-component.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, apiStream } from '@/lib/api';
import type {
  Artifact,
  Message,
  MessageKind,
  AgentDisplay,
} from '@/types/chat';

interface UseChatStreamResult {
  messages: Message[];
  participants: string[];
  activeAgents: string[];
  sendMessage: (text: string, opts?: { agentId?: string }) => void;
  error: string | null;
  isStreaming: boolean;
}

const LEGACY_FALLBACK_MS = 2000;
const SYNTHETIC_MANAGER_AGENT = 'manager';

export function useChatStream(conversationId: string | null | undefined): UseChatStreamResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const cancelRef = useRef<(() => void) | null>(null);
  const messageMapRef = useRef<Map<string, Message>>(new Map());

  // Hydrate messages + participants when conversation changes
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setParticipants([]);
      messageMapRef.current = new Map();
      return;
    }
    let cancelled = false;

    apiFetch<unknown[]>(`/api/conversations/${conversationId}/messages`)
      .then((rows) => {
        if (cancelled) return;
        const normalized = rows.map(normalizeStoredMessage);
        messageMapRef.current = new Map(normalized.map((m) => [m.id, m]));
        setMessages(normalized);
      })
      .catch(() => {});

    apiFetch<string[]>(`/api/conversations/${conversationId}/participants`)
      .then((p) => {
        if (cancelled) return;
        setParticipants(p && p.length > 0 ? p : [SYNTHETIC_MANAGER_AGENT]);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const pushMessage = useCallback((m: Message) => {
    messageMapRef.current.set(m.id, m);
    setMessages((prev) => {
      if (prev.some((p) => p.id === m.id)) {
        return prev.map((p) => (p.id === m.id ? m : p));
      }
      return [...prev, m];
    });
  }, []);

  const patchMessage = useCallback((id: string, patch: Partial<Message>) => {
    const existing = messageMapRef.current.get(id);
    if (!existing) return;
    const next = { ...existing, ...patch };
    messageMapRef.current.set(id, next);
    setMessages((prev) => prev.map((m) => (m.id === id ? next : m)));
  }, []);

  const sendMessage = useCallback(
    (text: string, opts?: { agentId?: string }) => {
      if (isStreaming) return;
      if (!text.trim()) return;

      const userMsgId = cryptoRandom();
      const userMsg: Message = {
        id: userMsgId,
        conversationId: conversationId || undefined,
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      };
      pushMessage(userMsg);
      setError(null);
      setIsStreaming(true);

      // Legacy fallback state
      let sawV2 = false;
      let legacyCollected = '';
      let legacyMessageId: string | null = null;

      const fallbackTimer = setTimeout(() => {
        if (!sawV2) {
          legacyMessageId = cryptoRandom();
          pushMessage({
            id: legacyMessageId,
            conversationId: conversationId || undefined,
            role: 'assistant',
            agentId: SYNTHETIC_MANAGER_AGENT,
            kind: 'text',
            content: '',
            createdAt: new Date().toISOString(),
            streaming: true,
          });
        }
      }, LEGACY_FALLBACK_MS);

      const cancel = apiStream(
        '/api/chat',
        {
          conversationId: conversationId || null,
          message: text,
          ...(opts?.agentId ? { agentId: opts.agentId } : {}),
        },
        (event, data) => {
          const d = (data as Record<string, unknown>) || {};

          switch (event) {
            case 'message.start': {
              sawV2 = true;
              clearTimeout(fallbackTimer);
              const id = d.messageId as string | undefined;
              const agentId = d.agentId as string | undefined;
              if (!id || !agentId) break;
              const kind = (d.kind as MessageKind | undefined) || 'text';
              const agentDisplay = d.agentDisplay as AgentDisplay | undefined;
              pushMessage({
                id,
                conversationId: conversationId || undefined,
                role: 'assistant',
                agentId,
                agentDisplay,
                kind,
                content: '',
                createdAt: (d.createdAt as string) || new Date().toISOString(),
                streaming: true,
              });
              setActiveAgents((prev) => (prev.includes(agentId) ? prev : [...prev, agentId]));
              break;
            }

            case 'message.delta': {
              const id = d.messageId as string | undefined;
              const chunk = (d.text as string) || '';
              if (!id) break;
              const existing = messageMapRef.current.get(id);
              if (existing) {
                patchMessage(id, { content: existing.content + chunk });
              }
              break;
            }

            case 'message.done': {
              const id = d.messageId as string | undefined;
              if (!id) break;
              const artifacts = (d.artifacts as Artifact[] | undefined) || undefined;
              const existing = messageMapRef.current.get(id);
              patchMessage(id, {
                streaming: false,
                ...(artifacts ? { artifacts } : {}),
              });
              if (existing?.agentId) {
                setActiveAgents((prev) => prev.filter((a) => a !== existing.agentId));
              }
              break;
            }

            case 'participants.update': {
              const ids = (d.participantAgentIds as string[]) || [];
              if (ids.length > 0) setParticipants(ids);
              break;
            }

            // --- legacy path ---
            case 'token':
            case 'content':
            case 'text': {
              if (sawV2) break;
              const chunk = (d.content as string) || (d.text as string) || (d.token as string) || '';
              legacyCollected += chunk;
              if (legacyMessageId) {
                patchMessage(legacyMessageId, { content: legacyCollected });
              }
              break;
            }

            case 'conversation': {
              // Legacy: server echoes conversation id (and sometimes participants)
              const newParticipants = d.participants as string[] | undefined;
              if (newParticipants && newParticipants.length > 0) {
                setParticipants(newParticipants);
              }
              break;
            }
          }
        },
        () => {
          clearTimeout(fallbackTimer);
          // Finalise any still-streaming bubble
          messageMapRef.current.forEach((m) => {
            if (m.streaming) patchMessage(m.id, { streaming: false });
          });
          if (legacyMessageId && legacyCollected) {
            patchMessage(legacyMessageId, {
              content: legacyCollected,
              streaming: false,
            });
          }
          setActiveAgents([]);
          setIsStreaming(false);
        },
        (err) => {
          clearTimeout(fallbackTimer);
          setError(err);
          setIsStreaming(false);
          setActiveAgents([]);
          messageMapRef.current.forEach((m) => {
            if (m.streaming) patchMessage(m.id, { streaming: false, errored: true });
          });
        }
      );

      cancelRef.current = cancel;
    },
    [conversationId, isStreaming, pushMessage, patchMessage]
  );

  // Cancel stream on unmount / convo switch
  useEffect(() => {
    return () => {
      cancelRef.current?.();
      cancelRef.current = null;
    };
  }, [conversationId]);

  return useMemo(
    () => ({ messages, participants, activeAgents, sendMessage, error, isStreaming }),
    [messages, participants, activeAgents, sendMessage, error, isStreaming]
  );
}

/** Hydrate a persisted row from `/api/conversations/:id/messages`.
 *  If `kind`, `agentId` or `agentDisplay` are missing we infer `text` +
 *  `manager` so legacy rows keep rendering. */
function normalizeStoredMessage(raw: unknown): Message {
  const r = (raw as Record<string, unknown>) || {};
  const role = (r.role as Message['role']) || 'assistant';
  const content = (r.content as string) || '';
  const id = (r.id as string) || cryptoRandom();
  return {
    id,
    conversationId: r.conversationId as string | undefined,
    role,
    agentId: (r.agentId as string | undefined) || (role === 'assistant' ? SYNTHETIC_MANAGER_AGENT : undefined),
    agentDisplay: r.agentDisplay as AgentDisplay | undefined,
    kind: (r.kind as MessageKind | undefined) || 'text',
    content,
    createdAt: r.createdAt as string | undefined,
    artifacts: r.artifacts as Artifact[] | undefined,
    workflowStepId: r.workflowStepId as string | undefined,
  };
}

function cryptoRandom(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
