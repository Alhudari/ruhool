'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiStream } from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Msg = { id: string; role: 'user' | 'assistant'; content: string };

export function AnalystChatDrawer() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [convId, setConvId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamContent]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || streaming) return;
    const userMsg: Msg = { id: crypto.randomUUID(), role: 'user', content: text };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setStreaming(true);
    setStreamContent('');
    let collected = '';
    const cancel = apiStream(
      '/api/chat',
      { conversationId: convId, message: text, agentId: 'analyst' },
      (event, data: unknown) => {
        const d = data as Record<string, unknown>;
        if (event === 'conversation') {
          const newId = d.conversationId as string;
          if (newId) setConvId(newId);
        } else if (event === 'text') {
          collected += (d.content as string) || '';
          setStreamContent(collected);
        }
      },
      () => {
        if (collected) {
          setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'assistant', content: collected }]);
        }
        setStreamContent('');
        setStreaming(false);
      },
      (err) => {
        setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${err}` }]);
        setStreaming(false);
        setStreamContent('');
      }
    );
    cancelRef.current = cancel;
  }, [input, streaming, convId]);

  return (
    <>
      {/* Floating toggle */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-teal-500 text-white shadow-lg hover:bg-teal-600 transition-colors"
          style={isRTL ? { left: 24 } : { right: 24 }}
          title={isRTL ? 'اسأل المحلل' : 'Ask the Analyst'}
        >
          <MessageSquare size={18} />
          <span className="text-sm font-semibold">{isRTL ? 'المحلل' : 'Analyst'}</span>
        </button>
      )}

      {/* Drawer */}
      <div
        className={cn(
          'fixed top-0 h-full w-full sm:w-[420px] bg-surface border-border shadow-2xl z-50 flex flex-col transition-transform',
          isRTL ? 'left-0 border-e' : 'right-0 border-s',
          open ? 'translate-x-0' : (isRTL ? '-translate-x-full' : 'translate-x-full')
        )}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-teal-500/10 text-teal-500 flex items-center justify-center">
              <MessageSquare size={16} />
            </div>
            <div>
              <div className="text-sm font-semibold text-on-surface">
                {isRTL ? 'المحلل' : 'Analyst'}
              </div>
              <div className="text-xs text-on-surface-tertiary">
                {isRTL ? 'اسأل عن الاشتراكات، الاستخدام، التكلفة' : 'Ask about subscriptions, usage, cost'}
              </div>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded hover:bg-surface-secondary text-on-surface-tertiary"
          >
            <X size={16} />
          </button>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-auto px-4 py-3 space-y-3">
          {messages.length === 0 && !streamContent && (
            <div className="text-center text-xs text-on-surface-tertiary py-12">
              {isRTL
                ? 'اطرح سؤالاً — مثال: "كم أنفق هذا الشهر؟" أو "أي اشتراك قارب على الحد؟"'
                : 'Ask a question — e.g., "How much did I spend this month?" or "Which subscription is near its limit?"'}
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn('rounded-[var(--radius)] px-3 py-2 text-sm', m.role === 'user' ? 'bg-accent/10 text-on-surface' : 'bg-surface-secondary text-on-surface')}>
              <div className="text-[10px] font-semibold text-on-surface-tertiary mb-1">
                {m.role === 'user' ? (isRTL ? 'أنت' : 'You') : (isRTL ? 'المحلل' : 'Analyst')}
              </div>
              <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-pre:my-2 prose-code:text-accent prose-code:bg-surface prose-code:px-1 prose-code:rounded prose-code:text-xs">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              </div>
            </div>
          ))}
          {streamContent && (
            <div className="rounded-[var(--radius)] px-3 py-2 text-sm bg-surface-secondary text-on-surface">
              <div className="text-[10px] font-semibold text-on-surface-tertiary mb-1">
                {isRTL ? 'المحلل' : 'Analyst'}
              </div>
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamContent}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={isRTL ? 'اسأل المحلل...' : 'Ask the analyst...'}
              rows={1}
              dir={isRTL ? 'rtl' : 'ltr'}
              disabled={streaming}
              className="flex-1 resize-none bg-input border border-border rounded-[var(--radius)] px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              style={{ minHeight: 40, maxHeight: 120 }}
            />
            <button
              onClick={send}
              disabled={streaming || !input.trim()}
              className="p-2 rounded-[var(--radius)] bg-accent text-on-accent disabled:opacity-40 hover:bg-accent-hover"
            >
              {streaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
