'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  BookOpen, FolderTree, Loader2, RefreshCw, Download, Check,
  ChevronRight, ChevronDown, AlertTriangle, Plus, Search,
  Table2, LayoutGrid, List, Settings2, X, ExternalLink, Network,
  Sparkles, ArrowUp, ArrowDown, Star, Tag as TagIcon, Calendar,
  FileText, Copy, BookMarked, Info, Clock, ChevronLeft,
  Bookmark, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface ZoteroCollection {
  key: string;
  name: string;
  parentCollection?: string;
  children?: ZoteroCollection[];
}

interface ZoteroItemRich {
  itemKey: string;
  title: string;
  authors: string;
  authorsList: string[];
  year: number | undefined;
  itemType: string;
  abstractNote: string;
  publicationTitle: string;
  volume: string;
  issue: string;
  pages: string;
  publisher: string;
  doi: string;
  url: string;
  isbn: string;
  issn: string;
  language: string;
  place: string;
  numPages: string;
  shortTitle: string;
  extra: string;
  dateAdded: string;
  dateModified: string;
  tags: string[];
  collections: string[];
  rating: number;
}

type ViewMode = 'table' | 'cards' | 'list';
type SortDir = 'asc' | 'desc';

interface ColumnDef {
  id: keyof ZoteroItemRich | 'rating' | 'tagsText';
  labelAr: string;
  labelEn: string;
  width?: number;
}

const ALL_COLUMNS: ColumnDef[] = [
  { id: 'title',            labelAr: 'العنوان',       labelEn: 'Title',       width: 280 },
  { id: 'authors',          labelAr: 'المؤلفون',      labelEn: 'Authors',     width: 180 },
  { id: 'year',             labelAr: 'السنة',         labelEn: 'Year',        width: 60 },
  { id: 'itemType',         labelAr: 'النوع',         labelEn: 'Type',        width: 100 },
  { id: 'publicationTitle', labelAr: 'المجلّة/الكتاب', labelEn: 'Publication', width: 180 },
  { id: 'doi',              labelAr: 'DOI',            labelEn: 'DOI',         width: 160 },
  { id: 'volume',           labelAr: 'مجلّد',          labelEn: 'Vol',         width: 60 },
  { id: 'issue',            labelAr: 'عدد',            labelEn: 'Issue',       width: 60 },
  { id: 'pages',            labelAr: 'صفحات',          labelEn: 'Pages',       width: 80 },
  { id: 'publisher',        labelAr: 'الناشر',         labelEn: 'Publisher',   width: 140 },
  { id: 'language',         labelAr: 'اللغة',          labelEn: 'Lang',        width: 60 },
  { id: 'rating',           labelAr: 'تقييم',          labelEn: 'Rating',      width: 100 },
  { id: 'tagsText',         labelAr: 'الوسوم',         labelEn: 'Tags',        width: 180 },
  { id: 'dateAdded',        labelAr: 'أُضيف',          labelEn: 'Added',       width: 120 },
  { id: 'dateModified',     labelAr: 'آخر تعديل',     labelEn: 'Modified',    width: 120 },
];

const DEFAULT_COLUMNS: Array<ColumnDef['id']> = ['title', 'authors', 'year', 'itemType', 'publicationTitle', 'rating', 'tagsText'];

export function ZoteroBrowser() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [collections, setCollections] = useState<ZoteroCollection[]>([]);
  const [tree, setTree] = useState<ZoteroCollection[]>([]);
  const [items, setItems] = useState<ZoteroItemRich[]>([]);
  const [activeCollection, setActiveCollection] = useState<ZoteroCollection | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [synced, setSynced] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  // View prefs — persisted, mobile-aware (table is unusable on phones)
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'table';
    const saved = localStorage.getItem('zotero.view') as ViewMode | null;
    if (saved) return saved;
    return window.matchMedia('(max-width: 768px)').matches ? 'cards' : 'table';
  });
  const [visibleCols, setVisibleCols] = useState<Array<ColumnDef['id']>>(() => {
    if (typeof window === 'undefined') return DEFAULT_COLUMNS;
    try { return JSON.parse(localStorage.getItem('zotero.cols') ?? '') || DEFAULT_COLUMNS; } catch { return DEFAULT_COLUMNS; }
  });
  const [sortBy, setSortBy] = useState<ColumnDef['id']>('year');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showColPicker, setShowColPicker] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [newOnly, setNewOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulk, setShowBulk] = useState(false);
  const [expandedAbstracts, setExpandedAbstracts] = useState<Set<string>>(new Set());
  const [showAllAbstracts, setShowAllAbstracts] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<{ lastRefreshAt: string | null; daysSince: number | null; overdue: boolean; thresholdDays: number } | null>(null);
  const [refreshDismissed, setRefreshDismissed] = useState(false);
  const [collectionsOpenMobile, setCollectionsOpenMobile] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showDbSearch, setShowDbSearch] = useState<'scopus' | 'wos' | null>(null);

  // Zotero ↔ Vault sync (phase 1: pull from Zotero into vault frontmatter)
  interface VaultSyncStatus {
    lastRunAt: string | null;
    lastRunDurationMs: number | null;
    lastRunStats: { matched: number; updated: number; conflicts: number; errors: number; missingInZotero: number; missingInVault: number } | null;
    running: boolean;
    lastError: string | null;
  }
  const [vaultSyncStatus, setVaultSyncStatus] = useState<VaultSyncStatus | null>(null);
  const [vaultSyncRunning, setVaultSyncRunning] = useState(false);
  const [dryRunMode, setDryRunMode] = useState(false);
  const [writeMode, setWriteMode] = useState<{ hasWriteKey: boolean; writeEnabled: boolean } | null>(null);

  const loadVaultSyncStatus = useCallback(() => {
    apiFetch<VaultSyncStatus>('/api/zotero/sync/status').then(setVaultSyncStatus).catch(() => {});
  }, []);
  const loadWriteMode = useCallback(() => {
    apiFetch<{ hasWriteKey?: boolean; writeEnabled?: boolean }>('/api/zotero/config')
      .then((r) => setWriteMode({ hasWriteKey: !!r.hasWriteKey, writeEnabled: !!r.writeEnabled }))
      .catch(() => setWriteMode({ hasWriteKey: false, writeEnabled: false }));
  }, []);
  useEffect(() => { loadVaultSyncStatus(); loadWriteMode(); }, [loadVaultSyncStatus, loadWriteMode]);

  const runVaultSync = async () => {
    if (vaultSyncRunning) return;
    setVaultSyncRunning(true);
    try {
      await apiFetch('/api/zotero/sync/run', {
        method: 'POST',
        body: JSON.stringify({ dryRun: dryRunMode }),
      });
      loadVaultSyncStatus();
    } catch (err) {
      setVaultSyncStatus((prev) => prev ? { ...prev, lastError: err instanceof Error ? err.message : 'Sync failed' } : prev);
    }
    setVaultSyncRunning(false);
  };

  const loadRefreshStatus = useCallback(() => {
    apiFetch<{ lastRefreshAt: string | null; daysSince: number | null; overdue: boolean; thresholdDays: number }>('/api/zotero/refresh-status')
      .then(setRefreshStatus).catch(() => {});
  }, []);
  useEffect(() => { loadRefreshStatus(); }, [loadRefreshStatus]);

  const markRefreshed = async () => {
    try {
      await apiFetch('/api/zotero/refresh-status/mark', { method: 'POST' });
      loadRefreshStatus();
      loadItems(activeCollection);
    } catch {}
  };
  const isAbstractOpen = useCallback((key: string) => showAllAbstracts || expandedAbstracts.has(key), [showAllAbstracts, expandedAbstracts]);
  const toggleAbstract = useCallback((key: string) => {
    setExpandedAbstracts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const [selectedItem, setSelectedItem] = useState<ZoteroItemRich | null>(null);
  const [suggestOpenFor, setSuggestOpenFor] = useState<ZoteroItemRich | null>(null);
  const [refsOpenFor, setRefsOpenFor] = useState<ZoteroItemRich | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('zotero.view', view); }, [view]);
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('zotero.cols', JSON.stringify(visibleCols)); }, [visibleCols]);

  const loadCollections = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await apiFetch<{ collections: ZoteroCollection[]; tree: ZoteroCollection[] }>('/api/zotero/collections');
      setCollections(r.collections);
      setTree(r.tree);
      // If active collection no longer exists in the new mode/library, reset to "All"
      // (prevents "not a valid collection key" 404 when switching local↔web).
      setActiveCollection((prev) => {
        if (prev && !r.collections.find((c) => c.key === prev.key)) return null;
        return prev;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed — is Zotero running?');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadCollections(); }, [loadCollections]);

  const loadItems = useCallback(async (collection: ZoteroCollection | null) => {
    setActiveCollection(collection);
    setCollectionsOpenMobile(false);
    setLoadingItems(true);
    try {
      const url = collection ? `/api/zotero/items-rich?collection=${collection.key}` : '/api/zotero/items-rich';
      const r = await apiFetch<{ items: ZoteroItemRich[]; invalidCollection?: boolean }>(url);
      setItems(r.items);
      // If backend reports the collection key is stale, auto-reset to "All items"
      if (r.invalidCollection && collection) {
        setActiveCollection(null);
        const all = await apiFetch<{ items: ZoteroItemRich[] }>('/api/zotero/items-rich');
        setItems(all.items);
      }
    } catch { setItems([]); }
    setLoadingItems(false);
  }, []);

  // Load all items on first collection load
  useEffect(() => { if (!loading && items.length === 0) loadItems(null); }, [loading, items.length, loadItems]);

  const syncToVault = async (item: ZoteroItemRich) => {
    setSyncing(item.itemKey);
    try {
      await apiFetch('/api/vault/literature/sync-from-zotero', {
        method: 'POST',
        body: JSON.stringify({ itemKey: item.itemKey, status: 'To Read' }),
      });
      setSynced((prev) => new Set([...prev, item.itemKey]));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'sync failed');
    }
    setSyncing(null);
  };

  const [classifying, setClassifying] = useState<string | null>(null);
  const aiClassify = async (item: ZoteroItemRich) => {
    setClassifying(item.itemKey);
    try {
      const r = await apiFetch<{ tags: string[]; readingPriority: string; readingStatus: string; rating: number; reason: string; applied: boolean }>(
        `/api/zotero/items/${item.itemKey}/ai-classify?apply=true`,
        { method: 'POST', body: JSON.stringify({ apply: true }) },
      );
      alert(isRTL
        ? `✓ صُنّف بـ ${r.tags.length} وسم\nالأولوية: ${r.readingPriority}\nالتقييم: ${r.rating > 0 ? '⭐'.repeat(r.rating) : '—'}\n\nالسبب: ${r.reason}`
        : `✓ Classified with ${r.tags.length} tags\nPriority: ${r.readingPriority}\nRating: ${r.rating > 0 ? '⭐'.repeat(r.rating) : '—'}\n\nReason: ${r.reason}`);
      loadItems(activeCollection);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'classify failed');
    }
    setClassifying(null);
  };

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleCol = (id: ColumnDef['id']) => {
    setVisibleCols((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  };

  const moveCol = (id: ColumnDef['id'], dir: -1 | 1) => {
    setVisibleCols((prev) => {
      const i = prev.indexOf(id);
      if (i < 0) return prev;
      const ni = i + dir;
      if (ni < 0 || ni >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[ni]] = [next[ni], next[i]];
      return next;
    });
  };

  const itemTypes = useMemo(() => [...new Set(items.map((i) => i.itemType).filter(Boolean))], [items]);

  const renderCollection = (col: ZoteroCollection, depth: number): React.ReactNode => {
    const hasChildren = (col.children?.length ?? 0) > 0;
    const isExpanded = expanded.has(col.key);
    const isActive = activeCollection?.key === col.key;
    return (
      <div key={col.key}>
        <div
          onClick={() => loadItems(col)}
          className={cn(
            'flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-surface-tertiary text-xs rounded transition-colors',
            isActive && 'bg-accent/15 text-accent font-semibold'
          )}
          style={{ [isRTL ? 'paddingRight' : 'paddingLeft']: `${0.5 + depth * 1}rem` }}
        >
          {hasChildren ? (
            <button onClick={(e) => { e.stopPropagation(); toggleExpand(col.key); }} className="text-on-surface-tertiary">
              {isExpanded
                ? <ChevronDown className="h-3 w-3" />
                : (isRTL ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)}
            </button>
          ) : <span className="w-3" />}
          <FolderTree className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span className="flex-1 truncate">{col.name}</span>
        </div>
        {hasChildren && isExpanded && col.children?.map((c) => renderCollection(c, depth + 1))}
      </div>
    );
  };

  const filtered = useMemo(() => {
    let r = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((i) =>
        i.title.toLowerCase().includes(q) ||
        i.authors.toLowerCase().includes(q) ||
        i.abstractNote.toLowerCase().includes(q) ||
        i.tags.some((t) => t.toLowerCase().includes(q)) ||
        (i.doi ?? '').toLowerCase().includes(q)
      );
    }
    if (typeFilter) r = r.filter((i) => i.itemType === typeFilter);
    if (newOnly) {
      // "New" = added in last 30 days OR has no user-set tags (no rating, no subject tags)
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      r = r.filter((i) => {
        const userTags = i.tags.filter((t) => !/^⭐+$/.test(t));
        const recentlyAdded = i.dateAdded ? new Date(i.dateAdded).getTime() > cutoff : false;
        return userTags.length === 0 || recentlyAdded;
      });
    }
    // Sort
    r = [...r].sort((a, b) => {
      const av = a[sortBy as keyof ZoteroItemRich] ?? '';
      const bv = b[sortBy as keyof ZoteroItemRich] ?? '';
      const ax = typeof av === 'number' ? av : Array.isArray(av) ? av.join(' ') : String(av);
      const bx = typeof bv === 'number' ? bv : Array.isArray(bv) ? bv.join(' ') : String(bv);
      if (ax === bx) return 0;
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(ax).localeCompare(String(bx));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return r;
  }, [items, search, typeFilter, newOnly, sortBy, sortDir]);

  const newCount = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return items.filter((i) => {
      const userTags = i.tags.filter((t) => !/^⭐+$/.test(t));
      const recentlyAdded = i.dateAdded ? new Date(i.dateAdded).getTime() > cutoff : false;
      return userTags.length === 0 || recentlyAdded;
    }).length;
  }, [items]);

  const visibleColDefs = visibleCols.map((id) => ALL_COLUMNS.find((c) => c.id === id)!).filter(Boolean);

  const getCell = (item: ZoteroItemRich, id: ColumnDef['id']): React.ReactNode => {
    if (id === 'rating') return item.rating > 0 ? '⭐'.repeat(item.rating) : '';
    if (id === 'tagsText') return item.tags.filter((t) => !/^⭐+$/.test(t)).slice(0, 5).join(', ');
    if (id === 'dateAdded' || id === 'dateModified') return item[id as 'dateAdded' | 'dateModified']?.slice(0, 10) ?? '';
    const v = item[id as keyof ZoteroItemRich];
    return Array.isArray(v) ? v.join(', ') : String(v ?? '');
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-surface" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Mobile overlay for collections */}
      {collectionsOpenMobile && (
        <div
          onClick={() => setCollectionsOpenMobile(false)}
          className="md:hidden fixed inset-0 bg-black/50 z-40"
        />
      )}
      {/* Left: Collections tree (slide-in on mobile) */}
      <aside className={cn(
        'w-64 shrink-0 border-border bg-surface-secondary flex flex-col transition-transform',
        isRTL ? 'border-l' : 'border-r',
        // Mobile: full-height drawer
        'md:static md:translate-x-0',
        'fixed top-0 bottom-0 z-50',
        isRTL ? 'right-0' : 'left-0',
        collectionsOpenMobile ? 'translate-x-0' : (isRTL ? 'translate-x-full md:translate-x-0' : '-translate-x-full md:translate-x-0')
      )}>
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-on-surface flex-1">
            {isRTL ? 'مجموعات Zotero' : 'Zotero Collections'}
          </h2>
          <button onClick={loadCollections} className="text-on-surface-tertiary hover:text-on-surface" title={isRTL ? 'تحديث' : 'Refresh'}>
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        {loading ? (
          <div className="p-6 text-center"><Loader2 className="h-5 w-5 animate-spin text-on-surface-tertiary mx-auto" /></div>
        ) : error ? (
          <div className="p-4 text-center">
            <AlertTriangle className="h-6 w-6 text-warning mx-auto mb-2" />
            <p className="text-xs text-on-surface-secondary">{error}</p>
            <p className="text-[10px] text-on-surface-tertiary mt-1">
              {isRTL ? 'افتح Zotero ثم أعد المحاولة' : 'Open Zotero and retry'}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-2">
            <div
              onClick={() => loadItems(null)}
              className={cn('px-2 py-1.5 cursor-pointer hover:bg-surface-tertiary text-xs rounded mb-1',
                !activeCollection && 'bg-accent/15 text-accent font-semibold')}
            >
              📚 {isRTL ? 'كل العناصر' : 'All items'}
            </div>
            <div className="text-[10px] text-on-surface-tertiary uppercase tracking-wider px-2 py-1">
              {collections.length} {isRTL ? 'مجموعة' : 'collections'}
            </div>
            {tree.map((c) => renderCollection(c, 0))}
          </div>
        )}
      </aside>

      {/* Right: Items area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Refresh-overdue banner — only shows if ≥ 14 days since last refresh */}
        {refreshStatus?.overdue && !refreshDismissed && (
          <div className="bg-warning/10 border-b border-warning/30 px-4 py-2 flex items-center gap-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            <p className="flex-1 text-on-surface-secondary">
              {isRTL
                ? refreshStatus.daysSince === null
                  ? '⏰ لم تقم بتحديث الأرقام (الاستشهادات/المراجع) لمكتبتك من OpenAlex حتى الآن. أنصحك بالتحديث الآن.'
                  : `⏰ مرّ ${refreshStatus.daysSince} يوماً منذ آخر تحديث للأرقام من OpenAlex (الحدّ ${refreshStatus.thresholdDays}). الأرقام قد تكون قديمة.`
                : refreshStatus.daysSince === null
                  ? '⏰ You have never refreshed citation/reference numbers from OpenAlex. Refresh recommended.'
                  : `⏰ ${refreshStatus.daysSince} days since last OpenAlex refresh (threshold ${refreshStatus.thresholdDays}). Numbers may be stale.`}
            </p>
            <button onClick={markRefreshed} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-warning text-white">
              <RefreshCw className="h-3 w-3" />
              {isRTL ? 'حدّث الآن' : 'Refresh now'}
            </button>
            <button onClick={() => setRefreshDismissed(true)} className="text-on-surface-tertiary hover:text-on-surface" title={isRTL ? 'أخفِ' : 'Dismiss'}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Vault sync status + trigger */}
        <div className="bg-surface border-b border-border px-4 py-1.5 flex items-center gap-2 text-[11px] flex-wrap">
          <span className="text-on-surface-tertiary shrink-0">
            {isRTL ? 'مزامنة Vault:' : 'Vault sync:'}
          </span>
          {writeMode && (
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full',
                writeMode.writeEnabled && writeMode.hasWriteKey
                  ? 'bg-warning/15 text-warning'
                  : 'bg-surface-secondary text-on-surface-tertiary',
              )}
              title={
                writeMode.writeEnabled && writeMode.hasWriteKey
                  ? (isRTL ? 'الكتابة إلى Zotero مفعّلة' : 'Zotero writes enabled')
                  : (isRTL ? 'قراءة فقط' : 'read-only')
              }
            >
              {writeMode.writeEnabled && writeMode.hasWriteKey
                ? (isRTL ? 'كتابة مفعّلة' : 'write enabled')
                : (isRTL ? 'قراءة فقط' : 'read-only')}
            </span>
          )}
          <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              role="switch"
              aria-checked={dryRunMode}
              checked={dryRunMode}
              onChange={(e) => setDryRunMode(e.target.checked)}
              className="accent-accent h-3 w-3"
            />
            <span className={cn('text-[10px]', dryRunMode ? 'text-accent' : 'text-on-surface-tertiary')}>
              {isRTL ? 'معاينة فقط' : 'dry-run'}
            </span>
          </label>
          {vaultSyncStatus?.lastRunAt ? (
            <span className="text-on-surface-secondary flex items-center gap-1.5 flex-wrap">
              <span>
                {isRTL ? 'آخر مزامنة' : 'last run'}{' '}
                <span className="font-mono">
                  {new Date(vaultSyncStatus.lastRunAt).toLocaleString(isRTL ? 'ar' : 'en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </span>
              {vaultSyncStatus.lastRunStats && (
                <span className="text-on-surface-tertiary">
                  · {isRTL ? 'طوبق' : 'matched'} {vaultSyncStatus.lastRunStats.matched}
                  · {isRTL ? 'حُدّث' : 'updated'} {vaultSyncStatus.lastRunStats.updated}
                  {vaultSyncStatus.lastRunStats.conflicts > 0 && (
                    <>
                      {' '}·{' '}
                      <span className="text-warning">
                        {isRTL ? 'تعارض' : 'conflicts'} {vaultSyncStatus.lastRunStats.conflicts}
                      </span>
                    </>
                  )}
                  {vaultSyncStatus.lastRunStats.errors > 0 && (
                    <>
                      {' '}·{' '}
                      <span className="text-error">
                        {isRTL ? 'أخطاء' : 'errors'} {vaultSyncStatus.lastRunStats.errors}
                      </span>
                    </>
                  )}
                </span>
              )}
            </span>
          ) : (
            <span className="text-on-surface-tertiary">{isRTL ? 'لم تُشغَّل بعد' : 'never run'}</span>
          )}
          <div className="flex-1" />
          {vaultSyncStatus?.lastError && (
            <span className="text-error truncate max-w-[20rem]" title={vaultSyncStatus.lastError}>
              {vaultSyncStatus.lastError}
            </span>
          )}
          <button
            onClick={runVaultSync}
            disabled={vaultSyncRunning || vaultSyncStatus?.running}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50"
            title={dryRunMode ? (isRTL ? 'معاينة المزامنة' : 'Preview sync') : (isRTL ? 'شغّل المزامنة الآن' : 'Run sync now')}
          >
            {(vaultSyncRunning || vaultSyncStatus?.running) ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
            {dryRunMode
              ? (isRTL ? 'عاين الآن' : 'Preview now')
              : (isRTL ? 'زامِن الآن' : 'Sync now')}
          </button>
        </div>

        {/* Header with controls */}
        <div className="border-b border-border bg-surface-secondary px-3 py-2 md:px-4 md:py-3 flex items-center gap-2 flex-wrap shrink-0">
          {/* Mobile: hamburger to open collections drawer */}
          <button
            onClick={() => setCollectionsOpenMobile(true)}
            className="md:hidden p-2 -ml-1 rounded text-on-surface-secondary hover:bg-surface-tertiary min-w-[44px] min-h-[44px] flex items-center justify-center"
            title={isRTL ? 'المجموعات' : 'Collections'}
          >
            <FolderTree className="h-4 w-4" />
          </button>
          <h1 className="text-sm font-semibold text-on-surface truncate">
            {activeCollection ? activeCollection.name : (isRTL ? 'كل العناصر' : 'All items')}
            <span className="ms-2 text-on-surface-tertiary text-xs">({filtered.length}/{items.length})</span>
          </h1>
          <div className="flex-1" />
          {/* New filter */}
          <button
            onClick={() => setNewOnly((v) => !v)}
            title={isRTL ? 'الإضافات الجديدة (آخر 30 يوماً أو غير مصنّفة)' : 'New additions (last 30d or untagged)'}
            className={cn('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors',
              newOnly ? 'bg-warning/15 border-warning text-warning' : 'border-border text-on-surface-secondary hover:bg-surface-tertiary')}
          >
            <Sparkles className="h-3 w-3" />
            {isRTL ? `جديد (${newCount})` : `New (${newCount})`}
          </button>

          {/* Bulk action */}
          {selected.size > 0 && (
            <button
              onClick={() => setShowBulk(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-info/15 text-info"
            >
              <TagIcon className="h-3 w-3" />
              {isRTL ? `صنّف (${selected.size})` : `Tag (${selected.size})`}
            </button>
          )}

          {/* External database searches (Scopus, WoS) */}
          <button
            onClick={() => setShowDbSearch('scopus')}
            title={isRTL ? 'ابحث في Scopus وأضف للمكتبة' : 'Search Scopus & import'}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-orange-500/40 text-orange-400 hover:bg-orange-500/10"
          >
            <Search className="h-3 w-3" />
            Scopus
          </button>
          <button
            onClick={() => setShowDbSearch('wos')}
            title={isRTL ? 'ابحث في Web of Science' : 'Search Web of Science'}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-purple-500/40 text-purple-400 hover:bg-purple-500/10"
          >
            <Search className="h-3 w-3" />
            WoS
          </button>

          {/* Connection settings */}
          <button
            onClick={() => setShowConfig(true)}
            title={isRTL ? 'إعدادات الاتصال (محلي / ويب)' : 'Connection settings (local / web)'}
            className="p-2 rounded text-on-surface-tertiary hover:bg-surface-tertiary border border-border min-w-[40px] min-h-[40px] flex items-center justify-center"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>

          {/* Add new */}
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-accent text-on-accent hover:opacity-90"
            title={isRTL ? 'أضف مصدراً جديداً (يُحفظ في Zotero أولاً)' : 'Add new (goes to Zotero first)'}
          >
            <Plus className="h-3 w-3" />
            {isRTL ? 'أضف مصدراً' : 'Add source'}
          </button>

          {/* Abstract global toggle */}
          <button
            onClick={() => setShowAllAbstracts((v) => !v)}
            title={isRTL ? (showAllAbstracts ? 'اخفِ كل الملخصات' : 'اعرض كل الملخصات') : (showAllAbstracts ? 'Hide all abstracts' : 'Show all abstracts')}
            className={cn('flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border transition-colors',
              showAllAbstracts ? 'bg-info/15 border-info text-info' : 'border-border text-on-surface-secondary hover:bg-surface-tertiary')}
          >
            <FileText className="h-3 w-3" />
            {isRTL ? 'ملخصات' : 'Abstracts'}
          </button>

          {/* View switch */}
          <div className="flex items-center bg-surface border border-border rounded overflow-hidden">
            {([
              { m: 'table', Icon: Table2, label: isRTL ? 'جدول' : 'Table' },
              { m: 'cards', Icon: LayoutGrid, label: isRTL ? 'بطاقات' : 'Cards' },
              { m: 'list',  Icon: List, label: isRTL ? 'قائمة' : 'List' },
            ] as const).map(({ m, Icon, label }) => (
              <button
                key={m}
                onClick={() => setView(m)}
                title={label}
                className={cn('p-1.5 transition-colors', view === m ? 'bg-accent text-on-accent' : 'text-on-surface-tertiary hover:bg-surface-tertiary')}
              ><Icon className="h-3.5 w-3.5" /></button>
            ))}
          </div>

          {/* Type filter */}
          {itemTypes.length > 0 && (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-surface border border-border rounded px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-accent"
            >
              <option value="">{isRTL ? 'كل الأنواع' : 'All types'}</option>
              {itemTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}

          {/* Column picker (only in table view) */}
          {view === 'table' && (
            <div className="relative">
              <button
                onClick={() => setShowColPicker((v) => !v)}
                title={isRTL ? 'أعمدة الجدول' : 'Columns'}
                className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-secondary border border-border"
              ><Settings2 className="h-3.5 w-3.5" /></button>
              {showColPicker && (
                <div className="absolute end-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-xl z-20 w-64 p-2 max-h-96 overflow-y-auto">
                  <p className="text-[10px] uppercase tracking-wider text-on-surface-tertiary px-2 pb-2">
                    {isRTL ? 'اختر وأعد ترتيب الأعمدة' : 'Pick & reorder columns'}
                  </p>
                  {visibleCols.map((id, i) => {
                    const col = ALL_COLUMNS.find((c) => c.id === id);
                    if (!col) return null;
                    return (
                      <div key={id} className="flex items-center gap-1 px-2 py-1 rounded hover:bg-surface-secondary">
                        <input type="checkbox" checked readOnly onClick={() => toggleCol(id)} className="shrink-0" />
                        <span className="flex-1 text-xs text-on-surface">{isRTL ? col.labelAr : col.labelEn}</span>
                        <button onClick={() => moveCol(id, -1)} disabled={i === 0} className="text-on-surface-tertiary disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                        <button onClick={() => moveCol(id, 1)} disabled={i === visibleCols.length - 1} className="text-on-surface-tertiary disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                      </div>
                    );
                  })}
                  <div className="border-t border-border my-2" />
                  <p className="text-[10px] uppercase tracking-wider text-on-surface-tertiary px-2 pb-1">
                    {isRTL ? 'المتاحة' : 'Available'}
                  </p>
                  {ALL_COLUMNS.filter((c) => !visibleCols.includes(c.id)).map((col) => (
                    <div key={col.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-secondary">
                      <input type="checkbox" checked={false} onChange={() => toggleCol(col.id)} />
                      <span className="flex-1 text-xs text-on-surface-tertiary">{isRTL ? col.labelAr : col.labelEn}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className={cn('absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-on-surface-tertiary', isRTL ? 'right-2' : 'left-2')} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isRTL ? 'بحث...' : 'Search...'}
              className={cn('bg-surface border border-border rounded px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-accent w-48',
                isRTL ? 'pr-7' : 'pl-7')}
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {loadingItems ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-on-surface-tertiary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-on-surface-tertiary py-10">
              {isRTL ? 'لا عناصر' : 'No items'}
            </p>
          ) : view === 'table' ? (
            <TableView
              items={filtered}
              cols={visibleColDefs}
              isRTL={isRTL}
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={(id) => {
                if (sortBy === id) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                else { setSortBy(id); setSortDir('asc'); }
              }}
              getCell={getCell}
              onRowClick={(it) => setSelectedItem(it)}
              onSync={syncToVault}
              syncing={syncing}
              synced={synced}
              onOpenRefs={(it) => setRefsOpenFor(it)}
              onOpenSuggest={(it) => setSuggestOpenFor(it)}
              selected={selected}
              onToggleSelect={(key) => {
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key); else next.add(key);
                  return next;
                });
              }}
              onSelectAll={() => {
                setSelected((prev) => prev.size === filtered.length ? new Set() : new Set(filtered.map((i) => i.itemKey)));
              }}
              isAbstractOpen={isAbstractOpen}
              toggleAbstract={toggleAbstract}
              onClassify={aiClassify}
              classifying={classifying}
            />
          ) : view === 'cards' ? (
            <CardsView
              items={filtered}
              isRTL={isRTL}
              onRowClick={setSelectedItem}
              onSync={syncToVault}
              syncing={syncing}
              synced={synced}
              onOpenRefs={setRefsOpenFor}
              onOpenSuggest={setSuggestOpenFor}
              isAbstractOpen={isAbstractOpen}
              toggleAbstract={toggleAbstract}
              onClassify={aiClassify}
              classifying={classifying}
            />
          ) : (
            <ListView
              items={filtered}
              isRTL={isRTL}
              onRowClick={setSelectedItem}
              onSync={syncToVault}
              syncing={syncing}
              synced={synced}
              isAbstractOpen={isAbstractOpen}
              toggleAbstract={toggleAbstract}
            />
          )}
        </div>
      </div>

      {/* Detail drawer */}
      {selectedItem && (
        <DetailDrawer item={selectedItem} isRTL={isRTL} onClose={() => setSelectedItem(null)} onOpenRefs={() => { setRefsOpenFor(selectedItem); }} onOpenSuggest={() => { setSuggestOpenFor(selectedItem); }} onClassify={aiClassify} classifying={classifying} />
      )}

      {/* Add modal */}
      {showAdd && (
        <AddModal isRTL={isRTL} onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); loadItems(activeCollection); }} />
      )}

      {/* References graph modal */}
      {refsOpenFor && (
        <ReferencesModal item={refsOpenFor} isRTL={isRTL} onClose={() => setRefsOpenFor(null)} />
      )}

      {/* AI suggestions modal */}
      {suggestOpenFor && (
        <SuggestionsModal item={suggestOpenFor} isRTL={isRTL} onClose={() => setSuggestOpenFor(null)} />
      )}

      {/* Database search modal (Scopus / WoS) */}
      {showDbSearch && (
        <DatabaseSearchModal
          source={showDbSearch}
          isRTL={isRTL}
          onClose={() => setShowDbSearch(null)}
          onImported={() => loadItems(activeCollection)}
        />
      )}

      {/* Connection settings modal */}
      {showConfig && (
        <ConnectionConfigModal
          isRTL={isRTL}
          onClose={() => setShowConfig(false)}
          onSaved={() => { setShowConfig(false); loadCollections(); loadItems(activeCollection); }}
        />
      )}

      {/* Bulk tag modal */}
      {showBulk && (
        <BulkTagModal
          itemKeys={[...selected]}
          itemTitles={items.filter((i) => selected.has(i.itemKey)).map((i) => i.title)}
          isRTL={isRTL}
          onClose={() => setShowBulk(false)}
          onDone={() => { setShowBulk(false); setSelected(new Set()); loadItems(activeCollection); }}
        />
      )}
    </div>
  );
}

// ── Scopus/WoS search modal — search remote DB and import to Zotero ──
interface DbSearchResult {
  title: string; authors?: string; year?: number; doi?: string; journal?: string;
  abstract?: string; citedByCount?: number; volume?: string; issue?: string; pages?: string;
}

interface SavedSearch { id: string; source: 'scopus' | 'wos'; query: string; label?: string; createdAt: string }

const PAGE_SIZE = 30;
const resultKey = (r: DbSearchResult, idx: number) => r.doi || `${r.title}::${idx}`;

function DatabaseSearchModal({ source, isRTL, onClose, onImported }: {
  source: 'scopus' | 'wos'; isRTL: boolean; onClose: () => void; onImported: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DbSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  // Saved searches
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [savedPanelOpen, setSavedPanelOpen] = useState(false);

  // Pagination cursors — scopus uses start offset, wos uses page number
  const nextStart = results.length;  // scopus: next offset
  const nextPage = Math.floor(results.length / PAGE_SIZE) + 1;  // wos: next page

  const loadSaved = useCallback(() => {
    apiFetch<SavedSearch[]>('/api/databases/saved-searches')
      .then((list) => setSaved(list.filter((s) => s.source === source)))
      .catch(() => setSaved([]));
  }, [source]);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  const runSearch = async (q: string, append: boolean) => {
    if (append) setLoadingMore(true); else { setLoading(true); setResults([]); setSelected(new Set()); }
    setError(null);
    try {
      const body = source === 'scopus'
        ? { query: q, count: PAGE_SIZE, start: append ? nextStart : 0 }
        : { query: q, count: PAGE_SIZE, page: append ? nextPage : 1 };
      const r = await apiFetch<{ results: DbSearchResult[]; total?: number; error?: string }>(
        `/api/databases/${source}/search`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      const next = r.results ?? [];
      setResults((prev) => append ? [...prev, ...next] : next);
      setTotal(r.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'search failed');
    }
    setLoading(false);
    setLoadingMore(false);
  };

  const search = () => {
    if (!query.trim()) return;
    runSearch(query.trim(), false);
  };

  const loadMore = () => {
    if (!query.trim() || loadingMore || results.length >= total) return;
    runSearch(query.trim(), true);
  };

  const importOne = async (r: DbSearchResult, idx: number) => {
    const k = resultKey(r, idx);
    setImporting(k);
    try {
      await apiFetch('/api/zotero/import-external', {
        method: 'POST',
        body: JSON.stringify({
          title: r.title, authors: r.authors, year: r.year, doi: r.doi, abstractNote: r.abstract,
        }),
      });
      setImported((prev) => new Set([...prev, k]));
      onImported();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'import failed');
    }
    setImporting(null);
  };

  const toggleSelect = (k: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const selectAllVisible = () => {
    const allKeys = results.map((r, idx) => resultKey(r, idx)).filter((k) => !imported.has(k));
    const allSelected = allKeys.every((k) => selected.has(k));
    setSelected(allSelected ? new Set() : new Set(allKeys));
  };

  const importSelected = async () => {
    const toImport = results
      .map((r, idx) => ({ r, k: resultKey(r, idx) }))
      .filter(({ k }) => selected.has(k) && !imported.has(k));
    if (toImport.length === 0) return;
    setBulkProgress({ done: 0, total: toImport.length });
    for (let i = 0; i < toImport.length; i += 1) {
      const { r, k } = toImport[i];
      try {
        await apiFetch('/api/zotero/import-external', {
          method: 'POST',
          body: JSON.stringify({
            title: r.title, authors: r.authors, year: r.year, doi: r.doi, abstractNote: r.abstract,
          }),
        });
        setImported((prev) => new Set([...prev, k]));
      } catch {
        // Swallow per-item failures; summary will reflect successes
      }
      setBulkProgress({ done: i + 1, total: toImport.length });
    }
    setSelected(new Set());
    onImported();
    setTimeout(() => setBulkProgress(null), 1500);
  };

  const saveCurrentQuery = async () => {
    if (!query.trim()) return;
    try {
      const s = await apiFetch<SavedSearch>('/api/databases/saved-searches', {
        method: 'POST',
        body: JSON.stringify({ source, query: query.trim() }),
      });
      setSaved((prev) => [s, ...prev.filter((x) => x.id !== s.id)]);
    } catch {
      // non-fatal
    }
  };

  const deleteSaved = async (id: string) => {
    try {
      await apiFetch(`/api/databases/saved-searches/${id}`, { method: 'DELETE' });
      setSaved((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // non-fatal
    }
  };

  const runSaved = (s: SavedSearch) => {
    setQuery(s.query);
    setSavedPanelOpen(false);
    runSearch(s.query, false);
  };

  const sourceMeta = source === 'scopus'
    ? { name: 'Scopus', accent: 'text-warning', help: 'Elsevier' }
    : { name: 'Web of Science', accent: 'text-accent', help: 'Clarivate' };

  const selectedCount = selected.size;
  const hasMore = results.length > 0 && results.length < total;
  const currentQuerySaved = saved.some((s) => s.query.toLowerCase() === query.trim().toLowerCase());

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-on-surface flex items-center gap-2">
              <Search className={cn('h-4 w-4', sourceMeta.accent)} />
              {isRTL ? `بحث في ${sourceMeta.name}` : `Search ${sourceMeta.name}`}
              <span className="text-[10px] text-on-surface-tertiary font-normal">({sourceMeta.help})</span>
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-tertiary"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
            placeholder={isRTL ? 'مثال: BIM adoption Kuwait' : 'e.g. BIM adoption Kuwait'}
            className="flex-1 bg-surface-secondary border border-border rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-accent"
          />
          <button
            onClick={() => setSavedPanelOpen((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded text-xs border border-border',
              savedPanelOpen ? 'bg-surface-secondary text-on-surface' : 'text-on-surface-secondary hover:bg-surface-secondary',
            )}
            title={isRTL ? 'البحوث المحفوظة' : 'Saved searches'}
          >
            <Bookmark className="h-3 w-3" />
            {saved.length > 0 && <span className="text-[10px]">({saved.length})</span>}
          </button>
          <button
            onClick={saveCurrentQuery}
            disabled={!query.trim() || currentQuerySaved}
            className="flex items-center gap-1.5 px-3 py-2 rounded text-xs border border-border text-on-surface-secondary hover:bg-surface-secondary disabled:opacity-40"
            title={currentQuerySaved ? (isRTL ? 'محفوظ بالفعل' : 'Already saved') : (isRTL ? 'احفظ هذا الاستعلام' : 'Save this query')}
          >
            <Plus className="h-3 w-3" />
            {isRTL ? 'احفظ' : 'Save'}
          </button>
          <button
            onClick={search}
            disabled={loading || !query.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded text-sm bg-accent text-on-accent disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
            {isRTL ? 'ابحث' : 'Search'}
          </button>
        </div>

        {savedPanelOpen && (
          <div className="px-5 py-3 border-b border-border bg-surface-secondary/50 max-h-40 overflow-y-auto">
            {saved.length === 0 ? (
              <p className="text-xs text-on-surface-tertiary text-center py-2">
                {isRTL ? 'لا توجد بحوث محفوظة. احفظ استعلامك الحالي بالضغط على "احفظ".' : 'No saved searches. Save your current query with "Save".'}
              </p>
            ) : (
              <div className="space-y-1">
                {saved.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface text-xs">
                    <button
                      onClick={() => runSaved(s)}
                      className="flex-1 text-start font-mono text-on-surface hover:text-accent truncate"
                      title={s.query}
                    >
                      {s.query}
                    </button>
                    <button
                      onClick={() => deleteSaved(s.id)}
                      className="p-1 rounded text-on-surface-tertiary hover:text-error hover:bg-error/10"
                      title={isRTL ? 'حذف' : 'Delete'}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {total > 0 && (
          <div className="px-5 py-2 bg-info/5 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[10px] text-info">
              {isRTL ? `إجمالي: ${total.toLocaleString()} — معروض: ${results.length}` : `Total: ${total.toLocaleString()} — showing: ${results.length}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={selectAllVisible}
                className="text-[10px] text-accent hover:underline"
              >
                {isRTL ? 'حدد الكل' : 'Select all'}
              </button>
              {selectedCount > 0 && (
                <button
                  onClick={importSelected}
                  disabled={bulkProgress !== null}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-accent text-on-accent disabled:opacity-50"
                >
                  {bulkProgress
                    ? <><Loader2 className="h-2.5 w-2.5 animate-spin" />{bulkProgress.done}/{bulkProgress.total}</>
                    : <><Plus className="h-2.5 w-2.5" />{isRTL ? `أضف ${selectedCount}` : `Add ${selectedCount}`}</>
                  }
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {error ? (
            <div className="text-center py-10">
              <p className="text-sm text-warning">{error}</p>
              {error.toLowerCase().includes('not configured') && (
                <p className="text-xs text-on-surface-tertiary mt-2">
                  {isRTL ? 'افتح ⚙️ → قواعد بيانات لإضافة المفتاح' : 'Open ⚙️ → Databases to add the key'}
                </p>
              )}
            </div>
          ) : results.length === 0 && !loading ? (
            <p className="text-center text-sm text-on-surface-tertiary py-10">
              {isRTL ? 'ابدأ بكتابة استعلام واضغط بحث' : 'Type a query and press Search'}
            </p>
          ) : (
            <div className="space-y-2">
              {results.map((r, idx) => {
                const k = resultKey(r, idx);
                const isImp = imported.has(k);
                const isLoad = importing === k;
                const isSel = selected.has(k);
                return (
                  <div key={k} className={cn(
                    'rounded-lg border p-3 transition-colors',
                    isSel ? 'border-accent bg-accent/5' : 'border-border bg-surface-secondary',
                  )}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleSelect(k)}
                        disabled={isImp}
                        className="mt-1 shrink-0 h-3.5 w-3.5 accent-accent"
                        aria-label={isRTL ? 'حدد للإضافة المجمّعة' : 'Select for bulk add'}
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-on-surface line-clamp-2">{r.title}</h4>
                        <p className="text-[11px] text-on-surface-tertiary mt-1 line-clamp-1">
                          {r.authors}{r.year ? ` · ${r.year}` : ''}{r.journal ? ` · ${r.journal}` : ''}
                        </p>
                        <div className="flex items-center gap-3 text-[10px] text-on-surface-tertiary mt-1.5 flex-wrap">
                          {r.doi && <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer" className="hover:text-accent flex items-center gap-1"><ExternalLink className="h-2.5 w-2.5" />DOI</a>}
                          {r.citedByCount !== undefined && <span>{r.citedByCount} {isRTL ? 'استشهاد' : 'citations'}</span>}
                          {r.volume && <span>vol {r.volume}{r.issue ? `(${r.issue})` : ''}{r.pages ? `:${r.pages}` : ''}</span>}
                        </div>
                        {r.abstract && (
                          <p className="text-xs text-on-surface-secondary mt-2 line-clamp-3 leading-relaxed">{r.abstract}</p>
                        )}
                      </div>
                      <button
                        onClick={() => importOne(r, idx)}
                        disabled={isLoad || isImp}
                        className={cn('shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 rounded',
                          isImp ? 'bg-success/15 text-success' : 'bg-accent text-on-accent',
                          'disabled:opacity-50')}
                      >
                        {isLoad ? <Loader2 className="h-3 w-3 animate-spin" /> :
                         isImp ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                        {isImp ? (isRTL ? 'أُضيف' : 'Added') : (isRTL ? 'أضف' : 'Add')}
                      </button>
                    </div>
                  </div>
                );
              })}

              {hasMore && (
                <div className="pt-2 text-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded border border-border text-on-surface-secondary hover:bg-surface-secondary disabled:opacity-50"
                  >
                    {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronDown className="h-3 w-3" />}
                    {isRTL ? 'حمّل المزيد' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Connection mode modal — Zotero (local/web) + database keys ──────
function ConnectionConfigModal({ isRTL, onClose, onSaved }: { isRTL: boolean; onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState<'zotero' | 'databases'>('zotero');
  const [mode, setMode] = useState<'local' | 'web'>('local');
  const [webUserId, setWebUserId] = useState('');
  const [webApiKey, setWebApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Database keys
  type DbKeyMeta = { configured: boolean; masked: string };
  const [dbKeys, setDbKeys] = useState<{ scopusApiKey: DbKeyMeta; scopusInstToken: DbKeyMeta; wosApiKey: DbKeyMeta; crossrefMailto: DbKeyMeta } | null>(null);
  const [scopusKey, setScopusKey] = useState('');
  const [scopusInst, setScopusInst] = useState('');
  const [wosKey, setWosKey] = useState('');
  const [crossrefMail, setCrossrefMail] = useState('');
  const [savingDb, setSavingDb] = useState(false);

  // Dirty tracking — any unsaved input across both tabs
  const zoteroDirty = (mode === 'web' && (webUserId !== '' || webApiKey !== ''));
  const dbDirty = !!(scopusKey || scopusInst || wosKey || (crossrefMail && crossrefMail !== (dbKeys?.crossrefMailto.masked ?? '')));
  const isDirty = zoteroDirty || dbDirty;

  // Warn before closing the modal if there are unsaved changes
  const guardedClose = () => {
    if (!isDirty || confirm(isRTL ? 'لديك تغييرات غير محفوظة. أغلق؟' : 'You have unsaved changes. Close anyway?')) {
      onClose();
    }
  };

  // Ctrl+S to save the active tab
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && isDirty) {
        e.preventDefault();
        if (tab === 'zotero') save();
        else saveDbKeys();
      }
      if (e.key === 'Escape') guardedClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, tab]);

  useEffect(() => {
    apiFetch<{ mode: 'local' | 'web'; webUserId: string; hasApiKey: boolean }>('/api/zotero/config')
      .then((r) => { setMode(r.mode); setWebUserId(r.webUserId); setHasKey(r.hasApiKey); })
      .catch(() => {})
      .finally(() => setLoading(false));
    apiFetch<typeof dbKeys>('/api/databases/keys').then((r) => { if (r) { setDbKeys(r); setCrossrefMail(r.crossrefMailto.masked); } }).catch(() => {});
  }, []);

  const saveDbKeys = async () => {
    setSavingDb(true);
    try {
      const payload: Record<string, string> = {};
      if (scopusKey) payload.scopusApiKey = scopusKey;
      if (scopusInst) payload.scopusInstToken = scopusInst;
      if (wosKey) payload.wosApiKey = wosKey;
      if (crossrefMail) payload.crossrefMailto = crossrefMail;
      await apiFetch('/api/databases/keys', { method: 'PUT', body: JSON.stringify(payload) });
      const r = await apiFetch<typeof dbKeys>('/api/databases/keys');
      setDbKeys(r);
      setScopusKey(''); setScopusInst(''); setWosKey('');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'save failed');
    }
    setSavingDb(false);
  };

  const save = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      await apiFetch('/api/zotero/config', {
        method: 'PUT',
        body: JSON.stringify({ mode, webUserId: mode === 'web' ? webUserId : undefined, webApiKey: mode === 'web' && webApiKey ? webApiKey : undefined }),
      });
      onSaved();
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : 'failed' });
    }
    setSaving(false);
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    // Save first, then test
    try {
      await apiFetch('/api/zotero/config', {
        method: 'PUT',
        body: JSON.stringify({ mode, webUserId: mode === 'web' ? webUserId : undefined, webApiKey: mode === 'web' && webApiKey ? webApiKey : undefined }),
      });
      const r = await apiFetch<{ ok: boolean; collectionCount?: number; error?: string }>('/api/zotero/config/test');
      setTestResult({
        ok: r.ok,
        msg: r.ok ? `✓ ${r.collectionCount} collections` : `✗ ${r.error}`,
      });
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : 'test failed' });
    }
    setTesting(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) guardedClose(); }} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-on-surface flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-accent" />
            {isRTL ? 'الإعدادات' : 'Settings'}
            {isDirty && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/20 text-warning font-medium">
                {isRTL ? '● غير محفوظ' : '● Unsaved'}
              </span>
            )}
          </h2>
          <button onClick={guardedClose} className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-tertiary"><X className="h-4 w-4" /></button>
        </div>
        {/* Tabs */}
        <div className="flex items-center gap-1 px-5 pt-2 border-b border-border">
          {([{id:'zotero', ar:'Zotero', en:'Zotero'}, {id:'databases', ar:'قواعد بيانات', en:'Databases'}] as const).map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={cn('px-4 py-2 text-sm border-b-2 -mb-px',
              tab === t.id ? 'border-accent text-accent font-semibold' : 'border-transparent text-on-surface-tertiary')}>
              {isRTL ? t.ar : t.en}
            </button>
          ))}
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {tab === 'databases' ? (
            <div className="space-y-4">
              <p className="text-xs text-on-surface-tertiary bg-info/10 border border-info/30 rounded p-2">
                {isRTL
                  ? '🔒 المفاتيح تُحفظ على هذا الجهاز فقط في data/store.json. لا تُرفع لأي مكان.'
                  : '🔒 Keys stored locally only in data/store.json. Never uploaded anywhere.'}
              </p>

              {/* Scopus */}
              <div className="rounded-lg border border-border bg-surface-secondary p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-on-surface">Scopus (Elsevier)</h3>
                  {dbKeys?.scopusApiKey.configured && <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success">✓ {dbKeys.scopusApiKey.masked}</span>}
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-on-surface-tertiary block mb-1">API Key</label>
                  <input
                    type="password"
                    value={scopusKey}
                    onChange={(e) => setScopusKey(e.target.value)}
                    placeholder={dbKeys?.scopusApiKey.configured ? '(leave empty to keep current)' : 'paste from dev.elsevier.com'}
                    className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-on-surface focus:outline-none focus:border-accent font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-on-surface-tertiary block mb-1">
                    Inst Token {dbKeys?.scopusInstToken.configured && <span className="text-success">✓ {dbKeys.scopusInstToken.masked}</span>}
                  </label>
                  <input
                    type="password"
                    value={scopusInst}
                    onChange={(e) => setScopusInst(e.target.value)}
                    placeholder={dbKeys?.scopusInstToken.configured ? '(saved)' : 'optional, after UoB approves request'}
                    className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-on-surface focus:outline-none focus:border-accent font-mono"
                  />
                  <p className="text-[10px] text-on-surface-tertiary mt-1">
                    {isRTL ? 'بدون Inst Token: يعمل من شبكة UoB فقط. مع Inst Token: من أي مكان.' : 'Without Inst Token: works only from UoB network. With it: anywhere.'}
                  </p>
                </div>
              </div>

              {/* Web of Science */}
              <div className="rounded-lg border border-border bg-surface-secondary p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-on-surface">Web of Science (Clarivate)</h3>
                  {dbKeys?.wosApiKey.configured && <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success">✓ {dbKeys.wosApiKey.masked}</span>}
                </div>
                <input
                  type="password"
                  value={wosKey}
                  onChange={(e) => setWosKey(e.target.value)}
                  placeholder={dbKeys?.wosApiKey.configured ? '(leave empty to keep)' : 'from developer.clarivate.com'}
                  className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-on-surface focus:outline-none focus:border-accent font-mono"
                />
              </div>

              {/* Crossref */}
              <div className="rounded-lg border border-border bg-surface-secondary p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-on-surface">Crossref (polite pool)</h3>
                  {dbKeys?.crossrefMailto.configured && <span className="text-[10px] text-success">✓</span>}
                </div>
                <input
                  type="email"
                  value={crossrefMail}
                  onChange={(e) => setCrossrefMail(e.target.value)}
                  placeholder="your@email.com (faster + more reliable)"
                  className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-on-surface focus:outline-none focus:border-accent"
                />
              </div>

              {isDirty && (
                <p className="text-[11px] text-warning text-center">
                  {isRTL ? '● لديك تغييرات — احفظ من الزرّ بالأسفل (Ctrl+S)' : '● Unsaved changes — save from button below (Ctrl+S)'}
                </p>
              )}
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-on-surface-tertiary" /></div>
          ) : (
            <>
              {/* Mode chooser */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMode('local')}
                  className={cn('rounded-lg border p-3 text-start transition-all',
                    mode === 'local' ? 'border-accent bg-accent/5' : 'border-border bg-surface-secondary hover:border-border-hover')}
                >
                  <p className="text-sm font-semibold text-on-surface">🖥️ {isRTL ? 'محلي' : 'Local'}</p>
                  <p className="text-[11px] text-on-surface-tertiary mt-1">
                    {isRTL ? 'تطبيق Zotero على هذا الجهاز (سريع، يحتاج فتح التطبيق)' : 'Zotero desktop on this machine (fast, needs app open)'}
                  </p>
                </button>
                <button
                  onClick={() => setMode('web')}
                  className={cn('rounded-lg border p-3 text-start transition-all',
                    mode === 'web' ? 'border-accent bg-accent/5' : 'border-border bg-surface-secondary hover:border-border-hover')}
                >
                  <p className="text-sm font-semibold text-on-surface">🌐 {isRTL ? 'الويب' : 'Web'}</p>
                  <p className="text-[11px] text-on-surface-tertiary mt-1">
                    {isRTL ? 'api.zotero.org (يعمل من أي جهاز/جوال، يحتاج اشتراك Zotero)' : 'api.zotero.org (works on any device/phone, needs Zotero account)'}
                  </p>
                </button>
              </div>

              {/* Web credentials */}
              {mode === 'web' && (
                <div className="space-y-3 bg-info/5 border border-info/30 rounded-lg p-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-on-surface-tertiary block mb-1">
                      {isRTL ? 'معرّف المستخدم الرقمي (Zotero User ID)' : 'Numeric Zotero User ID'}
                    </label>
                    <input
                      value={webUserId}
                      onChange={(e) => setWebUserId(e.target.value)}
                      placeholder="e.g. 12345"
                      className="w-full bg-surface-secondary border border-border rounded px-2 py-1.5 text-sm text-on-surface focus:outline-none focus:border-accent"
                    />
                    <p className="text-[10px] text-on-surface-tertiary mt-1">
                      {isRTL
                        ? 'تجده في zotero.org/settings/keys (أعلى الصفحة، رقم بعد "Your userID for use in API calls is")'
                        : 'Find at zotero.org/settings/keys (top of page, "Your userID for use in API calls is N")'}
                    </p>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-on-surface-tertiary block mb-1">
                      {isRTL ? 'مفتاح القراءة' : 'Read API Key'} {hasKey && <span className="text-success">{isRTL ? '(محفوظ)' : '(saved)'}</span>}
                    </label>
                    <input
                      type="password"
                      value={webApiKey}
                      onChange={(e) => setWebApiKey(e.target.value)}
                      placeholder={hasKey ? '••••••••' : 'P9ABC...'}
                      className="w-full bg-surface-secondary border border-border rounded px-2 py-1.5 text-sm text-on-surface focus:outline-none focus:border-accent font-mono"
                    />
                    <p className="text-[10px] text-on-surface-tertiary mt-1">
                      {isRTL
                        ? '1. اذهب zotero.org/settings/keys → "Create new private key" → اسم: Ruhool → فعّل "Allow library access" + "Allow notes access" → Save → انسخ المفتاح'
                        : '1. Go to zotero.org/settings/keys → "Create new private key" → name: Ruhool → enable "Allow library access" + "Allow notes access" → Save → copy the key'}
                    </p>
                  </div>
                  <WriteApiKeyField isRTL={isRTL} />
                </div>
              )}

              {/* Test result */}
              {testResult && (
                <div className={cn('rounded px-3 py-2 text-sm', testResult.ok ? 'bg-success/10 text-success border border-success/30' : 'bg-error/10 text-error border border-error/30')}>
                  {testResult.msg}
                </div>
              )}
            </>
          )}
        </div>
        {/* Unified action bar — works for both tabs */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-2 bg-surface-secondary/50">
          {tab === 'zotero' ? (
            <button onClick={test} disabled={testing || saving || (mode === 'web' && (!webUserId || (!webApiKey && !hasKey)))} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-info/15 text-info disabled:opacity-50">
              {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {isRTL ? 'اختبر الاتصال' : 'Test connection'}
            </button>
          ) : <div />}
          <div className="flex items-center gap-2">
            <button onClick={guardedClose} disabled={saving || savingDb} className="px-4 py-1.5 rounded text-sm text-on-surface-secondary hover:bg-surface-tertiary disabled:opacity-50">
              {isRTL ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              onClick={tab === 'zotero' ? save : saveDbKeys}
              disabled={(saving || savingDb) || !isDirty}
              title={!isDirty ? (isRTL ? 'لا تغييرات للحفظ' : 'No changes to save') : 'Ctrl+S'}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded text-sm bg-accent text-on-accent disabled:opacity-50"
            >
              {(saving || savingDb) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {isRTL ? 'احفظ' : 'Save'}
              {isDirty && <span className="text-[10px] opacity-60 ms-1">Ctrl+S</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── External search row — links to academic databases ──────────────
// All URL patterns are public search endpoints (no API/auth needed). The user's
// existing institutional sessions (UoB) handle access automatically when they click.
function ExternalSearchRow({ query, doi, isRTL }: { query: string; doi?: string; isRTL: boolean }) {
  const q = encodeURIComponent(query);
  const dq = doi ? encodeURIComponent(doi) : '';
  const links = [
    { name: 'Scopus',          url: `https://www.scopus.com/results/results.uri?s=${q}`,                                    color: 'text-orange-400' },
    { name: 'WoS',             url: `https://www.webofscience.com/wos/woscc/basic-search?q=${q}`,                          color: 'text-purple-400' },
    { name: 'ASCE',            url: `https://ascelibrary.org/action/doSearch?AllField=${q}`,                                color: 'text-blue-400' },
    { name: 'Scholar',         url: doi ? `https://scholar.google.com/scholar?q=${dq}` : `https://scholar.google.com/scholar?q=${q}`, color: 'text-green-400' },
    { name: 'Sem.Scholar',     url: doi ? `https://www.semanticscholar.org/paper/DOI:${dq}` : `https://www.semanticscholar.org/search?q=${q}`, color: 'text-cyan-400' },
    { name: 'CrossRef',        url: doi ? `https://search.crossref.org/?q=${dq}` : `https://search.crossref.org/?q=${q}`,   color: 'text-pink-400' },
    { name: 'CORE',            url: `https://core.ac.uk/search?q=${q}`,                                                      color: 'text-emerald-400' },
    { name: 'arXiv',           url: `https://arxiv.org/search/?query=${q}&searchtype=all`,                                  color: 'text-red-400' },
  ];
  return (
    <div className="flex items-center gap-1 mt-1 flex-wrap">
      <span className="text-[9px] text-on-surface-tertiary uppercase tracking-wider">
        {isRTL ? 'ابحث في:' : 'Search in:'}
      </span>
      {links.map((l) => (
        <a
          key={l.name}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn('text-[9px] px-1.5 py-0.5 rounded bg-surface-tertiary hover:bg-surface text-on-surface-secondary hover:opacity-100', l.color)}
          title={`Search "${query.slice(0, 60)}" in ${l.name}`}
        >
          {l.name}
        </a>
      ))}
    </div>
  );
}

// ── Bulk-tag modal — apply tags + priority + status to many items at once ──
function BulkTagModal({ itemKeys, itemTitles, isRTL, onClose, onDone }: {
  itemKeys: string[]; itemTitles: string[]; isRTL: boolean;
  onClose: () => void; onDone: () => void;
}) {
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState<'' | 'to-read' | 'reading' | 'read' | 'skip'>('');
  const [rating, setRating] = useState<0 | 1 | 2 | 3>(0);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: itemKeys.length });

  const apply = async () => {
    setRunning(true);
    setProgress({ done: 0, total: itemKeys.length });
    const tagsList = [
      ...tags.split(',').map((t) => t.trim()).filter(Boolean),
      ...(status ? [status] : []),
      ...(rating > 0 ? ['⭐'.repeat(rating)] : []),
    ];
    let done = 0;
    for (const key of itemKeys) {
      try {
        await apiFetch('/api/zotero/items/apply-tags', {
          method: 'POST',
          body: JSON.stringify({ itemKey: key, addTags: tagsList }),
        });
      } catch {}
      done++;
      setProgress({ done, total: itemKeys.length });
    }
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-on-surface flex items-center gap-2">
            <TagIcon className="h-4 w-4 text-info" />
            {isRTL ? `صنّف ${itemKeys.length} عنصراً` : `Tag ${itemKeys.length} items`}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-tertiary"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="text-[11px] text-on-surface-tertiary max-h-20 overflow-y-auto bg-surface-secondary rounded p-2">
            {itemTitles.slice(0, 5).join(' • ')}{itemTitles.length > 5 && ` +${itemTitles.length - 5} more`}
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-on-surface-tertiary">{isRTL ? 'وسوم (مفصولة بفاصلة)' : 'Tags (comma-separated)'}</label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="BIM, Kuwait, methodology" className="w-full mt-1 bg-surface-secondary border border-border rounded px-2 py-1.5 text-sm text-on-surface focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-on-surface-tertiary">{isRTL ? 'حالة القراءة' : 'Reading status'}</label>
            <div className="flex items-center gap-1 mt-1">
              {(['', 'to-read', 'reading', 'read', 'skip'] as const).map((s) => (
                <button key={s} onClick={() => setStatus(s)} className={cn('text-[11px] px-2 py-1 rounded',
                  status === s ? 'bg-accent text-on-accent' : 'bg-surface-secondary text-on-surface-tertiary hover:bg-surface-tertiary')}>
                  {s === '' ? (isRTL ? '—' : 'none') : s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-on-surface-tertiary">{isRTL ? 'التقييم' : 'Rating'}</label>
            <div className="flex items-center gap-1 mt-1">
              {[0, 1, 2, 3].map((r) => (
                <button key={r} onClick={() => setRating(r as 0|1|2|3)} className={cn('text-base px-2 py-0.5 rounded',
                  rating === r ? 'bg-warning/20 text-warning' : 'text-on-surface-tertiary hover:bg-surface-secondary')}>
                  {r === 0 ? '—' : '⭐'.repeat(r)}
                </button>
              ))}
            </div>
          </div>
          {running && (
            <div className="bg-info/10 rounded p-2">
              <div className="flex items-center gap-2 text-xs text-info">
                <Loader2 className="h-3 w-3 animate-spin" />
                {progress.done} / {progress.total}
              </div>
              <div className="h-1.5 bg-surface-secondary rounded mt-2 overflow-hidden">
                <div className="h-full bg-info transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={running} className="px-4 py-1.5 rounded text-sm text-on-surface-secondary hover:bg-surface-tertiary disabled:opacity-50">
            {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
          <button onClick={apply} disabled={running || (!tags.trim() && !status && rating === 0)} className="flex items-center gap-1.5 px-4 py-1.5 rounded text-sm bg-info text-white disabled:opacity-50">
            {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            {isRTL ? 'طبّق' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Table view ──────────────────────────────────────────────────────
function TableView({ items, cols, isRTL, sortBy, sortDir, onSort, getCell, onRowClick, onSync, syncing, synced, onOpenRefs, onOpenSuggest, selected, onToggleSelect, onSelectAll, isAbstractOpen, toggleAbstract, onClassify, classifying }: {
  items: ZoteroItemRich[]; cols: ColumnDef[]; isRTL: boolean;
  sortBy: ColumnDef['id']; sortDir: SortDir; onSort: (id: ColumnDef['id']) => void;
  getCell: (item: ZoteroItemRich, id: ColumnDef['id']) => React.ReactNode;
  onRowClick: (item: ZoteroItemRich) => void;
  onSync: (item: ZoteroItemRich) => void;
  syncing: string | null; synced: Set<string>;
  onOpenRefs: (item: ZoteroItemRich) => void;
  onOpenSuggest: (item: ZoteroItemRich) => void;
  selected: Set<string>;
  onToggleSelect: (key: string) => void;
  onSelectAll: () => void;
  isAbstractOpen: (key: string) => boolean;
  toggleAbstract: (key: string) => void;
  onClassify: (item: ZoteroItemRich) => void;
  classifying: string | null;
}) {
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-surface-secondary z-10 border-b border-border">
        <tr>
          <th className="w-8 px-2 py-2">
            <input
              type="checkbox"
              checked={items.length > 0 && selected.size === items.length}
              onChange={onSelectAll}
              className="cursor-pointer"
            />
          </th>
          {cols.map((c) => (
            <th
              key={c.id}
              style={{ width: c.width, minWidth: c.width }}
              onClick={() => onSort(c.id)}
              className="text-start font-semibold text-on-surface px-3 py-2 cursor-pointer hover:text-accent select-none"
            >
              <div className="flex items-center gap-1">
                <span>{isRTL ? c.labelAr : c.labelEn}</span>
                {sortBy === c.id && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
              </div>
            </th>
          ))}
          <th className="w-32 text-center font-semibold text-on-surface px-2 py-2 sticky end-0 bg-surface-secondary">
            {isRTL ? 'إجراءات' : 'Actions'}
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const open = isAbstractOpen(item.itemKey);
          return (
          <>
          <tr
            key={item.itemKey}
            onClick={() => onRowClick(item)}
            className={cn('border-b border-border hover:bg-surface-tertiary cursor-pointer transition-colors',
              selected.has(item.itemKey) && 'bg-info/5')}
          >
            <td className="px-2 py-2 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={selected.has(item.itemKey)}
                onChange={() => onToggleSelect(item.itemKey)}
                className="cursor-pointer"
              />
              {item.abstractNote && (
                <button onClick={() => toggleAbstract(item.itemKey)} className="text-on-surface-tertiary hover:text-accent" title={isRTL ? 'الملخص' : 'Abstract'}>
                  {open ? <ChevronDown className="h-3 w-3" /> : (isRTL ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)}
                </button>
              )}
            </td>
            {cols.map((c) => (
              <td key={c.id} className="px-3 py-2 text-on-surface-secondary align-top truncate">
                <div className="line-clamp-2">{getCell(item, c.id)}</div>
              </td>
            ))}
            <td className="px-2 py-2 text-center sticky end-0 bg-surface" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-1 justify-center">
                <button
                  onClick={() => onOpenRefs(item)}
                  disabled={!item.doi}
                  title={isRTL ? 'المراجع والاستشهادات' : 'References & citations'}
                  className="p-1 rounded hover:bg-surface-tertiary text-on-surface-tertiary hover:text-accent disabled:opacity-30"
                ><Network className="h-3.5 w-3.5" /></button>
                <button
                  onClick={() => onOpenSuggest(item)}
                  title={isRTL ? 'اقتراحات ذكية' : 'AI suggestions'}
                  className="p-1 rounded hover:bg-surface-tertiary text-on-surface-tertiary hover:text-success"
                ><Sparkles className="h-3.5 w-3.5" /></button>
                <button
                  onClick={() => onClassify(item)}
                  disabled={classifying === item.itemKey}
                  title={isRTL ? 'صنّف بالذكاء (تاقات + أولوية)' : 'AI Classify (tags + priority)'}
                  className="p-1 rounded hover:bg-surface-tertiary text-on-surface-tertiary hover:text-info disabled:opacity-50"
                >
                  {classifying === item.itemKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TagIcon className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => onSync(item)}
                  disabled={syncing === item.itemKey || synced.has(item.itemKey)}
                  title={isRTL ? 'استورد للفولت' : 'Sync to vault'}
                  className={cn('p-1 rounded',
                    synced.has(item.itemKey) ? 'bg-success/15 text-success' : 'hover:bg-surface-tertiary text-on-surface-tertiary hover:text-accent',
                    'disabled:opacity-50')}
                >
                  {syncing === item.itemKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                   synced.has(item.itemKey) ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                </button>
              </div>
            </td>
          </tr>
          {open && item.abstractNote && (
            <tr key={item.itemKey + '_abs'} className="bg-info/5">
              <td colSpan={cols.length + 2} className="px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-info mb-1 flex items-center gap-1">
                  <FileText className="h-3 w-3" />{isRTL ? 'الملخص' : 'Abstract'}
                </p>
                <p className="text-xs text-on-surface-secondary leading-relaxed max-h-40 overflow-y-auto">
                  {item.abstractNote}
                </p>
              </td>
            </tr>
          )}
          </>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Cards view ──────────────────────────────────────────────────────
function CardsView({ items, isRTL, onRowClick, onSync, syncing, synced, onOpenRefs, onOpenSuggest, isAbstractOpen, toggleAbstract, onClassify, classifying }: {
  items: ZoteroItemRich[]; isRTL: boolean;
  onRowClick: (i: ZoteroItemRich) => void;
  onSync: (i: ZoteroItemRich) => void;
  syncing: string | null; synced: Set<string>;
  onOpenRefs: (i: ZoteroItemRich) => void;
  onOpenSuggest: (i: ZoteroItemRich) => void;
  isAbstractOpen: (key: string) => boolean;
  toggleAbstract: (key: string) => void;
  onClassify: (i: ZoteroItemRich) => void;
  classifying: string | null;
}) {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
      {items.map((item) => {
        const open = isAbstractOpen(item.itemKey);
        return (
        <div
          key={item.itemKey}
          onClick={() => onRowClick(item)}
          className="rounded-lg border border-border bg-surface-secondary p-4 hover:border-accent transition-colors cursor-pointer flex flex-col"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent uppercase tracking-wider">{item.itemType}</span>
            {item.rating > 0 && <span className="text-xs text-warning">{'⭐'.repeat(item.rating)}</span>}
          </div>
          <h3 className="text-sm font-semibold text-on-surface line-clamp-3 mb-1">{item.title}</h3>
          <p className="text-[11px] text-on-surface-tertiary mb-1">{item.authors}{item.year ? ` · ${item.year}` : ''}</p>
          {item.publicationTitle && <p className="text-[11px] italic text-on-surface-tertiary mb-2 line-clamp-1">{item.publicationTitle}</p>}
          {item.abstractNote && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); toggleAbstract(item.itemKey); }}
                className="text-[10px] text-accent hover:underline mb-1 self-start flex items-center gap-1"
              >
                {open ? <ChevronDown className="h-2.5 w-2.5" /> : (isRTL ? <ChevronLeft className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />)}
                {isRTL ? 'الملخص' : 'Abstract'}
              </button>
              {open ? (
                <div className="text-xs text-on-surface-secondary mb-3 max-h-40 overflow-y-auto bg-surface rounded p-2">
                  {item.abstractNote}
                </div>
              ) : (
                <p className="text-xs text-on-surface-secondary line-clamp-3 mb-3">{item.abstractNote}</p>
              )}
            </>
          )}
          <div className="flex items-center gap-1 flex-wrap mb-3">
            {item.tags.filter((t) => !/^⭐+$/.test(t)).slice(0, 4).map((t) => (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-tertiary text-on-surface-tertiary">{t}</span>
            ))}
          </div>
          <div className="flex items-center gap-1 mt-auto" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onOpenRefs(item)}
              disabled={!item.doi}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded hover:bg-surface-tertiary text-on-surface-secondary disabled:opacity-30"
            ><Network className="h-3 w-3" />{isRTL ? 'خريطة' : 'Map'}</button>
            <button
              onClick={() => onOpenSuggest(item)}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded hover:bg-surface-tertiary text-success"
            ><Sparkles className="h-3 w-3" />{isRTL ? 'اقتراحات' : 'Suggest'}</button>
            <button
              onClick={() => onClassify(item)}
              disabled={classifying === item.itemKey}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded hover:bg-surface-tertiary text-info disabled:opacity-50"
            >
              {classifying === item.itemKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <TagIcon className="h-3 w-3" />}
              {isRTL ? 'صنّف' : 'Classify'}
            </button>
            <button
              onClick={() => onSync(item)}
              disabled={syncing === item.itemKey || synced.has(item.itemKey)}
              className={cn('flex items-center gap-1 text-[11px] px-2 py-1 rounded ms-auto',
                synced.has(item.itemKey) ? 'bg-success/15 text-success' : 'bg-accent text-on-accent',
                'disabled:opacity-50')}
            >
              {syncing === item.itemKey ? <Loader2 className="h-3 w-3 animate-spin" /> :
               synced.has(item.itemKey) ? <Check className="h-3 w-3" /> : <Download className="h-3 w-3" />}
              {synced.has(item.itemKey) ? (isRTL ? 'جاهز' : 'Done') : (isRTL ? 'استورد' : 'Sync')}
            </button>
          </div>
        </div>
        );
      })}
    </div>
  );
}

// ── List view (compact) ─────────────────────────────────────────────
function ListView({ items, isRTL, onRowClick, onSync, syncing, synced, isAbstractOpen, toggleAbstract }: {
  items: ZoteroItemRich[]; isRTL: boolean;
  onRowClick: (i: ZoteroItemRich) => void;
  onSync: (i: ZoteroItemRich) => void;
  syncing: string | null; synced: Set<string>;
  isAbstractOpen: (key: string) => boolean;
  toggleAbstract: (key: string) => void;
}) {
  return (
    <div className="divide-y divide-border">
      {items.map((item) => {
        const open = isAbstractOpen(item.itemKey);
        return (
          <div key={item.itemKey} className="px-4 py-2 hover:bg-surface-tertiary">
            <div onClick={() => onRowClick(item)} className="cursor-pointer flex items-center gap-3">
              {item.abstractNote && (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleAbstract(item.itemKey); }}
                  className="text-on-surface-tertiary shrink-0"
                  title={isRTL ? 'الملخص' : 'Abstract'}
                >
                  {open ? <ChevronDown className="h-3 w-3" /> : (isRTL ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)}
                </button>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm text-on-surface truncate">{item.title}</h3>
                <p className="text-[11px] text-on-surface-tertiary truncate">
                  {item.authors}{item.year ? ` · ${item.year}` : ''}{item.publicationTitle ? ` · ${item.publicationTitle}` : ''}
                </p>
              </div>
              {item.rating > 0 && <span className="text-xs text-warning shrink-0">{'⭐'.repeat(item.rating)}</span>}
              <button
                onClick={(e) => { e.stopPropagation(); onSync(item); }}
                disabled={syncing === item.itemKey || synced.has(item.itemKey)}
                className={cn('shrink-0 p-1.5 rounded',
                  synced.has(item.itemKey) ? 'bg-success/15 text-success' : 'hover:bg-surface-tertiary text-on-surface-tertiary hover:text-accent',
                  'disabled:opacity-50')}
              >
                {syncing === item.itemKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                 synced.has(item.itemKey) ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
              </button>
            </div>
            {open && item.abstractNote && (
              <div className="mt-2 ms-6 text-xs text-on-surface-secondary leading-relaxed bg-surface rounded p-2 max-h-40 overflow-y-auto">
                {item.abstractNote}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Detail drawer — shows all fields + tags + actions ───────────────
function DetailDrawer({ item, isRTL, onClose, onOpenRefs, onOpenSuggest, onClassify, classifying }: {
  item: ZoteroItemRich; isRTL: boolean; onClose: () => void;
  onOpenRefs: () => void; onOpenSuggest: () => void;
  onClassify?: (item: ZoteroItemRich) => void;
  classifying?: string | null;
}) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 384;
    const saved = Number(localStorage.getItem('zotero.drawer.width'));
    return Number.isFinite(saved) && saved > 280 ? saved : 384;
  });
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: width };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = isRTL ? (ev.clientX - dragRef.current.startX) : (dragRef.current.startX - ev.clientX);
      const next = Math.max(320, Math.min(900, dragRef.current.startW + delta));
      setWidth(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      try { localStorage.setItem('zotero.drawer.width', String(width)); } catch {}
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  return (
    <div
      style={{ width: typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches ? `${width}px` : undefined }}
      className={cn('fixed inset-0 md:inset-auto md:top-0 md:bottom-0 bg-surface border-border shadow-2xl z-40 flex flex-col', isRTL ? 'md:left-0 md:border-r' : 'md:right-0 md:border-l')}
    >
      {/* Resize handle (desktop only) */}
      <div
        onMouseDown={onMouseDown}
        className={cn('hidden md:block absolute top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/30 active:bg-accent group',
          isRTL ? '-right-0.5' : '-left-0.5')}
        title={isRTL ? 'اسحب لتغيير العرض' : 'Drag to resize'}
      >
        <div className={cn('absolute top-1/2 -translate-y-1/2 w-1 h-12 bg-border group-hover:bg-accent rounded',
          isRTL ? 'right-0' : 'left-0')} />
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-secondary">
        <h2 className="text-sm font-semibold text-on-surface flex items-center gap-2">
          <Info className="h-4 w-4 text-accent" />
          {isRTL ? 'تفاصيل المصدر' : 'Source details'}
        </h2>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-tertiary"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs" dir={/[\u0600-\u06FF]/.test(item.title) ? 'rtl' : 'ltr'}>
        <h3 className="text-base font-bold text-on-surface">{item.title}</h3>
        {item.rating > 0 && <div className="text-warning">{'⭐'.repeat(item.rating)}</div>}

        <div className="grid grid-cols-2 gap-2">
          <Field label={isRTL ? 'النوع' : 'Type'}            value={item.itemType} />
          <Field label={isRTL ? 'السنة' : 'Year'}           value={item.year ? String(item.year) : ''} />
          <Field label={isRTL ? 'اللغة' : 'Language'}       value={item.language} />
          <Field label={isRTL ? 'الناشر' : 'Publisher'}     value={item.publisher} />
          <Field label={isRTL ? 'مجلّد' : 'Vol'}            value={item.volume} />
          <Field label={isRTL ? 'عدد' : 'Issue'}            value={item.issue} />
          <Field label={isRTL ? 'صفحات' : 'Pages'}          value={item.pages} />
          <Field label={isRTL ? 'ISBN/ISSN' : 'ISBN/ISSN'}  value={item.isbn || item.issn} />
        </div>

        <Field label={isRTL ? 'المؤلفون' : 'Authors'} value={item.authors} />
        <Field label={isRTL ? 'المجلّة/الكتاب' : 'Publication'} value={item.publicationTitle} />

        {item.doi && (
          <div className="flex items-center gap-1">
            <span className="text-on-surface-tertiary">DOI:</span>
            <a href={`https://doi.org/${item.doi}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline truncate">{item.doi}</a>
            <button onClick={() => navigator.clipboard.writeText(item.doi)} className="text-on-surface-tertiary hover:text-accent"><Copy className="h-3 w-3" /></button>
          </div>
        )}
        {item.url && (
          <div>
            <span className="text-on-surface-tertiary">URL: </span>
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline truncate">{item.url}</a>
          </div>
        )}

        {item.abstractNote && (
          <div>
            <p className="text-on-surface-tertiary font-semibold mb-1">{isRTL ? 'الملخص' : 'Abstract'}</p>
            <p className="text-on-surface-secondary leading-relaxed">{item.abstractNote}</p>
          </div>
        )}

        {item.tags.length > 0 && (
          <div>
            <p className="text-on-surface-tertiary font-semibold mb-1 flex items-center gap-1"><TagIcon className="h-3 w-3" />{isRTL ? 'الوسوم' : 'Tags'}</p>
            <div className="flex flex-wrap gap-1">
              {item.tags.map((t) => (
                <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-tertiary text-on-surface-secondary">{t}</span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
          <Field label={isRTL ? 'أُضيف' : 'Added'}         value={item.dateAdded?.slice(0, 10)} />
          <Field label={isRTL ? 'آخر تعديل' : 'Modified'} value={item.dateModified?.slice(0, 10)} />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border">
          <button onClick={onOpenRefs} disabled={!item.doi} className="flex-1 min-w-[140px] flex items-center justify-center gap-1 px-3 py-2 rounded bg-surface-secondary hover:bg-surface-tertiary text-on-surface text-xs disabled:opacity-30">
            <Network className="h-3.5 w-3.5" />
            {isRTL ? 'خريطة المراجع' : 'Reference map'}
          </button>
          <button onClick={onOpenSuggest} className="flex-1 min-w-[140px] flex items-center justify-center gap-1 px-3 py-2 rounded bg-success/10 hover:bg-success/20 text-success text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            {isRTL ? 'اقتراحات ذكية' : 'AI suggestions'}
          </button>
          {onClassify && (
            <button
              onClick={() => onClassify(item)}
              disabled={classifying === item.itemKey}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-1 px-3 py-2 rounded bg-info/10 hover:bg-info/20 text-info text-xs disabled:opacity-50"
            >
              {classifying === item.itemKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TagIcon className="h-3.5 w-3.5" />}
              {isRTL ? 'صنّف بالذكاء' : 'AI Classify'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-on-surface-tertiary text-[10px] uppercase tracking-wider">{label}</p>
      <p className="text-on-surface">{value}</p>
    </div>
  );
}

// ── Add source modal — creates in Zotero FIRST, then syncs ──────────
function AddModal({ isRTL, onClose, onAdded }: { isRTL: boolean; onClose: () => void; onAdded: () => void }) {
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [year, setYear] = useState('');
  const [doi, setDoi] = useState('');
  const [url, setUrl] = useState('');
  const [abstract, setAbstract] = useState('');
  const [itemType, setItemType] = useState('journalArticle');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/api/zotero/push', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(), authors: authors.trim() || undefined,
          year: year ? Number(year) : undefined, doi: doi.trim() || undefined,
          type: itemType, abstractNote: abstract.trim() || undefined,
        }),
      });
      onAdded();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'push failed');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-on-surface flex items-center gap-2">
            <Plus className="h-4 w-4 text-accent" />
            {isRTL ? 'أضف مصدراً جديداً' : 'Add new source'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-tertiary"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-on-surface-tertiary bg-info/10 border border-info/30 rounded px-3 py-2">
            {isRTL ? '💡 سيُنشأ العنصر في Zotero أولاً (المصدر الأساسي)، ثم يظهر هنا تلقائياً.' : '💡 Creates in Zotero first (source of truth), then appears here.'}
          </p>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-on-surface-tertiary">{isRTL ? 'النوع' : 'Type'}</label>
            <select value={itemType} onChange={(e) => setItemType(e.target.value)} className="w-full mt-1 bg-surface-secondary border border-border rounded px-2 py-1.5 text-sm text-on-surface">
              <option value="journalArticle">Journal Article</option>
              <option value="book">Book</option>
              <option value="bookSection">Book Section</option>
              <option value="thesis">Thesis</option>
              <option value="conferencePaper">Conference Paper</option>
              <option value="report">Report</option>
              <option value="webpage">Web Page</option>
              <option value="document">Document</option>
            </select>
          </div>
          <Input label={isRTL ? 'العنوان *' : 'Title *'} value={title} onChange={setTitle} />
          <Input label={isRTL ? 'المؤلفون (مفصولون بفاصلة)' : 'Authors (comma-separated)'} value={authors} onChange={setAuthors} placeholder="John Smith, Jane Doe" />
          <div className="grid grid-cols-2 gap-3">
            <Input label={isRTL ? 'السنة' : 'Year'} value={year} onChange={setYear} placeholder="2025" />
            <Input label="DOI" value={doi} onChange={setDoi} placeholder="10.1016/..." />
          </div>
          <Input label="URL" value={url} onChange={setUrl} placeholder="https://..." />
          <div>
            <label className="text-[10px] uppercase tracking-wider text-on-surface-tertiary">{isRTL ? 'ملخص' : 'Abstract'}</label>
            <textarea value={abstract} onChange={(e) => setAbstract(e.target.value)} rows={3} className="w-full mt-1 bg-surface-secondary border border-border rounded px-2 py-1.5 text-sm text-on-surface resize-none" />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 rounded text-sm text-on-surface-secondary hover:bg-surface-tertiary">
            {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
          <button onClick={submit} disabled={!title.trim() || saving} className="flex items-center gap-1.5 px-4 py-1.5 rounded text-sm bg-accent text-on-accent disabled:opacity-50">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            {isRTL ? 'أضف إلى Zotero' : 'Add to Zotero'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-on-surface-tertiary">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full mt-1 bg-surface-secondary border border-border rounded px-2 py-1.5 text-sm text-on-surface focus:outline-none focus:border-accent" />
    </div>
  );
}

// ── References / citations modal — uses OpenAlex + AI triage ─────────
interface RefItem {
  id?: string; title: string; year?: number; doi: string; authors: string;
  journal: string; citedByCount: number; abstract: string; type?: string;
  openAccessUrl?: string; openAlexUpdated?: string;
}
interface TriageRec { index: number; decision: 'add' | 'skip' | 'maybe'; priority: 'high' | 'medium' | 'low'; reason: string; }

function ReferencesModal({ item, isRTL, onClose }: { item: ZoteroItemRich; isRTL: boolean; onClose: () => void }) {
  const [refs, setRefs] = useState<RefItem[]>([]);
  const [cits, setCits] = useState<RefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'refs' | 'cits'>('refs');
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [triaging, setTriaging] = useState(false);
  const [triage, setTriage] = useState<Map<number, TriageRec>>(new Map());
  const [triageError, setTriageError] = useState<string | null>(null);
  const [triageGeneratedAt, setTriageGeneratedAt] = useState<string | null>(null);
  const [triageFromCache, setTriageFromCache] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string>('');

  // Try to load cached triage on first render (silent)
  useEffect(() => {
    if (!item.doi) return;
    apiFetch<{ cached: TriageRec[] | null; generatedAt?: string }>(`/api/zotero/triage/${encodeURIComponent(item.doi)}`)
      .then((r) => {
        if (r.cached && r.cached.length > 0) {
          const m = new Map<number, TriageRec>();
          for (const rec of r.cached) m.set(rec.index, rec);
          setTriage(m);
          setTriageGeneratedAt(r.generatedAt ?? null);
          setTriageFromCache(true);
        }
      })
      .catch(() => {});
  }, [item.doi]);

  const loadRefs = useCallback(() => {
    if (!item.doi) { setLoading(false); setError('No DOI'); return; }
    setLoading(true); setError(null);
    apiFetch<{ references: RefItem[]; citations: RefItem[]; fetchedAt: string }>(`/api/zotero/references?doi=${encodeURIComponent(item.doi)}`)
      .then((r) => { setRefs(r.references); setCits(r.citations); setFetchedAt(r.fetchedAt); })
      .catch((e) => setError(e instanceof Error ? e.message : 'failed'))
      .finally(() => setLoading(false));
  }, [item.doi]);

  useEffect(() => { loadRefs(); }, [loadRefs]);

  const importOne = async (w: RefItem) => {
    setImporting(w.doi || w.title);
    try {
      await apiFetch('/api/zotero/import-external', {
        method: 'POST',
        body: JSON.stringify({ title: w.title, authors: w.authors, year: w.year, doi: w.doi, url: '', abstractNote: w.abstract }),
      });
      setImported((prev) => new Set([...prev, w.doi || w.title]));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'import failed');
    }
    setImporting(null);
  };

  const list = tab === 'refs' ? refs : cits;

  const runTriage = async (force = false) => {
    setTriaging(true);
    setTriageError(null);
    if (force) setTriage(new Map());
    try {
      const r = await apiFetch<{ recommendations: TriageRec[]; fromCache?: boolean; generatedAt?: string }>('/api/zotero/references/triage', {
        method: 'POST',
        body: JSON.stringify({
          parent: { title: item.title, year: item.year, abstract: item.abstractNote, doi: item.doi },
          candidates: list.map((w) => ({
            title: w.title, authors: w.authors, year: w.year, doi: w.doi,
            journal: w.journal, abstract: w.abstract, citedByCount: w.citedByCount,
          })),
          force,
        }),
      });
      const m = new Map<number, TriageRec>();
      for (const rec of r.recommendations) m.set(rec.index, rec);
      setTriage(m);
      setTriageGeneratedAt(r.generatedAt ?? null);
      setTriageFromCache(!!r.fromCache);
    } catch (e) {
      setTriageError(e instanceof Error ? e.message : 'triage failed');
    }
    setTriaging(false);
  };

  const addAllRecommended = async () => {
    const toAdd = list.filter((_, i) => triage.get(i + 1)?.decision === 'add');
    if (!toAdd.length) return;
    if (!confirm(isRTL ? `إضافة ${toAdd.length} ورقة موصى بها إلى Zotero؟` : `Add ${toAdd.length} recommended papers to Zotero?`)) return;
    for (const w of toAdd) await importOne(w);
  };

  const decisionColor = (d?: string) =>
    d === 'add' ? 'border-success bg-success/5 text-success' :
    d === 'skip' ? 'border-error/40 bg-error/5 text-error opacity-70' :
    d === 'maybe' ? 'border-warning bg-warning/5 text-warning' :
    '';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-on-surface flex items-center gap-2">
              <Network className="h-4 w-4 text-accent" />
              {isRTL ? 'خريطة المراجع' : 'Reference Map'}
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-info/10 text-info font-normal">via OpenAlex</span>
            </h2>
            <p className="text-[11px] text-on-surface-tertiary truncate mt-0.5">{item.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-tertiary shrink-0"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-5 pt-3 flex items-center gap-1 border-b border-border">
          {([{id:'refs', ar:'المراجع (backward)', en:'References'}, {id:'cits', ar:'الاستشهادات (forward)', en:'Cited by'}] as const).map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setTriage(new Map()); }} className={cn('px-4 py-2 text-sm border-b-2 -mb-px', tab === t.id ? 'border-accent text-accent font-semibold' : 'border-transparent text-on-surface-tertiary')}>
              {isRTL ? t.ar : t.en}
              <span className="ms-2 text-xs">({t.id === 'refs' ? refs.length : cits.length})</span>
            </button>
          ))}
          <div className="flex-1" />
          {/* AI Triage controls + Refresh */}
          {list.length > 0 && (
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={loadRefs}
                disabled={loading}
                title={isRTL ? 'تحديث الأرقام من OpenAlex' : 'Refresh from OpenAlex'}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded hover:bg-surface-tertiary text-on-surface-tertiary disabled:opacity-30"
              >
                <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
                {isRTL ? 'تحديث' : 'Refresh'}
              </button>
              {triage.size > 0 && (
                <button
                  onClick={addAllRecommended}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-success text-white"
                  title={isRTL ? 'أضف كل ما موصى به' : 'Add all recommended'}
                >
                  <Check className="h-3 w-3" />
                  {isRTL ? `أضف الموصى بها (${[...triage.values()].filter((r) => r.decision === 'add').length})` : `Add recommended (${[...triage.values()].filter((r) => r.decision === 'add').length})`}
                </button>
              )}
              <button
                onClick={() => runTriage(triage.size > 0)}
                disabled={triaging}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-info/15 text-info hover:bg-info/25 disabled:opacity-50"
                title={triage.size > 0 ? (isRTL ? 'أعد التوليد (يستهلك توكنز جديدة)' : 'Re-run (uses new tokens)') : (isRTL ? 'فرز ذكي بناءً على Abstract' : 'AI triage based on abstracts')}
              >
                {triaging ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {triage.size > 0 ? (isRTL ? 'أعد الفرز' : 'Re-triage') : (isRTL ? 'فرز ذكي' : 'AI Triage')}
              </button>
            </div>
          )}
        </div>

        {/* Triage freshness indicator */}
        {triage.size > 0 && triageGeneratedAt && (
          <div className={cn('px-5 py-1.5 text-[10px] flex items-center gap-2 border-b border-border',
            triageFromCache ? 'bg-info/5 text-info' : 'bg-success/5 text-success')}>
            <Clock className="h-3 w-3" />
            {triageFromCache
              ? (isRTL ? '📌 الفرز محفوظ من قبل (لم يُستهلك توكنز) — تاريخ التوليد:' : '📌 Cached triage (no tokens used) — generated:')
              : (isRTL ? '✨ تم الفرز للتو:' : '✨ Just triaged:')}
            <span className="font-medium">{new Date(triageGeneratedAt).toLocaleString(isRTL ? 'ar' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>
        )}

        {/* Freshness indicator */}
        {fetchedAt && !loading && (
          <div className="px-5 py-1.5 bg-surface-secondary/50 border-b border-border text-[10px] text-on-surface-tertiary flex items-center gap-2">
            <Clock className="h-3 w-3" />
            {isRTL ? 'تم جلب الأرقام من OpenAlex في:' : 'Numbers fetched from OpenAlex at:'}
            <span className="text-on-surface-secondary">{new Date(fetchedAt).toLocaleString(isRTL ? 'ar' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-on-surface-tertiary" /></div>
          ) : error ? (
            <p className="text-center text-sm text-warning py-10">{error}</p>
          ) : list.length === 0 ? (
            <p className="text-center text-sm text-on-surface-tertiary py-10">
              {isRTL ? 'لا توجد بيانات من OpenAlex لهذه الورقة' : 'No data from OpenAlex for this item'}
            </p>
          ) : (
            <>
              {triageError && (
                <div className="mb-3 px-3 py-2 rounded bg-error/10 border border-error/30 text-xs text-error">
                  {triageError}
                </div>
              )}
              <div className="space-y-2">
                {list.map((w, idx) => {
                  const key = w.doi || w.title + idx;
                  const isImp = imported.has(w.doi || w.title);
                  const isLoad = importing === (w.doi || w.title);
                  const isExpanded = expandedKey === key;
                  const rec = triage.get(idx + 1);
                  return (
                    <div key={key} className={cn('rounded-lg border bg-surface-secondary p-3 transition-all',
                      rec ? decisionColor(rec.decision) : 'border-border')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2">
                            {rec && (
                              <span className={cn('text-[10px] px-2 py-0.5 rounded-full shrink-0 font-semibold whitespace-nowrap',
                                rec.decision === 'add' ? 'bg-success text-white' :
                                rec.decision === 'maybe' ? 'bg-warning text-white' :
                                'bg-error/40 text-white')}>
                                {rec.decision === 'add' ? (isRTL ? '✓ أضف' : '✓ Add') :
                                 rec.decision === 'maybe' ? (isRTL ? '? ربما' : '? Maybe') :
                                 (isRTL ? '✗ تخطّ' : '✗ Skip')}
                                {' · '}{rec.priority}
                              </span>
                            )}
                            <h4 className="text-sm font-semibold text-on-surface line-clamp-2 flex-1">{w.title}</h4>
                          </div>
                          <p className="text-[11px] text-on-surface-tertiary mt-1 line-clamp-1">
                            {w.authors}{w.year ? ` · ${w.year}` : ''}{w.journal ? ` · ${w.journal}` : ''}
                          </p>
                          <div className="flex items-center gap-3 text-[10px] text-on-surface-tertiary mt-1.5 flex-wrap">
                            {w.doi && <a href={`https://doi.org/${w.doi}`} target="_blank" rel="noopener noreferrer" className="hover:text-accent flex items-center gap-1"><ExternalLink className="h-2.5 w-2.5" />DOI</a>}
                            {w.openAccessUrl && <a href={w.openAccessUrl} target="_blank" rel="noopener noreferrer" className="hover:text-success flex items-center gap-1"><ExternalLink className="h-2.5 w-2.5" />PDF (OA)</a>}
                            {w.doi && (
                              <a
                                href={`https://libkey.io/libraries/2452/${encodeURIComponent(w.doi)}`}
                                target="_blank" rel="noopener noreferrer"
                                className="hover:text-info flex items-center gap-1 px-1.5 py-0.5 rounded bg-info/10 text-info"
                                title={isRTL ? 'فتح عبر LibKey بصلاحيات جامعة برمنغهام' : 'Open via LibKey (UoB access)'}
                              >
                                <BookMarked className="h-2.5 w-2.5" />LibKey
                              </a>
                            )}
                            <a
                              href={`https://librarysearch.bham.ac.uk/discovery/search?query=any,contains,${encodeURIComponent(w.doi || w.title)}&vid=44BIR_INST:BIRM_VU1`}
                              target="_blank" rel="noopener noreferrer"
                              className="hover:text-warning flex items-center gap-1 px-1.5 py-0.5 rounded bg-warning/10 text-warning"
                              title={isRTL ? 'بحث في FindBham' : 'Search FindBham'}
                            >
                              <Search className="h-2.5 w-2.5" />FindBham
                            </a>
                            <span>{w.citedByCount} {isRTL ? 'استشهاد' : 'citations'}</span>
                            {w.type && <span className="px-1.5 py-0.5 rounded bg-surface-tertiary">{w.type}</span>}
                          </div>
                          {/* External search databases */}
                          <ExternalSearchRow query={w.doi || w.title} doi={w.doi} isRTL={isRTL} />
                          {rec && (
                            <p className="text-[11px] text-on-surface-secondary italic mt-2 ps-3 border-s-2 border-current">
                              💡 {rec.reason}
                            </p>
                          )}
                          {w.abstract && (
                            <button
                              onClick={() => setExpandedKey(isExpanded ? null : key)}
                              className="text-[11px] text-accent hover:underline mt-1.5"
                            >
                              {isExpanded ? (isRTL ? '▲ إخفاء الملخص' : '▲ Hide abstract') : (isRTL ? '▼ عرض الملخص' : '▼ Show abstract')}
                            </button>
                          )}
                          {isExpanded && w.abstract && (
                            <p className="text-xs text-on-surface-secondary mt-2 leading-relaxed bg-surface rounded p-2 max-h-40 overflow-y-auto">
                              {w.abstract}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => importOne(w)}
                          disabled={isLoad || isImp}
                          className={cn('shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 rounded',
                            isImp ? 'bg-success/15 text-success' : 'bg-accent text-on-accent',
                            'disabled:opacity-50')}
                        >
                          {isLoad ? <Loader2 className="h-3 w-3 animate-spin" /> :
                           isImp ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                          {isImp ? (isRTL ? 'أُضيف' : 'Added') : (isRTL ? 'أضف إلى Zotero' : 'Add to Zotero')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AI suggestions modal — approve / defer / reject ──────────────────
interface SuggestItem { id?: string; title: string; year?: number; doi: string; authors: string; journal: string; citedByCount: number; reason: string; }

function SuggestionsModal({ item, isRTL, onClose }: { item: ZoteroItemRich; isRTL: boolean; onClose: () => void }) {
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decided, setDecided] = useState<Map<string, 'approved' | 'deferred' | 'rejected'>>(new Map());
  const [working, setWorking] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const load = useCallback(async (force = false) => {
    setLoading(true); setError(null);
    try {
      // Cache-first
      if (!force) {
        try {
          const cached = await apiFetch<{ cached: SuggestItem[] | null; generatedAt?: string }>(`/api/zotero/ai-suggest/${item.itemKey}`);
          if (cached.cached && cached.cached.length > 0) {
            setSuggestions(cached.cached);
            setGeneratedAt(cached.generatedAt ?? null);
            setFromCache(true);
            setLoading(false);
            return;
          }
        } catch {}
      }
      // Generate fresh
      const r = await apiFetch<{ suggestions: SuggestItem[]; fromCache?: boolean; generatedAt?: string }>('/api/zotero/ai-suggest', {
        method: 'POST',
        body: JSON.stringify({ doi: item.doi, title: item.title, itemKey: item.itemKey, force }),
      });
      setSuggestions(r.suggestions);
      setGeneratedAt(r.generatedAt ?? null);
      setFromCache(!!r.fromCache);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    }
    setLoading(false);
  }, [item.itemKey, item.doi, item.title]);

  useEffect(() => { load(false); }, [load]);

  const decide = async (s: SuggestItem, d: 'approved' | 'deferred' | 'rejected') => {
    const k = s.doi || s.title;
    setWorking(k);
    try {
      if (d === 'approved') {
        await apiFetch('/api/zotero/import-external', {
          method: 'POST',
          body: JSON.stringify({ title: s.title, authors: s.authors, year: s.year, doi: s.doi }),
        });
      } else if (d === 'deferred') {
        await apiFetch('/api/zotero/suggestions/defer', { method: 'POST', body: JSON.stringify({ items: [s] }) });
      } else {
        await apiFetch('/api/zotero/suggestions/reject', { method: 'POST', body: JSON.stringify({ doi: s.doi, title: s.title }) });
      }
      setDecided((prev) => new Map(prev).set(k, d));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'action failed');
    }
    setWorking(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-on-surface flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-success" />
              {isRTL ? 'اقتراحات ذكية' : 'AI Suggestions'}
            </h2>
            <p className="text-[11px] text-on-surface-tertiary truncate mt-0.5">
              {isRTL ? 'بناءً على:' : 'Based on:'} {item.title}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => load(true)}
              disabled={loading}
              title={isRTL ? 'تحديث (يستهلك تكلفة جديدة)' : 'Refresh (uses new tokens)'}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded hover:bg-surface-tertiary text-on-surface-tertiary disabled:opacity-30"
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
              {isRTL ? 'تحديث' : 'Refresh'}
            </button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-tertiary"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Freshness indicator */}
        {generatedAt && !loading && (
          <div className={cn('px-5 py-1.5 text-[10px] flex items-center gap-2 border-b border-border',
            fromCache ? 'bg-info/5 text-info' : 'bg-success/5 text-success')}>
            <Clock className="h-3 w-3" />
            {fromCache
              ? (isRTL ? '📌 من الذاكرة المحفوظة (بدون كلفة جديدة) — تاريخ التوليد:' : '📌 From cache (no new cost) — generated:')
              : (isRTL ? '✨ تم التوليد للتو:' : '✨ Just generated:')}
            <span className="font-medium">{new Date(generatedAt).toLocaleString(isRTL ? 'ar' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-on-surface-tertiary" /></div>
          ) : error ? (
            <p className="text-center text-sm text-warning py-10">{error}</p>
          ) : suggestions.length === 0 ? (
            <p className="text-center text-sm text-on-surface-tertiary py-10">
              {isRTL ? 'لا اقتراحات متاحة' : 'No suggestions available'}
            </p>
          ) : (
            <div className="space-y-2">
              {suggestions.map((s, idx) => {
                const k = s.doi || s.title + idx;
                const d = decided.get(k);
                const isWork = working === k;
                return (
                  <div key={k} className={cn('rounded-lg border p-3 transition-all',
                    d === 'approved' ? 'border-success bg-success/5' :
                    d === 'deferred' ? 'border-warning bg-warning/5' :
                    d === 'rejected' ? 'border-error/40 bg-error/5 opacity-60' :
                    'border-border bg-surface-secondary')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-on-surface line-clamp-2">{s.title}</h4>
                        <p className="text-[11px] text-on-surface-tertiary mt-1 line-clamp-1">{s.authors}{s.year ? ` · ${s.year}` : ''}{s.journal ? ` · ${s.journal}` : ''}</p>
                        <p className="text-[11px] text-info mt-1">💡 {s.reason}</p>
                        <div className="flex items-center gap-3 text-[10px] text-on-surface-tertiary mt-1">
                          {s.doi && <a href={`https://doi.org/${s.doi}`} target="_blank" rel="noopener noreferrer" className="hover:text-accent flex items-center gap-1"><ExternalLink className="h-2.5 w-2.5" />DOI</a>}
                          <span>{s.citedByCount} {isRTL ? 'استشهاد' : 'citations'}</span>
                        </div>
                      </div>
                      {d ? (
                        <span className={cn('text-[11px] px-2 py-1 rounded-full shrink-0',
                          d === 'approved' ? 'bg-success/20 text-success' :
                          d === 'deferred' ? 'bg-warning/20 text-warning' :
                          'bg-error/20 text-error')}>
                          {d === 'approved' ? (isRTL ? '✓ مضاف' : '✓ Added') :
                           d === 'deferred' ? (isRTL ? '⏳ مؤجّل' : '⏳ Deferred') :
                           (isRTL ? '✗ مرفوض' : '✗ Rejected')}
                        </span>
                      ) : (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => decide(s, 'approved')}
                            disabled={isWork}
                            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-success text-white disabled:opacity-50"
                          >
                            {isWork ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            {isRTL ? 'موافق' : 'Approve'}
                          </button>
                          <button
                            onClick={() => decide(s, 'deferred')}
                            disabled={isWork}
                            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-warning/20 text-warning disabled:opacity-50"
                          >
                            <Clock className="h-3 w-3" />
                            {isRTL ? 'تأجيل' : 'Defer'}
                          </button>
                          <button
                            onClick={() => decide(s, 'rejected')}
                            disabled={isWork}
                            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded hover:bg-error/10 text-on-surface-tertiary hover:text-error disabled:opacity-50"
                          >
                            <X className="h-3 w-3" />
                            {isRTL ? 'رفض' : 'Reject'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WriteApiKeyField({ isRTL }: { isRTL: boolean }) {
  const [writeKey, setWriteKey] = useState('');
  const [hasWriteKey, setHasWriteKey] = useState(false);
  const [writeEnabled, setWriteEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    apiFetch<{ hasWriteKey?: boolean; writeEnabled?: boolean }>('/api/zotero/config')
      .then((r) => { setHasWriteKey(!!r.hasWriteKey); setWriteEnabled(!!r.writeEnabled); })
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/zotero/write-config', {
        method: 'PUT',
        body: JSON.stringify({
          writeApiKey: writeKey.trim() || undefined,
          writeEnabled,
        }),
      });
      setHasWriteKey(hasWriteKey || !!writeKey.trim());
      setWriteKey('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-on-surface-tertiary block mb-1">
        {isRTL ? 'مفتاح الكتابة (اختياري)' : 'Write API key (optional)'}
        {hasWriteKey && <span className="text-success ms-1">{isRTL ? '(محفوظ)' : '(saved)'}</span>}
      </label>
      <div className="flex gap-2">
        <input
          type={showKey ? 'text' : 'password'}
          value={writeKey}
          onChange={(e) => setWriteKey(e.target.value)}
          placeholder={hasWriteKey ? '••••••••' : 'P9WRITEKEY...'}
          className="flex-1 bg-surface-secondary border border-border rounded px-2 py-1.5 text-sm text-on-surface focus:outline-none focus:border-accent font-mono"
        />
        <button
          type="button"
          onClick={() => setShowKey((v) => !v)}
          aria-pressed={showKey}
          className="px-2 rounded border border-border text-[10px] text-on-surface-secondary"
        >
          {isRTL ? (showKey ? 'إخفاء' : 'إظهار') : (showKey ? 'Hide' : 'Show')}
        </button>
      </div>
      <label className="inline-flex items-center gap-1.5 mt-2 text-[11px] text-on-surface-secondary cursor-pointer">
        <input
          type="checkbox"
          role="switch"
          aria-checked={writeEnabled}
          checked={writeEnabled}
          onChange={(e) => setWriteEnabled(e.target.checked)}
          className="accent-accent h-3 w-3"
        />
        <span>{isRTL ? 'فعّل الكتابة إلى Zotero (دفع التعديلات)' : 'Enable writes back to Zotero (push edits)'}</span>
      </label>
      <button
        type="button"
        onClick={save}
        disabled={saving || (!writeKey.trim() && !hasWriteKey)}
        className="mt-2 text-[10px] px-2 py-1 rounded bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-50"
      >
        {saving
          ? (isRTL ? 'جارِ الحفظ…' : 'Saving…')
          : (isRTL ? 'احفظ إعدادات الكتابة' : 'Save write settings')}
      </button>
      <p className="text-[10px] text-on-surface-tertiary mt-1">
        {isRTL
          ? 'مفتاح منفصل بصلاحية الكتابة. القراءة تعمل بدونه. يُستخدم فقط لدفع التعديلات من الـVault إلى Zotero.'
          : 'Separate write-scoped key. Reads work without it. Used only to push edits from vault back to Zotero.'}
      </p>
    </div>
  );
}
