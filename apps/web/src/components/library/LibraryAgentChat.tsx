'use client';

/**
 * Library Matrix Agent — streaming chat panel.
 *
 * Right-side companion to LibraryMatrixView. The user picks an entity (or the
 * global thread for a type) and converses with the agent; the agent uses tool
 * calls to propose values, columns, or collection assignments. Each tool call
 * renders as an Accept / Reject / Edit card. Read-only tools auto-execute and
 * appear as small inline result chips.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  Check,
  ChevronDown,
  Edit3,
  Loader2,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch, API_BASE_URL } from '@/lib/api';

type ToolName =
  | 'propose_cell_value'
  | 'propose_new_column'
  | 'read_entities'
  | 'read_zotero_metadata'
  | 'suggest_collection_assignment'
  | 'search_library';

type ToolStatus = 'pending' | 'accepted' | 'rejected' | 'edited' | 'errored';

interface ToolCall {
  id: string;
  name: ToolName;
  input: Record<string, unknown>;
  result?: unknown;
  status: ToolStatus;
  editedInput?: Record<string, unknown>;
  rejectionReason?: string;
  createdAt: string;
  resolvedAt?: string;
}

interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  createdAt: string;
}

interface AgentConversation {
  id: string;
  entityId: string | null;
  entityType: string;
  scope: 'entity' | 'global';
  messages: AgentMessage[];
  totalTokens?: number;
  createdAt: string;
  updatedAt: string;
}

interface LibraryAgentChatProps {
  entityId: string | null;
  entityType: string;
  /** Title shown in header — defaults to "Library Agent". */
  entityTitle?: string;
  onClose: () => void;
  /** Called when an accepted/edited proposal mutated an entity — parent refreshes. */
  onEntityChanged?: (entityId: string) => void;
}

const PROPOSAL_TOOLS = new Set<ToolName>(['propose_cell_value', 'propose_new_column', 'suggest_collection_assignment']);

export function LibraryAgentChat({ entityId, entityType, entityTitle, onClose, onEntityChanged }: LibraryAgentChatProps) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [scope, setScope] = useState<'entity' | 'global'>(entityId ? 'entity' : 'global');
  const [conv, setConv] = useState<AgentConversation | null>(null);
  const [composer, setComposer] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Smart auto-scroll — only follow new messages when the user is already
  // near the bottom. If they've scrolled up to read history, we DON'T yank
  // them down; instead we surface a "↓ new" pill they can click.
  const [stickToBottom, setStickToBottom] = useState(true);
  const [hasNewBelow, setHasNewBelow] = useState(false);

  // Open or create the thread for this (entityId, scope).
  const ensureConversation = useCallback(async (s: 'entity' | 'global') => {
    setError(null);
    try {
      const targetEntityId = s === 'entity' ? entityId : null;
      const r = await apiFetch<{ conversation: AgentConversation }>(
        '/api/library/agent/conversations',
        {
          method: 'POST',
          body: JSON.stringify({ entityId: targetEntityId, entityType, scope: s }),
        },
      );
      setConv(r.conversation);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open thread');
    }
  }, [entityId, entityType]);

  useEffect(() => {
    void ensureConversation(scope);
  }, [scope, ensureConversation]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Smart auto-scroll: only follow new messages when the user is at/near
  // the bottom. Otherwise mark hasNewBelow so the floating pill appears.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickToBottom) {
      el.scrollTop = el.scrollHeight;
      setHasNewBelow(false);
    } else {
      setHasNewBelow(true);
    }
  }, [conv?.messages.length, streaming, stickToBottom]);

  const handleScrollerScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // 80px slack so the user can lean back a tiny bit without losing the
    // auto-follow behavior.
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setStickToBottom(nearBottom);
    if (nearBottom) setHasNewBelow(false);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setStickToBottom(true);
    setHasNewBelow(false);
  }, []);

  // Cancel an in-flight stream. The fetch's AbortController is wired to
  // /messages — aborting drops the SSE reader; the assistant message stays
  // partial in the local state and on the server (whatever was already
  // streamed will have been persisted at /done).
  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const sendMessage = useCallback(async () => {
    const text = composer.trim();
    if (!text || !conv || streaming) return;
    setComposer('');
    setError(null);
    setStreaming(true);

    // Optimistic local user + placeholder assistant message.
    const userMsg: AgentMessage = {
      id: `local-${crypto.randomUUID()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    const assistantMsg: AgentMessage = {
      id: `local-asst-${crypto.randomUUID()}`,
      role: 'assistant',
      content: '',
      toolCalls: [],
      createdAt: new Date().toISOString(),
    };
    setConv((c) => c ? { ...c, messages: [...c.messages, userMsg, assistantMsg] } : c);

    // Stream via fetch + manual SSE parse so we can wire AbortController on
    // unmount. EventSource doesn't support custom headers / POST.
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`${API_BASE_URL}/api/library/agent/conversations/${conv.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => 'stream failed');
        throw new Error(err || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE messages are separated by blank lines.
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const evt = parseSSE(raw);
          if (!evt) continue;
          handleSSEEvent(evt, assistantMsg.id);
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(e instanceof Error ? e.message : 'Stream failed');
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [composer, conv, streaming]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSSEEvent = useCallback((evt: { event: string; data: string }, assistantMsgId: string) => {
    if (evt.event === 'text') {
      const { delta } = JSON.parse(evt.data);
      setConv((c) => {
        if (!c) return c;
        return {
          ...c,
          messages: c.messages.map((m) => m.id === assistantMsgId ? { ...m, content: m.content + (delta as string) } : m),
        };
      });
    } else if (evt.event === 'tool_call') {
      const { toolCall } = JSON.parse(evt.data) as { toolCall: ToolCall };
      setConv((c) => {
        if (!c) return c;
        return {
          ...c,
          messages: c.messages.map((m) => m.id === assistantMsgId
            ? { ...m, toolCalls: [...(m.toolCalls ?? []), toolCall] }
            : m
          ),
        };
      });
    } else if (evt.event === 'done') {
      // Stream finished — server saved the final assistant message; refresh it.
      void refreshConv();
    } else if (evt.event === 'error') {
      try {
        const { error: err } = JSON.parse(evt.data);
        setError(err);
      } catch { setError('Stream error'); }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshConv = useCallback(async () => {
    if (!conv) return;
    try {
      const r = await apiFetch<{ conversation: AgentConversation }>(`/api/library/agent/conversations/${conv.id}`);
      setConv(r.conversation);
    } catch { /* keep optimistic state */ }
  }, [conv]);

  const decideTool = useCallback(async (
    toolCallId: string,
    decision: 'accepted' | 'rejected' | 'edited',
    extra?: { editedInput?: Record<string, unknown>; rejectionReason?: string },
  ) => {
    if (!conv) return;
    try {
      const r = await apiFetch<{ toolCall: ToolCall; appliedResult: unknown }>(
        `/api/library/agent/conversations/${conv.id}/tool-results`,
        {
          method: 'POST',
          body: JSON.stringify({ toolCallId, decision, ...extra }),
        },
      );
      // Update local toolCall in place.
      setConv((c) => {
        if (!c) return c;
        return {
          ...c,
          messages: c.messages.map((m) => {
            const tcs = m.toolCalls ?? [];
            if (!tcs.find((t) => t.id === toolCallId)) return m;
            return { ...m, toolCalls: tcs.map((t) => t.id === toolCallId ? r.toolCall : t) };
          }),
        };
      });
      // For accept/edit, notify the parent so the matrix can refresh.
      const result = r.appliedResult as { applied?: boolean; entityId?: string } | null;
      if (result?.applied && result.entityId && onEntityChanged) onEntityChanged(result.entityId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply');
    }
  }, [conv, onEntityChanged]);

  const deleteThread = useCallback(async () => {
    if (!conv) return;
    if (!window.confirm(isRTL ? 'حذف المحادثة كاملة؟' : 'Delete entire conversation?')) return;
    try {
      await apiFetch(`/api/library/agent/conversations/${conv.id}`, { method: 'DELETE' });
      setConv(null);
      void ensureConversation(scope);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }, [conv, ensureConversation, scope, isRTL]);

  const sessionCost = useMemo(() => {
    if (!conv) return 0;
    return conv.messages.reduce((sum, m) => sum + (m.costUsd ?? 0), 0);
  }, [conv]);

  return (
    <div className="fixed inset-y-0 end-0 z-40 w-full sm:w-[420px] md:w-[480px] bg-surface border-s border-border shadow-2xl flex flex-col" role="dialog" aria-label={isRTL ? 'محادثة وكيل المكتبة' : 'Library agent chat'}>
      <div className="px-3 py-2 border-b border-border flex items-center gap-2 shrink-0">
        {/* Sparkles doubles as a low-key cost surface — hover to see the
            session total. Only flips to a visible badge once the session
            crosses the soft threshold. Keeps the chrome calm. */}
        <span
          className="shrink-0"
          title={
            sessionCost > 0
              ? (isRTL
                  ? `تكلفة الجلسة: $${sessionCost.toFixed(3)}`
                  : `Session cost: $${sessionCost.toFixed(3)}`)
              : (isRTL ? 'وكيل المكتبة' : 'Library agent')
          }
        >
          <Sparkles size={14} className="text-purple-500" aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate" dir="auto">
            {entityTitle || (isRTL ? 'وكيل المكتبة' : 'Library Agent')}
          </p>
          <p className="text-[10px] text-on-surface-tertiary">
            {scope === 'entity' ? (isRTL ? 'محادثة الكيان' : 'Entity thread') : (isRTL ? 'محادثة المصفوفة' : 'Matrix thread')}
            {sessionCost >= 0.1 && (
              <span
                className={cn(
                  'ms-2 font-mono px-1 rounded',
                  sessionCost >= 0.5 ? 'bg-warning/20 text-warning' : 'bg-surface-secondary',
                )}
                title={isRTL ? 'تكلفة الجلسة' : 'Session cost'}
              >
                ${sessionCost.toFixed(2)}
              </span>
            )}
          </p>
        </div>
        {entityId && (
          <button
            onClick={() => setScope(scope === 'entity' ? 'global' : 'entity')}
            className="text-[10px] px-2 py-1 rounded border border-border hover:bg-surface-secondary"
            title={isRTL ? 'تبديل بين محادثة الكيان والمحادثة العامة' : 'Toggle entity / global thread'}
          >
            {scope === 'entity' ? (isRTL ? 'عامة' : 'Global') : (isRTL ? 'الكيان' : 'Entity')}
            <ChevronDown size={10} className="inline ms-1" />
          </button>
        )}
        <button onClick={deleteThread} className="p-1 rounded hover:bg-surface-secondary text-on-surface-tertiary" title={isRTL ? 'حذف' : 'Delete thread'} aria-label={isRTL ? 'حذف المحادثة' : 'Delete thread'}>
          <Trash2 size={12} />
        </button>
        <button onClick={onClose} className="p-1 rounded hover:bg-surface-secondary" aria-label={isRTL ? 'إغلاق' : 'Close'}>
          <X size={14} />
        </button>
      </div>

      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          onScroll={handleScrollerScroll}
          className="absolute inset-0 overflow-y-auto p-3 space-y-3"
        >
          {!conv && (
            <div className="text-center text-xs text-on-surface-tertiary py-8">
              <Loader2 size={14} className="animate-spin mx-auto mb-2" />
              {isRTL ? 'جارٍ فتح المحادثة…' : 'Opening conversation…'}
            </div>
          )}
          {conv?.messages.length === 0 && (
            <div className="text-center text-xs text-on-surface-tertiary py-8">
              {isRTL
                ? 'ابدأ المحادثة — اطلب تعبئة عمود، اقتراح أعمدة، أو ناقش الكيان.'
                : 'Start the conversation — ask to fill a column, suggest new ones, or discuss the entity.'}
            </div>
          )}
          {conv?.messages.map((m) => (
            <MessageBubble
              key={m.id}
              msg={m}
              isRTL={isRTL}
              onDecide={decideTool}
            />
          ))}
          {error && (
            <div className="text-xs text-error bg-error/10 border border-error/30 rounded p-2">
              {error}
            </div>
          )}
        </div>

        {/* Smart-scroll pill — only visible when the user has scrolled up
            AND new content has arrived below them. Click to follow. */}
        {hasNewBelow && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-accent text-on-accent text-[11px] shadow-md hover:bg-accent-hover transition-colors"
            aria-label={isRTL ? 'انتقل إلى آخر رسالة' : 'Scroll to latest'}
          >
            <ArrowDown size={10} aria-hidden />
            {isRTL ? 'رسائل جديدة' : 'New messages'}
          </button>
        )}
      </div>

      <div className="border-t border-border p-2 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
            placeholder={isRTL ? 'اكتب رسالة…' : 'Write a message…'}
            dir="auto"
            rows={2}
            disabled={streaming || !conv}
            className="flex-1 resize-none px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-xs text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            aria-label={isRTL ? 'مربع الرسالة' : 'Message composer'}
          />
          {streaming ? (
            <button
              onClick={stopStreaming}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-[var(--radius)] text-xs bg-error/10 text-error border border-error/30 hover:bg-error/20 transition-colors"
              aria-label={isRTL ? 'إيقاف الإرسال' : 'Stop streaming'}
              title={isRTL ? 'إيقاف الرد الحالي' : 'Stop the current response'}
            >
              <Square size={12} aria-hidden fill="currentColor" />
              {isRTL ? 'إيقاف' : 'Stop'}
            </button>
          ) : (
            <button
              onClick={() => void sendMessage()}
              disabled={!composer.trim() || !conv}
              className="px-3 py-2 rounded-[var(--radius)] text-xs bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
              aria-label={isRTL ? 'إرسال الرسالة' : 'Send message'}
            >
              {isRTL ? 'إرسال' : 'Send'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function parseSSE(raw: string): { event: string; data: string } | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

function MessageBubble({
  msg,
  isRTL,
  onDecide,
}: {
  msg: AgentMessage;
  isRTL: boolean;
  onDecide: (toolCallId: string, decision: 'accepted' | 'rejected' | 'edited', extra?: { editedInput?: Record<string, unknown>; rejectionReason?: string }) => void;
}) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[var(--radius-lg)] bg-accent text-on-accent px-3 py-2 text-xs whitespace-pre-wrap" dir="auto">
          {msg.content}
        </div>
      </div>
    );
  }
  // Assistant
  return (
    <div className="space-y-2">
      {msg.content && (
        <div className="rounded-[var(--radius-lg)] bg-surface-secondary px-3 py-2 text-xs whitespace-pre-wrap" dir="auto">
          {msg.content}
        </div>
      )}
      {(msg.toolCalls ?? []).map((tc) => (
        <ToolCallCard key={tc.id} tc={tc} isRTL={isRTL} onDecide={onDecide} />
      ))}
    </div>
  );
}

// ToolCallCard renders a single tool call inside an assistant bubble.
// Two interaction modes for proposal tools:
//   - propose_cell_value → friendly single-field editor (string/number/etc.)
//   - propose_new_column / suggest_collection_assignment → raw JSON behind
//     an "Advanced" disclosure (multi-field shapes don't have a clean
//     single-input mapping yet).
// Reject and JSON-error flows used to call window.prompt / window.alert —
// both are now inline so the user never leaves the panel.
function ToolCallCard({
  tc,
  isRTL,
  onDecide,
}: {
  tc: ToolCall;
  isRTL: boolean;
  onDecide: (toolCallId: string, decision: 'accepted' | 'rejected' | 'edited', extra?: { editedInput?: Record<string, unknown>; rejectionReason?: string }) => void;
}) {
  type Mode = 'view' | 'edit-value' | 'edit-json' | 'reject';
  const [mode, setMode] = useState<Mode>('view');
  // For propose_cell_value the user edits the `value` field only — keep the
  // raw value and serialize it back into the input on save.
  const initialValue = (tc.input as { value?: unknown }).value;
  const [valueDraft, setValueDraft] = useState<string>(() =>
    initialValue === null || initialValue === undefined
      ? ''
      : typeof initialValue === 'string' ? initialValue : JSON.stringify(initialValue),
  );
  const [editedJson, setEditedJson] = useState(JSON.stringify(tc.input, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const isProposal = PROPOSAL_TOOLS.has(tc.name);
  const isCellProposal = tc.name === 'propose_cell_value';

  const labelEn: Record<ToolName, string> = {
    propose_cell_value: 'Propose value',
    propose_new_column: 'Propose new column',
    read_entities: 'Read entities',
    read_zotero_metadata: 'Read Zotero',
    suggest_collection_assignment: 'Suggest collection',
    search_library: 'Search library',
  };
  const labelAr: Record<ToolName, string> = {
    propose_cell_value: 'اقتراح قيمة',
    propose_new_column: 'اقتراح عمود',
    read_entities: 'قراءة كيانات',
    read_zotero_metadata: 'قراءة Zotero',
    suggest_collection_assignment: 'اقتراح كولكشن',
    search_library: 'بحث في المكتبة',
  };

  const statusBadge = {
    pending: { en: 'Pending', ar: 'قيد المراجعة', cls: 'bg-warning/10 text-warning border-warning/30' },
    accepted: { en: 'Accepted', ar: 'مقبول', cls: 'bg-success/10 text-success border-success/30' },
    rejected: { en: 'Rejected', ar: 'مرفوض', cls: 'bg-error/10 text-error border-error/30' },
    edited: { en: 'Edited & accepted', ar: 'معدّل ومقبول', cls: 'bg-success/10 text-success border-success/30' },
    errored: { en: 'Errored', ar: 'خطأ', cls: 'bg-error/10 text-error border-error/30' },
  }[tc.status];

  // Friendly view of the proposal contents — different shape per tool.
  const renderViewBody = () => {
    if (isCellProposal) {
      const inp = (tc.editedInput ?? tc.input) as { columnKey?: string; value?: unknown; reasoning?: string };
      return (
        <div className="space-y-1">
          {inp.columnKey && (
            <p className="text-[10px] text-on-surface-tertiary">
              {isRTL ? 'العمود:' : 'Column:'} <span className="font-mono text-on-surface">{inp.columnKey}</span>
            </p>
          )}
          <div className="rounded bg-surface-secondary p-1.5 text-on-surface" dir="auto">
            {inp.value === null || inp.value === undefined
              ? <span className="text-on-surface-tertiary italic">{isRTL ? '(فارغ)' : '(empty)'}</span>
              : typeof inp.value === 'string' ? inp.value : JSON.stringify(inp.value)}
          </div>
          {inp.reasoning && (
            <p className="text-[10px] text-on-surface-tertiary italic" dir="auto">{inp.reasoning}</p>
          )}
        </div>
      );
    }
    return (
      <pre className="text-[10px] bg-surface-secondary rounded p-1.5 max-h-32 overflow-auto font-mono" dir="ltr">
        {JSON.stringify(tc.editedInput ?? tc.input, null, 2)}
      </pre>
    );
  };

  // Save-edit dispatch for whichever editor mode is active.
  const saveEdit = () => {
    if (mode === 'edit-value') {
      // Coerce value back to its original type (number stays number, etc.).
      let coerced: unknown = valueDraft;
      if (typeof initialValue === 'number') {
        const n = Number(valueDraft);
        if (Number.isNaN(n)) {
          setJsonError(isRTL ? 'القيمة لازم تكون رقم' : 'Value must be a number');
          return;
        }
        coerced = n;
      } else if (Array.isArray(initialValue)) {
        // Comma-separated string → array of trimmed strings.
        coerced = valueDraft.split(',').map((s) => s.trim()).filter(Boolean);
      } else if (typeof initialValue === 'boolean') {
        coerced = valueDraft.trim().toLowerCase() === 'true';
      } else if (valueDraft.trim() === '' && initialValue !== '') {
        coerced = null;
      }
      const next = { ...(tc.input as Record<string, unknown>), value: coerced };
      onDecide(tc.id, 'edited', { editedInput: next });
      setMode('view');
      setJsonError(null);
      return;
    }
    if (mode === 'edit-json') {
      try {
        const parsed = JSON.parse(editedJson);
        onDecide(tc.id, 'edited', { editedInput: parsed });
        setMode('view');
        setJsonError(null);
      } catch (e) {
        setJsonError((e as Error).message || (isRTL ? 'JSON غير صالح' : 'Invalid JSON'));
      }
    }
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-2 text-xs space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium inline-flex items-center gap-1">
          <Sparkles size={10} className="text-purple-500" />
          {isRTL ? labelAr[tc.name] : labelEn[tc.name]}
        </span>
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded border', statusBadge.cls)}>
          {isRTL ? statusBadge.ar : statusBadge.en}
        </span>
      </div>

      {mode === 'view' && renderViewBody()}

      {mode === 'edit-value' && (
        <div className="space-y-1">
          <label className="block text-[10px] text-on-surface-tertiary">
            {isRTL ? 'القيمة' : 'Value'}
            {Array.isArray(initialValue) && (
              <span className="ms-1 text-on-surface-tertiary">{isRTL ? '(افصل بفاصلة)' : '(comma-separated)'}</span>
            )}
            {typeof initialValue === 'number' && (
              <span className="ms-1 text-on-surface-tertiary">{isRTL ? '(رقم)' : '(number)'}</span>
            )}
          </label>
          {Array.isArray(initialValue) || (typeof initialValue === 'string' && initialValue.length > 60) ? (
            <textarea
              value={valueDraft}
              onChange={(e) => { setValueDraft(e.target.value); setJsonError(null); }}
              rows={3}
              dir="auto"
              className="w-full text-xs bg-input border border-border rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label={isRTL ? 'القيمة' : 'Value'}
              autoFocus
            />
          ) : (
            <input
              type={typeof initialValue === 'number' ? 'number' : 'text'}
              value={valueDraft}
              onChange={(e) => { setValueDraft(e.target.value); setJsonError(null); }}
              dir="auto"
              className="w-full text-xs bg-input border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label={isRTL ? 'القيمة' : 'Value'}
              autoFocus
            />
          )}
        </div>
      )}

      {mode === 'edit-json' && (
        <div className="space-y-1">
          <label className="block text-[10px] text-on-surface-tertiary">{isRTL ? 'JSON' : 'JSON'}</label>
          <textarea
            value={editedJson}
            onChange={(e) => { setEditedJson(e.target.value); setJsonError(null); }}
            rows={6}
            className="w-full text-[10px] bg-input border border-border rounded p-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            dir="ltr"
            aria-label={isRTL ? 'مدخل الأداة المعدّل' : 'Edited tool input'}
            autoFocus
          />
        </div>
      )}

      {mode === 'reject' && (
        <div className="space-y-1">
          <label className="block text-[10px] text-on-surface-tertiary">
            {isRTL ? 'سبب الرفض (اختياري)' : 'Rejection reason (optional)'}
          </label>
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            dir="auto"
            placeholder={isRTL ? 'مثلاً: ليس مناسباً للسياق' : 'e.g. wrong context'}
            className="w-full text-xs bg-input border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label={isRTL ? 'سبب الرفض' : 'Rejection reason'}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onDecide(tc.id, 'rejected', { rejectionReason: rejectReason.trim() || undefined });
                setMode('view');
              } else if (e.key === 'Escape') {
                setMode('view');
              }
            }}
          />
        </div>
      )}

      {jsonError && (
        <p className="text-[10px] text-error" role="alert">{jsonError}</p>
      )}

      {tc.result !== undefined && (
        <details className="text-[10px] text-on-surface-tertiary">
          <summary className="cursor-pointer">{isRTL ? 'النتيجة' : 'Result'}</summary>
          <pre className="mt-1 bg-surface-secondary rounded p-1.5 max-h-32 overflow-auto font-mono" dir="ltr">
            {typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2)}
          </pre>
        </details>
      )}

      {isProposal && tc.status === 'pending' && (
        <div className="flex flex-wrap items-center gap-1 pt-1">
          {mode === 'view' && (
            <>
              <button
                onClick={() => onDecide(tc.id, 'accepted')}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-success/10 text-success border border-success/30 hover:bg-success/20"
                aria-label={isRTL ? 'قبول الاقتراح' : 'Accept proposal'}
              >
                <Check size={10} /> {isRTL ? 'قبول' : 'Accept'}
              </button>
              <button
                onClick={() => setMode(isCellProposal ? 'edit-value' : 'edit-json')}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-secondary text-on-surface-secondary border border-border hover:bg-surface-tertiary"
                aria-label={isRTL ? 'تعديل الاقتراح' : 'Edit proposal'}
              >
                <Edit3 size={10} /> {isRTL ? 'تعديل' : 'Edit'}
              </button>
              {isCellProposal && (
                // Advanced disclosure — escape hatch to raw JSON for power users.
                <button
                  onClick={() => setMode('edit-json')}
                  className="text-[10px] px-1 py-0.5 rounded text-on-surface-tertiary hover:bg-surface-secondary"
                  title={isRTL ? 'تحرير JSON كامل' : 'Edit full JSON'}
                >
                  {isRTL ? 'JSON' : 'JSON'}
                </button>
              )}
              <button
                onClick={() => setMode('reject')}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-error/10 text-error border border-error/30 hover:bg-error/20"
                aria-label={isRTL ? 'رفض الاقتراح' : 'Reject proposal'}
              >
                <X size={10} /> {isRTL ? 'رفض' : 'Reject'}
              </button>
            </>
          )}
          {(mode === 'edit-value' || mode === 'edit-json') && (
            <>
              <button
                onClick={saveEdit}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-success/10 text-success border border-success/30 hover:bg-success/20"
              >
                <Check size={10} /> {isRTL ? 'حفظ التعديل' : 'Save edit'}
              </button>
              <button
                onClick={() => { setMode('view'); setJsonError(null); }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-secondary text-on-surface-secondary border border-border hover:bg-surface-tertiary"
              >
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
            </>
          )}
          {mode === 'reject' && (
            <>
              <button
                onClick={() => {
                  onDecide(tc.id, 'rejected', { rejectionReason: rejectReason.trim() || undefined });
                  setMode('view');
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-error/10 text-error border border-error/30 hover:bg-error/20"
              >
                <X size={10} /> {isRTL ? 'تأكيد الرفض' : 'Confirm reject'}
              </button>
              <button
                onClick={() => { setMode('view'); setRejectReason(''); }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-secondary text-on-surface-secondary border border-border hover:bg-surface-tertiary"
              >
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
