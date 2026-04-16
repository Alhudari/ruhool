'use client';

import { useEffect, useState } from 'react';
import { FileText, Plus, Trash2, Clock, User as UserIcon, Bot, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { ClippyHelp } from '@/components/help/clippy-help';

const ARTIFACTS_HELP = [
  { illustration: '📄', title: { ar: 'مستند حي', en: 'Live Document' },
    body: { ar: 'مستند تكتبه مع الوكلاء بالتوازي. مثالي لورقة بحثية، عقد، أو كود طويل.', en: 'A document you co-author with agents in parallel. Perfect for papers, contracts, or long code.' } },
  { illustration: '🕒', title: { ar: 'التاريخ المحفوظ', en: 'Version History' },
    body: { ar: 'كل تعديل يُحفظ — تقدر ترجع لأي إصدار سابق.', en: 'Every edit is saved — roll back to any prior version.' } },
  { illustration: '🤝', title: { ar: 'طلب من الوكيل', en: 'Ask an Agent' },
    body: { ar: 'في المحادثة، اطلب من الصفرا أو الدبسا تعديل المستند. يظهر التحديث فوراً هنا.', en: 'In chat, ask Al-Safra or Al-Dabsa to edit the artifact. Updates appear here instantly.' } },
];

interface Artifact {
  id: string;
  title: string;
  kind: 'markdown' | 'code' | 'html' | 'text';
  language?: string;
  content: string;
  versions: Array<{ version: number; editedBy: string; editedAt: string; comment?: string; content: string }>;
  createdAt: string;
  updatedAt: string;
  conversationId?: string;
}

export function ArtifactsView() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [active, setActive] = useState<Artifact | null>(null);
  const [edit, setEdit] = useState('');
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const load = () => {
    apiFetch<{ artifacts: Artifact[] }>('/api/artifacts').then((r) => setArtifacts(r.artifacts || []));
  };
  useEffect(() => { load(); }, []);

  useEffect(() => { if (active) setEdit(active.content); }, [active?.id]);

  const create = async () => {
    if (!newTitle.trim()) return;
    const r = await apiFetch<{ artifact: Artifact }>('/api/artifacts', { method: 'POST', body: JSON.stringify({ title: newTitle.trim(), kind: 'markdown' }) });
    setNewTitle('');
    load();
    setActive(r.artifact);
  };

  const save = async () => {
    if (!active) return;
    setSaving(true);
    try {
      const r = await apiFetch<{ artifact: Artifact }>(`/api/artifacts/${active.id}`, { method: 'PUT', body: JSON.stringify({ content: edit, editedBy: 'user' }) });
      setActive(r.artifact);
      load();
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm(isRTL ? 'حذف هذا المستند؟' : 'Delete this artifact?')) return;
    await apiFetch(`/api/artifacts/${id}`, { method: 'DELETE' });
    if (active?.id === id) setActive(null);
    load();
  };

  return (
    <div className={cn('max-w-7xl mx-auto px-6 py-6', isRTL && 'rtl')} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-[var(--radius-lg)] bg-accent/10 text-accent flex items-center justify-center">
          <FileText size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold">{isRTL ? 'المستندات (Artifacts)' : 'Artifacts'}</h1>
          <p className="text-xs text-on-surface-tertiary">{isRTL ? 'مستندات قابلة للتحرير المشترك بينك وبين الوكلاء' : 'Documents co-edited by you and agents'}</p>
        </div>
        <div className="ms-auto"><ClippyHelp steps={ARTIFACTS_HELP} title={{ ar: 'المستندات', en: 'Artifacts' }} /></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-3 space-y-2 max-h-[70vh] overflow-auto">
          <div className="flex items-center gap-2">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={isRTL ? 'عنوان جديد...' : 'New title...'} className="flex-1 px-2 py-1.5 text-xs bg-input border border-border rounded-[var(--radius)]" />
            <button onClick={create} className="p-1.5 rounded bg-accent text-on-accent"><Plus size={14} /></button>
          </div>
          {artifacts.length === 0 && <div className="text-xs text-on-surface-tertiary italic py-4 text-center">{isRTL ? 'لا يوجد مستندات' : 'No artifacts yet'}</div>}
          {artifacts.map((a) => (
            <button key={a.id} onClick={() => setActive(a)} className={cn('w-full text-start px-2 py-2 rounded-[var(--radius)] hover:bg-surface-secondary flex items-center gap-2', active?.id === a.id && 'bg-accent/10 ring-1 ring-accent')}>
              <FileText size={12} className="shrink-0 text-on-surface-tertiary" />
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{a.title}</div>
                <div className="text-[10px] text-on-surface-tertiary">{new Date(a.updatedAt).toLocaleDateString()} · v{a.versions.length}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="rounded-[var(--radius-lg)] border border-border bg-surface">
          {!active ? (
            <div className="p-12 text-center text-xs text-on-surface-tertiary">{isRTL ? 'اختر مستنداً أو أنشئ واحداً' : 'Select or create an artifact'}</div>
          ) : (
            <div className="flex flex-col h-[70vh]">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                <div>
                  <div className="text-sm font-semibold">{active.title}</div>
                  <div className="text-[10px] text-on-surface-tertiary">{active.kind} · v{active.versions.length}</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setShowHistory(!showHistory)} className="p-1.5 rounded hover:bg-surface-secondary"><History size={14} /></button>
                  <button onClick={() => remove(active.id)} className="p-1.5 rounded text-red-500 hover:bg-red-500/10"><Trash2 size={14} /></button>
                </div>
              </div>
              <textarea
                value={edit}
                onChange={(e) => setEdit(e.target.value)}
                dir={/[\u0600-\u06FF]/.test(edit) ? 'rtl' : 'ltr'}
                className="flex-1 w-full bg-transparent p-4 text-sm font-mono focus:outline-none resize-none"
              />
              <div className="flex items-center justify-between px-4 py-2 border-t border-border">
                <div className="text-[10px] text-on-surface-tertiary">{edit.length} {isRTL ? 'حرف' : 'chars'}</div>
                <button onClick={save} disabled={saving || edit === active.content} className="px-3 py-1.5 rounded bg-accent text-on-accent text-xs font-semibold disabled:opacity-40">
                  {saving ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'احفظ' : 'Save')}
                </button>
              </div>
              {showHistory && (
                <div className="border-t border-border p-3 max-h-[200px] overflow-auto">
                  <div className="text-[10px] uppercase text-on-surface-tertiary mb-2">{isRTL ? 'التاريخ' : 'History'}</div>
                  {active.versions.slice().reverse().map((v) => (
                    <div key={v.version} className="flex items-center gap-2 text-xs py-1">
                      {v.editedBy === 'user' ? <UserIcon size={10} /> : <Bot size={10} />}
                      <span className="font-mono">v{v.version}</span>
                      <span className="text-on-surface-tertiary">{v.editedBy}</span>
                      <Clock size={10} className="text-on-surface-tertiary ms-auto" />
                      <span className="text-on-surface-tertiary">{new Date(v.editedAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
