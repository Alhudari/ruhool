'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Download, Eye, EyeOff, Filter, RotateCcw, Upload, Search, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch, API_BASE_URL } from '@/lib/api';

type EntityType = 'paper' | 'book' | 'report' | 'standard' | 'my-writing' | 'thesis-chapter'
  | 'person' | 'organization' | 'conference' | 'project'
  | 'atomic-note' | 'reading-session' | 'research-cluster'
  | 'file' | 'webpage' | 'video' | 'code-repo';

type ColumnKind = 'string' | 'text' | 'number' | 'tags' | 'list' | 'date' | 'url' | 'select' | 'boolean';

interface MatrixColumn {
  key: string;
  labelEn: string;
  labelAr: string;
  kind: ColumnKind;
  options?: string[];
  visible: boolean;
  width?: number;
  order: number;
  source?: 'top-level' | 'custom';
}

interface MatrixSchema {
  type: EntityType;
  columns: MatrixColumn[];
  updatedAt: string;
}

interface LibraryEntity {
  id: string;
  type: EntityType;
  title: string;
  authors?: string;
  year?: number;
  url?: string;
  doi?: string;
  citekey?: string;
  tags: string[];
  readingStatus?: string;
  readingDepth?: string;
  customFields?: Record<string, unknown>;
  createdAt: string;
}

const TYPE_LABELS: Record<string, { en: string; ar: string }> = {
  paper: { en: 'Academic Papers', ar: 'الأوراق الأكاديمية' },
  book: { en: 'Books', ar: 'الكتب' },
  report: { en: 'Reports', ar: 'التقارير' },
  standard: { en: 'Standards', ar: 'المعايير' },
  'my-writing': { en: 'My Writing', ar: 'كتاباتي' },
  'thesis-chapter': { en: 'Thesis Chapters', ar: 'فصول الرسالة' },
  webpage: { en: 'Web Pages', ar: 'صفحات ويب' },
  file: { en: 'Files', ar: 'ملفات' },
};

const PHD_VAULT_LITREV = 'C:\\Users\\alhud\\OneDrive - University of Birmingham\\Obsidian\\PhD\\99 Archive\\2026-04-22 — PhD Reset\\01 PhD\\02 Literature Review\\Academic Literature';

function renderCellValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(String).join(', ');
  return String(v);
}

export function LibraryMatrixView({ initialType = 'paper' as EntityType }: { initialType?: EntityType }) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [type, setType] = useState<EntityType>(initialType);
  const [schema, setSchema] = useState<MatrixSchema | null>(null);
  const [entities, setEntities] = useState<LibraryEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [schemaRes, dataRes] = await Promise.all([
        apiFetch<MatrixSchema>(`/api/library/matrix/schema/${type}`),
        apiFetch<{ entities: LibraryEntity[]; total: number }>(`/api/library/matrix/${type}?limit=500`),
      ]);
      setSchema(schemaRes);
      setEntities(dataRes.entities);
    } catch (err) {
      setToast(`Load failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => { void load(); }, [load]);

  const visibleColumns = useMemo(
    () => (schema?.columns ?? []).filter(c => c.visible).sort((a, b) => a.order - b.order),
    [schema]
  );

  const filteredEntities = useMemo(() => {
    if (!search.trim()) return entities;
    const q = search.toLowerCase();
    return entities.filter(e =>
      e.title.toLowerCase().includes(q)
      || (e.authors ?? '').toLowerCase().includes(q)
      || e.tags.some(t => t.toLowerCase().includes(q))
    );
  }, [entities, search]);

  const toggleColumn = useCallback(async (key: string) => {
    if (!schema) return;
    const updated: MatrixSchema = {
      ...schema,
      columns: schema.columns.map(c => c.key === key ? { ...c, visible: !c.visible } : c),
    };
    setSchema(updated);
    try {
      await apiFetch(`/api/library/matrix/schema/${type}`, {
        method: 'PATCH',
        body: JSON.stringify({ columns: updated.columns }),
      });
    } catch { setSchema(schema); /* revert */ }
  }, [schema, type]);

  const resetSchema = useCallback(async () => {
    if (!confirm(isRTL ? 'استعادة الأعمدة الافتراضية؟' : 'Reset to default columns?')) return;
    try {
      const fresh = await apiFetch<MatrixSchema>(`/api/library/matrix/schema/${type}/reset`, { method: 'POST' });
      setSchema(fresh);
      setToast(isRTL ? 'تم استعادة الأعمدة' : 'Columns reset');
      setTimeout(() => setToast(null), 2000);
    } catch { /* ignore */ }
  }, [type, isRTL]);

  const exportCsv = useCallback((visibleOnly: boolean) => {
    const url = `${API_BASE_URL || ''}/api/library/matrix/${type}/export.csv?visibleOnly=${visibleOnly}`;
    window.open(url, '_blank');
  }, [type]);

  const importFromVault = useCallback(async () => {
    const folder = prompt(
      isRTL ? 'مسار المجلد في الـ vault:' : 'Vault folder path:',
      PHD_VAULT_LITREV
    );
    if (!folder) return;
    if (!confirm(isRTL ? `استيراد كل ملفات .md من هذا المجلد كـ ${TYPE_LABELS[type]?.ar || type}؟` : `Import all .md files from this folder as ${TYPE_LABELS[type]?.en || type}?`)) return;
    setImporting(true);
    try {
      const res = await apiFetch<{ stats: { total: number; new: number; updated: number; skipped: number } }>(
        '/api/library/matrix/import-vault',
        { method: 'POST', body: JSON.stringify({ folderPath: folder, type, dryRun: false }) }
      );
      setToast(
        isRTL
          ? `تم: ${res.stats.new} جديد، ${res.stats.updated} مُحدَّث، ${res.stats.skipped} متخطى`
          : `Done: ${res.stats.new} new, ${res.stats.updated} updated, ${res.stats.skipped} skipped`
      );
      void load();
      setTimeout(() => setToast(null), 4000);
    } catch (err) {
      setToast(`Import failed: ${(err as Error).message}`);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setImporting(false);
    }
  }, [type, isRTL, load]);

  const cellValue = (e: LibraryEntity, col: MatrixColumn): string => {
    if (col.source === 'top-level') {
      return renderCellValue((e as unknown as Record<string, unknown>)[col.key]);
    }
    return renderCellValue(e.customFields?.[col.key]);
  };

  return (
    <div className="flex flex-col h-full" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-on-surface">
            {isRTL ? 'مصفوفة المراجع' : 'Library Matrix'}
          </h2>
          <select
            value={type}
            onChange={e => setType(e.target.value as EntityType)}
            className="text-xs rounded-lg border border-border bg-surface-secondary px-2 py-1"
          >
            {Object.keys(TYPE_LABELS).map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t][language]}</option>
            ))}
          </select>
          <span className="text-[10px] text-on-surface-tertiary">
            {filteredEntities.length} / {entities.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <div className="relative">
            <Search size={12} className={cn('absolute top-1/2 -translate-y-1/2 text-on-surface-tertiary', isRTL ? 'right-2' : 'left-2')} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={isRTL ? 'بحث…' : 'Search…'}
              className={cn('text-xs rounded-lg border border-border bg-surface-secondary py-1 w-40', isRTL ? 'pr-7 pl-2' : 'pl-7 pr-2')}
            />
          </div>

          <button
            onClick={() => setShowColumnPicker(v => !v)}
            className="text-xs px-2 py-1 rounded-lg border border-border hover:bg-surface-secondary flex items-center gap-1"
            title={isRTL ? 'إظهار/إخفاء الأعمدة' : 'Show/hide columns'}
          >
            <Filter size={12} />
            {isRTL ? 'الأعمدة' : 'Columns'}
            <ChevronDown size={10} />
          </button>

          <button
            onClick={resetSchema}
            className="text-xs px-2 py-1 rounded-lg border border-border hover:bg-surface-secondary flex items-center gap-1"
            title={isRTL ? 'استعادة الأعمدة الافتراضية' : 'Reset columns'}
          >
            <RotateCcw size={12} />
          </button>

          <button
            onClick={importFromVault}
            disabled={importing}
            className="text-xs px-2 py-1 rounded-lg bg-accent text-on-accent hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
          >
            <Upload size={12} />
            {importing ? (isRTL ? 'جاري…' : 'Importing…') : (isRTL ? 'استيراد' : 'Import')}
          </button>

          <div className="relative group">
            <button className="text-xs px-2 py-1 rounded-lg border border-border hover:bg-surface-secondary flex items-center gap-1">
              <Download size={12} />
              {isRTL ? 'تصدير' : 'Export'}
              <ChevronDown size={10} />
            </button>
            <div className={cn(
              'absolute top-full mt-1 hidden group-hover:block bg-surface border border-border rounded-lg shadow-lg z-10 w-48',
              isRTL ? 'left-0' : 'right-0'
            )}>
              <button
                onClick={() => exportCsv(true)}
                className="w-full text-xs text-start px-3 py-2 hover:bg-surface-secondary"
              >
                {isRTL ? 'CSV — الأعمدة الظاهرة' : 'CSV — visible columns'}
              </button>
              <button
                onClick={() => exportCsv(false)}
                className="w-full text-xs text-start px-3 py-2 hover:bg-surface-secondary"
              >
                {isRTL ? 'CSV — كل الأعمدة' : 'CSV — all columns'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Column picker dropdown */}
      {showColumnPicker && schema && (
        <div className="bg-surface-secondary border-b border-border px-4 py-2">
          <div className="flex flex-wrap gap-2">
            {schema.columns.sort((a, b) => a.order - b.order).map(col => (
              <button
                key={col.key}
                onClick={() => toggleColumn(col.key)}
                className={cn(
                  'text-xs px-2 py-1 rounded-full border flex items-center gap-1',
                  col.visible
                    ? 'bg-accent text-on-accent border-accent'
                    : 'border-border text-on-surface-tertiary hover:border-border-hover'
                )}
              >
                {col.visible ? <Eye size={10} /> : <EyeOff size={10} />}
                {col[isRTL ? 'labelAr' : 'labelEn']}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="bg-blue-500/10 border-b border-blue-500/30 px-4 py-2 text-xs text-blue-700 dark:text-blue-300">
          {toast}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading && <p className="text-xs text-on-surface-tertiary text-center py-8">Loading…</p>}
        {!loading && filteredEntities.length === 0 && (
          <p className="text-xs text-on-surface-tertiary text-center py-8">
            {isRTL ? 'لا مراجع — استورد من Obsidian أو أضف يدوياً' : 'No entries — import from Obsidian or add manually'}
          </p>
        )}
        {!loading && filteredEntities.length > 0 && (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-surface border-b border-border z-10">
              <tr>
                {visibleColumns.map(col => (
                  <th
                    key={col.key}
                    style={{ minWidth: col.width ?? 120 }}
                    className="text-start px-2 py-2 text-on-surface-secondary font-semibold border-e border-border whitespace-nowrap"
                  >
                    {col[isRTL ? 'labelAr' : 'labelEn']}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEntities.map((e, i) => (
                <tr
                  key={e.id}
                  className={cn(
                    'border-b border-border hover:bg-surface-secondary transition-colors',
                    i % 2 === 0 ? 'bg-surface' : 'bg-surface/50'
                  )}
                >
                  {visibleColumns.map(col => {
                    const val = cellValue(e, col);
                    return (
                      <td
                        key={col.key}
                        style={{ minWidth: col.width ?? 120, maxWidth: (col.width ?? 120) + 100 }}
                        className="px-2 py-2 align-top text-on-surface border-e border-border"
                      >
                        {col.kind === 'url' && val ? (
                          <a href={val} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline truncate block">
                            {val.slice(0, 40)}
                          </a>
                        ) : col.kind === 'tags' || col.kind === 'list' ? (
                          <div className="flex flex-wrap gap-1">
                            {val.split(',').filter(Boolean).slice(0, 5).map((t, j) => (
                              <span key={j} className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-tertiary text-on-surface-tertiary">
                                {t.trim()}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="line-clamp-3 leading-relaxed">{val}</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
