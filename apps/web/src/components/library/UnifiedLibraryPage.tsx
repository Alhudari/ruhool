'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen, BookMarked, FileText, Users, Building2, Presentation,
  FolderOpen, Globe, Video, Code2, Pencil, GraduationCap,
  Search, Plus, Loader2, X, RefreshCw, Link2, ChevronRight,
  ArrowLeft, Save, Trash2, Archive, RotateCcw, ExternalLink,
  Tag, Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────
type EntityType =
  | 'paper' | 'book' | 'report' | 'standard' | 'my-writing' | 'thesis-chapter'
  | 'person' | 'organization' | 'conference' | 'project'
  | 'atomic-note' | 'reading-session' | 'research-cluster'
  | 'file' | 'webpage' | 'video' | 'code-repo';

type ReadingStatus = 'to-read' | 'skimming' | 'reading' | 'paused' | 'done';
type ReadingDepth = 'title-abstract-conclusion' | 'scan-only' | 'selective' | 'full';

interface SubNote { id: string; content: string; createdAt: string; updatedAt: string }
interface EntityLink { targetId: string; relation?: string; createdAt: string }

interface LibraryEntity {
  id: string; type: EntityType; title: string; coverImage?: string;
  notes: string; subNotes: SubNote[]; links: EntityLink[]; tags: string[];
  zoteroKey?: string;
  readingStatus?: ReadingStatus; readingDepth?: ReadingDepth;
  authors?: string; year?: number; url?: string; doi?: string;
  isbn?: string; publisher?: string; journal?: string; abstract?: string;
  createdAt: string; updatedAt: string; archivedAt?: string; deletedAt?: string;
}

// ── Config ────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<EntityType, {
  icon: React.ElementType; color: string; bg: string;
  labelEn: string; labelAr: string;
}> = {
  paper:            { icon: BookOpen,      color: 'text-info',    bg: 'bg-info/10',    labelEn: 'Paper',           labelAr: 'ورقة بحثية' },
  book:             { icon: BookMarked,    color: 'text-accent',  bg: 'bg-accent/10',  labelEn: 'Book',            labelAr: 'كتاب' },
  report:           { icon: FileText,      color: 'text-warning', bg: 'bg-warning/10', labelEn: 'Report',          labelAr: 'تقرير' },
  standard:         { icon: Star,          color: 'text-amber-500',bg: 'bg-amber-500/10',labelEn: 'Standard',      labelAr: 'معيار' },
  'my-writing':     { icon: Pencil,        color: 'text-success', bg: 'bg-success/10', labelEn: 'My Writing',      labelAr: 'كتاباتي' },
  'thesis-chapter': { icon: GraduationCap,color: 'text-accent',  bg: 'bg-accent/10',  labelEn: 'Thesis Chapter',  labelAr: 'فصل أطروحة' },
  person:           { icon: Users,         color: 'text-purple-500',bg: 'bg-purple-500/10',labelEn: 'Person',      labelAr: 'شخص' },
  organization:     { icon: Building2,     color: 'text-orange-500',bg: 'bg-orange-500/10',labelEn: 'Organization',labelAr: 'مؤسسة' },
  conference:       { icon: Presentation,  color: 'text-teal-500',bg: 'bg-teal-500/10', labelEn: 'Conference',    labelAr: 'مؤتمر' },
  project:          { icon: FolderOpen,    color: 'text-cyan-500',bg: 'bg-cyan-500/10', labelEn: 'Project',       labelAr: 'مشروع' },
  'atomic-note':    { icon: FileText,      color: 'text-green-500',bg: 'bg-green-500/10',labelEn: 'Atomic Note',  labelAr: 'ملاحظة ذرية' },
  'reading-session':{ icon: BookOpen,      color: 'text-info',    bg: 'bg-info/10',    labelEn: 'Reading Session', labelAr: 'جلسة قراءة' },
  'research-cluster':{ icon: FolderOpen,   color: 'text-warning', bg: 'bg-warning/10', labelEn: 'Research Cluster',labelAr: 'تجمع بحثي' },
  file:             { icon: FileText,      color: 'text-on-surface-secondary',bg: 'bg-surface-tertiary',labelEn: 'File',labelAr: 'ملف' },
  webpage:          { icon: Globe,         color: 'text-blue-500',bg: 'bg-blue-500/10', labelEn: 'Webpage',       labelAr: 'صفحة ويب' },
  video:            { icon: Video,         color: 'text-red-500', bg: 'bg-red-500/10',  labelEn: 'Video',         labelAr: 'فيديو' },
  'code-repo':      { icon: Code2,         color: 'text-gray-500',bg: 'bg-gray-500/10', labelEn: 'Code Repo',     labelAr: 'مستودع كود' },
};

const READING_STATUS_LABELS: Record<ReadingStatus, { en: string; ar: string; color: string }> = {
  'to-read':  { en: 'To Read',  ar: 'للقراءة',   color: 'bg-warning/15 text-warning' },
  'skimming': { en: 'Skimming', ar: 'تصفح',       color: 'bg-info/15 text-info' },
  'reading':  { en: 'Reading',  ar: 'يُقرأ الآن', color: 'bg-accent/15 text-accent' },
  'paused':   { en: 'Paused',   ar: 'موقوف',      color: 'bg-surface-tertiary text-on-surface-tertiary' },
  'done':     { en: 'Done',     ar: 'مكتمل',      color: 'bg-success/15 text-success' },
};

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-surface-tertiary rounded', className)} />;
}

// ── Add Entity Modal ──────────────────────────────────────────────────
function AddEntityModal({ onClose, onCreate, isRTL }: {
  onClose: () => void;
  onCreate: (e: LibraryEntity) => void;
  isRTL: boolean;
}) {
  const [form, setForm] = useState({
    type: 'paper' as EntityType, title: '', authors: '', year: '',
    doi: '', url: '', tags: '', readingStatus: '' as ReadingStatus | '',
    abstract: '', journal: '', publisher: '',
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        type: form.type, title: form.title,
        authors: form.authors || undefined,
        year: form.year ? Number(form.year) : undefined,
        doi: form.doi || undefined, url: form.url || undefined,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        readingStatus: form.readingStatus || undefined,
        abstract: form.abstract || undefined,
        journal: form.journal || undefined,
        publisher: form.publisher || undefined,
      };
      const created = await apiFetch<LibraryEntity>('/api/library/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      onCreate(created);
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="bg-surface rounded-2xl border border-border shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-base font-semibold text-on-surface">
              {isRTL ? 'إضافة كيان جديد' : 'Add New Entity'}
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-tertiary">
              <X className="h-4 w-4 text-on-surface-tertiary" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {/* Type */}
            <div>
              <label className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wider mb-1.5 block">
                {isRTL ? 'النوع' : 'Type'}
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['paper','book','report','standard','my-writing','person','organization','conference','atomic-note','research-cluster','webpage','file'] as EntityType[]).map(t => {
                  const cfg = TYPE_CONFIG[t];
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={t}
                      onClick={() => setForm(f => ({ ...f, type: t }))}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs border transition-colors',
                        form.type === t
                          ? `${cfg.bg} ${cfg.color} border-current`
                          : 'border-border text-on-surface-tertiary hover:bg-surface-secondary'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{cfg.labelEn}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wider mb-1.5 block">
                {isRTL ? 'العنوان *' : 'Title *'}
              </label>
              <input
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                dir="auto" placeholder={isRTL ? 'عنوان الكيان...' : 'Entity title...'}
                className="w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Authors + Year */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-on-surface-tertiary mb-1 block">{isRTL ? 'المؤلفون' : 'Authors'}</label>
                <input
                  value={form.authors} onChange={e => setForm(f => ({ ...f, authors: e.target.value }))}
                  dir="auto" placeholder="Author A, Author B"
                  className="w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="text-xs text-on-surface-tertiary mb-1 block">{isRTL ? 'السنة' : 'Year'}</label>
                <input
                  value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                  type="number" placeholder="2024"
                  className="w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>

            {/* DOI + URL */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-on-surface-tertiary mb-1 block">DOI</label>
                <input value={form.doi} onChange={e => setForm(f => ({ ...f, doi: e.target.value }))}
                  placeholder="10.xxxx/..." className="w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-accent" />
              </div>
              <div>
                <label className="text-xs text-on-surface-tertiary mb-1 block">URL</label>
                <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://..." className="w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-accent" />
              </div>
            </div>

            {/* Reading Status */}
            <div>
              <label className="text-xs text-on-surface-tertiary mb-1 block">{isRTL ? 'حالة القراءة' : 'Reading Status'}</label>
              <select
                value={form.readingStatus}
                onChange={e => setForm(f => ({ ...f, readingStatus: e.target.value as ReadingStatus | '' }))}
                className="w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">— {isRTL ? 'اختر' : 'Select'}</option>
                {Object.entries(READING_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{isRTL ? v.ar : v.en}</option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div>
              <label className="text-xs text-on-surface-tertiary mb-1 block">{isRTL ? 'الوسوم (مفصولة بفاصلة)' : 'Tags (comma-separated)'}</label>
              <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="BIM, Kuwait, Standard"
                className="w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-accent" />
            </div>

            {/* Abstract */}
            <div>
              <label className="text-xs text-on-surface-tertiary mb-1 block">{isRTL ? 'الملخص' : 'Abstract'}</label>
              <textarea value={form.abstract} onChange={e => setForm(f => ({ ...f, abstract: e.target.value }))}
                rows={3} dir="auto"
                className="w-full resize-none rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-accent" />
            </div>
          </div>

          <div className="px-6 pb-5 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-border text-on-surface-secondary hover:bg-surface-tertiary">
              {isRTL ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              onClick={submit} disabled={saving || !form.title.trim()}
              className="px-4 py-2 text-sm rounded-lg bg-accent text-on-accent hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isRTL ? 'إضافة' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Entity Detail Panel ───────────────────────────────────────────────
type DetailTab = 'notes' | 'connections' | 'reading';

function EntityDetailPanel({ entity, onBack, onUpdate, isRTL, allEntities }: {
  entity: LibraryEntity;
  onBack: () => void;
  onUpdate: (e: LibraryEntity) => void;
  isRTL: boolean;
  allEntities: LibraryEntity[];
}) {
  const [tab, setTab] = useState<DetailTab>('notes');
  const [notesValue, setNotesValue] = useState(entity.notes);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newSubNote, setNewSubNote] = useState('');
  const [addingSubNote, setAddingSubNote] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkSuggestions, setLinkSuggestions] = useState<LibraryEntity[]>([]);
  const [readingStatus, setReadingStatus] = useState<ReadingStatus | ''>(entity.readingStatus ?? '');
  const [readingDepth, setReadingDepth] = useState(entity.readingDepth ?? '');

  const cfg = TYPE_CONFIG[entity.type];
  const Icon = cfg.icon;

  const saveNotes = async () => {
    setSaving(true);
    try {
      const updated = await apiFetch<LibraryEntity>(`/api/library/entities/${entity.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesValue }),
      });
      onUpdate(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally { setSaving(false); }
  };

  const addSubNote = async () => {
    if (!newSubNote.trim()) return;
    setAddingSubNote(true);
    try {
      await apiFetch(`/api/library/entities/${entity.id}/subnotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newSubNote }),
      });
      const updated = await apiFetch<LibraryEntity>(`/api/library/entities/${entity.id}`);
      onUpdate(updated);
      setNewSubNote('');
    } finally { setAddingSubNote(false); }
  };

  const linkEntity = async (targetId: string) => {
    try {
      await apiFetch(`/api/library/entities/${entity.id}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId }),
      });
      const updated = await apiFetch<LibraryEntity>(`/api/library/entities/${entity.id}`);
      onUpdate(updated);
      setLinkSearch('');
      setLinkSuggestions([]);
    } catch { /* silent */ }
  };

  const unlink = async (targetId: string) => {
    try {
      await apiFetch(`/api/library/entities/${entity.id}/link/${targetId}`, { method: 'DELETE' });
      const updated = await apiFetch<LibraryEntity>(`/api/library/entities/${entity.id}`);
      onUpdate(updated);
    } catch { /* silent */ }
  };

  const saveReadingInfo = async () => {
    setSaving(true);
    try {
      const updated = await apiFetch<LibraryEntity>(`/api/library/entities/${entity.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          readingStatus: readingStatus || undefined,
          readingDepth: readingDepth || undefined,
        }),
      });
      onUpdate(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally { setSaving(false); }
  };

  useEffect(() => {
    if (!linkSearch.trim()) { setLinkSuggestions([]); return; }
    const q = linkSearch.toLowerCase();
    const already = new Set([entity.id, ...entity.links.map(l => l.targetId)]);
    setLinkSuggestions(
      allEntities.filter(e => !already.has(e.id) && (e.title.toLowerCase().includes(q) || (e.authors ?? '').toLowerCase().includes(q))).slice(0, 6)
    );
  }, [linkSearch, allEntities, entity]);

  const TABS: { id: DetailTab; label: { en: string; ar: string } }[] = [
    { id: 'notes', label: { en: 'Notes', ar: 'الملاحظات' } },
    { id: 'connections', label: { en: 'Connections', ar: 'الروابط' } },
    { id: 'reading', label: { en: 'Reading', ar: 'القراءة' } },
  ];

  return (
    <div className="flex flex-col h-full" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-start gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-surface-secondary mt-0.5">
          <ArrowLeft className={cn('h-4 w-4 text-on-surface-tertiary', isRTL && 'rotate-180')} />
        </button>
        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', cfg.bg)}>
          <Icon className={cn('h-5 w-5', cfg.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-on-surface leading-snug">{entity.title}</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-on-surface-tertiary">
            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', cfg.bg, cfg.color)}>
              {isRTL ? cfg.labelAr : cfg.labelEn}
            </span>
            {entity.authors && <span>{entity.authors}</span>}
            {entity.year && <span>{entity.year}</span>}
            {entity.readingStatus && (
              <span className={cn('px-2 py-0.5 rounded-full text-[10px]', READING_STATUS_LABELS[entity.readingStatus].color)}>
                {isRTL ? READING_STATUS_LABELS[entity.readingStatus].ar : READING_STATUS_LABELS[entity.readingStatus].en}
              </span>
            )}
            {entity.doi && (
              <a href={`https://doi.org/${entity.doi}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-accent">
                DOI <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        </div>
        {/* Export buttons */}
        <div className="flex gap-1 shrink-0">
          <button
            title="Export CSV"
            onClick={() => {
              const headers = ['title','type','authors','year','doi','readingStatus','tags'];
              const row = [entity.title, entity.type, entity.authors??'', entity.year??'', entity.doi??'', entity.readingStatus??'', entity.tags.join(';')];
              const csv = [headers.join(','), row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')].join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
              a.download = `${entity.title.replace(/[^\w]/g,'-').slice(0,40)}.csv`; a.click();
            }}
            className="p-1.5 text-[10px] rounded border border-border text-on-surface-tertiary hover:bg-surface-tertiary"
          >CSV</button>
          {(entity.zoteroKey || entity.doi) && (
            <button
              title="Export BibTeX"
              onClick={() => {
                const key = entity.zoteroKey ?? entity.doi?.replace(/[^a-zA-Z0-9]/g,'') ?? entity.id.slice(0,8);
                const bib = `@article{${key},\n  title = {${entity.title}},\n  author = {${entity.authors??''}},\n  year = {${entity.year??''}},\n  doi = {${entity.doi??''}},\n  journal = {${entity.journal??''}},\n}`;
                const blob = new Blob([bib], { type: 'text/plain' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                a.download = `${key}.bib`; a.click();
              }}
              className="p-1.5 text-[10px] rounded border border-border text-on-surface-tertiary hover:bg-surface-tertiary"
            >.bib</button>
          )}
        </div>
      </div>

      {/* Abstract if present */}
      {entity.abstract && (
        <div className="px-6 py-3 bg-info/5 border-b border-border">
          <p className="text-xs text-on-surface-secondary leading-relaxed line-clamp-3">{entity.abstract}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border px-6 shrink-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('px-4 py-2.5 text-sm border-b-2 transition-colors',
              tab === t.id ? 'border-accent text-accent font-medium' : 'border-transparent text-on-surface-tertiary hover:text-on-surface-secondary'
            )}>
            {t.label[isRTL ? 'ar' : 'en']}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* ── Notes tab ─────────────────────────────────────────── */}
        {tab === 'notes' && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wider">
                  {isRTL ? 'الملاحظة الرئيسية' : 'Main Note'}
                </label>
                {saved && (
                  <span className="text-xs text-success">{isRTL ? 'تم الحفظ ✓' : 'Saved ✓'}</span>
                )}
              </div>
              <textarea
                value={notesValue}
                onChange={e => setNotesValue(e.target.value)}
                onBlur={saveNotes}
                rows={8}
                dir="auto"
                placeholder={isRTL ? 'اكتب ملاحظاتك هنا... (Markdown مدعوم)' : 'Write your notes here... (Markdown supported)'}
                className="w-full resize-none rounded-lg border border-border bg-surface-secondary px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-accent font-mono"
              />
              <div className="flex justify-end mt-2">
                <button onClick={saveNotes} disabled={saving}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-surface-tertiary disabled:opacity-50">
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  {isRTL ? 'حفظ' : 'Save'}
                </button>
              </div>
            </div>

            {/* Sub-notes */}
            <div>
              <h3 className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wider mb-3">
                {isRTL ? `ملاحظات فرعية (${entity.subNotes?.length ?? 0})` : `Sub-notes (${entity.subNotes?.length ?? 0})`}
              </h3>
              {(entity.subNotes ?? []).map(sn => (
                <div key={sn.id} className="rounded-lg border border-border bg-surface p-3 mb-2 text-sm text-on-surface-secondary">
                  {sn.content}
                  <p className="text-[10px] text-on-surface-tertiary mt-1">{new Date(sn.createdAt).toLocaleDateString()}</p>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <input
                  value={newSubNote} onChange={e => setNewSubNote(e.target.value)}
                  dir="auto" placeholder={isRTL ? 'ملاحظة فرعية جديدة...' : 'New sub-note...'}
                  className="flex-1 rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-accent"
                  onKeyDown={e => e.key === 'Enter' && addSubNote()}
                />
                <button onClick={addSubNote} disabled={addingSubNote || !newSubNote.trim()}
                  className="px-3 py-2 rounded-lg bg-accent text-on-accent text-sm disabled:opacity-50">
                  {addingSubNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Tags */}
            {entity.tags.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Tag className="h-3.5 w-3.5 text-on-surface-tertiary" />
                {entity.tags.map(t => (
                  <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-surface-tertiary text-on-surface-tertiary">#{t}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Connections tab ────────────────────────────────────── */}
        {tab === 'connections' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wider mb-2 block">
                {isRTL ? 'ربط بكيان آخر' : 'Link to Entity'}
              </label>
              <div className="relative">
                <input
                  value={linkSearch} onChange={e => setLinkSearch(e.target.value)}
                  placeholder={isRTL ? 'ابحث للربط...' : 'Search to link...'}
                  className="w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-accent"
                />
                {linkSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg z-10 divide-y divide-border">
                    {linkSuggestions.map(e => {
                      const c = TYPE_CONFIG[e.type];
                      const I = c.icon;
                      return (
                        <button key={e.id} onClick={() => linkEntity(e.id)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-start hover:bg-surface-secondary transition-colors">
                          <I className={cn('h-4 w-4 shrink-0', c.color)} />
                          <span className="flex-1 truncate">{e.title}</span>
                          <span className="text-[10px] text-on-surface-tertiary">{e.year ?? ''}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {(entity.links ?? []).length === 0 ? (
              <p className="text-sm text-on-surface-tertiary py-6 text-center">
                {isRTL ? 'لا روابط بعد. ابحث لإضافة رابط.' : 'No connections yet. Search to add one.'}
              </p>
            ) : (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wider">
                  {isRTL ? `الروابط (${entity.links.length})` : `Links (${entity.links.length})`}
                </h3>
                {entity.links.map(link => {
                  const target = allEntities.find(e => e.id === link.targetId);
                  if (!target) return null;
                  const c = TYPE_CONFIG[target.type];
                  const I = c.icon;
                  return (
                    <div key={link.targetId} className="flex items-center gap-2 rounded-lg border border-border bg-surface-secondary px-3 py-2.5">
                      <I className={cn('h-4 w-4 shrink-0', c.color)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-on-surface truncate">{target.title}</p>
                        <p className="text-[10px] text-on-surface-tertiary">{isRTL ? c.labelAr : c.labelEn}</p>
                      </div>
                      <button onClick={() => unlink(link.targetId)}
                        className="text-on-surface-tertiary hover:text-error shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Reading tab ────────────────────────────────────────── */}
        {tab === 'reading' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wider mb-2 block">
                {isRTL ? 'حالة القراءة' : 'Reading Status'}
              </label>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(READING_STATUS_LABELS).map(([k, v]) => (
                  <button key={k} onClick={() => setReadingStatus(k as ReadingStatus)}
                    className={cn('px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                      readingStatus === k ? `${v.color} border-current` : 'border-border text-on-surface-tertiary hover:bg-surface-secondary'
                    )}>
                    {isRTL ? v.ar : v.en}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wider mb-2 block">
                {isRTL ? 'عمق القراءة' : 'Reading Depth'}
              </label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { v: 'title-abstract-conclusion', en: 'Title/Abstract/Conclusion', ar: 'عنوان/ملخص/خاتمة' },
                  { v: 'scan-only', en: 'Scan Only', ar: 'تصفح فقط' },
                  { v: 'selective', en: 'Selective', ar: 'انتقائي' },
                  { v: 'full', en: 'Full Read', ar: 'قراءة كاملة' },
                ].map(d => (
                  <button key={d.v} onClick={() => setReadingDepth(d.v)}
                    className={cn('px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                      readingDepth === d.v ? 'bg-accent/15 text-accent border-accent/30' : 'border-border text-on-surface-tertiary hover:bg-surface-secondary'
                    )}>
                    {isRTL ? d.ar : d.en}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={saveReadingInfo} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-on-accent text-sm disabled:opacity-50 hover:opacity-90">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {isRTL ? 'حفظ معلومات القراءة' : 'Save Reading Info'}
            </button>

            {entity.zoteroKey && (
              <div className="rounded-lg border border-border bg-surface-secondary px-4 py-3 text-xs text-on-surface-secondary">
                <span className="font-medium text-on-surface">Zotero Key:</span> {entity.zoteroKey}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Unified Library Page ─────────────────────────────────────────
export function UnifiedLibraryPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [entities, setEntities] = useState<LibraryEntity[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<EntityType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ReadingStatus | 'all'>('all');
  const [selected, setSelected] = useState<LibraryEntity | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [offset, setOffset] = useState(0);
  // J-11: multi-select
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const toggleCheck = (id: string) => setCheckedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const clearChecked = () => setCheckedIds(new Set());
  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (search.trim()) params.set('search', search.trim());
      const res = await apiFetch<{ entities: LibraryEntity[]; total: number }>(
        `/api/library/entities?${params}`
      );
      setEntities(res.entities ?? []);
      setTotal(res.total ?? 0);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [typeFilter, search, offset]);

  useEffect(() => {
    const t = setTimeout(() => load(), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const filteredByStatus = useMemo(() =>
    statusFilter === 'all' ? entities : entities.filter(e => e.readingStatus === statusFilter),
    [entities, statusFilter]
  );

  const handleCreate = (e: LibraryEntity) => {
    setEntities(prev => [e, ...prev]);
    setTotal(t => t + 1);
    setSelected(e);
  };

  const handleUpdate = (updated: LibraryEntity) => {
    setEntities(prev => prev.map(e => e.id === updated.id ? updated : e));
    if (selected?.id === updated.id) setSelected(updated);
  };

  const deleteEntity = async (id: string) => {
    if (!confirm(isRTL ? 'نقل إلى المحذوفات؟' : 'Move to deleted?')) return;
    try {
      await apiFetch(`/api/library/entities/${id}`, { method: 'DELETE' });
      setEntities(prev => prev.filter(e => e.id !== id));
      setTotal(t => Math.max(0, t - 1));
      if (selected?.id === id) setSelected(null);
    } catch { /* silent */ }
  };

  // Type count breakdown
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of entities) c[e.type] = (c[e.type] ?? 0) + 1;
    return c;
  }, [entities]);

  const QUICK_TYPES: EntityType[] = ['paper', 'book', 'standard', 'person', 'atomic-note', 'research-cluster'];

  return (
    <div className="flex h-full overflow-hidden" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ── Sidebar ── */}
      <div className="w-56 shrink-0 border-e border-border bg-surface flex flex-col">
        <div className="px-4 py-4 border-b border-border">
          <h2 className="font-bold text-sm text-on-surface">{isRTL ? 'المكتبة الموحّدة' : 'Unified Library'}</h2>
          <p className="text-[10px] text-on-surface-tertiary mt-0.5">{total} {isRTL ? 'كيان' : 'entities'}</p>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {/* All */}
          <button
            onClick={() => { setTypeFilter('all'); setOffset(0); }}
            className={cn('w-full flex items-center gap-2 px-4 py-2 text-xs hover:bg-surface-secondary transition-colors text-start',
              typeFilter === 'all' ? 'bg-accent/10 text-accent font-medium' : 'text-on-surface-secondary'
            )}
          >
            <BookOpen className="h-3.5 w-3.5 shrink-0" />
            {isRTL ? 'الكل' : 'All'}
            <span className="ms-auto text-[10px] text-on-surface-tertiary">{total}</span>
          </button>

          <div className="px-3 pt-3 pb-1">
            <p className="text-[9px] uppercase tracking-wider text-on-surface-tertiary font-medium">
              {isRTL ? 'حسب النوع' : 'By Type'}
            </p>
          </div>

          {QUICK_TYPES.map(t => {
            const c = TYPE_CONFIG[t];
            const I = c.icon;
            return (
              <button key={t}
                onClick={() => { setTypeFilter(t); setOffset(0); }}
                className={cn('w-full flex items-center gap-2 px-4 py-2 text-xs hover:bg-surface-secondary transition-colors text-start',
                  typeFilter === t ? 'bg-accent/10 text-accent font-medium' : 'text-on-surface-secondary'
                )}
              >
                <I className={cn('h-3.5 w-3.5 shrink-0', c.color)} />
                {isRTL ? c.labelAr : c.labelEn}
                {typeCounts[t] ? <span className="ms-auto text-[10px] text-on-surface-tertiary">{typeCounts[t]}</span> : null}
              </button>
            );
          })}

          <div className="px-3 pt-3 pb-1">
            <p className="text-[9px] uppercase tracking-wider text-on-surface-tertiary font-medium">
              {isRTL ? 'حالة القراءة' : 'Reading Status'}
            </p>
          </div>
          <button
            onClick={() => setStatusFilter('all')}
            className={cn('w-full flex items-center gap-2 px-4 py-2 text-xs hover:bg-surface-secondary transition-colors text-start',
              statusFilter === 'all' ? 'bg-accent/10 text-accent font-medium' : 'text-on-surface-secondary'
            )}
          >
            {isRTL ? 'الكل' : 'All'}
          </button>
          {Object.entries(READING_STATUS_LABELS).map(([k, v]) => (
            <button key={k}
              onClick={() => setStatusFilter(k as ReadingStatus)}
              className={cn('w-full flex items-center gap-2 px-4 py-2 text-xs hover:bg-surface-secondary transition-colors text-start',
                statusFilter === k ? 'bg-accent/10 text-accent font-medium' : 'text-on-surface-secondary'
              )}
            >
              <span className={cn('h-2 w-2 rounded-full shrink-0', v.color.includes('warning') ? 'bg-warning' : v.color.includes('info') ? 'bg-info' : v.color.includes('accent') ? 'bg-accent' : v.color.includes('success') ? 'bg-success' : 'bg-on-surface-tertiary')} />
              {isRTL ? v.ar : v.en}
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-border space-y-1.5">
          <button
            onClick={() => setShowAdd(true)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-accent text-on-accent text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            {isRTL ? 'كيان جديد' : 'New Entity'}
          </button>
          <div className="flex gap-1.5">
            <a href="/zotero"
              className="flex-1 text-center text-[11px] py-1.5 rounded-md bg-surface-secondary hover:bg-surface-tertiary text-on-surface-secondary"
              title={isRTL ? 'استورد من زوتيرو' : 'Import from Zotero'}>
              📚 Zotero
            </a>
            <a href="/library/matrix"
              className="flex-1 text-center text-[11px] py-1.5 rounded-md bg-surface-secondary hover:bg-surface-tertiary text-on-surface-secondary"
              title={isRTL ? 'استورد من Obsidian' : 'Import from Obsidian vault'}>
              📂 Vault
            </a>
          </div>
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="flex-1 flex min-w-0">
        {/* Entity list */}
        <div className={cn('flex flex-col border-e border-border bg-surface-secondary transition-all', selected ? 'w-80 shrink-0' : 'flex-1')}>
          {/* Search bar */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <div className="relative flex-1">
              <Search className={cn('absolute top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-tertiary', isRTL ? 'right-3' : 'left-3')} />
              <input
                value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }}
                placeholder={isRTL ? 'بحث...' : 'Search...'}
                className={cn('w-full bg-surface border border-border rounded-lg py-1.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-accent', isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3')}
              />
            </div>
            <button onClick={() => load()} className="p-1.5 text-on-surface-tertiary hover:text-on-surface rounded-lg hover:bg-surface-tertiary">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
              </div>
            ) : filteredByStatus.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-on-surface-tertiary px-6">
                <BookOpen className="h-10 w-10 opacity-30 mb-3" />
                <p className="text-sm">{isRTL ? 'لا كيانات في هذا الفلتر' : 'No entities in this filter'}</p>
                <p className="text-[11px] text-on-surface-tertiary mt-1 mb-4 text-center">
                  {isRTL
                    ? 'لو مكتبتك جديدة، استورد دفعة واحدة من المصادر التالية:'
                    : 'If your library is empty, import in bulk from one of these sources:'}
                </p>
                <div className="flex flex-col gap-2 w-full max-w-xs">
                  <a href="/zotero"
                    className="text-xs px-3 py-2 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 text-center">
                    📚 {isRTL ? 'استورد من زوتيرو' : 'Import from Zotero'}
                  </a>
                  <a href="/library/matrix"
                    className="text-xs px-3 py-2 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 text-center">
                    📂 {isRTL ? 'استورد من Obsidian vault' : 'Import from Obsidian vault'}
                  </a>
                  <button onClick={() => setShowAdd(true)}
                    className="text-xs px-3 py-2 rounded-lg border border-border hover:bg-surface-secondary">
                    {isRTL ? 'أو أضف يدوياً' : 'Or add manually'}
                  </button>
                </div>
              </div>
            ) : (
              filteredByStatus.map(e => {
                const c = TYPE_CONFIG[e.type];
                const I = c.icon;
                const isActive = selected?.id === e.id;
                return (
                  <button
                    key={e.id}
                    onClick={() => setSelected(isActive ? null : e)}
                    className={cn('w-full flex items-start gap-3 px-4 py-3 text-start hover:bg-surface-tertiary transition-colors',
                      isActive && 'bg-accent/10 border-s-2 border-accent'
                    )}
                  >
                    {/* Checkbox for multi-select */}
                    <input type="checkbox" checked={checkedIds.has(e.id)}
                      onClick={ev => { ev.stopPropagation(); toggleCheck(e.id); }}
                      onChange={() => {}}
                      className="shrink-0 h-4 w-4 rounded accent-accent mt-2" />
                    <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5', c.bg)}>
                      <I className={cn('h-4 w-4', c.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">{e.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-on-surface-tertiary">
                        {e.authors && <span className="truncate max-w-[100px]">{e.authors.split(',')[0]?.trim()}</span>}
                        {e.year && <span>{e.year}</span>}
                        {e.readingStatus && (
                          <span className={cn('px-1.5 py-0 rounded-full text-[10px]', READING_STATUS_LABELS[e.readingStatus].color)}>
                            {isRTL ? READING_STATUS_LABELS[e.readingStatus].ar : READING_STATUS_LABELS[e.readingStatus].en}
                          </span>
                        )}
                      </div>
                      {e.tags.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {e.tags.slice(0, 2).map(t => (
                            <span key={t} className="text-[9px] px-1 py-0 rounded bg-surface-tertiary text-on-surface-tertiary">#{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={ev => { ev.stopPropagation(); deleteEntity(e.id); }}
                      className="p-1 text-on-surface-tertiary hover:text-error shrink-0 opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <ChevronRight className={cn('h-4 w-4 text-on-surface-tertiary shrink-0 mt-1', isRTL && 'rotate-180')} />
                  </button>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {total > LIMIT && (
            <div className="border-t border-border px-4 py-2 flex items-center justify-between text-xs text-on-surface-tertiary">
              <span>{offset + 1}–{Math.min(offset + LIMIT, total)} / {total}</span>
              <div className="flex gap-1">
                <button onClick={() => setOffset(o => Math.max(0, o - LIMIT))} disabled={offset === 0}
                  className="px-2 py-1 rounded border border-border disabled:opacity-30 hover:bg-surface-tertiary">‹</button>
                <button onClick={() => setOffset(o => o + LIMIT)} disabled={offset + LIMIT >= total}
                  className="px-2 py-1 rounded border border-border disabled:opacity-30 hover:bg-surface-tertiary">›</button>
              </div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="flex-1 min-w-0 bg-surface overflow-hidden">
            <EntityDetailPanel
              entity={selected}
              onBack={() => setSelected(null)}
              onUpdate={handleUpdate}
              isRTL={isRTL}
              allEntities={entities}
            />
          </div>
        )}

        {/* Empty right pane */}
        {!selected && (
          <div className="flex-1 hidden lg:flex items-center justify-center text-on-surface-tertiary bg-surface">
            <div className="text-center">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">{isRTL ? 'اختر كياناً لعرض تفاصيله' : 'Select an entity to view details'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Multi-select action bar */}
      {checkedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-surface border border-border rounded-xl shadow-2xl px-5 py-3 flex items-center gap-4"
          dir={isRTL ? 'rtl' : 'ltr'}>
          <span className="text-sm font-medium text-on-surface">
            {checkedIds.size} {isRTL ? 'محدد' : 'selected'}
          </span>
          <button
            onClick={async () => {
              const targetId = window.prompt(isRTL ? 'أدخل ID الكيان للربط:' : 'Enter entity ID to link to:');
              if (!targetId) return;
              for (const id of checkedIds) {
                await apiFetch(`/api/library/entities/${id}/link`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ targetId }),
                }).catch(() => {});
              }
              clearChecked();
              await load();
            }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent text-on-accent hover:opacity-90">
            <Link2 className="h-3.5 w-3.5" />
            {isRTL ? 'ربط المحددة' : 'Link selected'}
          </button>
          <button onClick={clearChecked}
            className="text-xs px-3 py-1.5 rounded-lg border border-border text-on-surface-secondary hover:bg-surface-secondary">
            {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <AddEntityModal onClose={() => setShowAdd(false)} onCreate={handleCreate} isRTL={isRTL} />
      )}
    </div>
  );
}
