'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookMarked, Search, Download, CheckCircle, Loader2,
  RefreshCw, FolderOpen, AlertTriangle, ExternalLink, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface ZoteroItem {
  itemKey: string;
  title: string;
  authors: string;
  year?: number;
  itemType: string;
  doi?: string;
  url?: string;
  tags?: string[];
  imported: boolean;
  abstract?: string;
  numPages?: number;
}

interface ZoteroCollection {
  key: string;
  name: string;
  parentCollection?: string;
}

interface ZoteroStatus {
  ok: boolean;
  mode: 'local' | 'web';
  configured: boolean;
}

export function ZoteroPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const router = useRouter();

  const [status, setStatus] = useState<ZoteroStatus | null>(null);
  const [collections, setCollections] = useState<ZoteroCollection[]>([]);
  const [items, setItems] = useState<ZoteroItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [bulkImporting, setBulkImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCollection, setSelectedCollection] = useState('');
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    const s = await apiFetch<ZoteroStatus>('/api/zotero/status').catch(() => null);
    setStatus(s);
    return s;
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cols, its] = await Promise.all([
        apiFetch<ZoteroCollection[]>('/api/zotero/collections').catch(() => []),
        apiFetch<ZoteroItem[]>(`/api/zotero/items?limit=200${selectedCollection ? `&collection=${selectedCollection}` : ''}`).catch(() => []),
      ]);
      setCollections(cols || []);
      setItems(its || []);
      setImported(new Set((its || []).filter(i => i.imported).map(i => i.itemKey)));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedCollection]);

  useEffect(() => { loadStatus().then(s => { if (s?.ok) loadData(); else setLoading(false); }); }, [loadStatus, loadData]);

  const importItem = async (key: string) => {
    setImporting(s => new Set(s).add(key));
    try {
      const r = await apiFetch<{ ok: boolean; paperId?: string; notesImported?: number }>(
        `/api/zotero/import/${key}`, { method: 'POST' }
      );
      if (r.ok) {
        setImported(s => new Set(s).add(key));
        setItems(is => is.map(i => i.itemKey === key ? { ...i, imported: true } : i));
      }
    } finally {
      setImporting(s => { const n = new Set(s); n.delete(key); return n; });
    }
  };

  const bulkImport = async () => {
    setBulkImporting(true);
    try {
      await apiFetch('/api/zotero/import/bulk', {
        method: 'POST',
        body: JSON.stringify({ collectionKey: selectedCollection || undefined, limit: 30 }),
      });
      await loadData();
    } finally { setBulkImporting(false); }
  };

  const filtered = items.filter(it => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (it.title || '').toLowerCase().includes(q) || (it.authors || '').toLowerCase().includes(q);
  });

  const unimported = filtered.filter(i => !imported.has(i.itemKey));
  const importedItems = filtered.filter(i => imported.has(i.itemKey));

  // ── Not configured ──────────────────────────────────────────────────
  if (!loading && status && !status.ok) return (
    <div className={cn('max-w-2xl mx-auto px-6 py-12 text-center space-y-4', isRTL && 'rtl')}>
      <AlertTriangle size={40} className="mx-auto text-amber-500" />
      <h2 className="text-lg font-semibold">{isRTL ? 'Zotero غير متصل' : 'Zotero not connected'}</h2>
      <p className="text-sm text-on-surface-secondary">
        {isRTL
          ? 'شغّل Zotero Desktop على جهازك، أو أضف Web API Key في الإعدادات.'
          : 'Start Zotero Desktop on your machine, or add a Web API Key in settings.'}
      </p>
      <div className="flex gap-3 justify-center">
        <button onClick={() => loadStatus().then(s => { if (s?.ok) loadData(); })}
          className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] border border-border text-sm hover:bg-muted">
          <RefreshCw size={14} />{isRTL ? 'إعادة المحاولة' : 'Retry'}
        </button>
        <button onClick={() => router.push('/settings')}
          className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] bg-primary text-on-primary text-sm">
          {isRTL ? 'الإعدادات' : 'Settings'}
        </button>
      </div>
    </div>
  );

  return (
    <div className={cn('max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-4', isRTL && 'rtl')} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center">
          <BookMarked size={18} className="text-red-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">{isRTL ? 'مكتبة Zotero' : 'Zotero Library'}</h1>
          {status && <p className="text-xs text-on-surface-tertiary">{status.mode === 'local' ? '🟢 Zotero Desktop' : '🌐 Zotero Web API'}</p>}
        </div>
        <div className="ms-auto flex items-center gap-2">
          <button onClick={loadData} className="p-2 rounded-lg hover:bg-muted" title={isRTL ? 'تحديث' : 'Refresh'}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          {unimported.length > 0 && (
            <button onClick={bulkImport} disabled={bulkImporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm disabled:opacity-50">
              {bulkImporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {isRTL ? `استيراد الكل (${unimported.length})` : `Import all (${unimported.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && <div className="flex items-center gap-2 bg-red-500/10 text-red-600 px-3 py-2 rounded-lg text-sm"><AlertTriangle size={14}/>{error}</div>}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-on-surface-tertiary" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={isRTL ? 'ابحث عن ورقة...' : 'Search papers...'}
            className="w-full h-9 rounded-[var(--radius)] bg-input border border-border ps-9 pe-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        {collections.length > 0 && (
          <select value={selectedCollection} onChange={e => { setSelectedCollection(e.target.value); loadData(); }}
            className="h-9 rounded-[var(--radius)] bg-input border border-border px-3 text-sm focus:outline-none">
            <option value="">{isRTL ? 'كل المجموعات' : 'All collections'}</option>
            {collections.map(col => <option key={col.key} value={col.key}>{col.name}</option>)}
          </select>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-on-surface-tertiary py-8 justify-center">
          <Loader2 size={16} className="animate-spin" />
          {isRTL ? 'جاري تحميل المكتبة...' : 'Loading library...'}
        </div>
      )}

      {/* Items */}
      {!loading && (
        <div className="space-y-4">
          {/* Unimported */}
          {unimported.length > 0 && (
            <div>
              <p className="text-xs text-on-surface-tertiary mb-2 font-medium uppercase tracking-wide">
                {isRTL ? `غير مستوردة (${unimported.length})` : `Not imported (${unimported.length})`}
              </p>
              <div className="space-y-1">
                {unimported.map(item => (
                  <div key={item.itemKey}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius)] border border-border bg-surface hover:bg-surface-secondary group">
                    <FileText size={14} className="text-on-surface-tertiary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-xs text-on-surface-tertiary truncate">
                        {item.authors}{item.year ? ` · ${item.year}` : ''}
                      </p>
                    </div>
                    {item.doi && (
                      <a href={`https://doi.org/${item.doi}`} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded hover:bg-muted opacity-0 group-hover:opacity-100">
                        <ExternalLink size={12} />
                      </a>
                    )}
                    <button onClick={() => importItem(item.itemKey)}
                      disabled={importing.has(item.itemKey)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 text-xs hover:bg-red-500/20 disabled:opacity-50 shrink-0">
                      {importing.has(item.itemKey) ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                      {isRTL ? 'استيراد' : 'Import'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Already imported */}
          {importedItems.length > 0 && (
            <div>
              <p className="text-xs text-on-surface-tertiary mb-2 font-medium uppercase tracking-wide">
                {isRTL ? `مستوردة بالفعل (${importedItems.length})` : `Already imported (${importedItems.length})`}
              </p>
              <div className="space-y-1">
                {importedItems.map(item => (
                  <a key={item.itemKey} href="/papers"
                    className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius)] hover:bg-muted">
                    <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                    <span className="flex-1 text-sm truncate text-on-surface-secondary">{item.title}</span>
                    <span className="text-xs text-on-surface-tertiary shrink-0">{item.authors?.split(',')[0]}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-12 text-on-surface-tertiary">
              <FolderOpen size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">{isRTL ? 'لا توجد أوراق' : 'No papers found'}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
