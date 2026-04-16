'use client';

import { useEffect, useMemo, useState } from 'react';
import { Library as LibraryIcon, Search, Grid3x3, List, Archive, FolderPlus, Folder, Plus, X, Pencil, Trash2, CheckSquare, Square, FolderInput, Tag as TagIcon, Loader2, Check, ArchiveRestore } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { LibraryGrid, type LibraryItem, type LibraryCategory, type LibraryTag } from './library-grid';

type ViewMode = 'grid' | 'list';
type TypeFilter = 'all' | 'video' | 'image' | 'audio' | 'design' | 'document';
type SourceFilter = 'all' | 'demo' | 'studio-render' | 'studio-upload' | 'content';
type SortOrder = 'newest' | 'oldest' | 'name' | 'size';

export function LibraryPageView() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [categories, setCategories] = useState<LibraryCategory[]>([]);
  const [tags, setTags] = useState<LibraryTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('grid');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [sort, setSort] = useState<SortOrder>('newest');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewTag, setShowNewTag] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMenu, setBulkMenu] = useState<'category' | 'tags' | null>(null);

  // Category editing
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<LibraryCategory | null>(null);

  const loadTaxonomy = () => {
    apiFetch<LibraryCategory[]>('/api/library/categories').then(setCategories).catch(() => setCategories([]));
    apiFetch<LibraryTag[]>('/api/library/tags').then(setTags).catch(() => setTags([]));
  };

  const load = () => {
    const params = new URLSearchParams();
    if (typeFilter !== 'all') params.set('type', typeFilter);
    if (sourceFilter !== 'all') params.set('source', sourceFilter);
    if (showArchived) params.set('archived', 'true');
    if (categoryFilter !== 'all') params.set('categoryId', categoryFilter);
    if (tagFilter) params.set('tag', tagFilter);
    params.set('sort', sort);
    if (search.trim()) params.set('q', search.trim());
    setLoading(true);
    apiFetch<LibraryItem[]>(`/api/library?${params.toString()}`)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTaxonomy();
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, sourceFilter, sort, showArchived, categoryFilter, tagFilter]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Clear selection when filters change / items change set
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(items.map((i) => i.id));
      const next = new Set<string>();
      for (const id of prev) if (visible.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, video: 0, image: 0, audio: 0, design: 0, document: 0 };
    for (const it of items) c[it.type] = (c[it.type] || 0) + 1;
    return c;
  }, [items]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => setSelectedIds(new Set(items.map((i) => i.id)));
  const clearSelection = () => setSelectedIds(new Set());
  const allSelected = items.length > 0 && selectedIds.size === items.length;

  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.id)),
    [items, selectedIds],
  );

  const handleArchive = async (item: LibraryItem) => {
    try {
      await apiFetch(`/api/library/${encodeURIComponent(item.id)}/archive`, {
        method: 'PUT',
        body: JSON.stringify({ archived: !item.archived }),
      });
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (item: LibraryItem) => {
    try {
      await apiFetch(`/api/library/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssignCategory = async (item: LibraryItem, categoryId: string | null) => {
    try {
      await apiFetch(`/api/library/items/${encodeURIComponent(item.id)}/category`, {
        method: 'PUT',
        body: JSON.stringify({ categoryId }),
      });
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSetTags = async (item: LibraryItem, tagIds: string[]) => {
    try {
      await apiFetch(`/api/library/items/${encodeURIComponent(item.id)}/tags`, {
        method: 'PUT',
        body: JSON.stringify({ tags: tagIds }),
      });
      load();
    } catch (err) {
      console.error(err);
    }
  };

  // ───────────────── Bulk operations ─────────────────

  const bulkAssignCategory = async (categoryId: string | null) => {
    if (selectedItems.length === 0) return;
    setBulkBusy(true);
    try {
      for (const it of selectedItems) {
        await apiFetch(`/api/library/items/${encodeURIComponent(it.id)}/category`, {
          method: 'PUT',
          body: JSON.stringify({ categoryId }),
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBulkBusy(false);
      setBulkMenu(null);
      load();
    }
  };

  const bulkAddTag = async (tagId: string) => {
    if (selectedItems.length === 0) return;
    setBulkBusy(true);
    try {
      for (const it of selectedItems) {
        const existing = new Set(it.tagIds || []);
        if (existing.has(tagId)) continue;
        existing.add(tagId);
        await apiFetch(`/api/library/items/${encodeURIComponent(it.id)}/tags`, {
          method: 'PUT',
          body: JSON.stringify({ tags: Array.from(existing) }),
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBulkBusy(false);
      load();
    }
  };

  const bulkArchive = async (archived: boolean) => {
    if (selectedItems.length === 0) return;
    setBulkBusy(true);
    try {
      for (const it of selectedItems) {
        await apiFetch(`/api/library/${encodeURIComponent(it.id)}/archive`, {
          method: 'PUT',
          body: JSON.stringify({ archived }),
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBulkBusy(false);
      clearSelection();
      load();
    }
  };

  const bulkDelete = async () => {
    if (selectedItems.length === 0) return;
    const msg = isRTL
      ? `حذف ${selectedItems.length} عنصر نهائياً؟ لا يمكن التراجع.`
      : `Permanently delete ${selectedItems.length} items? This cannot be undone.`;
    if (!confirm(msg)) return;
    setBulkBusy(true);
    try {
      for (const it of selectedItems) {
        await apiFetch(`/api/library/${encodeURIComponent(it.id)}`, { method: 'DELETE' });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBulkBusy(false);
      clearSelection();
      load();
    }
  };

  // Extract raw video filename from library item URL (e.g. /api/videos/foo.mp4 → foo.mp4)
  const videoFilenameOf = (it: LibraryItem): string | null => {
    const m = it.url.match(/\/api\/videos\/([^/?#]+)/);
    return m ? m[1] : null;
  };

  const bulkExportZip = async () => {
    const files = selectedItems.map(videoFilenameOf).filter((x): x is string => !!x);
    if (files.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001'}/api/library/export-zip`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filenames: files }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('content-disposition')?.match(/filename="(.+?)"/)?.[1] || `ruhool-${Date.now()}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert((isRTL ? 'فشل التصدير: ' : 'Export failed: ') + (err instanceof Error ? err.message : ''));
    } finally { setBulkBusy(false); }
  };

  const bulkRerender = async () => {
    const files = selectedItems
      .filter((i) => i.type === 'video' && i.source !== 'demo')
      .map(videoFilenameOf)
      .filter((x): x is string => !!x);
    if (files.length === 0) return;
    if (!confirm(isRTL ? `سيتم إعادة إخراج ${files.length} فيديو بشكل متسلسل. متابعة؟` : `Re-render ${files.length} videos sequentially. Continue?`)) return;
    setBulkBusy(true);
    try {
      const start = await apiFetch<{ jobId: string; total: number }>('/api/library/rerender-batch', {
        method: 'POST', body: JSON.stringify({ filenames: files }),
      });
      const jobId = start.jobId;
      // Poll status
      while (true) {
        await new Promise((r) => setTimeout(r, 1500));
        const s = await apiFetch<{ done: number; total: number; current: string | null; status: string }>(`/api/library/rerender-status/${jobId}`);
        if (s.status === 'completed' || s.status === 'failed') break;
      }
      load();
    } catch (err) {
      alert((isRTL ? 'فشلت إعادة الإخراج: ' : 'Re-render failed: ') + (err instanceof Error ? err.message : ''));
    } finally { setBulkBusy(false); clearSelection(); }
  };

  const autoCaptionSelected = async () => {
    if (selectedItems.length !== 1) return;
    const fn = videoFilenameOf(selectedItems[0]);
    if (!fn) return;
    setBulkBusy(true);
    try {
      await apiFetch('/api/creative/auto-caption', {
        method: 'POST', body: JSON.stringify({ filename: fn }),
      });
      load();
    } catch (err) {
      alert((isRTL ? 'فشلت الترجمة التلقائية: ' : 'Auto-caption failed: ') + (err instanceof Error ? err.message : ''));
    } finally { setBulkBusy(false); clearSelection(); }
  };

  // Whether any selected item is archived → show unarchive action
  const anySelectedArchived = selectedItems.some((i) => i.archived);

  // ───────────────── Category CRUD ─────────────────

  const createCategory = async (name: { ar: string; en: string }, parentId: string | null, color?: string) => {
    try {
      await apiFetch('/api/library/categories', {
        method: 'POST',
        body: JSON.stringify({ name, parentId, color }),
      });
      loadTaxonomy();
    } catch (err) {
      console.error(err);
    }
  };

  const renameCategory = async (id: string, name: { ar: string; en: string }) => {
    await apiFetch(`/api/library/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
    loadTaxonomy();
  };

  const deleteCategoryDirect = async (id: string) => {
    await apiFetch(`/api/library/categories/${id}`, { method: 'DELETE' });
    if (categoryFilter === id) setCategoryFilter('all');
    loadTaxonomy();
  };

  const createTag = async (name: { ar: string; en: string }, color?: string) => {
    await apiFetch('/api/library/tags', { method: 'POST', body: JSON.stringify({ name, color }) });
    loadTaxonomy();
  };

  const deleteTag = async (id: string) => {
    if (!confirm(isRTL ? 'حذف التاق؟' : 'Delete tag?')) return;
    await apiFetch(`/api/library/tags/${id}`, { method: 'DELETE' });
    if (tagFilter === id) setTagFilter('');
    loadTaxonomy();
  };

  // Build category tree
  const rootCategories = useMemo(() => categories.filter((c) => !c.parentId), [categories]);
  const childrenOf = (pid: string) => categories.filter((c) => c.parentId === pid);

  const TYPE_TABS: { id: TypeFilter; ar: string; en: string }[] = [
    { id: 'all', ar: 'الكل', en: 'All' },
    { id: 'video', ar: 'فيديو', en: 'Video' },
    { id: 'image', ar: 'صور', en: 'Images' },
    { id: 'design', ar: 'تصاميم', en: 'Designs' },
    { id: 'audio', ar: 'صوت', en: 'Audio' },
    { id: 'document', ar: 'مستندات', en: 'Documents' },
  ];

  const SOURCE_OPTIONS: { id: SourceFilter; ar: string; en: string }[] = [
    { id: 'all', ar: 'كل المصادر', en: 'All sources' },
    { id: 'demo', ar: 'عروض توضيحية', en: 'Demos' },
    { id: 'studio-render', ar: 'الاستديو (تصيير)', en: 'Studio renders' },
    { id: 'studio-upload', ar: 'الاستديو (تحميلات)', en: 'Studio uploads' },
    { id: 'content', ar: 'المحتوى', en: 'Content' },
  ];

  const SORT_OPTIONS: { id: SortOrder; ar: string; en: string }[] = [
    { id: 'newest', ar: 'الأحدث', en: 'Newest' },
    { id: 'oldest', ar: 'الأقدم', en: 'Oldest' },
    { id: 'name', ar: 'الاسم', en: 'Name' },
    { id: 'size', ar: 'الحجم', en: 'Size' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[var(--radius-lg)] bg-accent/10 text-accent flex items-center justify-center">
            <LibraryIcon size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-on-surface">
              {isRTL ? 'المكتبة' : 'Library'}
            </h1>
            <p className="text-xs text-on-surface-tertiary">
              {isRTL
                ? 'كل مخرجاتك الإبداعية في مكان واحد'
                : 'All your creative outputs in one place'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-[var(--radius)] border border-border p-0.5">
          <button
            onClick={() => setView('grid')}
            className={cn(
              'p-1.5 rounded',
              view === 'grid' ? 'bg-accent text-on-accent' : 'text-on-surface-secondary hover:bg-surface-secondary'
            )}
            title={isRTL ? 'شبكة' : 'Grid'}
          >
            <Grid3x3 size={14} />
          </button>
          <button
            onClick={() => setView('list')}
            className={cn(
              'p-1.5 rounded',
              view === 'list' ? 'bg-accent text-on-accent' : 'text-on-surface-secondary hover:bg-surface-secondary'
            )}
            title={isRTL ? 'قائمة' : 'List'}
          >
            <List size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
        {/* Sidebar: Categories */}
        <aside className="space-y-3">
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-2">
            <div className="flex items-center justify-between px-2 py-1.5">
              <div className="text-xs font-semibold text-on-surface-secondary uppercase tracking-wide">
                {isRTL ? 'التصنيفات' : 'Categories'}
              </div>
              <button
                onClick={() => setShowNewCategory(true)}
                className="p-1 rounded hover:bg-surface-secondary text-on-surface-secondary"
                title={isRTL ? 'تصنيف جديد' : 'New category'}
              >
                <FolderPlus size={14} />
              </button>
            </div>
            <nav className="flex flex-col">
              <CategoryNavItem
                active={categoryFilter === 'all'}
                onClick={() => setCategoryFilter('all')}
                label={isRTL ? 'الكل' : 'All'}
                icon={<LibraryIcon size={13} />}
              />
              <CategoryNavItem
                active={categoryFilter === 'uncategorized'}
                onClick={() => setCategoryFilter('uncategorized')}
                label={isRTL ? 'غير مصنّف' : 'Uncategorized'}
                icon={<Folder size={13} />}
              />
              {rootCategories.map((cat) => (
                <div key={cat.id}>
                  <CategoryNavItem
                    active={categoryFilter === cat.id}
                    onClick={() => setCategoryFilter(cat.id)}
                    label={isRTL ? cat.name.ar : cat.name.en}
                    icon={<Folder size={13} style={{ color: cat.color }} />}
                    renaming={renamingId === cat.id}
                    onCommitRename={async (val) => {
                      const trimmed = val.trim();
                      if (trimmed && trimmed !== (isRTL ? cat.name.ar : cat.name.en)) {
                        await renameCategory(cat.id, isRTL ? { ar: trimmed, en: cat.name.en } : { ar: cat.name.ar, en: trimmed });
                      }
                      setRenamingId(null);
                    }}
                    onCancelRename={() => setRenamingId(null)}
                    onRename={!cat.builtin ? () => setRenamingId(cat.id) : undefined}
                    onDelete={!cat.builtin ? () => setDeletingCategory(cat) : undefined}
                  />
                  {childrenOf(cat.id).map((sub) => (
                    <CategoryNavItem
                      key={sub.id}
                      active={categoryFilter === sub.id}
                      onClick={() => setCategoryFilter(sub.id)}
                      label={isRTL ? sub.name.ar : sub.name.en}
                      icon={<Folder size={11} style={{ color: sub.color }} />}
                      indent
                      renaming={renamingId === sub.id}
                      onCommitRename={async (val) => {
                        const trimmed = val.trim();
                        if (trimmed && trimmed !== (isRTL ? sub.name.ar : sub.name.en)) {
                          await renameCategory(sub.id, isRTL ? { ar: trimmed, en: sub.name.en } : { ar: sub.name.ar, en: trimmed });
                        }
                        setRenamingId(null);
                      }}
                      onCancelRename={() => setRenamingId(null)}
                      onRename={!sub.builtin ? () => setRenamingId(sub.id) : undefined}
                      onDelete={!sub.builtin ? () => setDeletingCategory(sub) : undefined}
                    />
                  ))}
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main column */}
        <div className="space-y-4 min-w-0">
          {/* Search + filters row */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search
                size={14}
                className={cn(
                  'absolute top-1/2 -translate-y-1/2 text-on-surface-tertiary',
                  isRTL ? 'right-3' : 'left-3'
                )}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isRTL ? 'بحث…' : 'Search…'}
                className={cn(
                  'w-full h-9 rounded-[var(--radius)] bg-surface border border-border text-sm text-on-surface',
                  isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'
                )}
              />
            </div>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
              className="h-9 rounded-[var(--radius)] bg-surface border border-border text-sm text-on-surface px-2"
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{isRTL ? o.ar : o.en}</option>
              ))}
            </select>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOrder)}
              className="h-9 rounded-[var(--radius)] bg-surface border border-border text-sm text-on-surface px-2"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{isRTL ? o.ar : o.en}</option>
              ))}
            </select>

            <button
              onClick={() => setShowArchived(!showArchived)}
              className={cn(
                'h-9 px-3 rounded-[var(--radius)] border text-sm flex items-center gap-1.5 transition-colors',
                showArchived
                  ? 'bg-accent/10 text-accent border-accent/40'
                  : 'bg-surface text-on-surface-secondary border-border hover:border-accent/40'
              )}
            >
              <Archive size={14} />
              {isRTL ? 'المؤرشفة' : 'Archived'}
            </button>

            <button
              onClick={() => (allSelected ? clearSelection() : selectAllVisible())}
              disabled={items.length === 0}
              className={cn(
                'h-9 px-3 rounded-[var(--radius)] border text-sm flex items-center gap-1.5 transition-colors',
                allSelected
                  ? 'bg-accent/10 text-accent border-accent/40'
                  : 'bg-surface text-on-surface-secondary border-border hover:border-accent/40',
                items.length === 0 && 'opacity-50 cursor-not-allowed',
              )}
              title={allSelected ? (isRTL ? 'إلغاء التحديد' : 'Deselect all') : (isRTL ? 'تحديد الكل' : 'Select all')}
            >
              {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
              {allSelected
                ? (isRTL ? 'إلغاء التحديد' : 'Deselect')
                : (isRTL ? 'تحديد الكل' : 'Select all')}
            </button>
          </div>

          {/* Tag pills */}
          <div className="flex gap-1.5 flex-wrap items-center">
            <button
              onClick={() => setTagFilter('')}
              className={cn(
                'h-7 px-2.5 rounded-full text-xs border transition-colors',
                tagFilter === ''
                  ? 'bg-accent text-on-accent border-accent'
                  : 'bg-surface text-on-surface-secondary border-border hover:border-accent/40'
              )}
            >
              {isRTL ? 'كل التاقات' : 'All tags'}
            </button>
            {tags.map((t) => (
              <button
                key={t.id}
                onClick={() => setTagFilter(tagFilter === t.id ? '' : t.id)}
                className={cn(
                  'group h-7 px-2.5 rounded-full text-xs border transition-colors inline-flex items-center gap-1',
                  tagFilter === t.id
                    ? 'bg-accent text-on-accent border-accent'
                    : 'bg-surface text-on-surface-secondary border-border hover:border-accent/40'
                )}
                style={t.color && tagFilter !== t.id ? { borderColor: t.color, color: t.color } : undefined}
              >
                <span>{isRTL ? t.name.ar : t.name.en}</span>
                {!t.builtin && (
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); deleteTag(t.id); }}
                    className="opacity-0 group-hover:opacity-70 hover:opacity-100"
                    title={isRTL ? 'حذف' : 'Delete'}
                  >
                    <X size={10} />
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={() => setShowNewTag(true)}
              className="h-7 px-2 rounded-full text-xs border border-dashed border-border text-on-surface-tertiary hover:text-accent hover:border-accent/40 inline-flex items-center gap-1"
              title={isRTL ? 'تاق جديد' : 'New tag'}
            >
              <Plus size={12} />
              {isRTL ? 'تاق' : 'Tag'}
            </button>
          </div>

          {/* Type tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 border-b border-border">
            {TYPE_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTypeFilter(t.id)}
                className={cn(
                  'shrink-0 px-3 py-2 text-sm border-b-2 -mb-px transition-colors',
                  typeFilter === t.id
                    ? 'border-accent text-accent font-medium'
                    : 'border-transparent text-on-surface-secondary hover:text-on-surface'
                )}
              >
                {isRTL ? t.ar : t.en}
                {counts[t.id] > 0 && (
                  <span className="ms-1.5 text-[10px] text-on-surface-tertiary">({counts[t.id]})</span>
                )}
              </button>
            ))}
          </div>

          {/* Bulk action toolbar (sticky) */}
          {selectedIds.size > 0 && (
            <div
              className="sticky top-2 z-20 flex items-center gap-2 flex-wrap rounded-[var(--radius-lg)] border border-accent/40 bg-accent/10 backdrop-blur px-3 py-2 shadow-sm"
            >
              <span className="text-sm font-semibold text-accent">
                {isRTL ? `${selectedIds.size} عنصر مختار` : `${selectedIds.size} selected`}
              </span>
              {bulkBusy && <Loader2 size={14} className="animate-spin text-accent" />}
              <div className="flex-1" />

              {/* Move to category */}
              <div className="relative">
                <button
                  disabled={bulkBusy}
                  onClick={() => setBulkMenu(bulkMenu === 'category' ? null : 'category')}
                  className="h-8 px-3 rounded-[var(--radius)] bg-surface border border-border text-xs text-on-surface hover:border-accent/40 inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <FolderInput size={13} />
                  {isRTL ? 'نقل إلى تصنيف' : 'Move to category'}
                </button>
                {bulkMenu === 'category' && (
                  <div
                    data-bulk-menu
                    className={cn(
                      'absolute z-30 top-9 min-w-[220px] rounded-[var(--radius)] border border-border bg-surface shadow-xl py-1 max-h-[300px] overflow-auto',
                      isRTL ? 'start-0' : 'end-0',
                    )}
                    onMouseLeave={() => setBulkMenu(null)}
                  >
                    <button
                      onClick={() => bulkAssignCategory(null)}
                      className="w-full text-start px-3 py-1.5 text-xs text-on-surface-secondary hover:bg-surface-secondary flex items-center gap-2"
                    >
                      <Folder size={12} />
                      <span>{isRTL ? 'بدون تصنيف' : 'No category'}</span>
                    </button>
                    {categories.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => bulkAssignCategory(c.id)}
                        className="w-full text-start px-3 py-1.5 text-xs text-on-surface hover:bg-surface-secondary flex items-center gap-2"
                      >
                        <span className="inline-block w-2 h-2 rounded-full" style={{ background: c.color || 'transparent', border: '1px solid var(--border)' }} />
                        <span className={c.parentId ? 'ms-2' : ''}>{isRTL ? c.name.ar : c.name.en}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Edit tags */}
              <div className="relative">
                <button
                  disabled={bulkBusy}
                  onClick={() => setBulkMenu(bulkMenu === 'tags' ? null : 'tags')}
                  className="h-8 px-3 rounded-[var(--radius)] bg-surface border border-border text-xs text-on-surface hover:border-accent/40 inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <TagIcon size={13} />
                  {isRTL ? 'تعديل التاقات' : 'Edit tags'}
                </button>
                {bulkMenu === 'tags' && (
                  <div
                    data-bulk-menu
                    className={cn(
                      'absolute z-30 top-9 min-w-[240px] rounded-[var(--radius)] border border-border bg-surface shadow-xl p-2 max-h-[320px] overflow-auto space-y-1',
                      isRTL ? 'start-0' : 'end-0',
                    )}
                    onMouseLeave={() => setBulkMenu(null)}
                  >
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-on-surface-tertiary">
                      {isRTL ? 'إضافة تاق للعناصر المحددة' : 'Add tag to selected items'}
                    </div>
                    {tags.length === 0 && (
                      <div className="px-2 py-2 text-xs text-on-surface-tertiary">{isRTL ? 'لا توجد تاقات' : 'No tags'}</div>
                    )}
                    {tags.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => bulkAddTag(t.id)}
                        className="w-full text-start px-2 py-1 rounded text-xs flex items-center gap-2 hover:bg-surface-secondary text-on-surface"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full border"
                          style={{ background: t.color || 'transparent', borderColor: t.color || 'var(--border)' }}
                        />
                        <span>{isRTL ? t.name.ar : t.name.en}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Archive / unarchive */}
              <button
                disabled={bulkBusy}
                onClick={() => bulkArchive(!anySelectedArchived)}
                className="h-8 px-3 rounded-[var(--radius)] bg-surface border border-border text-xs text-on-surface hover:border-accent/40 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {anySelectedArchived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                {anySelectedArchived
                  ? (isRTL ? 'إلغاء أرشفة' : 'Unarchive')
                  : (isRTL ? 'أرشفة' : 'Archive')}
              </button>

              {/* Export ZIP — videos only */}
              <button
                disabled={bulkBusy || selectedItems.filter((i) => i.type === 'video').length === 0}
                onClick={() => bulkExportZip()}
                className="h-8 px-3 rounded-[var(--radius)] bg-surface border border-border text-xs text-on-surface hover:border-accent/40 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                📦 {isRTL ? 'تصدير ZIP' : 'Export ZIP'}
              </button>

              {/* Re-render batch — videos only */}
              <button
                disabled={bulkBusy || selectedItems.filter((i) => i.type === 'video' && i.source !== 'demo').length === 0}
                onClick={() => bulkRerender()}
                className="h-8 px-3 rounded-[var(--radius)] bg-surface border border-border text-xs text-on-surface hover:border-accent/40 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                🎬 {isRTL ? 'إعادة إخراج' : 'Re-render'}
              </button>

              {/* Auto-caption — single video selection */}
              <button
                disabled={bulkBusy || selectedItems.length !== 1 || selectedItems[0]?.type !== 'video'}
                onClick={() => autoCaptionSelected()}
                className="h-8 px-3 rounded-[var(--radius)] bg-surface border border-border text-xs text-on-surface hover:border-accent/40 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                ✓ {isRTL ? 'ترجمة تلقائية' : 'Auto captions'}
              </button>

              {/* Delete */}
              <button
                disabled={bulkBusy}
                onClick={bulkDelete}
                className="h-8 px-3 rounded-[var(--radius)] bg-red-500/10 border border-red-500/30 text-xs text-red-500 hover:bg-red-500/20 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 size={13} />
                {isRTL ? 'حذف' : 'Delete'}
              </button>

              <button
                onClick={clearSelection}
                className="h-8 w-8 rounded-[var(--radius)] text-on-surface-secondary hover:bg-surface inline-flex items-center justify-center"
                title={isRTL ? 'إغلاق' : 'Clear'}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Items */}
          {loading ? (
            <div className="py-16 text-center text-on-surface-tertiary text-sm">
              {isRTL ? 'جاري التحميل…' : 'Loading…'}
            </div>
          ) : (
            <LibraryGrid
              items={items}
              language={language}
              view={view}
              showActions
              onArchive={handleArchive}
              onDelete={handleDelete}
              categories={categories}
              tags={tags}
              onAssignCategory={handleAssignCategory}
              onSetTags={handleSetTags}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
            />
          )}
        </div>
      </div>

      {showNewCategory && (
        <NewCategoryModal
          isRTL={isRTL}
          categories={categories}
          onClose={() => setShowNewCategory(false)}
          onCreate={async (name, parentId, color) => {
            await createCategory(name, parentId, color);
            setShowNewCategory(false);
          }}
        />
      )}
      {showNewTag && (
        <NewTagModal
          isRTL={isRTL}
          onClose={() => setShowNewTag(false)}
          onCreate={async (name, color) => {
            await createTag(name, color);
            setShowNewTag(false);
          }}
        />
      )}
      {deletingCategory && (
        <DeleteCategoryModal
          isRTL={isRTL}
          category={deletingCategory}
          categories={categories}
          onClose={() => setDeletingCategory(null)}
          onConfirm={async (action) => {
            try {
              // Fetch items belonging to this category (incl. archived)
              const params = new URLSearchParams();
              params.set('categoryId', deletingCategory.id);
              params.set('archived', 'true');
              const catItems = await apiFetch<LibraryItem[]>(`/api/library?${params.toString()}`).catch(() => [] as LibraryItem[]);

              if (action.type === 'move') {
                for (const it of catItems) {
                  await apiFetch(`/api/library/items/${encodeURIComponent(it.id)}/category`, {
                    method: 'PUT',
                    body: JSON.stringify({ categoryId: action.targetCategoryId }),
                  });
                }
              } else if (action.type === 'archive') {
                for (const it of catItems) {
                  if (!it.archived) {
                    await apiFetch(`/api/library/${encodeURIComponent(it.id)}/archive`, {
                      method: 'PUT',
                      body: JSON.stringify({ archived: true }),
                    });
                  }
                }
              }

              await deleteCategoryDirect(deletingCategory.id);
            } catch (err) {
              console.error(err);
            } finally {
              setDeletingCategory(null);
              load();
            }
          }}
        />
      )}
    </div>
  );
}

function CategoryNavItem({
  active, onClick, label, icon, indent, onDelete, onRename,
  renaming, onCommitRename, onCancelRename,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
  indent?: boolean;
  onDelete?: () => void;
  onRename?: () => void;
  renaming?: boolean;
  onCommitRename?: (val: string) => void;
  onCancelRename?: () => void;
}) {
  const [draft, setDraft] = useState(label);
  useEffect(() => { if (renaming) setDraft(label); }, [renaming, label]);

  if (renaming) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-2 py-1 text-sm rounded bg-surface-secondary',
          indent && 'ms-4',
        )}
      >
        {icon}
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename?.(draft);
            else if (e.key === 'Escape') onCancelRename?.();
          }}
          onBlur={() => onCommitRename?.(draft)}
          className="flex-1 min-w-0 h-6 px-1.5 rounded bg-surface border border-border text-xs text-on-surface outline-none focus:border-accent"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer transition-colors',
        active ? 'bg-accent/10 text-accent font-medium' : 'text-on-surface-secondary hover:bg-surface-secondary hover:text-on-surface',
        indent && 'ms-4 text-xs'
      )}
      onClick={onClick}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {onRename && (
        <button
          onClick={(e) => { e.stopPropagation(); onRename(); }}
          className="opacity-0 group-hover:opacity-70 hover:opacity-100 text-on-surface-tertiary"
          title="rename"
        >
          <Pencil size={11} />
        </button>
      )}
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-70 hover:opacity-100 text-red-500"
          title="delete"
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}

function DeleteCategoryModal({
  isRTL, category, categories, onClose, onConfirm,
}: {
  isRTL: boolean;
  category: LibraryCategory;
  categories: LibraryCategory[];
  onClose: () => void;
  onConfirm: (action: { type: 'move'; targetCategoryId: string | null } | { type: 'archive' }) => Promise<void>;
}) {
  const [count, setCount] = useState<number | null>(null);
  const [mode, setMode] = useState<'move' | 'archive'>('move');
  const [targetCategoryId, setTargetCategoryId] = useState<string>(''); // '' => null (Uncategorized)
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('categoryId', category.id);
    params.set('archived', 'true');
    apiFetch<LibraryItem[]>(`/api/library?${params.toString()}`)
      .then((res) => setCount(res.length))
      .catch(() => setCount(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const otherCategories = categories.filter((c) => c.id !== category.id);
  const label = isRTL ? category.name.ar : category.name.en;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose} dir={isRTL ? 'rtl' : 'ltr'}>
      <div
        className="bg-surface border border-border rounded-[var(--radius-lg)] w-full max-w-md p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
            <Trash2 size={16} className="text-red-500" />
            {isRTL ? `حذف تصنيف '${label}'؟` : `Delete category '${label}'?`}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-secondary text-on-surface-secondary">
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-on-surface-secondary">
          {count === null
            ? (isRTL ? 'جاري حساب العناصر…' : 'Counting items…')
            : count === 0
              ? (isRTL ? 'لا يحتوي على أي عنصر.' : 'Contains no items.')
              : (isRTL ? `يحتوي على ${count} عنصر.` : `Contains ${count} item${count === 1 ? '' : 's'}.`)}
        </p>

        {count !== null && count > 0 && (
          <div className="space-y-2">
            <label className={cn(
              'flex items-start gap-2 p-2.5 rounded-[var(--radius)] border cursor-pointer transition-colors',
              mode === 'move' ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40',
            )}>
              <input
                type="radio"
                name="delmode"
                checked={mode === 'move'}
                onChange={() => setMode('move')}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1.5">
                <div className="text-sm font-medium text-on-surface">
                  {isRTL ? 'نقل العناصر إلى تصنيف آخر' : 'Move items to another category'}
                </div>
                {mode === 'move' && (
                  <select
                    value={targetCategoryId}
                    onChange={(e) => setTargetCategoryId(e.target.value)}
                    className="w-full h-8 px-2 rounded-[var(--radius)] bg-surface-secondary border border-border text-xs text-on-surface"
                  >
                    <option value="">{isRTL ? '— بدون تصنيف —' : '— Uncategorized —'}</option>
                    {otherCategories.map((c) => (
                      <option key={c.id} value={c.id}>{isRTL ? c.name.ar : c.name.en}</option>
                    ))}
                  </select>
                )}
              </div>
            </label>

            <label className={cn(
              'flex items-start gap-2 p-2.5 rounded-[var(--radius)] border cursor-pointer transition-colors',
              mode === 'archive' ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40',
            )}>
              <input
                type="radio"
                name="delmode"
                checked={mode === 'archive'}
                onChange={() => setMode('archive')}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-on-surface">
                  {isRTL ? 'نقل العناصر إلى الأرشيف' : 'Archive items'}
                </div>
                <div className="text-[11px] text-on-surface-tertiary">
                  {isRTL ? 'لن تظهر في العرض الافتراضي.' : 'They will not show in the default view.'}
                </div>
              </div>
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="h-8 px-3 rounded-[var(--radius)] border border-border text-sm text-on-surface-secondary hover:bg-surface-secondary disabled:opacity-50"
          >
            {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            disabled={busy || count === null}
            onClick={async () => {
              setBusy(true);
              try {
                if (count && count > 0) {
                  if (mode === 'move') {
                    await onConfirm({ type: 'move', targetCategoryId: targetCategoryId || null });
                  } else {
                    await onConfirm({ type: 'archive' });
                  }
                } else {
                  await onConfirm({ type: 'move', targetCategoryId: null });
                }
              } finally {
                setBusy(false);
              }
            }}
            className="h-8 px-3 rounded-[var(--radius)] bg-red-500 text-white text-sm hover:bg-red-600 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            {isRTL ? 'تأكيد الحذف' : 'Confirm delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewCategoryModal({
  isRTL, categories, onClose, onCreate,
}: {
  isRTL: boolean;
  categories: LibraryCategory[];
  onClose: () => void;
  onCreate: (name: { ar: string; en: string }, parentId: string | null, color?: string) => Promise<void>;
}) {
  const [ar, setAr] = useState('');
  const [en, setEn] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [color, setColor] = useState('#3b82f6');
  const canSubmit = ar.trim() || en.trim();

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-[var(--radius-lg)] w-full max-w-md p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-on-surface">
            {isRTL ? 'تصنيف جديد' : 'New category'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-secondary text-on-surface-secondary">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-on-surface-secondary">
            {isRTL ? 'الاسم بالعربية' : 'Arabic name'}
          </label>
          <input value={ar} onChange={(e) => setAr(e.target.value)} className="w-full h-9 px-2 rounded-[var(--radius)] bg-surface-secondary border border-border text-sm text-on-surface" dir="rtl" />
          <label className="block text-xs text-on-surface-secondary">
            {isRTL ? 'الاسم بالإنجليزية' : 'English name'}
          </label>
          <input value={en} onChange={(e) => setEn(e.target.value)} className="w-full h-9 px-2 rounded-[var(--radius)] bg-surface-secondary border border-border text-sm text-on-surface" />
          <label className="block text-xs text-on-surface-secondary">
            {isRTL ? 'تصنيف أب (اختياري)' : 'Parent category (optional)'}
          </label>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="w-full h-9 px-2 rounded-[var(--radius)] bg-surface-secondary border border-border text-sm text-on-surface"
          >
            <option value="">{isRTL ? '— بدون —' : '— None —'}</option>
            {categories.filter((c) => !c.parentId).map((c) => (
              <option key={c.id} value={c.id}>{isRTL ? c.name.ar : c.name.en}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <label className="text-xs text-on-surface-secondary">
              {isRTL ? 'لون' : 'Color'}
            </label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-12 rounded border border-border bg-transparent" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="h-8 px-3 rounded-[var(--radius)] border border-border text-sm text-on-surface-secondary hover:bg-surface-secondary">
            {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            disabled={!canSubmit}
            onClick={() => canSubmit && onCreate({ ar: ar.trim() || en.trim(), en: en.trim() || ar.trim() }, parentId || null, color)}
            className="h-8 px-3 rounded-[var(--radius)] bg-accent text-on-accent text-sm disabled:opacity-50"
          >
            {isRTL ? 'إنشاء' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewTagModal({
  isRTL, onClose, onCreate,
}: {
  isRTL: boolean;
  onClose: () => void;
  onCreate: (name: { ar: string; en: string }, color?: string) => Promise<void>;
}) {
  const [ar, setAr] = useState('');
  const [en, setEn] = useState('');
  const [color, setColor] = useState('#10b981');
  const canSubmit = ar.trim() || en.trim();

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-[var(--radius-lg)] w-full max-w-md p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-on-surface">
            {isRTL ? 'تاق جديد' : 'New tag'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-secondary text-on-surface-secondary">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-2">
          <input value={ar} onChange={(e) => setAr(e.target.value)} placeholder={isRTL ? 'الاسم بالعربية' : 'Arabic name'} className="w-full h-9 px-2 rounded-[var(--radius)] bg-surface-secondary border border-border text-sm text-on-surface" dir="rtl" />
          <input value={en} onChange={(e) => setEn(e.target.value)} placeholder={isRTL ? 'الاسم بالإنجليزية' : 'English name'} className="w-full h-9 px-2 rounded-[var(--radius)] bg-surface-secondary border border-border text-sm text-on-surface" />
          <div className="flex items-center gap-2">
            <label className="text-xs text-on-surface-secondary">{isRTL ? 'لون' : 'Color'}</label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-12 rounded border border-border bg-transparent" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 rounded-[var(--radius)] border border-border text-sm text-on-surface-secondary hover:bg-surface-secondary">
            {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            disabled={!canSubmit}
            onClick={() => canSubmit && onCreate({ ar: ar.trim() || en.trim(), en: en.trim() || ar.trim() }, color)}
            className="h-8 px-3 rounded-[var(--radius)] bg-accent text-on-accent text-sm disabled:opacity-50"
          >
            {isRTL ? 'إنشاء' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
