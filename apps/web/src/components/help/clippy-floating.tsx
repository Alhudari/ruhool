'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { X, Send, Loader2, Volume2, VolumeX, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiStream, apiFetch } from '@/lib/api';
import { ClippySVG, type HelpStep } from './clippy-help';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Msg = { id: string; role: 'user' | 'assistant'; content: string };

export function ClippyFloating({ pageHelp }: { pageHelp?: HelpStep[] }) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [convId, setConvId] = useState<string | null>(null);
  const [showHelpFirst, setShowHelpFirst] = useState(true);
  const [helpStep, setHelpStep] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Quip toast state
  const [quip, setQuip] = useState<string | null>(null);
  const [quipSettings, setQuipSettings] = useState<{ quipsEnabled: boolean; intervalMinutes: number }>({ quipsEnabled: true, intervalMinutes: 4 });

  // Load settings and schedule periodic quips
  useEffect(() => {
    apiFetch<{ quipsEnabled: boolean; intervalMinutes: number }>('/api/clippy/settings')
      .then(setQuipSettings)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!quipSettings.quipsEnabled || open) return;
    const fetchQuip = async () => {
      try {
        const r = await apiFetch<{ quip: string | null }>('/api/clippy/quip');
        if (r.quip) {
          setQuip(r.quip);
          // Auto-dismiss after 8 seconds
          setTimeout(() => setQuip(null), 8000);
        }
      } catch {}
    };
    // First quip after 30s, then at configured interval
    const first = setTimeout(fetchQuip, 30_000);
    const iv = setInterval(fetchQuip, quipSettings.intervalMinutes * 60_000);
    return () => { clearTimeout(first); clearInterval(iv); };
  }, [quipSettings.quipsEnabled, quipSettings.intervalMinutes, open]);

  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, streamContent]);

  const send = useCallback((text: string) => {
    if (!text.trim() || streaming) return;
    const userMsg: Msg = { id: crypto.randomUUID(), role: 'user', content: text };
    setMsgs((m) => [...m, userMsg]);
    setInput(''); setStreaming(true); setStreamContent('');
    let collected = '';
    apiStream(
      '/api/chat',
      { conversationId: convId, message: text, agentId: 'clippy' },
      (event, data: unknown) => {
        const d = data as Record<string, unknown>;
        if (event === 'conversation') { const id = d.conversationId as string; if (id) setConvId(id); }
        else if (event === 'text') { collected += (d.content as string) || ''; setStreamContent(collected); }
      },
      () => {
        if (collected) setMsgs((m) => [...m, { id: crypto.randomUUID(), role: 'assistant', content: collected }]);
        setStreamContent(''); setStreaming(false);
      },
      (err) => {
        setMsgs((m) => [...m, { id: crypto.randomUUID(), role: 'assistant', content: 'Error: ' + err }]);
        setStreaming(false); setStreamContent('');
      }
    );
  }, [convId, streaming]);

  const h = pageHelp && pageHelp[helpStep];

  return (
    <>
      {/* Floating button — Clippy stays pinned; the bubble floats above it absolutely
          so it never shifts his position when it appears/disappears. */}
      {!open && (
        <div className="fixed bottom-6 z-30" style={isRTL ? { left: 20 } : { right: 20 }}>
          {/* Quip speech bubble — absolutely positioned so it doesn't push Clippy */}
          {quip && (
            <div
              className="absolute max-w-[260px] min-w-[120px] bg-white dark:bg-slate-100 text-slate-900 text-xs rounded-2xl px-3 py-2 shadow-lg animate-in fade-in slide-in-from-bottom-2 cursor-pointer"
              onClick={() => setQuip(null)}
              dir={/[\u0600-\u06FF]/.test(quip) ? 'rtl' : 'ltr'}
              style={{
                bottom: 'calc(100% + 10px)',
                ...(isRTL ? { left: 0 } : { right: 0 }),
              }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); setQuip(null); }}
                className="absolute top-0.5 end-0.5 p-0.5 rounded hover:bg-slate-200 text-slate-500"
              >
                <X size={10} />
              </button>
              <div className="pe-3">{quip}</div>
              {/* Tail — points down-toward-Clippy */}
              <div
                className="absolute w-0 h-0"
                style={{
                  bottom: -7,
                  ...(isRTL ? { left: 22 } : { right: 22 }),
                  borderLeft: '7px solid transparent',
                  borderRight: '7px solid transparent',
                  borderTop: '7px solid white',
                }}
              />
            </div>
          )}
          <button
            onClick={() => setOpen(true)}
            className="transition-transform hover:scale-110 block"
            title={isRTL ? 'Clippy — اسألني أي شيء' : 'Clippy — ask me anything'}
          >
            <ClippySVG size={56} expression={quip ? 'smile' : 'idle'} />
          </button>
        </div>
      )}

      {/* Drawer */}
      {open && (
        <div
          className={cn('fixed bottom-6 z-50 w-[360px] max-w-[calc(100vw-32px)] h-[520px] bg-surface border border-border rounded-[var(--radius-lg)] shadow-2xl flex flex-col overflow-hidden')}
          style={isRTL ? { left: 20 } : { right: 20 }}
          dir={isRTL ? 'rtl' : 'ltr'}
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface-secondary">
            <div className="w-8 h-8"><ClippySVG size={32} /></div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-on-surface">Clippy</div>
              <div className="text-[10px] text-on-surface-tertiary">{isRTL ? 'مساعدك في Ruhool' : 'Your Ruhool assistant'}</div>
            </div>
            <button
              onClick={async () => {
                const next = !quipSettings.quipsEnabled;
                setQuipSettings((s) => ({ ...s, quipsEnabled: next }));
                await apiFetch('/api/clippy/settings', { method: 'PUT', body: JSON.stringify({ quipsEnabled: next }) }).catch(() => {});
              }}
              className="p-1 rounded hover:bg-surface text-on-surface-tertiary"
              title={quipSettings.quipsEnabled ? (isRTL ? 'إسكات الرسائل' : 'Mute quips') : (isRTL ? 'تفعيل الرسائل' : 'Enable quips')}
            >
              {quipSettings.quipsEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
            </button>
            <a
              href="/agents/clippy/prompt"
              className="p-1 rounded hover:bg-surface text-on-surface-tertiary"
              title={isRTL ? 'عدّل تعليمات Clippy' : 'Edit Clippy prompt'}
            >
              <Settings size={13} />
            </a>
            <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-surface text-on-surface-tertiary"><X size={14} /></button>
          </div>

          <div ref={bodyRef} className="flex-1 overflow-auto px-3 py-2 space-y-2">
            {showHelpFirst && h ? (
              <div className="rounded-[var(--radius)] bg-accent/5 border border-accent/20 p-3">
                <div className="text-center mb-2">
                  <div className="text-4xl mb-1">{h.illustration}</div>
                  <div className="text-sm font-semibold">{h.title[language]}</div>
                </div>
                <div className="text-xs text-on-surface-secondary leading-relaxed whitespace-pre-wrap">{h.body[language]}</div>
                <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-accent/20">
                  <div className="text-[10px] text-on-surface-tertiary">{helpStep + 1} / {pageHelp!.length}</div>
                  <div className="flex gap-1">
                    <button disabled={helpStep === 0} onClick={() => setHelpStep(s => s - 1)} className="px-2 py-1 rounded text-xs bg-surface-secondary disabled:opacity-30">{isRTL ? '→' : '←'}</button>
                    {helpStep < pageHelp!.length - 1
                      ? <button onClick={() => setHelpStep(s => s + 1)} className="px-2 py-1 rounded bg-accent text-on-accent text-xs font-semibold">{isRTL ? 'التالي' : 'Next'}</button>
                      : <button onClick={() => setShowHelpFirst(false)} className="px-2 py-1 rounded bg-accent text-on-accent text-xs font-semibold">{isRTL ? 'اسأل كليبي ←' : 'Ask Clippy →'}</button>}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {msgs.length === 0 && !streamContent && (
                  <div className="text-center text-xs text-on-surface-tertiary py-4">
                    {isRTL ? '👋 أهلاً! اسألني عن أي صفحة أو ميزة.' : "👋 Hi! Ask me about any page or feature."}
                  </div>
                )}
                {msgs.map((m) => (
                  <div key={m.id} className={cn('rounded-[var(--radius)] px-2 py-1.5 text-xs', m.role === 'user' ? 'bg-accent/10' : 'bg-surface-secondary')}>
                    <div className="text-[9px] font-semibold text-on-surface-tertiary mb-0.5">{m.role === 'user' ? (isRTL ? 'أنت' : 'You') : 'Clippy'}</div>
                    <div className="prose prose-xs max-w-none prose-p:my-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
                  </div>
                ))}
                {streamContent && (
                  <div className="rounded-[var(--radius)] px-2 py-1.5 text-xs bg-surface-secondary">
                    <div className="text-[9px] font-semibold text-on-surface-tertiary mb-0.5">Clippy</div>
                    <div className="prose prose-xs max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{streamContent}</ReactMarkdown></div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="border-t border-border p-2 flex gap-1">
            <input
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(input); }}
              placeholder={isRTL ? 'اسأل Clippy...' : 'Ask Clippy...'}
              dir={isRTL ? 'rtl' : 'ltr'}
              disabled={streaming}
              className="flex-1 bg-input border border-border rounded-[var(--radius)] px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button onClick={() => send(input)} disabled={streaming || !input.trim()} className="p-1.5 rounded bg-accent text-on-accent disabled:opacity-40">
              {streaming ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
