'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import {
  Send, Loader2, RefreshCw, ClipboardList, FileCheck2, Languages,
  Image as ImageIcon, Camera, X, History, MessageSquare,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';

const PROSE_CLASSES =
  'text-sm text-on-surface leading-relaxed break-words prose prose-sm max-w-none ' +
  'prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 ' +
  'prose-strong:text-on-surface prose-headings:text-on-surface ' +
  'prose-blockquote:border-accent prose-blockquote:text-on-surface-secondary';

const QUICK_PROMPTS = [
  { en: 'Prepare for next meeting', ar: 'جهّزني للاجتماع القادم' },
  { en: 'Write up the meeting I just had', ar: 'اكتب الاجتماع الذي انتهى للتو' },
  { en: 'What changed since last meeting?', ar: 'ماذا حدث منذ آخر اجتماع؟' },
  { en: 'Show pending action items', ar: 'اعرض بنود العمل المعلّقة' },
];

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

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

function urlTransform(url: string): string {
  if (!url) return url;
  if (url.startsWith('#') || url.startsWith('/')) return url;
  return /^(https?:|mailto:|obsidian:|zotero:|file:)/i.test(url) ? url : '';
}

export function MudawwinPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [responseLang, setResponseLang] = useState<'ar' | 'en'>('ar');
  const [createdMeetings, setCreatedMeetings] = useState<string[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingImages, setPendingImages] = useState<Array<{ id: string; base64: string; mimeType: string; previewUrl: string; name: string }>>([]);
  const [conversations, setConversations] = useState<Array<{ id: string; title: string; updatedAt: string }>>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      const all = await apiFetch<Array<{ id: string; title: string; updatedAt: string; agentId?: string; archived?: boolean }>>('/api/conversations');
      const mine = all
        .filter((c) => c.agentId === 'mudawwin' && !c.archived)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setConversations(mine);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const loadConversation = async (id: string) => {
    setLoadingConv(true);
    try {
      const msgs = await apiFetch<Array<{ id: string; role: string; content: string }>>(`/api/conversations/${id}/messages`);
      setMessages(msgs.map((m) => ({
        id: m.id,
        role: m.role === 'user' ? 'user' as const : 'assistant' as const,
        content: m.content,
      })));
      setConvId(id);
      setShowHistory(false);
    } catch {}
    setLoadingConv(false);
  };

  useEffect(() => {
    if (convId && !conversations.find((c) => c.id === convId)) loadConversations();
  }, [convId, conversations, loadConversations]);

  const handleImageFiles = (files: FileList) => {
    Array.from(files).forEach((file) => {
      const r = new FileReader();
      r.onload = (e) => {
        const url = e.target?.result as string;
        setPendingImages((prev) => [...prev, {
          id: crypto.randomUUID(),
          base64: url.replace(/^data:[^;]+;base64,/, ''),
          mimeType: url.match(/data:([^;]+);/)?.[1] ?? 'image/jpeg',
          previewUrl: url,
          name: file.name,
        }]);
      };
      r.readAsDataURL(file);
    });
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content) return;
    setInput('');
    if (processingRef.current) {
      queueRef.current.push(content);
      return;
    }
    await runSend(content);
    while (queueRef.current.length > 0) {
      const next = queueRef.current.shift();
      if (next) await runSend(next);
    }
  };

  const runSend = async (content: string) => {
    processingRef.current = true;
    setSending(true);
    const imagesToSend = pendingImages.slice();
    setPendingImages([]);

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content };
    setMessages((prev) => [...prev, userMsg]);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    let fullText = '';
    let receivedAnyText = false;
    try {
      const langDirective = responseLang === 'en' ? '\n\n[Reply in English.]' : '';
      const imageHint = imagesToSend.length > 0
        ? '\n\n[ملاحظة: أرفقت صور خط يد لاجتماع — استخرج التفاصيل واقترح الملف]'
        : '';
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Ruhool-Chat-V2': '0' },
        body: JSON.stringify({
          message: content + imageHint + langDirective,
          agentId: 'mudawwin',
          conversationId: convId,
          language: responseLang,
          images: imagesToSend.length > 0 ? imagesToSend.map((i) => ({ base64: i.base64, mimeType: i.mimeType })) : undefined,
        }),
      });
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
              if (d.content) { fullText += d.content; receivedAnyText = true; }
            } catch { /* ignore */ }
          }
          if (event === 'meeting_created') {
            try {
              const d = JSON.parse(data) as { path?: string };
              if (d.path) setCreatedMeetings((prev) => [...prev, d.path!]);
            } catch { /* ignore */ }
          }
          if (event === 'done') break;
        }
      } catch (innerErr) { if (!receivedAnyText) throw innerErr; }
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: fullText } : m));
    } catch (e) {
      setMessages((prev) => prev.map((m) =>
        m.id === assistantId ? { ...m, content: receivedAnyText ? fullText : `⚠️ ${e instanceof Error ? e.message : 'failed'}` } : m
      ));
    } finally {
      setSending(false);
      processingRef.current = false;
      textareaRef.current?.focus();
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-surface" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-surface-secondary">
        <div className="h-9 w-9 rounded-xl bg-warning/15 border border-warning/30 flex items-center justify-center shrink-0">
          <ClipboardList className="h-5 w-5 text-warning" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-on-surface">
            {isRTL ? 'المُدوّن — كاتب اجتماعات الإشراف' : 'Al-Mudawwin — Supervision Scribe'}
          </h1>
          <p className="text-[11px] text-on-surface-tertiary">
            {isRTL ? 'يكتب اجتماعاتك، يجهّزك للقادم، يتذكّر كل التواريخ' : 'Drafts meetings, preps you for the next, knows every date'}
          </p>
        </div>
        <div className="ms-auto flex items-center gap-2 relative">
          <button
            onClick={() => setShowHistory((v) => !v)}
            title={isRTL ? 'المحادثات السابقة' : 'Past conversations'}
            className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors',
              showHistory ? 'bg-accent text-on-accent' : 'text-on-surface-tertiary hover:bg-surface-tertiary')}
          >
            <History className="h-3 w-3" />
            {conversations.length}
          </button>
          <button
            onClick={() => setResponseLang((p) => p === 'ar' ? 'en' : 'ar')}
            className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors',
              responseLang === 'ar' ? 'bg-accent/15 text-accent' : 'bg-info/15 text-info')}
          >
            <Languages className="h-3 w-3" />
            {responseLang === 'ar' ? 'عربي' : 'EN'}
          </button>
          <button
            onClick={() => { setMessages([]); setConvId(null); setCreatedMeetings([]); }}
            className="text-[11px] text-on-surface-tertiary hover:text-on-surface-secondary transition-colors flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            {isRTL ? 'محادثة جديدة' : 'New chat'}
          </button>

          {/* History dropdown */}
          {showHistory && (
            <div className={cn('absolute top-full mt-2 w-80 max-h-[420px] rounded-xl border border-border bg-surface shadow-2xl z-30 overflow-hidden flex flex-col',
              isRTL ? 'left-0' : 'right-0')}>
              <div className="px-4 py-2 border-b border-border flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-widest text-on-surface-tertiary">
                  {isRTL ? 'المحادثات السابقة' : 'Past Conversations'}
                </span>
                <button onClick={() => setShowHistory(false)}><X className="h-3.5 w-3.5 text-on-surface-tertiary" /></button>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-border">
                {conversations.length === 0 ? (
                  <p className="text-xs text-on-surface-tertiary text-center py-8">
                    {isRTL ? 'لا توجد محادثات سابقة' : 'No past conversations'}
                  </p>
                ) : (
                  conversations.map((cv) => (
                    <button
                      key={cv.id}
                      onClick={() => loadConversation(cv.id)}
                      className={cn('w-full text-start px-4 py-3 hover:bg-surface-tertiary flex items-start gap-2',
                        cv.id === convId && 'bg-surface-tertiary')}
                    >
                      <MessageSquare className="h-3.5 w-3.5 text-on-surface-tertiary shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-on-surface line-clamp-1">{cv.title || (isRTL ? 'بدون عنوان' : 'Untitled')}</p>
                        <p className="text-[10px] text-on-surface-tertiary mt-0.5">{cv.updatedAt.slice(0, 10)}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {loadingConv && (
        <div className="absolute inset-0 z-40 bg-surface/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <Loader2 className="h-6 w-6 animate-spin text-warning" />
        </div>
      )}

      {/* Created meetings banner */}
      {createdMeetings.length > 0 && (
        <div className="mx-6 mt-3 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success flex items-center gap-2">
          <FileCheck2 className="h-3.5 w-3.5" />
          {isRTL
            ? `تم إنشاء ${createdMeetings.length} ملف اجتماع في Obsidian`
            : `Created ${createdMeetings.length} meeting file(s) in Obsidian`}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-6">
            <div className="text-center space-y-2 py-8">
              <div className="h-16 w-16 rounded-2xl bg-warning/10 border border-warning/30 flex items-center justify-center mx-auto">
                <ClipboardList className="h-8 w-8 text-warning" />
              </div>
              <h2 className="text-xl font-bold text-on-surface">
                {isRTL ? 'أهلاً، أنا المُدوّن' : "Hello, I'm Al-Mudawwin"}
              </h2>
              <p className="text-sm text-on-surface-tertiary max-w-sm mx-auto leading-relaxed">
                {isRTL
                  ? 'أحضّرك للاجتماع. أكتب الاجتماع بعد انتهائه. أتابع كل ما حدث بين الاجتماعات.'
                  : 'I prep you for meetings, draft them after, and track everything between.'}
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
          <div key={msg.id} className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'assistant' && (
              <div className="h-7 w-7 rounded-lg bg-warning/15 border border-warning/30 flex items-center justify-center shrink-0 mt-0.5">
                <ClipboardList className="h-4 w-4 text-warning" />
              </div>
            )}
            <div
              className={cn('max-w-[75%] rounded-2xl px-4 py-3',
                msg.role === 'user'
                  ? 'bg-accent/15 text-on-surface rounded-tr-sm text-sm leading-relaxed'
                  : 'bg-surface-secondary rounded-tl-sm border border-border'
              )}
              dir={/[\u0600-\u06FF]/.test(msg.content) ? 'rtl' : 'ltr'}
            >
              {msg.role === 'assistant' && !msg.content ? (
                <div className="flex items-center gap-1.5 py-1">
                  <span className="h-2 w-2 rounded-full bg-warning/60 animate-[bounce_1s_infinite]" />
                  <span className="h-2 w-2 rounded-full bg-warning/60 animate-[bounce_1s_infinite_0.15s]" />
                  <span className="h-2 w-2 rounded-full bg-warning/60 animate-[bounce_1s_infinite_0.3s]" />
                </div>
              ) : msg.role === 'assistant' ? (
                <div className={cn(PROSE_CLASSES, 'animate-[fadeInUp_0.4s_ease-out]')}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    urlTransform={urlTransform}
                  >
                    {msg.content
                      .replace(/\[MEETING:CREATE\][\s\S]*?\[\/MEETING:CREATE\]/gi, '\n_📋 (تم إنشاء ملف الاجتماع في Obsidian)_\n')
                      .trim()}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-border bg-surface-secondary">
        {/* Pending images */}
        {pendingImages.length > 0 && (
          <div className="mb-2 flex items-center gap-2 flex-wrap">
            {pendingImages.map((img) => (
              <div key={img.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.previewUrl} alt={img.name} className="h-14 w-14 object-cover rounded-md border border-border" />
                <button
                  onClick={() => setPendingImages((p) => p.filter((x) => x.id !== img.id))}
                  className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-error text-white flex items-center justify-center"
                ><X className="h-2.5 w-2.5" /></button>
              </div>
            ))}
            <span className="text-[10px] text-on-surface-tertiary">
              {isRTL ? `${pendingImages.length} صورة جاهزة (سيستخرجها فطين)` : `${pendingImages.length} image(s) — Fatin will OCR`}
            </span>
          </div>
        )}
        {/* Attach buttons */}
        <div className="flex items-center gap-1 mb-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            title={isRTL ? 'إرفاق صور (ملاحظات بخط اليد)' : 'Attach images (handwritten notes)'}
            className="h-8 w-8 rounded-md text-on-surface-tertiary hover:text-warning hover:bg-surface-tertiary flex items-center justify-center"
          ><ImageIcon className="h-4 w-4" /></button>
          <button
            onClick={() => cameraInputRef.current?.click()}
            title={isRTL ? 'كاميرا' : 'Camera'}
            className="h-8 w-8 rounded-md text-on-surface-tertiary hover:text-warning hover:bg-surface-tertiary flex items-center justify-center"
          ><Camera className="h-4 w-4" /></button>
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
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={
              sending
                ? (isRTL ? 'اكتب التالي... سيُرسَل بعد الرد' : 'Type next... queued')
                : (isRTL ? 'اكتب فوضى ما حدث في الاجتماع...' : 'Dump what happened in the meeting...')
            }
            rows={3}
            className="flex-1 resize-none bg-surface border border-border rounded-xl px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:border-warning"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim()}
            className="h-11 w-11 rounded-xl bg-warning/20 border border-warning/40 flex items-center justify-center shrink-0 hover:bg-warning/30 transition-all disabled:opacity-40 relative"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin text-warning" /> : <Send className="h-4 w-4 text-warning" />}
            {queueRef.current.length > 0 && (
              <span className="absolute -top-1 -end-1 h-4 min-w-[16px] px-1 rounded-full bg-error text-on-accent text-[10px] font-bold flex items-center justify-center">
                {queueRef.current.length}
              </span>
            )}
          </button>
        </div>
        <p className="text-[10px] text-on-surface-tertiary mt-2 text-center">
          {isRTL ? 'بعد ما يقترح ملف الاجتماع، قل "اعتمد" ليُحفظ في Obsidian' : 'When he proposes a meeting record, say "approve" to save it to Obsidian'}
        </p>
      </div>
    </div>
  );
}
