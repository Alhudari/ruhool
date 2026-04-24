'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Plus, Loader2, ChevronRight, File, Folder,
  FlaskConical, X, Save, Edit2, ArrowLeft,
  SortAsc,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/store/app';
import { WikilinkEditor } from '@/components/shared/WikilinkEditor';
import { WikilinkRenderer } from '@/components/shared/WikilinkRenderer';

// ─── Constants ────────────────────────────────────────────────────────────────

const FLAG: Record<string, string> = {
  QAT: '🇶🇦', ARE: '🇦🇪', GBR: '🇬🇧', KWT: '🇰🇼', SAU: '🇸🇦',
  USA: '🇺🇸', DEU: '🇩🇪', AUS: '🇦🇺', SGP: '🇸🇬', NLD: '🇳🇱',
};

const FILE_ICON: Record<string, string> = {
  pdf: '📄', xlsx: '📊', xls: '📊', csv: '📊',
  docx: '📝', doc: '📝', pptx: '📑', ppt: '📑',
  zip: '🗜', rar: '🗜', jpg: '🖼', jpeg: '🖼', png: '🖼',
  mp4: '🎬', webm: '🎬', default: '📁',
};

const DIMENSION_COLORS: Record<string, string> = {
  'bim-mandate': 'bg-info/15 text-info',
  contracts: 'bg-warning/15 text-warning',
  laws: 'bg-error/15 text-error',
  market: 'bg-success/15 text-success',
  standards: 'bg-accent/15 text-accent',
  methodology: 'bg-purple-500/15 text-purple-500',
  writing: 'bg-blue-500/15 text-blue-500',
  training: 'bg-orange-500/15 text-orange-500',
  life: 'bg-pink-500/15 text-pink-500',
  other: 'bg-surface-tertiary text-on-surface-secondary',
};

const SOURCE_TYPES = ['url', 'person', 'meeting', 'zotero', 'email', 'purchase', 'direct-download'] as const;
const FILE_CATEGORIES = [
  'technical-doc', 'regulation', 'standard', 'data', 'presentation',
  'template', 'image', 'correspondence', 'report', 'thesis', 'other',
] as const;
const DIMENSIONS = [
  'bim-mandate', 'contracts', 'laws', 'market', 'standards',
  'methodology', 'writing', 'training', 'life', 'other',
] as const;

type SortKey = 'name' | 'size' | 'type' | 'date';
type TabId = 'files' | 'notes' | 'provenance' | 'report';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Jurisdiction {
  type: 'country' | 'region' | 'international' | 'life';
  code?: string;
  name: string;
}

interface FileProvenance {
  path: string;
  name: string;
  sourceType?: string;
  sourceUrl?: string;
  sourcePerson?: string;
  sourceMeetingId?: string;
  sourceDate?: string;
  tags?: string[];
  fileCategory?: string;
  jurisdictionCode?: string;
  notes?: string;
  addedAt?: string;
}

interface ResearchCluster {
  id: string;
  name: string;
  description?: string;
  paths: string[];
  tags?: string[];
  jurisdiction?: Jurisdiction;
  dimension?: string;
  fileMetadata?: Record<string, FileProvenance>;
  notes?: string;
  report?: string;
  reportUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface BrowseEntry {
  name: string;
  path: string;
  type: 'file' | 'folder';
  ext: string;
  size: number;
  modifiedAt: string;
  viewMode: string;
}

interface MeetingSession {
  id: string;
  title: string;
  date?: string;
}

interface TagSuggestion {
  tag: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(ext: string): string {
  const clean = ext.replace(/^\./, '').toLowerCase();
  return FILE_ICON[clean] ?? FILE_ICON.default;
}

function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL || '';
}

// ─── New Cluster Form ─────────────────────────────────────────────────────────

interface NewClusterFormProps {
  onSave: (cluster: ResearchCluster) => void;
  onCancel: () => void;
  language: 'en' | 'ar';
}

function NewClusterForm({ onSave, onCancel, language }: NewClusterFormProps) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [jurisCode, setJurisCode] = useState('');
  const [jurisName, setJurisName] = useState('');
  const [dimension, setDimension] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isRTL = language === 'ar';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError(isRTL ? 'الاسم مطلوب' : 'Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const body: Partial<ResearchCluster> = {
        name: name.trim(),
        paths: path.trim() ? [path.trim()] : [],
        dimension: dimension || undefined,
        jurisdiction: jurisCode.trim() ? {
          type: 'country',
          code: jurisCode.trim().toUpperCase(),
          name: jurisName.trim() || jurisCode.trim().toUpperCase(),
        } : undefined,
      };
      const cluster = await apiFetch<ResearchCluster>('/api/research/clusters', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onSave(cluster);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-3 bg-surface-secondary rounded-[var(--radius-lg)] border border-border">
      <p className="text-sm font-semibold text-on-surface">
        {isRTL ? 'مجموعة جديدة' : 'New Cluster'}
      </p>
      {error && <p className="text-xs text-error">{error}</p>}

      <div className="space-y-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={isRTL ? 'الاسم *' : 'Name *'}
          className="w-full text-sm bg-input border border-border rounded-[var(--radius)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          value={path}
          onChange={e => setPath(e.target.value)}
          placeholder={isRTL ? 'المسار (اختياري)' : 'Path (optional)'}
          className="w-full text-sm bg-input border border-border rounded-[var(--radius)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring font-mono text-xs"
          dir="ltr"
        />
        <div className="flex gap-2">
          <input
            value={jurisCode}
            onChange={e => setJurisCode(e.target.value)}
            placeholder="QAT"
            maxLength={3}
            className="w-20 text-sm bg-input border border-border rounded-[var(--radius)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring uppercase"
          />
          <input
            value={jurisName}
            onChange={e => setJurisName(e.target.value)}
            placeholder={isRTL ? 'اسم الولاية القضائية' : 'Jurisdiction name'}
            className="flex-1 text-sm bg-input border border-border rounded-[var(--radius)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={dimension}
          onChange={e => setDimension(e.target.value)}
          className="w-full text-sm bg-input border border-border rounded-[var(--radius)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">{isRTL ? '— الأبعاد —' : '— Dimension —'}</option>
          {DIMENSIONS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 rounded-[var(--radius)] text-sm text-on-surface-secondary hover:bg-surface-tertiary transition-colors">
          {isRTL ? 'إلغاء' : 'Cancel'}
        </button>
        <button type="submit" disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50">
          {saving && <Loader2 size={13} className="animate-spin" />}
          {isRTL ? 'حفظ' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// ─── Provenance Panel ─────────────────────────────────────────────────────────

interface ProvenancePanelProps {
  clusterId: string;
  file: BrowseEntry;
  existing?: FileProvenance;
  onClose: () => void;
  onSaved: (prov: FileProvenance) => void;
  language: 'en' | 'ar';
}

function ProvenancePanel({ clusterId, file, existing, onClose, onSaved, language }: ProvenancePanelProps) {
  const isRTL = language === 'ar';
  const [sourceType, setSourceType] = useState(existing?.sourceType ?? '');
  const [sourceUrl, setSourceUrl] = useState(existing?.sourceUrl ?? '');
  const [sourcePerson, setSourcePerson] = useState(existing?.sourcePerson ?? '');
  const [sourceMeetingId, setSourceMeetingId] = useState(existing?.sourceMeetingId ?? '');
  const [sourceDate, setSourceDate] = useState(existing?.sourceDate ?? '');
  const [tagsInput, setTagsInput] = useState((existing?.tags ?? []).join(', '));
  const [fileCategory, setFileCategory] = useState(existing?.fileCategory ?? '');
  const [jurisdictionCode, setJurisdictionCode] = useState(existing?.jurisdictionCode ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [meetings, setMeetings] = useState<MeetingSession[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const tagDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    apiFetch<{ sessions: MeetingSession[] }>('/api/meetings/sessions')
      .then(r => setMeetings(r.sessions ?? []))
      .catch(() => {});
  }, []);

  const handleTagInput = (val: string) => {
    setTagsInput(val);
    if (tagDebounce.current) clearTimeout(tagDebounce.current);
    const lastTag = val.split(',').pop()?.trim().replace(/^#/, '') ?? '';
    if (lastTag.length >= 1) {
      tagDebounce.current = setTimeout(() => {
        apiFetch<{ tags: TagSuggestion[] }>(`/api/tags/search?q=${encodeURIComponent(lastTag)}`)
          .then(r => setTagSuggestions((r.tags ?? []).map(t => t.tag)))
          .catch(() => {});
      }, 300);
    } else {
      setTagSuggestions([]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const tags = tagsInput.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);
      const body: FileProvenance & { path: string } = {
        path: file.path,
        name: file.name,
        sourceType: sourceType || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
        sourcePerson: sourcePerson.trim() || undefined,
        sourceMeetingId: sourceMeetingId || undefined,
        sourceDate: sourceDate || undefined,
        tags: tags.length ? tags : undefined,
        fileCategory: fileCategory || undefined,
        jurisdictionCode: jurisdictionCode.trim().toUpperCase() || undefined,
        notes: notes.trim() || undefined,
      };
      const result = await apiFetch<FileProvenance>(`/api/research/clusters/${clusterId}/files/provenance`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      onSaved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-[var(--radius-xl)] border border-border shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <span className="text-lg">{getFileIcon(file.ext)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-on-surface truncate">{file.name}</p>
            <p className="text-xs text-on-surface-tertiary">{isRTL ? 'تتبع المصدر' : 'File Provenance'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-secondary text-on-surface-tertiary">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {error && <p className="text-xs text-error bg-error/10 rounded px-3 py-2">{error}</p>}

          {/* Source type */}
          <div className="space-y-1">
            <label className="text-xs text-on-surface-secondary font-medium">
              {isRTL ? 'نوع المصدر' : 'Source type'}
            </label>
            <select value={sourceType} onChange={e => setSourceType(e.target.value)}
              className="w-full text-sm bg-input border border-border rounded-[var(--radius)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">—</option>
              {SOURCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Conditional fields */}
          {sourceType === 'url' && (
            <div className="space-y-1">
              <label className="text-xs text-on-surface-secondary font-medium">
                {isRTL ? 'الرابط' : 'Source URL'}
              </label>
              <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} dir="ltr"
                className="w-full text-sm bg-input border border-border rounded-[var(--radius)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring font-mono text-xs"
                placeholder="https://" />
            </div>
          )}

          {(sourceType === 'person' || sourceType === 'email') && (
            <div className="space-y-1">
              <label className="text-xs text-on-surface-secondary font-medium">
                {isRTL ? 'اسم الشخص' : 'Person name'}
              </label>
              <input value={sourcePerson} onChange={e => setSourcePerson(e.target.value)}
                className="w-full text-sm bg-input border border-border rounded-[var(--radius)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          )}

          {sourceType === 'meeting' && (
            <div className="space-y-1">
              <label className="text-xs text-on-surface-secondary font-medium">
                {isRTL ? 'الاجتماع' : 'Meeting'}
              </label>
              <select value={sourceMeetingId} onChange={e => setSourceMeetingId(e.target.value)}
                className="w-full text-sm bg-input border border-border rounded-[var(--radius)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">—</option>
                {meetings.map(m => (
                  <option key={m.id} value={m.id}>{m.title}{m.date ? ` (${m.date})` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Date obtained */}
          <div className="space-y-1">
            <label className="text-xs text-on-surface-secondary font-medium">
              {isRTL ? 'تاريخ الحصول' : 'Date obtained'}
            </label>
            <input type="date" value={sourceDate} onChange={e => setSourceDate(e.target.value)} dir="ltr"
              className="w-full text-sm bg-input border border-border rounded-[var(--radius)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          {/* Tags */}
          <div className="space-y-1 relative">
            <label className="text-xs text-on-surface-secondary font-medium">
              {isRTL ? 'الوسوم' : 'Tags'} <span className="opacity-50">(# autocomplete)</span>
            </label>
            <input value={tagsInput} onChange={e => handleTagInput(e.target.value)}
              placeholder="#BIM/Standards, #GCC/Qatar"
              className="w-full text-sm bg-input border border-border rounded-[var(--radius)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring" />
            {tagSuggestions.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-[var(--radius-lg)] shadow-lg overflow-hidden">
                {tagSuggestions.map(tag => (
                  <button key={tag} type="button" onMouseDown={(e) => { e.preventDefault(); setTagsInput(v => { const parts = v.split(','); parts[parts.length - 1] = ` #${tag}`; return parts.join(','); }); setTagSuggestions([]); }}
                    className="w-full text-start px-3 py-1.5 text-sm hover:bg-surface-secondary">
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* File category */}
          <div className="space-y-1">
            <label className="text-xs text-on-surface-secondary font-medium">
              {isRTL ? 'تصنيف الملف' : 'File category'}
            </label>
            <select value={fileCategory} onChange={e => setFileCategory(e.target.value)}
              className="w-full text-sm bg-input border border-border rounded-[var(--radius)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">—</option>
              {FILE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Jurisdiction */}
          <div className="space-y-1">
            <label className="text-xs text-on-surface-secondary font-medium">
              {isRTL ? 'الولاية القضائية' : 'Jurisdiction'} <span className="opacity-50">(e.g. QAT)</span>
            </label>
            <input value={jurisdictionCode} onChange={e => setJurisdictionCode(e.target.value)} maxLength={3}
              className="w-24 text-sm bg-input border border-border rounded-[var(--radius)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring uppercase" />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs text-on-surface-secondary font-medium">
              {isRTL ? 'ملاحظات' : 'Notes'}
            </label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} dir="auto"
              className="w-full text-sm bg-input border border-border rounded-[var(--radius)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
          <button onClick={onClose}
            className="px-3 py-1.5 rounded-[var(--radius)] text-sm text-on-surface-secondary hover:bg-surface-secondary transition-colors">
            {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50">
            {saving && <Loader2 size={13} className="animate-spin" />}
            <Save size={13} />
            {isRTL ? 'حفظ' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Files Tab ────────────────────────────────────────────────────────────────

interface FilesTabProps {
  cluster: ResearchCluster;
  language: 'en' | 'ar';
  onProvenanceUpdate: (path: string, prov: FileProvenance) => void;
}

function FilesTab({ cluster, language, onProvenanceUpdate }: FilesTabProps) {
  const isRTL = language === 'ar';
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [currentPath, setCurrentPath] = useState<string>(cluster.paths[0] ?? '');
  const [pathStack, setPathStack] = useState<string[]>([]);
  const [provenanceTarget, setProvenanceTarget] = useState<BrowseEntry | null>(null);

  const browseDir = useCallback(async (path: string) => {
    if (!path) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ entries: BrowseEntry[] }>(`/api/research/browse?path=${encodeURIComponent(path)}`);
      setEntries(res.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to browse');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const p = cluster.paths[0] ?? '';
    setCurrentPath(p);
    setPathStack([]);
    if (p) browseDir(p);
    else setEntries([]);
  }, [cluster.id, cluster.paths, browseDir]);

  const navigateInto = (entry: BrowseEntry) => {
    if (entry.type === 'folder') {
      setPathStack(s => [...s, currentPath]);
      setCurrentPath(entry.path);
      browseDir(entry.path);
    }
  };

  const navigateBack = () => {
    const prev = pathStack[pathStack.length - 1];
    if (!prev) return;
    setPathStack(s => s.slice(0, -1));
    setCurrentPath(prev);
    browseDir(prev);
  };

  const openFile = (entry: BrowseEntry) => {
    const apiBase = getApiBase();
    const url = `${apiBase}/api/research/file?path=${encodeURIComponent(entry.path)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const sorted = [...entries].sort((a, b) => {
    if (sortKey === 'name') return a.name.localeCompare(b.name);
    if (sortKey === 'size') return b.size - a.size;
    if (sortKey === 'type') return a.ext.localeCompare(b.ext);
    if (sortKey === 'date') return b.modifiedAt.localeCompare(a.modifiedAt);
    return 0;
  });

  if (!cluster.paths.length) {
    return (
      <div className="flex items-center justify-center h-40 text-on-surface-tertiary text-sm">
        {isRTL ? 'لا يوجد مسار مرتبط بهذه المجموعة' : 'No path configured for this cluster'}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {pathStack.length > 0 && (
          <button onClick={navigateBack}
            className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius)] text-xs bg-surface-secondary hover:bg-surface-tertiary transition-colors text-on-surface-secondary">
            <ArrowLeft size={13} />
            {isRTL ? 'رجوع' : 'Back'}
          </button>
        )}
        <p className="text-xs text-on-surface-tertiary font-mono truncate flex-1" dir="ltr">{currentPath}</p>
        <div className="flex items-center gap-1">
          <SortAsc size={13} className="text-on-surface-tertiary" />
          {(['name', 'size', 'type', 'date'] as SortKey[]).map(k => (
            <button key={k} onClick={() => setSortKey(k)}
              className={cn('px-2 py-0.5 rounded text-xs transition-colors',
                sortKey === k ? 'bg-accent/15 text-accent' : 'text-on-surface-secondary hover:bg-surface-secondary')}>
              {k}
            </button>
          ))}
        </div>
      </div>

      {/* File list */}
      {loading && <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-on-surface-tertiary" /></div>}
      {error && <p className="text-xs text-error bg-error/10 rounded px-3 py-2">{error}</p>}

      {!loading && !error && (
        <div className="space-y-1">
          {sorted.length === 0 && (
            <p className="text-sm text-on-surface-tertiary text-center py-8">
              {isRTL ? 'المجلد فارغ' : 'Empty folder'}
            </p>
          )}
          {sorted.map(entry => {
            const hasProv = !!cluster.fileMetadata?.[entry.path];
            const isViewable = ['pdf', 'image', 'video', 'text'].includes(entry.viewMode);
            return (
              <div key={entry.path}
                className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius)] hover:bg-surface-secondary group transition-colors">
                {/* Icon */}
                <span className="text-lg shrink-0 cursor-pointer" onClick={() => entry.type === 'folder' && navigateInto(entry)}>
                  {entry.type === 'folder' ? <Folder size={18} className="text-accent" /> : getFileIcon(entry.ext)}
                </span>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => entry.type === 'folder' ? navigateInto(entry) : undefined}
                    className={cn('text-sm truncate text-start w-full',
                      entry.type === 'folder' ? 'text-accent hover:underline cursor-pointer' : 'text-on-surface cursor-default')}
                  >
                    {entry.name}
                  </button>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-on-surface-tertiary">{formatSize(entry.size)}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-tertiary text-on-surface-secondary">
                      {entry.viewMode}
                    </span>
                    {hasProv && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success">
                        {isRTL ? 'موثّق' : 'tracked'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {entry.type === 'file' && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {isViewable && (
                      <button onClick={() => openFile(entry)} title={isRTL ? 'عرض' : 'View'}
                        className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-secondary transition-colors text-sm">
                        👁
                      </button>
                    )}
                    {!isViewable && (
                      <button
                        onClick={() => alert(`${isRTL ? 'افتح في التطبيق:' : 'Open in app:'}\n${entry.path}`)}
                        title={isRTL ? 'افتح في التطبيق' : 'Open in app'}
                        className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-secondary transition-colors text-sm">
                        📂
                      </button>
                    )}
                    <button onClick={() => setProvenanceTarget(entry)} title={isRTL ? 'تتبع المصدر' : 'Provenance'}
                      className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-secondary transition-colors text-sm">
                      📋
                    </button>
                  </div>
                )}

                {entry.type === 'folder' && (
                  <ChevronRight size={14} className="text-on-surface-tertiary shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Provenance modal */}
      {provenanceTarget && (
        <ProvenancePanel
          clusterId={cluster.id}
          file={provenanceTarget}
          existing={cluster.fileMetadata?.[provenanceTarget.path]}
          onClose={() => setProvenanceTarget(null)}
          onSaved={(prov) => {
            onProvenanceUpdate(provenanceTarget.path, prov);
            setProvenanceTarget(null);
          }}
          language={language}
        />
      )}
    </div>
  );
}

// ─── Notes Tab ────────────────────────────────────────────────────────────────

interface NotesTabProps {
  cluster: ResearchCluster;
  language: 'en' | 'ar';
  onUpdate: (notes: string) => void;
}

function NotesTab({ cluster, language, onUpdate }: NotesTabProps) {
  const isRTL = language === 'ar';
  const [notes, setNotes] = useState(cluster.notes ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNotes(cluster.notes ?? '');
  }, [cluster.id, cluster.notes]);

  const handleBlur = async () => {
    if (notes === (cluster.notes ?? '')) return;
    setSaving(true);
    try {
      await apiFetch<ResearchCluster>(`/api/research/clusters/${cluster.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes }),
      });
      onUpdate(notes);
    } catch { /* silent */ }
    setSaving(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-on-surface-tertiary">
          {isRTL ? 'ملاحظات المجموعة — تحفظ تلقائيًا عند المغادرة' : 'Cluster notes — auto-saves on blur'}
        </p>
        {saving && <Loader2 size={13} className="animate-spin text-on-surface-tertiary" />}
      </div>
      <WikilinkEditor
        value={notes}
        onChange={setNotes}
        onBlur={handleBlur}
        placeholder={isRTL ? 'أضف ملاحظاتك هنا…' : 'Add notes here…'}
        rows={16}
        dir="auto"
      />
    </div>
  );
}

// ─── Provenance List Tab ──────────────────────────────────────────────────────

interface ProvenanceListTabProps {
  cluster: ResearchCluster;
  language: 'en' | 'ar';
}

function ProvenanceListTab({ cluster, language }: ProvenanceListTabProps) {
  const isRTL = language === 'ar';
  const entries = Object.entries(cluster.fileMetadata ?? {});

  if (!entries.length) {
    return (
      <div className="flex items-center justify-center h-40 text-on-surface-tertiary text-sm">
        {isRTL ? 'لا يوجد تتبع مصدر بعد. انتقل إلى تبويب الملفات واضغط 📋' : 'No provenance yet. Go to Files tab and click 📋'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map(([filePath, prov]) => (
        <div key={filePath} className="p-3 rounded-[var(--radius-lg)] border border-border bg-surface-secondary space-y-1.5">
          <div className="flex items-start gap-2">
            <span className="text-base shrink-0">{getFileIcon(filePath.split('.').pop() ?? '')}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-on-surface truncate">{prov.name}</p>
              <p className="text-[10px] font-mono text-on-surface-tertiary truncate" dir="ltr">{filePath}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {prov.sourceType && (
              <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent">{prov.sourceType}</span>
            )}
            {prov.fileCategory && (
              <span className="px-2 py-0.5 rounded-full bg-surface-tertiary text-on-surface-secondary">{prov.fileCategory}</span>
            )}
            {prov.jurisdictionCode && (
              <span className="px-2 py-0.5 rounded-full bg-info/15 text-info">
                {FLAG[prov.jurisdictionCode] ?? ''} {prov.jurisdictionCode}
              </span>
            )}
            {prov.sourceDate && (
              <span className="text-on-surface-tertiary">{prov.sourceDate}</span>
            )}
          </div>
          {prov.tags && prov.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {prov.tags.map(t => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-tertiary text-on-surface-secondary">
                  #{t}
                </span>
              ))}
            </div>
          )}
          {prov.notes && (
            <p className="text-xs text-on-surface-secondary">{prov.notes}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Report Tab ───────────────────────────────────────────────────────────────

interface ReportTabProps {
  cluster: ResearchCluster;
  language: 'en' | 'ar';
  onUpdate: (report: string) => void;
}

function ReportTab({ cluster, language, onUpdate }: ReportTabProps) {
  const isRTL = language === 'ar';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cluster.report ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(cluster.report ?? '');
    setEditing(false);
  }, [cluster.id, cluster.report]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/research/clusters/${cluster.id}/report`, {
        method: 'POST',
        body: JSON.stringify({ report: draft }),
      });
      onUpdate(draft);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-on-surface">
            {isRTL ? 'تقرير المجموعة' : 'Cluster Report'}
          </p>
          {cluster.reportUpdatedAt && (
            <p className="text-xs text-on-surface-tertiary">
              {isRTL ? 'آخر تحديث:' : 'Updated:'} {new Date(cluster.reportUpdatedAt).toLocaleDateString()}
            </p>
          )}
        </div>
        <button
          onClick={() => editing ? handleSave() : setEditing(true)}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius)] text-sm bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : editing ? <Save size={13} /> : <Edit2 size={13} />}
          {editing ? (isRTL ? 'حفظ' : 'Save') : (isRTL ? 'تعديل' : 'Edit')}
        </button>
      </div>

      {error && <p className="text-xs text-error bg-error/10 rounded px-3 py-2">{error}</p>}

      {editing ? (
        <div className="space-y-2">
          <WikilinkEditor
            value={draft}
            onChange={setDraft}
            placeholder={isRTL ? 'اكتب التقرير بتنسيق Markdown…' : 'Write report in Markdown…'}
            rows={20}
            dir="auto"
          />
          <button onClick={() => setEditing(false)}
            className="px-3 py-1.5 rounded-[var(--radius)] text-sm text-on-surface-secondary hover:bg-surface-secondary transition-colors">
            {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
        </div>
      ) : (
        <div className="prose prose-sm max-w-none bg-surface-secondary rounded-[var(--radius-lg)] p-4 min-h-[200px]">
          {draft ? (
            <pre className="whitespace-pre-wrap text-sm text-on-surface font-sans leading-relaxed">
              <WikilinkRenderer text={draft} />
            </pre>
          ) : (
            <p className="text-on-surface-tertiary text-sm">
              {isRTL ? 'لا يوجد تقرير بعد. اضغط تعديل للبدء.' : 'No report yet. Click Edit to start.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ResearchHub ─────────────────────────────────────────────────────────

export function ResearchHub() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [clusters, setClusters] = useState<ResearchCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('files');

  const fetchClusters = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ clusters: ResearchCluster[] }>('/api/research/clusters');
      setClusters(res.clusters ?? []);
      if (res.clusters?.length && !selectedId) {
        setSelectedId(res.clusters[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clusters');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    fetchClusters();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCluster = clusters.find(c => c.id === selectedId) ?? null;

  const handleClusterCreated = (cluster: ResearchCluster) => {
    setClusters(prev => [cluster, ...prev]);
    setSelectedId(cluster.id);
    setShowNewForm(false);
  };

  const updateClusterNotes = (notes: string) => {
    setClusters(prev => prev.map(c => c.id === selectedId ? { ...c, notes } : c));
  };

  const updateClusterReport = (report: string) => {
    setClusters(prev => prev.map(c => c.id === selectedId ? { ...c, report, reportUpdatedAt: new Date().toISOString() } : c));
  };

  const updateClusterProvenance = (filePath: string, prov: FileProvenance) => {
    setClusters(prev => prev.map(c => {
      if (c.id !== selectedId) return c;
      return { ...c, fileMetadata: { ...c.fileMetadata, [filePath]: prov } };
    }));
  };

  const TABS: { id: TabId; label: { en: string; ar: string } }[] = [
    { id: 'files',      label: { en: 'Files',      ar: 'الملفات' } },
    { id: 'notes',      label: { en: 'Notes',      ar: 'الملاحظات' } },
    { id: 'provenance', label: { en: 'Provenance', ar: 'التوثيق' } },
    { id: 'report',     label: { en: 'Report',     ar: 'التقرير' } },
  ];

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', isRTL && 'dir-rtl')}>
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <FlaskConical size={20} className="text-accent" />
          <h1 className="text-lg font-semibold text-on-surface">
            {isRTL ? 'مركز البحث' : 'Research Hub'}
          </h1>
        </div>
        <button
          onClick={() => setShowNewForm(v => !v)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors"
        >
          {showNewForm ? <X size={15} /> : <Plus size={15} />}
          {isRTL ? 'مجموعة جديدة' : 'New Cluster'}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* ── Cluster list sidebar ── */}
        <aside className="w-72 shrink-0 border-e border-border flex flex-col overflow-hidden bg-sidebar">
          {showNewForm && (
            <div className="p-3 border-b border-border">
              <NewClusterForm
                onSave={handleClusterCreated}
                onCancel={() => setShowNewForm(false)}
                language={language}
              />
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex justify-center py-12">
                <Loader2 size={20} className="animate-spin text-on-surface-tertiary" />
              </div>
            )}
            {error && (
              <p className="text-xs text-error m-3 bg-error/10 rounded px-3 py-2">{error}</p>
            )}
            {!loading && clusters.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
                <FlaskConical size={32} className="text-on-surface-tertiary" />
                <p className="text-sm text-on-surface-tertiary">
                  {isRTL ? 'لا توجد مجموعات بحثية بعد' : 'No research clusters yet'}
                </p>
              </div>
            )}
            <div className="p-2 space-y-1">
              {clusters.map(cluster => {
                const flag = cluster.jurisdiction?.code ? (FLAG[cluster.jurisdiction.code] ?? '') : '';
                const fileCount = Object.keys(cluster.fileMetadata ?? {}).length;
                const isActive = cluster.id === selectedId;
                return (
                  <button
                    key={cluster.id}
                    onClick={() => { setSelectedId(cluster.id); setActiveTab('files'); }}
                    className={cn(
                      'w-full text-start px-3 py-2.5 rounded-[var(--radius-lg)] transition-colors space-y-1',
                      isActive ? 'bg-sidebar-active text-on-surface' : 'hover:bg-sidebar-hover text-on-sidebar'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {flag && <span className="text-base shrink-0">{flag}</span>}
                      <span className="text-sm font-medium truncate flex-1">{cluster.name}</span>
                      {fileCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-tertiary text-on-surface-secondary shrink-0">
                          {fileCount}
                        </span>
                      )}
                    </div>
                    {cluster.dimension && (
                      <span className={cn('inline-block text-[10px] px-2 py-0.5 rounded-full font-medium',
                        DIMENSION_COLORS[cluster.dimension] ?? 'bg-surface-tertiary text-on-surface-secondary')}>
                        {cluster.dimension}
                      </span>
                    )}
                    {cluster.jurisdiction?.name && !flag && (
                      <p className="text-[10px] text-on-surface-tertiary truncate">{cluster.jurisdiction.name}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* ── Cluster detail ── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {!selectedCluster ? (
            <div className="flex items-center justify-center h-full text-on-surface-tertiary">
              <div className="text-center space-y-2">
                <File size={40} className="mx-auto opacity-30" />
                <p className="text-sm">{isRTL ? 'اختر مجموعة للعرض' : 'Select a cluster to view'}</p>
              </div>
            </div>
          ) : (
            <>
              {/* Cluster header */}
              <div className="px-6 py-4 border-b border-border shrink-0">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {selectedCluster.jurisdiction?.code && (
                        <span className="text-xl">{FLAG[selectedCluster.jurisdiction.code] ?? ''}</span>
                      )}
                      <h2 className="text-base font-semibold text-on-surface">{selectedCluster.name}</h2>
                      {selectedCluster.dimension && (
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                          DIMENSION_COLORS[selectedCluster.dimension] ?? 'bg-surface-tertiary text-on-surface-secondary')}>
                          {selectedCluster.dimension}
                        </span>
                      )}
                    </div>
                    {selectedCluster.description && (
                      <p className="text-xs text-on-surface-secondary mt-1">{selectedCluster.description}</p>
                    )}
                    {selectedCluster.paths.length > 0 && (
                      <p className="text-[10px] font-mono text-on-surface-tertiary mt-1 truncate" dir="ltr">
                        {selectedCluster.paths[0]}
                      </p>
                    )}
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 mt-3 border-b border-border -mb-4 pb-0">
                  {TABS.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        'px-3 py-2 text-sm transition-colors border-b-2 -mb-px',
                        activeTab === tab.id
                          ? 'border-accent text-accent font-medium'
                          : 'border-transparent text-on-surface-secondary hover:text-on-surface'
                      )}
                    >
                      {tab.label[language]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'files' && (
                  <FilesTab
                    cluster={selectedCluster}
                    language={language}
                    onProvenanceUpdate={updateClusterProvenance}
                  />
                )}
                {activeTab === 'notes' && (
                  <NotesTab
                    cluster={selectedCluster}
                    language={language}
                    onUpdate={updateClusterNotes}
                  />
                )}
                {activeTab === 'provenance' && (
                  <ProvenanceListTab
                    cluster={selectedCluster}
                    language={language}
                  />
                )}
                {activeTab === 'report' && (
                  <ReportTab
                    cluster={selectedCluster}
                    language={language}
                    onUpdate={updateClusterReport}
                  />
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
