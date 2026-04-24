'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Send, Loader2, BookOpen, Target, Lightbulb,
  CheckSquare, TrendingUp, RefreshCw, Trash2,
  GraduationCap, Brain, Languages, Pencil, Check, X, Plus,
  MessageSquare, History, ChevronLeft, ChevronRight,
  Image as ImageIcon, Camera, Paperclip,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

// Pre-process Al-Khuwy's markdown so obsidian:// links with spaces actually work.
// The protocol handler is strict — every space must be %20.
function fixObsidianLinks(md: string): string {
  // Match (obsidian://...) inside markdown links and percent-encode spaces.
  return md.replace(
    /\((obsidian:\/\/[^)]+)\)/g,
    (_, url: string) => `(${url.replace(/ /g, '%20')})`
  );
}

// Allow obsidian:// (and other custom protocols) past ReactMarkdown's URL filter.
const ALLOWED_PROTOCOLS = /^(https?:|mailto:|tel:|obsidian:|zotero:|file:)/i;
function urlTransform(url: string): string {
  if (!url) return url;
  if (url.startsWith('#') || url.startsWith('/')) return url;
  return ALLOWED_PROTOCOLS.test(url) ? url : '';
}

// Same prose classes used in main chat-view for visual consistency
const PROSE_CLASSES =
  'text-sm text-on-surface leading-relaxed break-words prose prose-sm max-w-none ' +
  'prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 ' +
  'prose-pre:my-2 prose-code:text-accent prose-code:bg-surface-tertiary prose-code:px-1 ' +
  'prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-surface-tertiary ' +
  'prose-pre:rounded-lg prose-pre:p-3 prose-strong:text-on-surface prose-headings:text-on-surface ' +
  'prose-blockquote:border-accent prose-blockquote:text-on-surface-secondary';

type MemoryCategory = 'insight' | 'idea' | 'decision' | 'concern' | 'goal' | 'progress' | 'note';

interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  content: string;
  date: string;
  tags?: string[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

const CAT_CONFIG: Record<MemoryCategory, {
  icon: React.ElementType;
  color: string;            // text color class
  bg: string;               // soft bg class
  label: { en: string; ar: string };
}> = {
  insight:  { icon: Brain,        color: 'text-info',    bg: 'bg-info/15',    label: { en: 'Insights',  ar: 'رؤى' } },
  idea:     { icon: Lightbulb,    color: 'text-warning', bg: 'bg-warning/15', label: { en: 'Ideas',     ar: 'أفكار' } },
  decision: { icon: Target,       color: 'text-accent',  bg: 'bg-accent/15',  label: { en: 'Decisions', ar: 'قرارات' } },
  concern:  { icon: RefreshCw,    color: 'text-error',   bg: 'bg-error/15',   label: { en: 'Concerns',  ar: 'مخاوف' } },
  goal:     { icon: GraduationCap, color: 'text-success', bg: 'bg-success/15', label: { en: 'Goals',    ar: 'أهداف' } },
  progress: { icon: TrendingUp,   color: 'text-success', bg: 'bg-success/10', label: { en: 'Progress',  ar: 'تقدم' } },
  note:     { icon: BookOpen,     color: 'text-on-surface-secondary', bg: 'bg-surface-tertiary', label: { en: 'Notes', ar: 'ملاحظات' } },
};

const QUICK_PROMPTS = [
  { en: "Day 1 — what should I do?", ar: "اليوم الأول — ماذا أفعل؟" },
  { en: "Suggest a daily research routine", ar: "اقترح روتيناً يومياً للبحث" },
  { en: "What are the key BIM adoption theories?", ar: "ما أهم نظريات تبني BIM؟" },
  { en: "How should I structure my literature review?", ar: "كيف أنظم مراجعتي الأدبية؟" },
  { en: "What's my research progress so far?", ar: "ما تقدمي البحثي حتى الآن؟" },
  { en: "Help me think through my methodology", ar: "ساعدني في التفكير بمنهجيتي" },
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

export function CompanionPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [memory, setMemory] = useState<MemoryEntry[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [memFilter, setMemFilter] = useState<MemoryCategory | 'all'>('all');
  const [responseLang, setResponseLang] = useState<'ar' | 'en'>('ar');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('note');
  const [conversations, setConversations] = useState<Array<{ id: string; title: string; updatedAt: string }>>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  // Message queue — user can keep typing while Al-Khuwy replies
  const messageQueueRef = useRef<string[]>([]);
  const processingQueueRef = useRef(false);
  // Memory panel toggle
  const [memoryOpen, setMemoryOpen] = useState(true);
  // Image attachments (sent with next message)
  const [pendingImages, setPendingImages] = useState<Array<{ id: string; base64: string; mimeType: string; previewUrl: string; name: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadMemory = useCallback(async () => {
    try {
      const data = await apiFetch<MemoryEntry[]>('/api/companion/memory');
      setMemory(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadMemory(); }, [loadMemory]);

  // Load Al-Khuwy conversation list
  const loadConversations = useCallback(async () => {
    try {
      const all = await apiFetch<Array<{ id: string; title: string; updatedAt: string; agentId?: string; archived?: boolean }>>('/api/conversations');
      const rumman = all
        .filter((c) => c.agentId === 'research-companion' && !c.archived)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setConversations(rumman);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Auto-resume the most recent Al-Khuwy conversation when the page mounts.
  // Only does it once (when no convId yet) — never overwrites an active session.
  const autoResumedRef = useRef(false);
  useEffect(() => {
    if (autoResumedRef.current || convId || conversations.length === 0) return;
    autoResumedRef.current = true;
    loadConversation(conversations[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations]);

  // Load a past conversation's messages
  const loadConversation = async (id: string) => {
    setLoadingConv(true);
    try {
      const msgs = await apiFetch<Array<{ id: string; role: string; content: string; createdAt: string }>>(`/api/conversations/${id}/messages`);
      setMessages(msgs.map((m) => ({
        id: m.id,
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
        createdAt: m.createdAt,
      })));
      setConvId(id);
      setShowHistory(false);
    } catch { /* ignore */ }
    setLoadingConv(false);
  };

  // After a new chat sends, refresh conversations list
  useEffect(() => {
    if (convId && !conversations.find((c) => c.id === convId)) {
      loadConversations();
    }
  }, [convId, conversations, loadConversations]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const deleteMemory = async (id: string) => {
    await apiFetch(`/api/companion/memory/${id}`, { method: 'DELETE' });
    setMemory((prev) => prev.filter((e) => e.id !== id));
  };

  const startEdit = (entry: MemoryEntry) => {
    setEditingId(entry.id);
    setEditText(entry.content);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const updated = await apiFetch<MemoryEntry>(`/api/companion/memory/${editingId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: editText }),
    });
    setMemory((prev) => prev.map((e) => (e.id === editingId ? updated : e)));
    setEditingId(null);
    setEditText('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const addNew = async () => {
    if (!newText.trim()) return;
    const created = await apiFetch<MemoryEntry>('/api/companion/memory', {
      method: 'POST',
      body: JSON.stringify({ content: newText.trim(), category: newCategory }),
    });
    setMemory((prev) => [...prev, created]);
    setNewText('');
    setAddingNew(false);
  };

  // Public send — adds to queue; user can call repeatedly without waiting
  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content) return;
    setInput('');
    // If something's in flight, queue this one
    if (processingQueueRef.current) {
      messageQueueRef.current.push(content);
      return;
    }
    await runSend(content);
    // Drain queue
    while (messageQueueRef.current.length > 0) {
      const next = messageQueueRef.current.shift();
      if (next) await runSend(next);
    }
  };

  const handleImageFiles = (files: FileList) => {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const id = crypto.randomUUID();
        const mt = dataUrl.match(/data:([^;]+);/)?.[1] ?? 'image/jpeg';
        const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
        setPendingImages((prev) => [...prev, { id, base64, mimeType: mt, previewUrl: dataUrl, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const runSend = async (content: string) => {
    processingQueueRef.current = true;
    setSending(true);
    const imagesToSend = pendingImages.slice();
    setPendingImages([]);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(), role: 'user',
      content, createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, {
      id: assistantId, role: 'assistant', content: '', createdAt: new Date().toISOString(),
    }]);

    let fullText = '';
    let receivedAnyText = false;
    try {
      // Inject a language directive based on the response language toggle.
      // The agent defaults to Arabic; only override when user picks English.
      const langDirective = responseLang === 'en'
        ? '\n\n[Reply in English.]'
        : '';
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Ruhool-Chat-V2': '0' },
        body: JSON.stringify({
          message: content + langDirective,
          agentId: 'research-companion',
          conversationId: convId,
          language: responseLang,
          images: imagesToSend.length > 0 ? imagesToSend.map((i) => ({ base64: i.base64, mimeType: i.mimeType })) : undefined,
        }),
      });

      // Buffer the entire response — DO NOT update the message until done.
      // This avoids the "scrolling" UX where text trickles in.
      try {
        for await (const { event, data } of readSSE(res)) {
          if (event === 'conversation') {
            try {
              const d = JSON.parse(data) as { conversationId?: string };
              if (d.conversationId && !convId) setConvId(d.conversationId);
            } catch { /* ignore */ }
          }
          if (event === 'text') {
            try {
              const d = JSON.parse(data) as { content?: string };
              if (d.content) {
                fullText += d.content;
                receivedAnyText = true;
              }
            } catch { /* ignore */ }
          }
          if (event === 'done') break;
        }
      } catch (innerErr) {
        // SSE stream errored or got cut. If we received content, still show it.
        if (!receivedAnyText) throw innerErr;
      }
      // Reveal the full message in one shot (animation handled in CSS via key change)
      setMessages((prev) => prev.map((m) =>
        m.id === assistantId ? { ...m, content: fullText } : m
      ));
      loadMemory();
    } catch (e) {
      // Only show error if we never received any content
      if (!receivedAnyText) {
        setMessages((prev) => prev.map((m) =>
          m.id === assistantId ? { ...m, content: `⚠️ ${e instanceof Error ? e.message : 'failed'}` } : m
        ));
      } else {
        // Got partial content — show it and a soft warning
        setMessages((prev) => prev.map((m) =>
          m.id === assistantId ? { ...m, content: fullText } : m
        ));
      }
    } finally {
      setSending(false);
      processingQueueRef.current = false;
      textareaRef.current?.focus();
    }
  };

  const visibleMemory = memFilter === 'all' ? memory : memory.filter((e) => e.category === memFilter);

  return (
    <div className="flex-1 flex overflow-hidden bg-surface" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ── Left: Chat ───────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-border">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-surface-secondary">
          <div className="h-9 w-9 rounded-xl bg-success/15 border border-success/30 flex items-center justify-center shrink-0">
            <GraduationCap className="h-5 w-5 text-success" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-on-surface">
              {isRTL ? 'الخوي — رفيق الدكتوراه' : 'Al-Khuwy — Research Companion'}
            </h1>
            <p className="text-[11px] text-on-surface-tertiary">
              {isRTL ? 'قعود من ذود رحول. رفيقك في مسيرة الدكتوراه.' : 'Your daily PhD guide, idea partner, and research memory.'}
            </p>
          </div>
          <div className="ms-auto flex items-center gap-2 relative">
            {/* Compact button (when conversation has > 20 messages) */}
            {convId && messages.length > 20 && (
              <button
                onClick={async () => {
                  if (!confirm(isRTL
                    ? `سيُلخّص ${messages.length - 10} رسالة قديمة إلى ملخص واحد ويُحفظ آخر 10. هل تتابع؟`
                    : `Will summarize ${messages.length - 10} old messages and keep the last 10. Continue?`)) return;
                  try {
                    const r = await apiFetch<{ ok: boolean; summarized: number; kept: number }>(`/api/companion/conversations/${convId}/compact`, { method: 'POST' });
                    alert(isRTL
                      ? `✓ تم تلخيص ${r.summarized} رسالة. الباقي ${r.kept}.`
                      : `✓ Summarized ${r.summarized} messages. Kept ${r.kept}.`);
                    if (convId) loadConversation(convId);
                  } catch (e) {
                    alert(e instanceof Error ? e.message : 'compact failed');
                  }
                }}
                title={isRTL ? 'لخّص الرسائل القديمة (ضغط)' : 'Compact old messages'}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium text-info hover:bg-info/10 transition-colors"
              >
                📜 {isRTL ? `ضغط (${messages.length})` : `Compact (${messages.length})`}
              </button>
            )}
            {/* History toggle */}
            <button
              onClick={() => setShowHistory((v) => !v)}
              title={isRTL ? 'المحادثات السابقة' : 'Past conversations'}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors',
                showHistory
                  ? 'bg-accent text-on-accent'
                  : 'text-on-surface-tertiary hover:text-on-surface-secondary hover:bg-surface-tertiary'
              )}
            >
              <History className="h-3 w-3" />
              {conversations.length}
            </button>
            {/* Language toggle */}
            <button
              onClick={() => setResponseLang((prev) => prev === 'ar' ? 'en' : 'ar')}
              title={responseLang === 'ar' ? 'رد بالإنجليزية' : 'Reply in Arabic'}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors',
                responseLang === 'ar'
                  ? 'bg-accent/15 text-accent'
                  : 'bg-info/15 text-info'
              )}
            >
              <Languages className="h-3 w-3" />
              {responseLang === 'ar' ? 'عربي' : 'EN'}
            </button>
            <button
              onClick={() => { setMessages([]); setConvId(null); }}
              className="text-[11px] text-on-surface-tertiary hover:text-on-surface-secondary transition-colors flex items-center gap-1"
            >
              <RefreshCw className="h-3 w-3" />
              {isRTL ? 'محادثة جديدة' : 'New chat'}
            </button>

            {/* History dropdown */}
            {showHistory && (
              <div
                className={cn(
                  'absolute top-full mt-2 w-80 max-h-[420px] rounded-xl border border-border bg-surface shadow-2xl z-30 overflow-hidden flex flex-col',
                  isRTL ? 'left-0' : 'right-0'
                )}
              >
                <div className="px-4 py-2 border-b border-border flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-widest text-on-surface-tertiary">
                    {isRTL ? 'المحادثات السابقة' : 'Past Conversations'}
                  </span>
                  <button
                    onClick={() => setShowHistory(false)}
                    className="text-on-surface-tertiary hover:text-on-surface"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-border">
                  {conversations.length === 0 ? (
                    <p className="text-xs text-on-surface-tertiary text-center py-8">
                      {isRTL ? 'لا توجد محادثات سابقة' : 'No past conversations'}
                    </p>
                  ) : (
                    conversations.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => loadConversation(c.id)}
                        className={cn(
                          'w-full text-start px-4 py-3 hover:bg-surface-tertiary transition-colors flex items-start gap-2',
                          c.id === convId && 'bg-surface-tertiary'
                        )}
                      >
                        <MessageSquare className="h-3.5 w-3.5 text-on-surface-tertiary shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-on-surface line-clamp-1">{c.title || (isRTL ? 'بدون عنوان' : 'Untitled')}</p>
                          <p className="text-[10px] text-on-surface-tertiary mt-0.5">{c.updatedAt.slice(0, 10)}</p>
                        </div>
                        {c.id === convId && (
                          <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0 mt-1.5" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 relative">
          {loadingConv && (
            <div className="absolute inset-0 z-20 bg-surface/80 backdrop-blur-sm flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          )}
          {messages.length === 0 && (
            <div className="space-y-6">
              <div className="text-center space-y-2 py-8">
                <div className="h-16 w-16 rounded-2xl bg-success/10 border border-success/30 flex items-center justify-center mx-auto">
                  <GraduationCap className="h-8 w-8 text-success" />
                </div>
                <h2 className="text-xl font-bold text-on-surface">
                  {isRTL ? 'أهلاً، أنا الخوي' : "Hello, I'm Rumman"}
                </h2>
                <p className="text-sm text-on-surface-tertiary max-w-sm mx-auto leading-relaxed">
                  {isRTL
                    ? 'رفيقك في رحلة الدكتوراه. أعرف مسيرتك، أتذكر أفكارك، وأساعدك في كل يوم من أيام البحث.'
                    : 'Your PhD companion. I know your journey, remember your ideas, and guide you through every research day.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl mx-auto">
                {QUICK_PROMPTS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(isRTL ? p.ar : p.en)}
                    className="text-start px-4 py-3 rounded-xl border border-border bg-surface-secondary hover:bg-surface-tertiary hover:border-border-hover transition-all text-sm text-on-surface-secondary hover:text-on-surface"
                  >
                    {isRTL ? p.ar : p.en}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              {msg.role === 'assistant' && (
                <div className="h-7 w-7 rounded-lg bg-success/15 border border-success/30 flex items-center justify-center shrink-0 mt-0.5">
                  <GraduationCap className="h-4 w-4 text-success" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[75%] rounded-2xl px-4 py-3',
                  msg.role === 'user'
                    ? 'bg-accent/15 text-on-surface rounded-tr-sm text-sm leading-relaxed'
                    : 'bg-surface-secondary rounded-tl-sm border border-border'
                )}
                dir={/[\u0600-\u06FF]/.test(msg.content) ? 'rtl' : 'ltr'}
              >
                {msg.role === 'assistant' && !msg.content ? (
                  // Loading: animated typing dots while Al-Khuwy thinks
                  <div className="flex items-center gap-1.5 py-1">
                    <span className="h-2 w-2 rounded-full bg-success/60 animate-[bounce_1s_infinite]" />
                    <span className="h-2 w-2 rounded-full bg-success/60 animate-[bounce_1s_infinite_0.15s]" />
                    <span className="h-2 w-2 rounded-full bg-success/60 animate-[bounce_1s_infinite_0.3s]" />
                    <span className="ms-2 text-[11px] text-on-surface-tertiary">
                      {isRTL ? 'الخوي يفكر...' : 'Al-Khuwy is thinking...'}
                    </span>
                  </div>
                ) : msg.role === 'assistant' ? (
                  // Reveal: full response appears with a fade+slide animation
                  <div
                    className={cn(PROSE_CLASSES, 'animate-[fadeInUp_0.4s_ease-out]')}
                    style={{ animationFillMode: 'both' }}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      urlTransform={urlTransform}
                      components={{
                        // Open external links in new tab
                        a: ({ node: _node, href, children, ...props }) => (
                          <a
                            href={href}
                            target={href?.startsWith('obsidian:') ? '_self' : '_blank'}
                            rel="noopener noreferrer"
                            {...props}
                          >
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {fixObsidianLinks(
                        msg.content
                          .replace(/\[REMEMBER[\s\S]*?\[\/REMEMBER\]/gi, '')
                          .trim()
                      )}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-border bg-surface-secondary">
          {/* Pending images preview */}
          {pendingImages.length > 0 && (
            <div className="mb-2 flex items-center gap-2 flex-wrap">
              {pendingImages.map((img) => (
                <div key={img.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.previewUrl} alt={img.name} className="h-14 w-14 object-cover rounded-md border border-border" />
                  <button
                    onClick={() => setPendingImages((p) => p.filter((x) => x.id !== img.id))}
                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-error text-white flex items-center justify-center"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
              <span className="text-[10px] text-on-surface-tertiary">
                {pendingImages.length} {isRTL ? 'صورة جاهزة للإرسال' : 'image(s) ready'}
              </span>
            </div>
          )}
          {/* Attach buttons row */}
          <div className="flex items-center gap-1 mb-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              title={isRTL ? 'إرفاق صور' : 'Attach images'}
              className="h-8 w-8 rounded-md text-on-surface-tertiary hover:text-accent hover:bg-surface-tertiary flex items-center justify-center"
            >
              <ImageIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => cameraInputRef.current?.click()}
              title={isRTL ? 'كاميرا' : 'Camera'}
              className="h-8 w-8 rounded-md text-on-surface-tertiary hover:text-accent hover:bg-surface-tertiary flex items-center justify-center"
            >
              <Camera className="h-4 w-4" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple hidden
              onChange={(e) => { if (e.target.files) handleImageFiles(e.target.files); e.target.value = ''; }} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden
              onChange={(e) => { if (e.target.files) handleImageFiles(e.target.files); e.target.value = ''; }} />
          </div>
          <div className="flex gap-3 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
              }}
              placeholder={
                sending
                  ? (isRTL ? 'اكتب رسالتك التالية... ستُرسَل بعد رد الخوي' : 'Type your next message... queued for after reply')
                  : (isRTL ? 'اسأل الخوي عن مسيرتك البحثية...' : 'Ask Al-Khuwy about your research journey...')
              }
              rows={2}
              className={cn(
                'flex-1 resize-none bg-surface border border-border rounded-xl px-4 py-3 text-sm text-on-surface',
                'placeholder:text-on-surface-tertiary focus:outline-none focus:border-accent focus:bg-surface-secondary transition-all',
                'disabled:opacity-50'
              )}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim()}
              title={sending && messageQueueRef.current.length > 0 ? `Queued: ${messageQueueRef.current.length}` : undefined}
              className="h-11 w-11 rounded-xl bg-success/20 border border-success/40 flex items-center justify-center shrink-0 hover:bg-success/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed relative"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin text-success" />
              ) : (
                <Send className="h-4 w-4 text-success" />
              )}
              {messageQueueRef.current.length > 0 && (
                <span className="absolute -top-1 -end-1 h-4 min-w-[16px] px-1 rounded-full bg-warning text-on-accent text-[10px] font-bold flex items-center justify-center">
                  {messageQueueRef.current.length}
                </span>
              )}
            </button>
          </div>
          <p className="text-[10px] text-on-surface-tertiary mt-2 text-center">
            {isRTL ? 'Enter للإرسال · Shift+Enter لسطر جديد' : 'Enter to send · Shift+Enter for new line'}
          </p>
        </div>
      </div>

      {/* ── Right: Memory Panel (collapsible) ────────────────────── */}
      {!memoryOpen && (
        <button
          onClick={() => setMemoryOpen(true)}
          title={isRTL ? 'فتح الذاكرة' : 'Open memory'}
          className={cn(
            'h-full px-1 border-border bg-surface-secondary hover:bg-surface-tertiary text-on-surface-tertiary hover:text-accent transition-colors flex items-center justify-center shrink-0',
            isRTL ? 'border-r' : 'border-l'
          )}
        >
          {isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      )}
      <div className={cn(
        'flex flex-col border-border bg-surface-secondary shrink-0 transition-all',
        isRTL ? 'border-r' : 'border-l',
        memoryOpen ? 'w-72' : 'w-0 overflow-hidden border-l-0 border-r-0',
      )}>

        {/* Memory header */}
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="h-4 w-4 text-on-surface-secondary" />
            <span className="text-[11px] uppercase tracking-widest text-on-surface-tertiary">
              {isRTL ? 'ذاكرة الخوي' : "Al-Khuwy's Memory"}
            </span>
            <span className="text-[10px] text-on-surface-tertiary">{memory.length}</span>
            <button
              onClick={() => setAddingNew((v) => !v)}
              title={isRTL ? 'إضافة ذكرى' : 'Add memory'}
              className="ms-auto h-5 w-5 rounded flex items-center justify-center text-on-surface-tertiary hover:text-accent hover:bg-surface-tertiary transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setMemoryOpen(false)}
              title={isRTL ? 'إخفاء' : 'Hide'}
              className="h-5 w-5 rounded flex items-center justify-center text-on-surface-tertiary hover:text-on-surface-secondary hover:bg-surface-tertiary transition-colors"
            >
              {isRTL ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
            </button>
          </div>

          {/* New entry form */}
          {addingNew && (
            <div className="mb-3 p-2 rounded-lg bg-surface-tertiary border border-border space-y-2">
              <div className="flex gap-1 flex-wrap">
                {(Object.keys(CAT_CONFIG) as MemoryCategory[]).map((cat) => {
                  const cfg = CAT_CONFIG[cat];
                  return (
                    <button
                      key={cat}
                      onClick={() => setNewCategory(cat)}
                      className={cn(
                        'text-[9px] px-1.5 py-0.5 rounded-full transition-colors',
                        newCategory === cat ? cn(cfg.bg, cfg.color) : 'text-on-surface-tertiary hover:text-on-surface-secondary'
                      )}
                    >
                      {cfg.label[language]}
                    </button>
                  );
                })}
              </div>
              <textarea
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder={isRTL ? 'اكتب ما تريد تذكره...' : 'What do you want to remember...'}
                rows={3}
                className="w-full bg-surface border border-border rounded p-2 text-xs text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:border-accent resize-none"
              />
              <div className="flex justify-end gap-1">
                <button
                  onClick={() => { setAddingNew(false); setNewText(''); }}
                  className="text-[10px] px-2 py-1 rounded text-on-surface-tertiary hover:text-on-surface-secondary"
                >
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={addNew}
                  disabled={!newText.trim()}
                  className="text-[10px] px-2 py-1 rounded bg-accent text-on-accent disabled:opacity-40"
                >
                  {isRTL ? 'حفظ' : 'Save'}
                </button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setMemFilter('all')}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full transition-colors',
                memFilter === 'all'
                  ? 'bg-surface-tertiary text-on-surface'
                  : 'text-on-surface-tertiary hover:text-on-surface-secondary'
              )}
            >
              {isRTL ? 'الكل' : 'All'}
            </button>
            {(Object.keys(CAT_CONFIG) as MemoryCategory[]).map((cat) => {
              const cfg = CAT_CONFIG[cat];
              return (
                <button
                  key={cat}
                  onClick={() => setMemFilter(cat)}
                  className={cn(
                    'text-[10px] px-2 py-0.5 rounded-full transition-colors',
                    memFilter === cat ? cn(cfg.bg, cfg.color) : 'text-on-surface-tertiary hover:text-on-surface-secondary'
                  )}
                >
                  {cfg.label[language]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Memory list */}
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {visibleMemory.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Brain className="h-8 w-8 text-on-surface-tertiary opacity-30 mx-auto mb-2" />
              <p className="text-xs text-on-surface-tertiary">
                {isRTL ? 'لا توجد ذكريات بعد' : 'No memories yet'}
              </p>
              <p className="text-[10px] text-on-surface-tertiary opacity-60 mt-1">
                {isRTL ? 'ستظهر هنا ما يدوّنه الخوي' : "Al-Khuwy's notes will appear here"}
              </p>
            </div>
          ) : (
            visibleMemory.map((entry) => {
              const cfg = CAT_CONFIG[entry.category];
              const Icon = cfg.icon;
              const isEditing = editingId === entry.id;
              return (
                <div key={entry.id} className="px-4 py-3 hover:bg-surface-tertiary transition-colors group">
                  <div className="flex items-start gap-2">
                    <div className={cn('h-5 w-5 rounded flex items-center justify-center shrink-0 mt-0.5', cfg.bg, cfg.color)}>
                      <Icon className="h-3 w-3" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit();
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          autoFocus
                          rows={3}
                          className="w-full bg-surface border border-accent rounded p-1.5 text-xs text-on-surface focus:outline-none resize-none"
                        />
                      ) : (
                        <p className="text-xs text-on-surface-secondary leading-snug">{entry.content}</p>
                      )}
                      {entry.tags && entry.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {entry.tags.map((tag) => (
                            <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-tertiary text-on-surface-tertiary">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-[9px] text-on-surface-tertiary opacity-70 mt-1">{entry.date}</p>
                    </div>
                    {isEditing ? (
                      <div className="flex flex-col gap-1 shrink-0">
                        <button onClick={saveEdit} title={isRTL ? 'حفظ' : 'Save'}>
                          <Check className="h-3.5 w-3.5 text-success hover:text-success/70 transition-colors" />
                        </button>
                        <button onClick={cancelEdit} title={isRTL ? 'إلغاء' : 'Cancel'}>
                          <X className="h-3.5 w-3.5 text-on-surface-tertiary hover:text-error transition-colors" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => startEdit(entry)} title={isRTL ? 'تعديل' : 'Edit'}>
                          <Pencil className="h-3.5 w-3.5 text-on-surface-tertiary hover:text-accent transition-colors" />
                        </button>
                        <button onClick={() => deleteMemory(entry.id)} title={isRTL ? 'حذف' : 'Delete'}>
                          <Trash2 className="h-3.5 w-3.5 text-on-surface-tertiary hover:text-error transition-colors" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Stats strip */}
        <div className="px-4 py-3 border-t border-border grid grid-cols-3 gap-2">
          {(['insight', 'idea', 'decision'] as MemoryCategory[]).map((cat) => {
            const count = memory.filter((e) => e.category === cat).length;
            const cfg = CAT_CONFIG[cat];
            const Icon = cfg.icon;
            return (
              <div key={cat} className="flex flex-col items-center gap-0.5">
                <div className={cn('h-5 w-5 rounded flex items-center justify-center', cfg.bg, cfg.color)}>
                  <Icon className="h-3 w-3" />
                </div>
                <span className="text-sm font-bold text-on-surface-secondary">{count}</span>
                <span className="text-[9px] text-on-surface-tertiary">{cfg.label[language]}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
