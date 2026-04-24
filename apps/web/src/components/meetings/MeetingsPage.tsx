'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus, Send, Loader2, Save, Trash2, ChevronLeft,
  Calendar, User, CheckSquare, FileText, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface MeetingRecord {
  No: number | null;
  date: string | null;
  Location: string | null;
  Summary: string;
  Attendees: string[];
  GRS2_Input: string | null;
  GRS2_Respond: string | null;
  GRS2_confirmed: boolean;
  Next_Meeting: string | null;
  Next_Location: string | null;
  action_plan_previous: string[];
  agenda: string[];
  discussion: string;
  action_plan_next: string[];
  arabic_summary: string[];
  tags: string[];
}

interface MeetingSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  record: MeetingRecord | null;
  obsidianPath: string | null;
  draft: string;
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface ChatMsg { role: 'user' | 'assistant'; content: string }

// ── helpers ──────────────────────────────────────────────────────────
function parseSSE(line: string): { event: string; data: string } | null {
  if (line.startsWith('event:')) {
    return null; // handled below in stream loop
  }
  return null;
}

async function* readSSE(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let buf = '';
  let currentEvent = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n');
    buf = parts.pop() ?? '';
    for (const raw of parts) {
      const line = raw.trim();
      if (line.startsWith('event:')) { currentEvent = line.slice(6).trim(); continue; }
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        yield { event: currentEvent, data };
        currentEvent = '';
      }
    }
  }
}

export function MeetingsPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [sessions, setSessions] = useState<MeetingSession[]>([]);
  const [active, setActive] = useState<MeetingSession | null>(null);
  const [draft, setDraft] = useState('');
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'draft' | 'record' | 'chat'>('draft');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async () => {
    try {
      // Pull both: platform-recorded sessions + vault-stored supervision meetings
      const [platformData, vaultData] = await Promise.all([
        apiFetch<MeetingSession[]>('/api/meetings/sessions').catch(() => [] as MeetingSession[]),
        apiFetch<{ meetings: Array<{ path: string; name: string; title?: string; date?: string; summary?: string }> }>('/api/vault/supervision').catch(() => ({ meetings: [] })),
      ]);
      // Convert vault meetings to MeetingSession shape (read-only display)
      const vaultAsSessions: MeetingSession[] = (vaultData.meetings ?? []).map((m) => ({
        id: `vault:${m.path}`,
        title: m.title || m.name,
        updatedAt: m.date ? String(m.date) : new Date().toISOString(),
        record: { date: m.date ?? null, Summary: m.summary ?? '' },
        savedToObsidian: true,
      } as unknown as MeetingSession));
      const combined = [...platformData, ...vaultAsSessions]
        .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
      setSessions(combined);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs]);

  const createSession = async () => {
    const title = isRTL
      ? `اجتماع ${new Date().toLocaleDateString('ar')}`
      : `Meeting ${new Date().toLocaleDateString('en')}`;
    const s = await apiFetch<MeetingSession>('/api/meetings/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    setSessions((prev) => [s, ...prev]);
    setActive(s);
    setDraft('');
    setChatMsgs([]);
    setTab('draft');
  };

  const selectSession = async (s: MeetingSession) => {
    const full = await apiFetch<MeetingSession>(`/api/meetings/sessions/${s.id}`);
    setActive(full);
    setDraft(full.draft);
    setChatMsgs(full.chatHistory?.map((h) => ({ role: h.role, content: h.content })) ?? []);
    setTab(full.record ? 'record' : 'draft');
  };

  const saveDraft = async () => {
    if (!active) return;
    await apiFetch(`/api/meetings/sessions/${active.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft }),
    });
  };

  const extract = async () => {
    if (!active || !draft.trim()) return;
    await saveDraft();
    setIsExtracting(true);
    setStreamText('');
    setError(null);
    try {
      const res = await fetch(`${API}/api/meetings/sessions/${active.id}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: draft }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      let newRecord: MeetingRecord | null = null;
      for await (const { event, data } of readSSE(reader)) {
        if (event === 'message.delta') {
          const d = JSON.parse(data);
          if (d.text) setStreamText((p) => p + d.text);
        } else if (event === 'message.done') {
          const d = JSON.parse(data);
          newRecord = d.record;
        } else if (event === 'error') {
          const d = JSON.parse(data);
          setError(d.error ?? 'Extract failed');
        }
      }
      if (newRecord) {
        setActive((prev) => prev ? { ...prev, record: newRecord! } : prev);
        setTab('record');
        loadSessions();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extract failed');
    } finally {
      setIsExtracting(false);
      setStreamText('');
    }
  };

  const sendChat = async () => {
    if (!active || !chatInput.trim() || isChatting) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMsgs((prev) => [...prev, { role: 'user', content: msg }]);
    setIsChatting(true);
    let reply = '';
    try {
      const res = await fetch(`${API}/api/meetings/sessions/${active.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      setChatMsgs((prev) => [...prev, { role: 'assistant', content: '' }]);
      for await (const { event, data } of readSSE(reader)) {
        if (event === 'message.delta') {
          const d = JSON.parse(data);
          if (d.text) {
            reply += d.text;
            setChatMsgs((prev) => {
              const next = [...prev];
              next[next.length - 1] = { role: 'assistant', content: reply };
              return next;
            });
          }
        }
      }
    } catch (e) {
      setChatMsgs((prev) => [...prev, { role: 'assistant', content: `Error: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setIsChatting(false);
    }
  };

  const saveToObsidian = async () => {
    if (!active?.record) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ ok: boolean; path: string; meetingNo: number }>(
        `/api/meetings/sessions/${active.id}/save`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
      );
      setActive((prev) => prev ? { ...prev, obsidianPath: res.path } : prev);
      loadSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSession = async (id: string) => {
    if (!confirm(isRTL ? 'حذف الجلسة؟' : 'Delete session?')) return;
    await apiFetch(`/api/meetings/sessions/${id}`, { method: 'DELETE' });
    if (active?.id === id) setActive(null);
    loadSessions();
  };

  return (
    <div className="flex h-full" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Sidebar */}
      <div className="w-64 shrink-0 border-e flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-sm">{isRTL ? 'الاجتماعات' : 'Meetings'}</h2>
          <button onClick={createSession}
            className="rounded-md p-1 hover:bg-accent" title={isRTL ? 'جلسة جديدة' : 'New session'}>
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 && (
            <p className="text-xs text-muted-foreground p-4">
              {isRTL ? 'لا توجد اجتماعات. اضغط + لبدء جلسة.' : 'No meetings. Press + to start.'}
            </p>
          )}
          {sessions.map((s) => (
            <button key={s.id}
              onClick={() => selectSession(s)}
              className={cn(
                'w-full text-start px-4 py-3 text-sm hover:bg-accent border-b transition-colors',
                active?.id === s.id && 'bg-accent font-medium'
              )}>
              <div className="truncate">{s.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                <span>{new Date(s.updatedAt).toLocaleDateString(isRTL ? 'ar' : 'en')}</span>
                {s.obsidianPath && <span className="text-emerald-500">✓ Obsidian</span>}
                {s.record && !s.obsidianPath && <span className="text-amber-500">● pending</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      {!active ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center space-y-2">
            <Calendar className="h-10 w-10 mx-auto opacity-30" />
            <p className="text-sm">{isRTL ? 'اختر أو أنشئ جلسة' : 'Select or create a meeting session'}</p>
            <button onClick={createSession}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
              <Plus className="h-4 w-4" />
              {isRTL ? 'جلسة جديدة' : 'New meeting'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="border-b px-6 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => setActive(null)} className="rounded p-1 hover:bg-accent">
                <ChevronLeft className={cn('h-4 w-4', isRTL && 'rotate-180')} />
              </button>
              <h3 className="font-semibold">{active.title}</h3>
              {active.obsidianPath && (
                <span className="text-xs bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full">
                  {isRTL ? 'محفوظ في Obsidian' : 'Saved to Obsidian'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {active.record && !active.obsidianPath && (
                <button onClick={saveToObsidian} disabled={isSaving}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-50">
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {isRTL ? 'حفظ في Obsidian' : 'Save to Obsidian'}
                </button>
              )}
              <button onClick={() => deleteSession(active.id)}
                className="rounded p-1.5 hover:bg-destructive/10 text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b flex shrink-0">
            {(['draft', 'record', 'chat'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn(
                  'px-5 py-2.5 text-sm border-b-2 transition-colors',
                  tab === t ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}>
                {t === 'draft' ? (isRTL ? 'الملاحظات' : 'Notes')
                  : t === 'record' ? (isRTL ? 'السجل' : 'Record')
                  : (isRTL ? 'المحادثة' : 'Chat')}
                {t === 'record' && active.record && (
                  <span className="ms-1.5 text-xs bg-primary/10 text-primary px-1.5 rounded-full">✓</span>
                )}
              </button>
            ))}
          </div>

          {error && (
            <div className="m-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{error}</div>
          )}

          {/* Draft tab */}
          {tab === 'draft' && (
            <div className="flex-1 flex flex-col p-6 gap-4 overflow-auto">
              <p className="text-sm text-muted-foreground">
                {isRTL
                  ? 'اكتب ملاحظاتك بحرية — نقاط، فقرات، أي شي. ثم اضغط "استخرج" ليحوّلها المُلخِّص لسجل منظّم.'
                  : 'Write freely — bullets, paragraphs, anything. Then press Extract to convert them into a structured record.'}
              </p>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={saveDraft}
                dir="auto"
                placeholder={isRTL ? 'ملاحظات الاجتماع…' : 'Meeting notes…'}
                className="flex-1 min-h-[300px] resize-none rounded-lg border bg-background p-4 text-sm font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {isExtracting && streamText && (
                <div className="rounded-lg border bg-muted p-3 text-xs font-mono text-muted-foreground max-h-32 overflow-auto">
                  <span className="text-xs text-primary font-medium">{isRTL ? 'جاري الاستخراج… ' : 'Extracting… '}</span>
                  {streamText.slice(0, 300)}…
                </div>
              )}
              <div className="flex justify-end">
                <button onClick={extract} disabled={isExtracting || !draft.trim()}
                  className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-700 disabled:opacity-50">
                  {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {isRTL ? 'استخرج السجل' : 'Extract record'}
                </button>
              </div>
            </div>
          )}

          {/* Record tab */}
          {tab === 'record' && (
            <div className="flex-1 overflow-auto p-6">
              {!active.record ? (
                <p className="text-sm text-muted-foreground">
                  {isRTL ? 'لا يوجد سجل بعد. اكتب ملاحظات في تبويب النصوص ثم استخرج.' : 'No record yet. Write notes and click Extract.'}
                </p>
              ) : (
                <MeetingRecordView record={active.record} isRTL={isRTL} />
              )}
            </div>
          )}

          {/* Chat tab */}
          {tab === 'chat' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatMsgs.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {isRTL ? 'اسأل أي سؤال عن الاجتماع أو المهام…' : 'Ask anything about this meeting or action items…'}
                  </p>
                )}
                {chatMsgs.map((m, i) => (
                  <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap',
                      m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    )}>
                      {m.content || <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="border-t p-4 flex gap-2">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                  dir="auto"
                  rows={2}
                  placeholder={isRTL ? 'اكتب سؤالك…' : 'Type your question…'}
                  className="flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button onClick={sendChat} disabled={isChatting || !chatInput.trim()}
                  className="self-end rounded-xl bg-primary p-2.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {isChatting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MeetingRecordView({ record: r, isRTL }: { record: MeetingRecord; isRTL: boolean }) {
  return (
    <div className="space-y-6 max-w-2xl">
      {/* Meta */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <Field label={isRTL ? 'التاريخ' : 'Date'} value={r.date} />
        <Field label={isRTL ? 'المكان' : 'Location'} value={r.Location} />
        <Field label={isRTL ? 'الحضور' : 'Attendees'} value={r.Attendees.join(', ')} />
        <Field label={isRTL ? 'الاجتماع التالي' : 'Next meeting'} value={r.Next_Meeting} />
      </div>

      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-xs font-semibold text-muted-foreground mb-1">{isRTL ? 'الملخص' : 'Summary'}</p>
        <p className="text-sm">{r.Summary}</p>
      </div>

      {r.discussion && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2">{isRTL ? 'النقاش والملاحظات' : 'Discussion & Feedback'}</p>
          <p className="text-sm whitespace-pre-wrap">{r.discussion}</p>
        </div>
      )}

      <TaskList title={isRTL ? 'خطة العمل (التالية)' : 'Action Plan (next)'} items={r.action_plan_next} />
      <TaskList title={isRTL ? 'جدول الأعمال' : 'Agenda'} items={r.agenda} />

      {r.arabic_summary.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2">ملخص</p>
          <ul className="space-y-1" dir="rtl">
            {r.arabic_summary.map((b, i) => (
              <li key={i} className="text-sm before:content-['•'] before:me-2 before:text-primary">{b}</li>
            ))}
          </ul>
        </div>
      )}

      {r.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {r.tags.map((t) => (
            <span key={t} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function TaskList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-2">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <CheckSquare className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
