'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StickyNote, Loader2, Filter, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { ItemMenu, ShowArchivedToggle } from '@/components/ui/item-menu';

interface Note {
  id: string;
  paperId: string;
  section: string;
  type: string;
  content: string;
  themes: string[];
  archived?: boolean;
  createdAt: string;
}

interface Paper {
  id: string;
  title: string;
  filename: string;
}

const NOTE_TYPES = ['claim', 'evidence', 'method', 'critique', 'question', 'connection'];
const TYPE_COLORS: Record<string, string> = {
  claim: 'bg-blue-500/10 text-blue-600',
  evidence: 'bg-green-500/10 text-green-600',
  method: 'bg-purple-500/10 text-purple-600',
  critique: 'bg-red-500/10 text-red-600',
  question: 'bg-amber-500/10 text-amber-600',
  connection: 'bg-teal-500/10 text-teal-600',
};

export function NotesPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterPaper, setFilterPaper] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const load = async () => {
    try {
      const [n, p] = await Promise.all([
        apiFetch<Note[]>(`/api/notes?archived=${showArchived}`),
        apiFetch<Paper[]>('/api/papers'),
      ]);
      setNotes(n);
      setPapers(p);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [showArchived]);

  const filtered = notes.filter(n => {
    if (filterType && n.type !== filterType) return false;
    if (filterPaper && n.paperId !== filterPaper) return false;
    return true;
  });

  const paperTitle = (id: string) => papers.find(p => p.id === id)?.title || papers.find(p => p.id === id)?.filename || id;

  const saveEdit = async (id: string) => {
    await apiFetch(`/api/notes/${id}`, { method: 'PUT', body: JSON.stringify({ content: editContent }) });
    setEditingId(null);
    await load();
  };

  const deleteNote = async (id: string) => {
    await apiFetch(`/api/notes/${id}`, { method: 'DELETE' });
    await load();
  };

  const archiveNote = async (id: string, archived: boolean) => {
    await apiFetch(`/api/notes/${id}/archive`, { method: 'PUT', body: JSON.stringify({ archived }) });
    await load();
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <StickyNote size={24} className="text-on-surface-secondary" />
        <h1 className="text-xl font-semibold text-on-surface">
          {isRTL ? 'الملاحظات الذرية' : 'Atomic Notes'}
        </h1>
        <span className="text-sm text-on-surface-tertiary">({filtered.length})</span>
        <button
          onClick={() => router.push(`/?q=${encodeURIComponent(isRTL ? '@الكاتب ساعدني في تنظيم ملاحظاتي وربطها ببحثي' : '@sayyaq Help me organize my notes and connect them to my research')}`)}
          className="ms-auto flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20 transition-colors"
          title={isRTL ? 'تحدث مع الكاتب' : 'Chat with Al-Katib'}
        >
          <MessageSquare size={14} />
          {isRTL ? 'الكاتب' : 'Al-Katib'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <div className="flex items-center gap-1 text-xs text-on-surface-tertiary mr-2">
          <Filter size={12} />
          {isRTL ? 'تصفية:' : 'Filter:'}
        </div>
        <button
          onClick={() => setFilterType(null)}
          className={cn('px-2 py-1 rounded text-xs transition-colors', !filterType ? 'bg-accent text-on-accent' : 'bg-surface-secondary text-on-surface-secondary')}
        >
          {isRTL ? 'الكل' : 'All'}
        </button>
        {NOTE_TYPES.map(t => (
          <button key={t} onClick={() => setFilterType(filterType === t ? null : t)}
            className={cn('px-2 py-1 rounded text-xs transition-colors', filterType === t ? 'bg-accent text-on-accent' : 'bg-surface-secondary text-on-surface-secondary')}
          >{t}</button>
        ))}
        {papers.length > 0 && (
          <select
            value={filterPaper || ''}
            onChange={(e) => setFilterPaper(e.target.value || null)}
            className="px-2 py-1 rounded text-xs bg-surface-secondary text-on-surface-secondary border border-border ml-2"
          >
            <option value="">{isRTL ? 'كل الأوراق' : 'All papers'}</option>
            {papers.map(p => <option key={p.id} value={p.id}>{p.title || p.filename}</option>)}
          </select>
        )}
        <ShowArchivedToggle value={showArchived} onChange={setShowArchived} isRTL={isRTL} className="ml-2" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-on-surface-tertiary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-on-surface-tertiary text-sm">
          {isRTL ? 'لا توجد ملاحظات' : 'No notes yet'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(note => (
            <div key={note.id} className="border border-border rounded-[var(--radius)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', TYPE_COLORS[note.type] || 'bg-surface-secondary text-on-surface-secondary')}>
                      {note.type}
                    </span>
                    <span className="text-xs text-on-surface-tertiary truncate">{paperTitle(note.paperId)} — {note.section}</span>
                  </div>
                  {editingId === note.id ? (
                    <div className="flex gap-2 mt-1">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={2}
                        dir="auto"
                        className="flex-1 text-sm px-2 py-1 bg-input border border-border rounded text-on-surface focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                      />
                      <div className="flex flex-col gap-1">
                        <button onClick={() => saveEdit(note.id)} className="px-2 py-1 text-xs bg-accent text-on-accent rounded">{isRTL ? 'حفظ' : 'Save'}</button>
                        <button onClick={() => setEditingId(null)} className="px-2 py-1 text-xs text-on-surface-tertiary">{isRTL ? 'إلغاء' : 'Cancel'}</button>
                      </div>
                    </div>
                  ) : (
                    <p
                      className="text-sm text-on-surface cursor-pointer hover:text-accent transition-colors"
                      dir="auto"
                      onClick={() => { setEditingId(note.id); setEditContent(note.content); }}
                    >
                      {note.content}
                    </p>
                  )}
                </div>
                <ItemMenu
                  isRTL={isRTL}
                  archived={!!note.archived}
                  onArchive={() => archiveNote(note.id, true)}
                  onUnarchive={() => archiveNote(note.id, false)}
                  onDelete={() => deleteNote(note.id)}
                  deleteConfirmMessage={isRTL ? 'حذف هذه الملاحظة؟' : 'Delete this note?'}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
