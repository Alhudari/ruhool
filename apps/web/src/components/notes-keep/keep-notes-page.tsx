'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StickyNote, Plus, Pin, PinOff, Archive, ArchiveRestore, Trash2, X, Check,
  Search, Tag, Palette, Bold, Italic, Underline as UnderlineIcon, List as ListIcon,
  ListOrdered, Heading1, Heading2, Quote, Code as CodeIcon, Link as LinkIcon,
  CheckSquare, Square, Loader2, Type, ListChecks, CheckCircle2,
} from 'lucide-react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/store/app';
import { CARD_COLORS, getCardBg, getContrastColor } from '@/components/tasks/tasks-page';

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  children?: ChecklistItem[];
}

interface KeepNote {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'checklist' | 'mixed';
  items?: ChecklistItem[];
  color: string;
  pinned: boolean;
  archived: boolean;
  labels: string[];
  reminders?: string[];
  images?: string[];
  order?: number;
  createdAt: string;
  updatedAt: string;
}

function RichEditor({
  value,
  onChange,
  placeholder,
  isRTL,
  textClass,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  isRTL?: boolean;
  textClass?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] } }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'underline' } }),
      Placeholder.configure({ placeholder: placeholder || '' }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none min-h-[80px]',
          '[&_p]:my-1 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold',
          '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:ps-5 [&_ol]:ps-5',
          '[&_blockquote]:border-s-2 [&_blockquote]:border-black/20 [&_blockquote]:ps-3 [&_blockquote]:italic',
          '[&_code]:bg-black/10 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs',
          textClass,
        ),
        dir: isRTL ? 'rtl' : 'ltr',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    immediatelyRender: false,
  });

  // Sync external value changes (e.g. when switching notes)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const btn = (active: boolean, onClick: () => void, Icon: React.ComponentType<any>, title: string) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded hover:bg-black/10 transition-colors',
        active && 'bg-black/15',
      )}
    >
      <Icon size={14} />
    </button>
  );

  return (
    <div>
      <div className="flex items-center gap-0.5 flex-wrap mb-2 pb-2 border-b border-black/10">
        {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), Bold, 'Bold')}
        {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), Italic, 'Italic')}
        {btn(editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), UnderlineIcon, 'Strike')}
        <span className="w-px h-4 bg-black/10 mx-0.5" />
        {btn(editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), Heading1, 'H1')}
        {btn(editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), Heading2, 'H2')}
        <span className="w-px h-4 bg-black/10 mx-0.5" />
        {btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), ListIcon, 'Bullet list')}
        {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), ListOrdered, 'Numbered list')}
        {btn(editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), Quote, 'Quote')}
        {btn(editor.isActive('code'), () => editor.chain().focus().toggleCode().run(), CodeIcon, 'Code')}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = prompt('URL:');
            if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
          }}
          title="Link"
          className={cn('p-1.5 rounded hover:bg-black/10 transition-colors', editor.isActive('link') && 'bg-black/15')}
        >
          <LinkIcon size={14} />
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

// Strip tags and return plain text for card previews
function htmlToText(html: string): string {
  if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, '');
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || d.innerText || '';
}

export function KeepNotesPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [notes, setNotes] = useState<KeepNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [editing, setEditing] = useState<KeepNote | null>(null);

  // Quick-add
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickType, setQuickType] = useState<'text' | 'checklist'>('text');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickContent, setQuickContent] = useState('');
  const [quickItems, setQuickItems] = useState<ChecklistItem[]>([]);
  const [quickItemText, setQuickItemText] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<KeepNote[]>(`/api/keep-notes?archived=${showArchive}`);
      setNotes(data);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [showArchive]);

  useEffect(() => { load(); }, [load]);

  const labels = useMemo(() => {
    const s = new Set<string>();
    notes.forEach(n => n.labels.forEach(l => s.add(l)));
    return Array.from(s);
  }, [notes]);

  const filtered = notes.filter(n => {
    if (activeLabel && !n.labels.includes(activeLabel)) return false;
    if (search) {
      const q = search.toLowerCase();
      const text = (n.title + ' ' + htmlToText(n.content) + ' ' + (n.items || []).map(i => i.text).join(' ')).toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const pinned = filtered.filter(n => n.pinned);
  const others = filtered.filter(n => !n.pinned);

  // Actions
  const createNote = async (payload: Partial<KeepNote>) => {
    try {
      const created = await apiFetch<KeepNote>('/api/keep-notes', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setNotes(prev => [created, ...prev]);
    } catch { /* ignore */ }
  };

  const saveNote = async (note: KeepNote) => {
    try {
      const updated = await apiFetch<KeepNote>(`/api/keep-notes/${note.id}`, {
        method: 'PUT',
        body: JSON.stringify(note),
      });
      setNotes(prev => prev.map(n => n.id === note.id ? updated : n));
      setEditing(null);
    } catch { /* ignore */ }
  };

  const deleteNote = async (id: string) => {
    try {
      await apiFetch(`/api/keep-notes/${id}`, { method: 'DELETE' });
      setNotes(prev => prev.filter(n => n.id !== id));
      if (editing?.id === id) setEditing(null);
    } catch { /* ignore */ }
  };

  const togglePin = async (id: string) => {
    try {
      const updated = await apiFetch<KeepNote>(`/api/keep-notes/${id}/pin`, { method: 'PUT' });
      setNotes(prev => prev.map(n => n.id === id ? updated : n));
    } catch { /* ignore */ }
  };

  const convertToTask = async (note: KeepNote) => {
    const wsId = (typeof window !== 'undefined' && window.localStorage.getItem('ruhool.active-workspace')) || 'phd';
    const title = note.title.trim() || htmlToText(note.content).slice(0, 80).trim() || 'ملاحظة';
    const notesText = note.title.trim() ? htmlToText(note.content).trim() : '';
    const checklist = (note.items || []).map((it) => ({ id: crypto.randomUUID(), text: it.text, done: it.done }));
    try {
      await apiFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title,
          notes: notesText,
          priority: 'none',
          list: 'عام',
          tags: note.labels,
          color: note.color,
          checklist,
          workspaceId: wsId,
        }),
      });
      // Archive the source note — user's intent is to promote, not duplicate.
      await apiFetch(`/api/keep-notes/${note.id}/archive`, { method: 'PUT' });
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      if (editing?.id === note.id) setEditing(null);
    } catch { /* ignore */ }
  };

  const toggleArchive = async (id: string) => {
    try {
      const updated = await apiFetch<KeepNote>(`/api/keep-notes/${id}/archive`, { method: 'PUT' });
      if (updated.archived !== showArchive) {
        setNotes(prev => prev.filter(n => n.id !== id));
      } else {
        setNotes(prev => prev.map(n => n.id === id ? updated : n));
      }
    } catch { /* ignore */ }
  };

  const handleQuickSave = async () => {
    const hasContent = quickTitle.trim() || quickContent.trim() || quickItems.length > 0;
    if (!hasContent) { setQuickOpen(false); return; }
    await createNote({
      title: quickTitle.trim(),
      content: quickType === 'text' ? quickContent : '',
      type: quickType,
      items: quickType === 'checklist' ? quickItems : [],
      color: 'none',
    });
    setQuickTitle(''); setQuickContent(''); setQuickItems([]); setQuickItemText('');
    setQuickOpen(false);
  };

  const NoteCard = ({ note }: { note: KeepNote }) => {
    const colors = getContrastColor(note.color);
    const preview = note.type === 'checklist'
      ? (note.items || []).slice(0, 6)
      : null;
    return (
      <div
        className={cn(
          'group relative rounded-xl border border-border p-4 cursor-pointer hover:shadow-md transition-all break-inside-avoid mb-3',
          getCardBg(note.color),
        )}
        onClick={() => setEditing({ ...note })}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <button
          onClick={(e) => { e.stopPropagation(); togglePin(note.id); }}
          className={cn('absolute top-2 end-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-black/10', note.pinned && 'opacity-100', colors.tertiary)}
          title={note.pinned ? 'Unpin' : 'Pin'}
        >
          {note.pinned ? <Pin size={14} fill="currentColor" /> : <Pin size={14} />}
        </button>
        {note.title && (
          <h3 className={cn('text-sm font-semibold mb-1 pe-6', colors.primary)}>{note.title}</h3>
        )}
        {note.type === 'checklist' && preview ? (
          <div className="space-y-0.5">
            {preview.map(item => (
              <div key={item.id} className={cn('flex items-center gap-2 text-sm', colors.secondary)}>
                {item.done ? <CheckSquare size={14} className="text-accent" /> : <Square size={14} className={colors.tertiary} />}
                <span className={cn(item.done && 'line-through opacity-60')}>{item.text}</span>
              </div>
            ))}
            {(note.items || []).length > 6 && (
              <p className={cn('text-xs mt-1', colors.tertiary)}>+{(note.items || []).length - 6} {isRTL ? '\u0639\u0646\u0627\u0635\u0631' : 'more'}</p>
            )}
          </div>
        ) : (
          <div
            className={cn('text-sm line-clamp-6 prose prose-sm max-w-none', colors.primary)}
            // SEC-01 (AUDIT.md): sanitize tiptap HTML content before rendering.
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(note.content || '', { USE_PROFILES: { html: true } }) }}
          />
        )}
        {note.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {note.labels.map(l => (
              <span key={l} className={cn('text-xs px-1.5 py-0.5 rounded', colors.muted, colors.tertiary)}>{l}</span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); convertToTask(note); }}
            className={cn('p-1 rounded hover:bg-accent/10 hover:text-accent', colors.tertiary)}
            title={isRTL ? 'تحويل إلى مهمة' : 'Convert to task'}
          >
            <CheckCircle2 size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); toggleArchive(note.id); }}
            className={cn('p-1 rounded hover:bg-black/10', colors.tertiary)}
            title={note.archived ? 'Restore' : 'Archive'}
          >
            {note.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); if (confirm(isRTL ? '\u062d\u0630\u0641\u061f' : 'Delete?')) deleteNote(note.id); }}
            className={cn('p-1 rounded hover:bg-red-500/10 hover:text-red-600', colors.tertiary)}
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-on-surface-tertiary" size={24} />
      </div>
    );
  }

  return (
    <div className="flex gap-6 max-w-6xl mx-auto px-4 md:px-6 py-6">
      {/* Labels sidebar */}
      <aside className="hidden lg:block w-48 shrink-0">
        <h3 className="text-xs font-medium text-on-surface-tertiary uppercase mb-3">{isRTL ? '\u0639\u0631\u0636' : 'View'}</h3>
        <div className="space-y-1 mb-6">
          <button
            onClick={() => { setShowArchive(false); setActiveLabel(null); }}
            className={cn(
              'flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm transition-colors',
              !showArchive ? 'bg-surface-secondary text-on-surface' : 'text-on-surface-secondary hover:bg-surface-secondary/50'
            )}
          >
            <StickyNote size={14} /> {isRTL ? '\u0627\u0644\u0645\u0644\u0627\u062d\u0638\u0627\u062a' : 'Notes'}
          </button>
          <button
            onClick={() => { setShowArchive(true); setActiveLabel(null); }}
            className={cn(
              'flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm transition-colors',
              showArchive ? 'bg-surface-secondary text-on-surface' : 'text-on-surface-secondary hover:bg-surface-secondary/50'
            )}
          >
            <Archive size={14} /> {isRTL ? '\u0627\u0644\u0623\u0631\u0634\u064a\u0641' : 'Archive'}
          </button>
        </div>
        {labels.length > 0 && (
          <>
            <h3 className="text-xs font-medium text-on-surface-tertiary uppercase mb-3">{isRTL ? '\u0627\u0644\u062a\u0635\u0646\u064a\u0641\u0627\u062a' : 'Labels'}</h3>
            <div className="space-y-1">
              {labels.map(l => (
                <button
                  key={l}
                  onClick={() => setActiveLabel(activeLabel === l ? null : l)}
                  className={cn(
                    'flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm transition-colors',
                    activeLabel === l ? 'bg-surface-secondary text-on-surface' : 'text-on-surface-secondary hover:bg-surface-secondary/50'
                  )}
                >
                  <Tag size={12} /> {l}
                </button>
              ))}
            </div>
          </>
        )}
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <StickyNote size={18} className="text-amber-500" />
            </div>
            <h1 className="text-xl font-semibold text-on-surface">
              {isRTL ? (showArchive ? '\u0627\u0644\u0623\u0631\u0634\u064a\u0641' : '\u0645\u0644\u0627\u062d\u0638\u0627\u062a \u0633\u0631\u064a\u0639\u0629') : (showArchive ? 'Archive' : 'Quick Notes')}
            </h1>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-on-surface-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isRTL ? '\u0628\u062d\u062b...' : 'Search notes...'}
            className="w-full bg-input border border-border rounded-lg ps-9 pe-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            dir={isRTL ? 'rtl' : 'ltr'}
          />
        </div>

        {/* Quick add */}
        {!showArchive && (
          <div className="mb-6">
            {!quickOpen ? (
              <button
                onClick={() => setQuickOpen(true)}
                className="w-full flex items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3 text-sm text-on-surface-tertiary hover:shadow-md transition-all text-start"
              >
                <Plus size={16} />
                {isRTL ? '\u0645\u0644\u0627\u062d\u0638\u0629 \u062c\u062f\u064a\u062f\u0629...' : 'Take a note...'}
              </button>
            ) : (
              <div className="bg-surface border border-border rounded-xl p-4 shadow-md" dir={isRTL ? 'rtl' : 'ltr'}>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => setQuickType('text')}
                    className={cn('p-1.5 rounded', quickType === 'text' ? 'bg-surface-secondary text-on-surface' : 'text-on-surface-tertiary hover:text-on-surface')}
                    title="Text"
                  >
                    <Type size={14} />
                  </button>
                  <button
                    onClick={() => setQuickType('checklist')}
                    className={cn('p-1.5 rounded', quickType === 'checklist' ? 'bg-surface-secondary text-on-surface' : 'text-on-surface-tertiary hover:text-on-surface')}
                    title="Checklist"
                  >
                    <ListChecks size={14} />
                  </button>
                </div>
                <input
                  type="text"
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  placeholder={isRTL ? '\u0627\u0644\u0639\u0646\u0648\u0627\u0646' : 'Title'}
                  className="w-full bg-transparent text-sm font-medium focus:outline-none mb-2"
                />
                {quickType === 'text' ? (
                  <textarea
                    value={quickContent}
                    onChange={(e) => setQuickContent(e.target.value)}
                    rows={3}
                    placeholder={isRTL ? '\u0645\u0644\u0627\u062d\u0638\u0629...' : 'Take a note...'}
                    className="w-full bg-transparent text-sm focus:outline-none resize-none"
                  />
                ) : (
                  <div className="space-y-1">
                    {quickItems.map((it, idx) => (
                      <div key={it.id} className="flex items-center gap-2">
                        <button onClick={() => setQuickItems(prev => prev.map(p => p.id === it.id ? { ...p, done: !p.done } : p))}>
                          {it.done ? <CheckSquare size={14} className="text-accent" /> : <Square size={14} className="text-on-surface-tertiary" />}
                        </button>
                        <span className={cn('text-sm flex-1', it.done && 'line-through text-on-surface-tertiary')}>{it.text}</span>
                        <button onClick={() => setQuickItems(prev => prev.filter((_, i) => i !== idx))} className="text-on-surface-tertiary hover:text-red-500">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <Plus size={14} className="text-on-surface-tertiary" />
                      <input
                        type="text"
                        value={quickItemText}
                        onChange={(e) => setQuickItemText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && quickItemText.trim()) {
                            setQuickItems(prev => [...prev, { id: crypto.randomUUID(), text: quickItemText.trim(), done: false }]);
                            setQuickItemText('');
                          }
                        }}
                        placeholder={isRTL ? '\u0639\u0646\u0635\u0631 \u062c\u062f\u064a\u062f...' : 'List item...'}
                        className="flex-1 bg-transparent text-sm focus:outline-none"
                      />
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-end gap-2 mt-3">
                  <button onClick={() => { setQuickOpen(false); setQuickTitle(''); setQuickContent(''); setQuickItems([]); }} className="px-3 py-1 text-sm text-on-surface-secondary">
                    {isRTL ? '\u0625\u0644\u063a\u0627\u0621' : 'Close'}
                  </button>
                  <button onClick={handleQuickSave} className="px-3 py-1 text-sm bg-accent text-white rounded-lg">
                    {isRTL ? '\u062d\u0641\u0638' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pinned */}
        {pinned.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-medium text-on-surface-tertiary uppercase mb-3">{isRTL ? '\u0645\u062b\u0628\u062a\u0629' : 'Pinned'}</h3>
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-3">
              {pinned.map(n => <NoteCard key={n.id} note={n} />)}
            </div>
          </div>
        )}

        {/* Others */}
        {others.length > 0 && (
          <div>
            {pinned.length > 0 && (
              <h3 className="text-xs font-medium text-on-surface-tertiary uppercase mb-3">{isRTL ? '\u0627\u0644\u0623\u062e\u0631\u0649' : 'Others'}</h3>
            )}
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-3">
              {others.map(n => <NoteCard key={n.id} note={n} />)}
            </div>
          </div>
        )}

        {filtered.length === 0 && (
          <div className="text-center py-16 text-on-surface-tertiary">
            <StickyNote size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">{isRTL ? '\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0644\u0627\u062d\u0638\u0627\u062a' : 'No notes'}</p>
          </div>
        )}
      </div>

      {/* Editor modal */}
      {editing && (
        <KeepEditor
          note={editing}
          isRTL={isRTL}
          onClose={() => setEditing(null)}
          onSave={saveNote}
          onDelete={deleteNote}
          onTogglePin={togglePin}
          onToggleArchive={toggleArchive}
          onConvertToTask={convertToTask}
        />
      )}
    </div>
  );
}

function KeepEditor({
  note, isRTL, onClose, onSave, onDelete, onTogglePin, onToggleArchive, onConvertToTask,
}: {
  note: KeepNote;
  isRTL: boolean;
  onClose: () => void;
  onSave: (n: KeepNote) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleArchive: (id: string) => void;
  onConvertToTask: (n: KeepNote) => void;
}) {
  const [form, setForm] = useState<KeepNote>({ ...note });
  const [newLabel, setNewLabel] = useState('');
  const [newItem, setNewItem] = useState('');
  const colors = getContrastColor(form.color);
  const update = (f: Partial<KeepNote>) => setForm(prev => ({ ...prev, ...f }));

  const addItem = () => {
    if (!newItem.trim()) return;
    update({ items: [...(form.items || []), { id: crypto.randomUUID(), text: newItem.trim(), done: false }] });
    setNewItem('');
  };
  const toggleItem = (id: string) => {
    update({ items: (form.items || []).map(i => i.id === id ? { ...i, done: !i.done } : i) });
  };
  const removeItem = (id: string) => update({ items: (form.items || []).filter(i => i.id !== id) });

  const toType = (t: 'text' | 'checklist') => {
    if (t === form.type) return;
    if (t === 'checklist') {
      // convert current text to items split by newlines
      const txt = htmlToText(form.content);
      const items: ChecklistItem[] = txt.split(/\n+/).map(s => s.trim()).filter(Boolean).map(text => ({ id: crypto.randomUUID(), text, done: false }));
      update({ type: 'checklist', items: items.length ? items : (form.items || []), content: '' });
    } else {
      // convert items to paragraphs
      const html = (form.items || []).map(i => `<p>${i.done ? '\u2713 ' : ''}${i.text}</p>`).join('') || form.content;
      update({ type: 'text', content: html, items: [] });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className={cn('bg-surface border border-border rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto', getCardBg(form.color))}
        onClick={(e) => e.stopPropagation()}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => toType('text')} className={cn('p-1.5 rounded', form.type === 'text' ? 'bg-black/15' : 'hover:bg-black/10', colors.secondary)}>
              <Type size={14} />
            </button>
            <button onClick={() => toType('checklist')} className={cn('p-1.5 rounded', form.type === 'checklist' ? 'bg-black/15' : 'hover:bg-black/10', colors.secondary)}>
              <ListChecks size={14} />
            </button>
          </div>

          <input
            type="text"
            value={form.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder={isRTL ? '\u0627\u0644\u0639\u0646\u0648\u0627\u0646' : 'Title'}
            className={cn('w-full text-lg font-semibold bg-transparent focus:outline-none', colors.primary)}
          />

          {form.type === 'checklist' ? (
            <div className="space-y-1">
              {(form.items || []).map(it => (
                <div key={it.id} className="flex items-center gap-2 group">
                  <button onClick={() => toggleItem(it.id)}>
                    {it.done ? <CheckSquare size={14} className="text-accent" /> : <Square size={14} className={colors.tertiary} />}
                  </button>
                  <input
                    value={it.text}
                    onChange={(e) => update({ items: (form.items || []).map(x => x.id === it.id ? { ...x, text: e.target.value } : x) })}
                    className={cn('flex-1 bg-transparent text-sm focus:outline-none', colors.primary, it.done && 'line-through opacity-60')}
                  />
                  <button onClick={() => removeItem(it.id)} className={cn('opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500', colors.tertiary)}>
                    <X size={12} />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Plus size={14} className={colors.tertiary} />
                <input
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addItem()}
                  placeholder={isRTL ? '\u0639\u0646\u0635\u0631...' : 'List item...'}
                  className={cn('flex-1 bg-transparent text-sm focus:outline-none', colors.primary)}
                />
              </div>
            </div>
          ) : (
            <RichEditor
              value={form.content}
              onChange={(html) => update({ content: html })}
              placeholder={isRTL ? '\u0645\u0644\u0627\u062d\u0638\u0629...' : 'Take a note...'}
              isRTL={isRTL}
              textClass={colors.primary}
            />
          )}

          {/* Labels */}
          <div>
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {form.labels.map(l => (
                <span key={l} className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs', colors.muted, colors.secondary)}>
                  {l}
                  <button onClick={() => update({ labels: form.labels.filter(x => x !== l) })}><X size={10} /></button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Tag size={14} className={colors.tertiary} />
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newLabel.trim() && !form.labels.includes(newLabel.trim())) {
                    update({ labels: [...form.labels, newLabel.trim()] });
                    setNewLabel('');
                  }
                }}
                placeholder={isRTL ? '\u062a\u0635\u0646\u064a\u0641...' : 'Label...'}
                className={cn('flex-1 bg-transparent text-sm focus:outline-none', colors.primary)}
              />
            </div>
          </div>

          {/* Color picker */}
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Palette size={14} className={colors.tertiary} />
              {CARD_COLORS.map(c => (
                <button
                  key={c.id}
                  onClick={() => update({ color: c.id })}
                  className={cn('w-6 h-6 rounded-full border-2', c.bg, form.color === c.id ? 'border-accent ring-2 ring-accent/20' : 'border-border')}
                  title={c.label}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <div className="flex items-center gap-1">
            <button onClick={() => { onTogglePin(form.id); setForm(prev => ({ ...prev, pinned: !prev.pinned })); }} className={cn('p-2 rounded-lg hover:bg-black/10', colors.secondary)} title="Pin">
              {form.pinned ? <PinOff size={16} /> : <Pin size={16} />}
            </button>
            <button onClick={() => { onToggleArchive(form.id); onClose(); }} className={cn('p-2 rounded-lg hover:bg-black/10', colors.secondary)} title="Archive">
              {form.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
            </button>
            <button onClick={() => { onConvertToTask(form); onClose(); }} className={cn('p-2 rounded-lg hover:bg-accent/10 hover:text-accent', colors.secondary)} title={isRTL ? 'تحويل إلى مهمة' : 'Convert to task'}>
              <CheckCircle2 size={16} />
            </button>
            <button onClick={() => { if (confirm(isRTL ? '\u062d\u0630\u0641\u061f' : 'Delete?')) onDelete(form.id); }} className="p-2 rounded-lg text-red-500 hover:bg-red-500/10" title="Delete">
              <Trash2 size={16} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className={cn('px-4 py-1.5 rounded-lg text-sm hover:bg-black/10', colors.secondary)}>
              {isRTL ? '\u0625\u0644\u063a\u0627\u0621' : 'Cancel'}
            </button>
            <button onClick={() => onSave(form)} className="px-4 py-1.5 rounded-lg text-sm bg-accent text-white hover:bg-accent/90">
              {isRTL ? '\u062d\u0641\u0638' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
