'use client';

import { useState, useRef } from 'react';
import {
  Wand2, Loader2, Check, X, Send, Sparkles, ChevronUp, ChevronDown,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';

const PROSE = 'text-sm text-on-surface leading-relaxed prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-strong:text-on-surface';

interface SayyaqPanelProps {
  /** Current note/source/meeting context */
  context: {
    title?: string;
    body: string;
    /** atomic-note | paper | meeting | source | inbox | writing — auto-picks tone */
    kind: string;
    /** Vault path if this is a real file */
    path?: string;
  };
  /** Called when user accepts a rewrite — receives the new body */
  onAccept: (newBody: string) => void;
  /** Optional: position — 'inline' renders below trigger, 'modal' opens overlay */
  variant?: 'inline' | 'modal';
}

const QUICK_ACTIONS = [
  { id: 'tighten', en: 'Tighten', ar: 'اختصر' },
  { id: 'academic', en: 'Make academic', ar: 'أكثر أكاديمي' },
  { id: 'casual', en: 'Make casual', ar: 'أبسط' },
  { id: 'bullets', en: 'Bullet form', ar: 'نقاط' },
  { id: 'expand', en: 'Expand', ar: 'وسّع' },
  { id: 'fix-grammar', en: 'Fix grammar', ar: 'صحّح اللغة' },
];

async function* readSSE(response: Response): AsyncGenerator<{ event: string; data: string }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    let event = 'message';
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) {
        yield { event, data: line.slice(5).trim() };
        event = 'message';
      }
    }
  }
}

export function SayyaqPanel({ context, onAccept, variant = 'inline' }: SayyaqPanelProps) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [progressChars, setProgressChars] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const ask = async (instruction: string) => {
    if (!instruction.trim()) return;
    setBusy(true); setError(null); setSuggestion(null); setProgressChars(0);
    const startTime = Date.now();
    const timer = setInterval(() => setElapsedSec(Math.floor((Date.now() - startTime) / 1000)), 500);
    const message = `الكاتب:
- النوع: ${context.kind}
- العنوان: ${context.title ?? '(بلا عنوان)'}
${context.path ? `- المسار: ${context.path}` : ''}

النص الحالي:
"""
${context.body}
"""

طلب المستخدم: ${instruction}

أعطني الناتج بهذا التنسيق فقط:
[REWRITE]
الصياغة الجديدة الكاملة هنا
[/REWRITE]`;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Ruhool-Chat-V2': '0' },
        body: JSON.stringify({
          message,
          agentId: 'sayyaq',
          language,
        }),
      });
      let full = '';
      for await (const { event, data } of readSSE(res)) {
        if (event === 'text') {
          try {
            full += (JSON.parse(data) as { content?: string }).content ?? '';
            setProgressChars(full.length);
          } catch {}
        }
        if (event === 'done') break;
      }
      clearInterval(timer);
      const m = full.match(/\[REWRITE\]([\s\S]*?)\[\/REWRITE\]/i);
      setSuggestion(m ? m[1].trim() : full.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    }
    clearInterval(timer);
    setBusy(false);
  };

  const accept = () => {
    if (suggestion) {
      onAccept(suggestion);
      setSuggestion(null);
      setRequest('');
      setOpen(false);
    }
  };

  const wrapper = variant === 'modal' && open ? (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl shadow-2xl">
        {renderContent()}
      </div>
    </div>
  ) : (
    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5">
      {renderContent()}
    </div>
  );

  function renderContent() {
    return (
      <div dir={isRTL ? 'rtl' : 'ltr'}>
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-cyan-500/10 transition-colors"
        >
          <Wand2 className="h-4 w-4 text-cyan-500" />
          <span className="font-semibold text-on-surface flex-1 text-start">
            {isRTL ? 'السيّاق — مساعد الصياغة' : 'Sayyaq — Writing Assistant'}
          </span>
          {open ? <ChevronUp className="h-3.5 w-3.5 text-on-surface-tertiary" /> : <ChevronDown className="h-3.5 w-3.5 text-on-surface-tertiary" />}
        </button>

        {open && (
          <div className="px-4 pb-4 border-t border-cyan-500/20 pt-3 space-y-3">
            {/* Quick actions */}
            <div className="flex flex-wrap gap-1">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => ask(isRTL ? a.ar : a.en)}
                  disabled={busy}
                  className="text-[11px] px-2 py-1 rounded-full bg-surface border border-border hover:border-cyan-500 text-on-surface-secondary disabled:opacity-50"
                >
                  {isRTL ? a.ar : a.en}
                </button>
              ))}
            </div>

            {/* Custom request */}
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ask(request); }}
                placeholder={isRTL ? 'أو اكتب طلباً مخصّصاً...' : 'Or type a custom request...'}
                rows={2}
                className="flex-1 bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-on-surface focus:outline-none focus:border-cyan-500 resize-none"
              />
              <button
                onClick={() => ask(request)}
                disabled={!request.trim() || busy}
                className="px-3 rounded-lg bg-cyan-500 text-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>

            {busy && (
              <div className="flex items-center gap-2 text-xs text-cyan-500 bg-cyan-500/5 rounded-lg px-2 py-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>
                  {isRTL ? 'السيّاق يكتب...' : 'Sayyaq is writing...'}
                </span>
                <span className="ms-auto font-mono text-on-surface-tertiary">
                  {progressChars} {isRTL ? 'حرف' : 'chars'} · {elapsedSec}s
                </span>
                <div className="h-1.5 w-24 bg-cyan-500/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 transition-all"
                    style={{
                      // Approximation: 800 chars = 100% (rough model output)
                      width: `${Math.min(100, (progressChars / 800) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {error && <p className="text-xs text-error">{error}</p>}

            {/* Side-by-side comparison */}
            {suggestion && (
              <div className="space-y-2">
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-on-surface-tertiary mb-1">
                      {isRTL ? 'الأصلي' : 'Original'}
                    </p>
                    <div className="rounded border border-border bg-surface p-2 max-h-48 overflow-y-auto">
                      <p className="text-xs text-on-surface-secondary whitespace-pre-wrap leading-relaxed">{context.body}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-cyan-500 mb-1 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      {isRTL ? 'اقتراح السيّاق' : "Sayyaq's suggestion"}
                    </p>
                    <div className="rounded border border-cyan-500/40 bg-cyan-500/5 p-2 max-h-48 overflow-y-auto">
                      <div className={PROSE}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{suggestion}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setSuggestion(null)}
                    className="text-xs px-3 py-1.5 rounded text-on-surface-tertiary hover:text-on-surface-secondary"
                  >
                    <X className="inline h-3 w-3 me-1" />
                    {isRTL ? 'إلغاء' : 'Discard'}
                  </button>
                  <button
                    onClick={accept}
                    className="text-xs px-3 py-1.5 rounded bg-cyan-500 text-white hover:opacity-90"
                  >
                    <Check className="inline h-3 w-3 me-1" />
                    {isRTL ? 'اعتمد' : 'Accept'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return wrapper;
}
