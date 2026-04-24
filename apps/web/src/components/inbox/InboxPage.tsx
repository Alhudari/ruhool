'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Inbox, Plus, Loader2, Trash2, FileText, Image as ImageIcon,
  Camera, Send, ArrowRight, Sparkles, X, Check, Pencil,
  ChevronDown, ChevronUp, Eye, Wand2, Save,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface InboxItem {
  id: string;
  kind: 'note' | 'image' | 'link' | 'voice-memo';
  title?: string;
  content?: string;
  imagePath?: string;
  url?: string;
  tags?: string[];
  capturedAt: string;
  capturedFrom?: string;
}

const PROMOTE_TARGETS = [
  { id: 'atomic', en: 'Atomic Note', ar: 'ملاحظة ذرية', dest: '01 PhD/02 Atomic Notes', goTo: '/notes' },
  { id: 'paper-note', en: 'Paper Note', ar: 'ملاحظة على ورقة', dest: '01 PhD/01 Sources/Papers', goTo: '/reading-queue' },
  { id: 'book-note', en: 'Book Note', ar: 'ملاحظة على كتاب', dest: '01 PhD/01 Sources/Books', goTo: '/sources?kind=book' },
  { id: 'case-study', en: 'Case Study', ar: 'دراسة حالة', dest: '01 PhD/08 Case Studies', goTo: '/sources?kind=case-study' },
  { id: 'people', en: 'Person', ar: 'شخصية', dest: '01 PhD/05 People', goTo: '/sources?kind=person' },
  { id: 'org', en: 'Organisation', ar: 'منظّمة', dest: '01 PhD/06 Organisations', goTo: '/sources?kind=org' },
  { id: 'writing', en: 'Writing Draft', ar: 'مسودة كتابة', dest: '01 PhD/03 Writing', goTo: '/notes' },
];

// Read SSE stream from /api/chat
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

export function InboxPage() {
  const router = useRouter();
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCapture, setShowCapture] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newImageData, setNewImageData] = useState<{ base64: string; mimeType: string; previewUrl: string; name: string } | null>(null);

  // Per-item state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  // Al-Khuwy side-panel per item
  const [rummanForItem, setRummanForItem] = useState<string | null>(null);
  const [rummanSuggestion, setRummanSuggestion] = useState('');
  const [rummanDestination, setRummanDestination] = useState<string | null>(null);
  const [rummanLoading, setRummanLoading] = useState(false);
  const [promoting, setPromoting] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = () => {
    setLoading(true);
    apiFetch<{ items: InboxItem[] }>('/api/inbox')
      .then((d) => setItems(d.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const mt = dataUrl.match(/data:([^;]+);/)?.[1] ?? 'image/jpeg';
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
      setNewImageData({ base64, mimeType: mt, previewUrl: dataUrl, name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const submitCapture = async () => {
    if (!newContent.trim() && !newImageData) return;
    try {
      await apiFetch('/api/inbox', {
        method: 'POST',
        body: JSON.stringify({
          kind: newImageData ? 'image' : 'note',
          title: newTitle || undefined,
          content: newContent || undefined,
          image: newImageData ? { base64: newImageData.base64, mimeType: newImageData.mimeType, name: newImageData.name } : undefined,
        }),
      });
      setNewContent(''); setNewTitle(''); setNewImageData(null); setShowCapture(false);
      load();
    } catch {}
  };

  // Expand/edit
  const startEdit = (item: InboxItem) => {
    setExpandedId(item.id);
    setEditTitle(item.title ?? '');
    setEditContent(item.content ?? '');
    setRummanForItem(null);
    setRummanSuggestion('');
    setRummanDestination(null);
  };
  const cancelEdit = () => {
    setExpandedId(null);
    setRummanForItem(null);
    setRummanSuggestion('');
    setRummanDestination(null);
  };
  const saveEdit = async () => {
    if (!expandedId) return;
    setSavingEdit(true);
    try {
      await apiFetch(`/api/inbox/${expandedId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: editTitle || undefined, content: editContent }),
      });
      setItems((prev) => prev.map((i) => i.id === expandedId ? { ...i, title: editTitle, content: editContent } : i));
    } catch {}
    setSavingEdit(false);
  };

  // Rumman: ask + get suggestion (in-place, no navigation)
  const askRumman = async (item: InboxItem) => {
    setRummanForItem(item.id);
    setRummanSuggestion('');
    setRummanDestination(null);
    setRummanLoading(true);

    const prompt = `لديّ فكرة سريعة في الـ Inbox أريد أن تساعدني في:
1. تحسين صياغتها لتكون ملاحظة كاملة (احتفظ بكل المعنى الأصلي، فقط نظّمها)
2. اقترح المكان المناسب لها من قائمة:
   - atomic (ملاحظة ذرية)
   - paper-note (ملاحظة على ورقة)
   - book-note (ملاحظة على كتاب)
   - case-study (دراسة حالة)
   - people (شخصية)
   - org (منظّمة)
   - writing (مسودة كتابة)

أعطني الرد بهذا الشكل بالضبط:
\`\`\`
[CONTENT]
الصياغة المحسّنة بصيغة الشخص الأول
[/CONTENT]
[DEST]atomic|paper-note|book-note|case-study|people|org|writing[/DEST]
\`\`\`

العنوان الحالي: ${item.title || '(بدون عنوان)'}
المحتوى الحالي:
${item.content || '(فارغ)'}`;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Ruhool-Chat-V2': '0' },
        body: JSON.stringify({ message: prompt, agentId: 'research-companion', language: 'ar' }),
      });
      let full = '';
      for await (const { event, data } of readSSE(res)) {
        if (event === 'text') {
          try { full += (JSON.parse(data) as { content?: string }).content ?? ''; } catch {}
        }
        if (event === 'done') break;
      }
      // Extract [CONTENT] block
      const cm = full.match(/\[CONTENT\]([\s\S]*?)\[\/CONTENT\]/i);
      const dm = full.match(/\[DEST\](.+?)\[\/DEST\]/i);
      setRummanSuggestion(cm ? cm[1].trim() : full.trim());
      setRummanDestination(dm ? dm[1].trim() : null);
    } catch (e) {
      setRummanSuggestion(`Error: ${e instanceof Error ? e.message : 'failed'}`);
    }
    setRummanLoading(false);
  };

  const acceptRummanSuggestion = () => {
    setEditContent(rummanSuggestion);
    setRummanForItem(null);
  };

  // Promote: persist content first if edited, then move to destination
  const promote = async (item: InboxItem, dest: string, goTo?: string) => {
    setPromoting(item.id);
    try {
      // If user edited, push the latest first
      if (expandedId === item.id) {
        await apiFetch(`/api/inbox/${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ title: editTitle || undefined, content: editContent }),
        });
      }
      const result = await apiFetch<{ ok: boolean; path: string }>(`/api/inbox/${item.id}/promote`, {
        method: 'POST',
        body: JSON.stringify({ destination: dest }),
      });
      // Navigate to the destination page so user can continue editing
      if (goTo && result.path) {
        router.push(goTo);
      }
      load();
      setExpandedId(null);
    } catch {}
    setPromoting(null);
  };

  const discard = async (id: string) => {
    if (!confirm(isRTL ? 'حذف هذه الفكرة؟' : 'Discard this idea?')) return;
    await apiFetch(`/api/inbox/${id}`, { method: 'DELETE' });
    if (expandedId === id) setExpandedId(null);
    load();
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-surface">
      <Loader2 className="h-7 w-7 animate-spin text-on-surface-tertiary" />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-surface" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="border-b border-border bg-surface-secondary px-6 md:px-10 py-6 sticky top-0 z-10 backdrop-blur-sm bg-surface-secondary/95">
        <div className="max-w-4xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Inbox className="h-5 w-5 text-accent" />
              <h1 className="text-xl md:text-2xl font-bold text-on-surface">
                {isRTL ? 'صندوق الالتقاط' : 'Inbox'}
              </h1>
            </div>
            <p className="text-sm text-on-surface-tertiary mt-1">
              {isRTL
                ? `أفكار سريعة، صور، وروابط — تنتظر المعالجة (${items.length})`
                : `Fleeting captures awaiting triage (${items.length})`}
            </p>
          </div>
          <button
            onClick={() => setShowCapture(true)}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-accent text-on-accent hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" />
            {isRTL ? 'التقاط جديد' : 'New capture'}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="max-w-4xl mx-auto px-6 md:px-10 py-6">
        {items.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-secondary p-16 text-center">
            <Inbox className="h-12 w-12 text-on-surface-tertiary mx-auto mb-4 opacity-30" />
            <h3 className="text-base font-bold text-on-surface mb-2">
              {isRTL ? 'الصندوق فارغ' : 'Inbox is empty'}
            </h3>
            <p className="text-sm text-on-surface-tertiary max-w-md mx-auto">
              {isRTL
                ? 'الأفكار العابرة والصور التي تلتقطها بسرعة ستظهر هنا حتى تنظّمها أو يساعدك الخوي.'
                : 'Quick captures will appear here until you organize them or Al-Khuwy helps.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const isExpanded = expandedId === item.id;
              const isAskingRumman = rummanForItem === item.id;
              return (
                <div key={item.id} className={cn(
                  'rounded-xl border bg-surface-secondary transition-colors',
                  isExpanded ? 'border-accent' : 'border-border'
                )}>
                  {/* Compact header (always visible) */}
                  <div
                    className="flex items-start gap-3 p-4 cursor-pointer"
                    onClick={() => isExpanded ? cancelEdit() : startEdit(item)}
                  >
                    <div className="h-9 w-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                      {item.kind === 'image' ? <ImageIcon className="h-4 w-4 text-accent" /> : <FileText className="h-4 w-4 text-accent" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      {item.title && <h3 className="text-sm font-semibold text-on-surface mb-1 line-clamp-1">{item.title}</h3>}
                      {item.content && !isExpanded && (
                        <p className="text-xs text-on-surface-secondary line-clamp-2 leading-relaxed">{item.content}</p>
                      )}
                      <div className="flex items-center gap-2 text-[10px] text-on-surface-tertiary mt-1.5">
                        <span>{item.capturedAt.slice(0, 16).replace('T', ' ')}</span>
                        <span>·</span>
                        <span>{item.capturedFrom ?? 'manual'}</span>
                        {item.imagePath && <><span>·</span><span className="text-info"><ImageIcon className="inline h-3 w-3" /></span></>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!isExpanded && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); startEdit(item); }}
                            title={isRTL ? 'تحرير' : 'Edit'}
                            className="text-on-surface-tertiary hover:text-accent p-1 rounded"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); discard(item.id); }}
                            className="text-on-surface-tertiary hover:text-error p-1 rounded"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      {isExpanded
                        ? <ChevronUp className="h-4 w-4 text-on-surface-tertiary" />
                        : <ChevronDown className="h-4 w-4 text-on-surface-tertiary" />}
                    </div>
                  </div>

                  {/* Expanded editor */}
                  {isExpanded && (
                    <div className="border-t border-border p-4 space-y-3">
                      {/* Two-column when Al-Khuwy is suggesting */}
                      <div className={cn('gap-4', isAskingRumman ? 'grid md:grid-cols-2' : 'block')}>
                        {/* User editor */}
                        <div className="space-y-2">
                          <label className="text-[11px] uppercase tracking-wider text-on-surface-tertiary">
                            {isRTL ? 'صياغتي' : 'My version'}
                          </label>
                          <input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            placeholder={isRTL ? 'عنوان' : 'Title'}
                            className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-on-surface focus:outline-none focus:border-accent"
                          />
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            placeholder={isRTL ? 'المحتوى...' : 'Content...'}
                            rows={isAskingRumman ? 8 : 5}
                            className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-on-surface focus:outline-none focus:border-accent resize-none"
                          />
                        </div>
                        {/* Al-Khuwy suggestion (side-by-side when active) */}
                        {isAskingRumman && (
                          <div className="space-y-2">
                            <label className="text-[11px] uppercase tracking-wider text-success flex items-center gap-1.5">
                              <Sparkles className="h-3 w-3" />
                              {isRTL ? 'اقتراح الخوي' : "Al-Khuwy's suggestion"}
                            </label>
                            <div className="rounded border border-success/30 bg-success/5 p-2 min-h-[200px] max-h-[300px] overflow-y-auto">
                              {rummanLoading ? (
                                <div className="flex items-center gap-2 text-xs text-on-surface-tertiary">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  {isRTL ? 'الخوي يفكر...' : 'Al-Khuwy thinking...'}
                                </div>
                              ) : (
                                <p className="text-xs text-on-surface-secondary whitespace-pre-wrap leading-relaxed">{rummanSuggestion}</p>
                              )}
                            </div>
                            {rummanSuggestion && !rummanLoading && (
                              <div className="flex items-center justify-between gap-2">
                                {rummanDestination && (
                                  <span className="text-[11px] text-success flex items-center gap-1">
                                    <ArrowRight className="h-3 w-3" />
                                    {isRTL ? 'مكان مقترح:' : 'Suggested:'} <strong>{rummanDestination}</strong>
                                  </span>
                                )}
                                <button
                                  onClick={acceptRummanSuggestion}
                                  className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-success text-on-accent ms-auto"
                                >
                                  <Check className="h-3 w-3" />
                                  {isRTL ? 'استخدم اقتراحه' : 'Use this'}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action row */}
                      <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-border">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[11px] text-on-surface-tertiary me-1">{isRTL ? 'إلى:' : 'Promote to:'}</span>
                          {PROMOTE_TARGETS.map((t) => (
                            <button
                              key={t.id}
                              onClick={() => promote(item, t.dest, t.goTo)}
                              disabled={promoting === item.id}
                              className={cn(
                                'flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border transition-colors disabled:opacity-40',
                                rummanDestination === t.id
                                  ? 'border-success bg-success/10 text-success font-bold'
                                  : 'border-border bg-surface text-on-surface-secondary hover:bg-surface-tertiary'
                              )}
                            >
                              {promoting === item.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ArrowRight className="h-2.5 w-2.5" />}
                              {t[language]}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 ms-auto">
                          {!isAskingRumman && (
                            <button
                              onClick={() => askRumman(item)}
                              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-success/15 text-success hover:bg-success/25"
                            >
                              <Wand2 className="h-3 w-3" />
                              {isRTL ? 'اسأل الخوي' : 'Ask Rumman'}
                            </button>
                          )}
                          <button
                            onClick={saveEdit}
                            disabled={savingEdit}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border bg-surface text-on-surface-secondary hover:bg-surface-tertiary disabled:opacity-50"
                          >
                            {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            {isRTL ? 'احفظ' : 'Save edit'}
                          </button>
                          <button onClick={cancelEdit} className="text-xs px-2 py-1.5 text-on-surface-tertiary hover:text-on-surface-secondary">
                            {isRTL ? 'إغلاق' : 'Close'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Capture modal */}
      {showCapture && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCapture(false); }}
        >
          <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl" dir={isRTL ? 'rtl' : 'ltr'}>
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-on-surface">
                {isRTL ? 'التقاط سريع' : 'Quick Capture'}
              </h2>
              <button onClick={() => setShowCapture(false)} className="text-on-surface-tertiary hover:text-on-surface">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={isRTL ? 'عنوان (اختياري)' : 'Title (optional)'}
                className="w-full bg-surface-secondary border border-border rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-accent"
              />
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder={isRTL ? 'اكتب الفكرة بسرعة...' : 'Type the idea fast...'}
                rows={5}
                autoFocus
                className="w-full bg-surface-secondary border border-border rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-accent resize-none"
              />
              {newImageData && (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={newImageData.previewUrl} alt={newImageData.name} className="h-16 w-16 object-cover rounded border border-border" />
                  <button onClick={() => setNewImageData(null)} className="text-on-surface-tertiary hover:text-error">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded text-on-surface-tertiary hover:bg-surface-tertiary"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {isRTL ? 'صورة' : 'Image'}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" hidden
                  onChange={(e) => { if (e.target.files?.[0]) handleImageFile(e.target.files[0]); e.target.value = ''; }} />
                <button
                  onClick={submitCapture}
                  disabled={!newContent.trim() && !newImageData}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-accent text-on-accent disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {isRTL ? 'احفظ' : 'Capture'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
