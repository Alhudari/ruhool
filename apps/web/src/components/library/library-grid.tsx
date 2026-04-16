'use client';

import { useState, useEffect } from 'react';
import { Play, Image as ImageIcon, Music, Paintbrush, FileText, Download, Archive, Trash2, ExternalLink, X, MoreVertical, Info, FolderInput, Tag as TagIcon, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/lib/api';

export interface LibraryCategory {
  id: string;
  name: { ar: string; en: string };
  parentId?: string | null;
  color?: string;
  builtin?: boolean;
}
export interface LibraryTag {
  id: string;
  name: { ar: string; en: string };
  color?: string;
  builtin?: boolean;
}

export interface LibraryItem {
  id: string;
  type: 'video' | 'image' | 'audio' | 'design' | 'document';
  source: string;
  title: string;
  description?: string;
  thumbnail?: string;
  url: string;
  size?: number;
  duration?: number;
  createdAt: string;
  archived: boolean;
  tags: string[];
  categoryId?: string | null;
  tagIds?: string[];
  metadata?: Record<string, unknown>;
}

const TYPE_ICON = {
  video: Play,
  image: ImageIcon,
  audio: Music,
  design: Paintbrush,
  document: FileText,
} as const;

const TYPE_LABEL_AR: Record<string, string> = {
  video: 'فيديو', image: 'صورة', audio: 'صوت', design: 'تصميم', document: 'مستند',
};
const TYPE_LABEL_EN: Record<string, string> = {
  video: 'Video', image: 'Image', audio: 'Audio', design: 'Design', document: 'Document',
};

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(iso: string, isRTL: boolean): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(isRTL ? 'ar' : 'en', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function formatDuration(s?: number): string {
  if (!s) return '';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

interface Props {
  items: LibraryItem[];
  limit?: number;
  showActions?: boolean;
  onItemClick?: (item: LibraryItem) => void;
  onArchive?: (item: LibraryItem) => void;
  onDelete?: (item: LibraryItem) => void;
  language: 'en' | 'ar';
  view?: 'grid' | 'list';
  emptyMessage?: string;
  categories?: LibraryCategory[];
  tags?: LibraryTag[];
  onAssignCategory?: (item: LibraryItem, categoryId: string | null) => void;
  onSetTags?: (item: LibraryItem, tagIds: string[]) => void;
  // Selection
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function LibraryGrid({
  items, limit, showActions = false, onItemClick, onArchive, onDelete,
  language, view = 'grid', emptyMessage,
  categories = [], tags = [], onAssignCategory, onSetTags,
  selectedIds, onToggleSelect,
}: Props) {
  const isRTL = language === 'ar';
  const displayItems = limit ? items.slice(0, limit) : items;
  const [preview, setPreview] = useState<LibraryItem | null>(null);
  const [details, setDetails] = useState<LibraryItem | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [subMenu, setSubMenu] = useState<'category' | 'tags' | null>(null);

  const selectionMode = !!onToggleSelect;
  const isSelected = (id: string) => selectedIds?.has(id) ?? false;

  const handleClick = (item: LibraryItem) => {
    if (selectionMode && (selectedIds?.size ?? 0) > 0) {
      onToggleSelect?.(item.id);
      return;
    }
    if (onItemClick) onItemClick(item);
    else setPreview(item);
  };

  const openItemMenu = (id: string) => {
    setMenuFor(id);
    setSubMenu(null);
  };
  const closeMenu = () => { setMenuFor(null); setSubMenu(null); };

  useEffect(() => {
    if (!menuFor) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-library-menu]')) closeMenu();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuFor]);

  if (displayItems.length === 0) {
    return (
      <div className="py-12 text-center text-on-surface-tertiary text-sm">
        {emptyMessage || (isRTL ? 'لا توجد عناصر بعد' : 'No items yet')}
      </div>
    );
  }

  const renderItemMenu = (item: LibraryItem) => {
    if (menuFor !== item.id) return null;
    if (subMenu === 'category' && onAssignCategory) {
      return (
        <div data-library-menu className={cn('absolute z-30 top-8 min-w-[200px] rounded-[var(--radius)] border border-border bg-surface shadow-xl py-1 max-h-[300px] overflow-auto', isRTL ? 'start-2' : 'end-2')}>
          <button
            onClick={(e) => { e.stopPropagation(); onAssignCategory(item, null); closeMenu(); }}
            className="w-full text-start px-3 py-1.5 text-xs text-on-surface-secondary hover:bg-surface-secondary flex items-center gap-2"
          >
            {!item.categoryId && <Check size={12} />}
            <span>{isRTL ? 'بدون تصنيف' : 'No category'}</span>
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={(e) => { e.stopPropagation(); onAssignCategory(item, c.id); closeMenu(); }}
              className="w-full text-start px-3 py-1.5 text-xs text-on-surface hover:bg-surface-secondary flex items-center gap-2"
            >
              {item.categoryId === c.id && <Check size={12} className="text-accent" />}
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: c.color || 'transparent', border: '1px solid var(--border)' }} />
              <span className={c.parentId ? 'ms-2' : ''}>{isRTL ? c.name.ar : c.name.en}</span>
            </button>
          ))}
        </div>
      );
    }
    if (subMenu === 'tags' && onSetTags) {
      const current = new Set(item.tagIds || []);
      return (
        <div data-library-menu className={cn('absolute z-30 top-8 min-w-[220px] rounded-[var(--radius)] border border-border bg-surface shadow-xl p-2 max-h-[300px] overflow-auto space-y-1', isRTL ? 'start-2' : 'end-2')}>
          {tags.length === 0 && (
            <div className="px-2 py-1 text-xs text-on-surface-tertiary">{isRTL ? 'لا توجد تاقات' : 'No tags'}</div>
          )}
          {tags.map((t) => {
            const on = current.has(t.id);
            return (
              <button
                key={t.id}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = new Set(current);
                  if (on) next.delete(t.id); else next.add(t.id);
                  onSetTags(item, Array.from(next));
                }}
                className={cn('w-full text-start px-2 py-1 rounded text-xs flex items-center gap-2', on ? 'bg-accent/10 text-accent' : 'hover:bg-surface-secondary text-on-surface')}
              >
                <span className={cn('w-3 h-3 rounded border', on ? 'bg-accent border-accent' : 'border-border')}>
                  {on && <Check size={10} className="text-on-accent" />}
                </span>
                <span>{isRTL ? t.name.ar : t.name.en}</span>
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <div data-library-menu className={cn('absolute z-30 top-8 min-w-[180px] rounded-[var(--radius)] border border-border bg-surface shadow-xl py-1', isRTL ? 'start-2' : 'end-2')}>
        <button
          onClick={(e) => { e.stopPropagation(); setDetails(item); closeMenu(); }}
          className="w-full text-start px-3 py-1.5 text-xs text-on-surface hover:bg-surface-secondary flex items-center gap-2"
        >
          <Info size={12} /> {isRTL ? 'تفاصيل' : 'Details'}
        </button>
        {onAssignCategory && (
          <button
            onClick={(e) => { e.stopPropagation(); setSubMenu('category'); }}
            className="w-full text-start px-3 py-1.5 text-xs text-on-surface hover:bg-surface-secondary flex items-center gap-2"
          >
            <FolderInput size={12} /> {isRTL ? 'نقل لتصنيف' : 'Move to category'}
          </button>
        )}
        {onSetTags && (
          <button
            onClick={(e) => { e.stopPropagation(); setSubMenu('tags'); }}
            className="w-full text-start px-3 py-1.5 text-xs text-on-surface hover:bg-surface-secondary flex items-center gap-2"
          >
            <TagIcon size={12} /> {isRTL ? 'تعديل التاقات' : 'Edit tags'}
          </button>
        )}
        <div className="my-1 border-t border-border" />
        <a
          href={`${API_BASE_URL}${item.url}`}
          download
          onClick={(e) => { e.stopPropagation(); closeMenu(); }}
          className="w-full text-start px-3 py-1.5 text-xs text-on-surface hover:bg-surface-secondary flex items-center gap-2"
        >
          <Download size={12} /> {isRTL ? 'تحميل' : 'Download'}
        </a>
        {onArchive && !item.archived && (
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(item); closeMenu(); }}
            className="w-full text-start px-3 py-1.5 text-xs text-on-surface hover:bg-surface-secondary flex items-center gap-2"
          >
            <Archive size={12} /> {isRTL ? 'أرشفة' : 'Archive'}
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(item); closeMenu(); }}
            className="w-full text-start px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10 flex items-center gap-2"
          >
            <Trash2 size={12} /> {isRTL ? 'حذف' : 'Delete'}
          </button>
        )}
      </div>
    );
  };

  const renderItemTagBadges = (item: LibraryItem) => {
    if (!item.tagIds?.length) return null;
    return item.tagIds.slice(0, 3).map((tid) => {
      const t = tags.find((x) => x.id === tid);
      if (!t) return null;
      return (
        <span
          key={tid}
          className="text-[9px] px-1 rounded border"
          style={{ borderColor: t.color || 'var(--border)', color: t.color || 'var(--on-surface-secondary)' }}
        >
          {isRTL ? t.name.ar : t.name.en}
        </span>
      );
    });
  };

  const renderSelectCheckbox = (item: LibraryItem, variant: 'overlay' | 'inline') => {
    if (!selectionMode) return null;
    const sel = isSelected(item.id);
    const base = 'w-5 h-5 rounded border flex items-center justify-center cursor-pointer transition-all';
    const colors = sel
      ? 'bg-accent border-accent text-on-accent'
      : variant === 'overlay'
        ? 'bg-black/60 border-white/50 text-white backdrop-blur-sm hover:bg-black/80'
        : 'bg-surface border-border text-on-surface-secondary hover:border-accent/60';
    const visibility = sel
      ? 'opacity-100'
      : variant === 'overlay'
        ? 'opacity-0 group-hover:opacity-100'
        : 'opacity-60 group-hover:opacity-100';
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleSelect?.(item.id); }}
        className={cn(base, colors, visibility, 'transition-opacity')}
        title={isRTL ? 'تحديد' : 'Select'}
        aria-pressed={sel}
      >
        {sel && <Check size={12} strokeWidth={3} />}
      </button>
    );
  };

  if (view === 'list') {
    return (
      <>
        <div className="divide-y divide-border border border-border rounded-[var(--radius-lg)] overflow-hidden">
          {displayItems.map((item) => {
            const Icon = TYPE_ICON[item.type] || FileText;
            const sel = isSelected(item.id);
            return (
              <div
                key={item.id}
                className={cn(
                  'group relative flex items-center gap-3 px-3 py-2.5 transition-colors cursor-pointer',
                  sel ? 'bg-accent/10' : 'hover:bg-surface-secondary',
                )}
                onClick={() => handleClick(item)}
              >
                {selectionMode && (
                  <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                    {renderSelectCheckbox(item, 'inline')}
                  </div>
                )}
                <div className="w-10 h-10 rounded bg-surface-secondary flex items-center justify-center shrink-0 overflow-hidden">
                  {item.thumbnail ? (
                    <img src={`${API_BASE_URL}${item.thumbnail}`} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Icon size={18} className="text-on-surface-tertiary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-on-surface truncate">{item.title}</div>
                  <div className="text-xs text-on-surface-tertiary flex gap-2 flex-wrap items-center">
                    <span className="px-1.5 rounded bg-accent/10 text-accent">
                      {isRTL ? TYPE_LABEL_AR[item.type] : TYPE_LABEL_EN[item.type]}
                    </span>
                    <span>{formatDate(item.createdAt, isRTL)}</span>
                    {item.size && <span>{formatBytes(item.size)}</span>}
                    {typeof item.metadata?.costUSD === 'number' && (item.metadata.costUSD as number) > 0 && (
                      <span className="px-1.5 rounded bg-emerald-500/10 text-emerald-600 font-mono">
                        ${(item.metadata.costUSD as number).toFixed(4)}
                      </span>
                    )}
                    {renderItemTagBadges(item)}
                  </div>
                </div>
                {showActions && (
                  <div className="flex items-center gap-1 shrink-0 relative" onClick={(e) => e.stopPropagation()}>
                    <a
                      href={`${API_BASE_URL}${item.url}`}
                      download
                      className="p-1.5 rounded hover:bg-surface text-on-surface-secondary"
                      title={isRTL ? 'تحميل' : 'Download'}
                    >
                      <Download size={14} />
                    </a>
                    <button
                      onClick={() => setDetails(item)}
                      className="p-1.5 rounded hover:bg-surface text-on-surface-secondary"
                      title={isRTL ? 'تفاصيل' : 'Details'}
                    >
                      <Info size={14} />
                    </button>
                    <button
                      data-library-menu
                      onClick={() => openItemMenu(item.id)}
                      className="p-1.5 rounded hover:bg-surface text-on-surface-secondary"
                      title={isRTL ? 'خيارات' : 'More'}
                    >
                      <MoreVertical size={14} />
                    </button>
                    {renderItemMenu(item)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {preview && <PreviewModal item={preview} onClose={() => setPreview(null)} language={language} />}
        {details && <DetailsModal item={details} onClose={() => setDetails(null)} language={language} categories={categories} tags={tags} />}
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {displayItems.map((item) => {
          const Icon = TYPE_ICON[item.type] || FileText;
          const sel = isSelected(item.id);
          return (
            <div
              key={item.id}
              className={cn(
                'group relative rounded-[var(--radius-lg)] border bg-surface overflow-hidden hover:shadow-md transition-all cursor-pointer',
                sel ? 'border-accent ring-2 ring-accent/40' : 'border-border hover:border-accent/40',
              )}
              onClick={() => handleClick(item)}
            >
              <div className="aspect-square bg-surface-secondary flex items-center justify-center relative overflow-hidden">
                {item.type === 'image' && item.thumbnail ? (
                  <img src={`${API_BASE_URL}${item.thumbnail}`} alt="" className="w-full h-full object-cover" />
                ) : item.type === 'video' ? (
                  <video src={`${API_BASE_URL}${item.url}`} className="w-full h-full object-cover" muted preload="metadata" />
                ) : (
                  <Icon size={32} className="text-on-surface-tertiary" />
                )}
                {selectionMode && (
                  <div className="absolute top-2 start-2 z-10" onClick={(e) => e.stopPropagation()}>
                    {renderSelectCheckbox(item, 'overlay')}
                  </div>
                )}
                <div className={cn(
                  'absolute px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/60 text-white backdrop-blur-sm flex items-center gap-1',
                  selectionMode ? 'top-2 start-9' : 'top-2 start-2',
                )}>
                  <Icon size={10} />
                  {isRTL ? TYPE_LABEL_AR[item.type] : TYPE_LABEL_EN[item.type]}
                </div>
                {showActions && (
                  <div
                    className="absolute top-2 end-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => setDetails(item)}
                      className="p-1.5 rounded bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
                      title={isRTL ? 'تفاصيل' : 'Details'}
                    >
                      <Info size={12} />
                    </button>
                    <button
                      data-library-menu
                      onClick={() => openItemMenu(item.id)}
                      className="p-1.5 rounded bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
                      title={isRTL ? 'خيارات' : 'More'}
                    >
                      <MoreVertical size={12} />
                    </button>
                    {renderItemMenu(item)}
                  </div>
                )}
              </div>
              <div className="p-2.5">
                <div className="text-xs font-medium text-on-surface truncate">{item.title}</div>
                <div className="text-[10px] text-on-surface-tertiary mt-0.5 flex gap-2 items-center flex-wrap">
                  {item.source === 'demo' && (typeof item.metadata?.tool === 'string') && (
                    <span className="px-1.5 rounded bg-amber-500/15 text-amber-500 font-mono">
                      {item.metadata.tool as string}
                    </span>
                  )}
                  <span>{formatDate(item.createdAt, isRTL)}</span>
                  {item.size && <span>{formatBytes(item.size)}</span>}
                  {typeof item.metadata?.costUSD === 'number' && (item.metadata.costUSD as number) > 0 && (
                    <span className="px-1.5 rounded bg-emerald-500/15 text-emerald-600 font-mono font-semibold">
                      ${(item.metadata.costUSD as number).toFixed(4)}
                    </span>
                  )}
                </div>
                {item.tagIds && item.tagIds.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {renderItemTagBadges(item)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {preview && <PreviewModal item={preview} onClose={() => setPreview(null)} language={language} />}
      {details && <DetailsModal item={details} onClose={() => setDetails(null)} language={language} categories={categories} tags={tags} />}
    </>
  );
}

function PreviewModal({ item, onClose, language }: { item: LibraryItem; onClose: () => void; language: 'en' | 'ar' }) {
  const isRTL = language === 'ar';
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <button
        onClick={onClose}
        className={cn('fixed top-4 z-[60] p-3 rounded-full bg-white/10 backdrop-blur hover:bg-white/20 text-white transition-colors shadow-lg', isRTL ? 'left-4' : 'right-4')}
        title={isRTL ? 'إغلاق (ESC)' : 'Close (ESC)'}
      >
        <X size={22} />
      </button>
      <div className="relative max-w-4xl w-full max-h-[90vh] bg-surface rounded-[var(--radius-lg)] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-on-surface truncate">{item.title}</div>
            <div className="text-xs text-on-surface-tertiary flex gap-2 items-center flex-wrap">
              <span>{isRTL ? TYPE_LABEL_AR[item.type] : TYPE_LABEL_EN[item.type]}</span>
              <span>· {formatBytes(item.size)}</span>
              {typeof item.metadata?.costUSD === 'number' && (item.metadata.costUSD as number) > 0 && (
                <span className="px-1.5 rounded bg-emerald-500/10 text-emerald-600 font-mono font-semibold">
                  · ${(item.metadata.costUSD as number).toFixed(4)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href={`${API_BASE_URL}${item.url}`} target="_blank" rel="noreferrer" className="p-2 rounded hover:bg-surface-secondary text-on-surface-secondary" title={isRTL ? 'فتح في نافذة جديدة' : 'Open in new tab'}><ExternalLink size={16} /></a>
            <a href={`${API_BASE_URL}${item.url}`} download className="p-2 rounded hover:bg-surface-secondary text-on-surface-secondary" title={isRTL ? 'تحميل' : 'Download'}><Download size={16} /></a>
            <button onClick={onClose} className="flex items-center gap-1 px-3 py-1.5 rounded hover:bg-surface-secondary text-on-surface text-sm">
              <X size={16} />
              <span>{isRTL ? 'إغلاق' : 'Close'}</span>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-black flex items-center justify-center min-h-[300px]">
          {item.type === 'video' && <video src={`${API_BASE_URL}${item.url}`} controls autoPlay className="max-w-full max-h-[75vh]" />}
          {item.type === 'image' && <img src={`${API_BASE_URL}${item.url}`} alt="" className="max-w-full max-h-[75vh] object-contain" />}
          {item.type === 'audio' && <audio src={`${API_BASE_URL}${item.url}`} controls className="w-full max-w-md" />}
          {(item.type === 'design' || item.type === 'document') && (
            <div className="text-white/70 p-8 text-center">
              <FileText size={48} className="mx-auto mb-3 opacity-50" />
              <a href={`${API_BASE_URL}${item.url}`} target="_blank" rel="noreferrer" className="underline">
                {isRTL ? 'فتح في نافذة جديدة' : 'Open in new tab'}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailsModal({
  item, onClose, language, categories, tags,
}: {
  item: LibraryItem;
  onClose: () => void;
  language: 'en' | 'ar';
  categories: LibraryCategory[];
  tags: LibraryTag[];
}) {
  const isRTL = language === 'ar';
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const md = (item.metadata || {}) as Record<string, unknown>;
  const tool = typeof md.tool === 'string' ? md.tool : undefined;
  const width = typeof md.width === 'number' ? md.width : undefined;
  const height = typeof md.height === 'number' ? md.height : undefined;
  const fps = typeof md.fps === 'number' ? md.fps : undefined;
  const format = typeof md.format === 'string' ? md.format : undefined;
  const source = typeof md.source === 'string' ? md.source : item.source;
  const costUSD = typeof md.costUSD === 'number' ? md.costUSD : undefined;
  const hasAudio = typeof md.hasAudio === 'boolean' ? md.hasAudio : undefined;
  const prompt = (typeof md.prompt === 'string' ? md.prompt
    : typeof md.promptText === 'string' ? md.promptText
    : typeof md.source === 'string' && md.source ? undefined
    : item.description) as string | undefined;
  const costLines = Array.isArray(md.costLines) ? (md.costLines as Array<{ service: string; units: number; unitName: string; usd: number }>) : [];

  const category = item.categoryId ? categories.find((c) => c.id === item.categoryId) : null;
  const itemTags = (item.tagIds || []).map((id) => tags.find((t) => t.id === id)).filter(Boolean) as LibraryTag[];

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-1.5 border-b border-border/60 last:border-0">
      <div className="text-xs text-on-surface-tertiary">{label}</div>
      <div className="text-xs text-on-surface break-words">{value || <span className="text-on-surface-tertiary">—</span>}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="bg-surface border border-border rounded-[var(--radius-lg)] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Info size={16} className="text-accent shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-on-surface truncate">{item.title}</div>
              <div className="text-[11px] text-on-surface-tertiary">{isRTL ? 'تفاصيل العنصر' : 'Item details'}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-secondary text-on-surface-secondary">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Preview strip */}
          <div className="rounded-[var(--radius)] bg-surface-secondary overflow-hidden max-h-[240px] flex items-center justify-center">
            {item.type === 'video' ? (
              <video src={`${API_BASE_URL}${item.url}`} className="max-h-[240px]" controls />
            ) : item.type === 'image' ? (
              <img src={`${API_BASE_URL}${item.url}`} alt="" className="max-h-[240px] object-contain" />
            ) : item.type === 'audio' ? (
              <audio src={`${API_BASE_URL}${item.url}`} controls className="w-full max-w-md my-4" />
            ) : (
              <div className="p-8 text-on-surface-tertiary"><FileText size={40} /></div>
            )}
          </div>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-secondary mb-2">
              {isRTL ? 'معلومات أساسية' : 'Basic info'}
            </h3>
            <div className="rounded-[var(--radius)] border border-border px-3 py-1.5 bg-surface">
              <Row label={isRTL ? 'النوع' : 'Type'} value={isRTL ? TYPE_LABEL_AR[item.type] : TYPE_LABEL_EN[item.type]} />
              <Row label={isRTL ? 'المصدر' : 'Source'} value={source} />
              {tool && <Row label={isRTL ? 'الأداة' : 'Tool'} value={<span className="font-mono">{tool}</span>} />}
              <Row label={isRTL ? 'تاريخ الإنشاء' : 'Created'} value={new Date(item.createdAt).toLocaleString(isRTL ? 'ar' : 'en')} />
              {(width && height) && <Row label={isRTL ? 'الأبعاد' : 'Dimensions'} value={<span className="font-mono">{width} × {height}{fps ? ` @ ${fps}fps` : ''}</span>} />}
              {format && <Row label={isRTL ? 'الصيغة' : 'Format'} value={<span className="font-mono">{format}</span>} />}
              {item.duration !== undefined && <Row label={isRTL ? 'المدة' : 'Duration'} value={<span className="font-mono">{formatDuration(item.duration)}</span>} />}
              {item.size !== undefined && <Row label={isRTL ? 'الحجم' : 'Size'} value={formatBytes(item.size)} />}
              {hasAudio !== undefined && <Row label={isRTL ? 'يحتوي صوت' : 'Has audio'} value={hasAudio ? (isRTL ? 'نعم' : 'Yes') : (isRTL ? 'لا' : 'No')} />}
              <Row label={isRTL ? 'التصنيف' : 'Category'} value={category ? (isRTL ? category.name.ar : category.name.en) : (isRTL ? 'غير مصنّف' : 'Uncategorized')} />
              <Row
                label={isRTL ? 'التاقات' : 'Tags'}
                value={itemTags.length ? (
                  <div className="flex flex-wrap gap-1">
                    {itemTags.map((t) => (
                      <span key={t.id} className="text-[10px] px-1.5 rounded border" style={{ borderColor: t.color || 'var(--border)', color: t.color || 'var(--on-surface-secondary)' }}>
                        {isRTL ? t.name.ar : t.name.en}
                      </span>
                    ))}
                  </div>
                ) : null}
              />
            </div>
          </section>

          {(costUSD !== undefined || costLines.length > 0) && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-secondary mb-2 flex items-center gap-2">
                {isRTL ? 'التكلفة' : 'Cost'}
                {costUSD !== undefined && (
                  <span className="text-emerald-600 font-mono font-semibold normal-case">
                    ${costUSD.toFixed(4)}
                  </span>
                )}
              </h3>
              <div className="rounded-[var(--radius)] border border-border overflow-hidden">
                {costLines.length === 0 && (
                  <div className="px-3 py-2 text-xs text-on-surface-tertiary">{isRTL ? 'لا يوجد تفصيل' : 'No breakdown available'}</div>
                )}
                {costLines.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 py-1.5 border-b border-border/60 last:border-0 text-xs">
                    <div className="font-medium text-on-surface truncate">{l.service}</div>
                    <div className="text-on-surface-tertiary font-mono whitespace-nowrap">{l.units} {l.unitName}</div>
                    <div className="text-emerald-600 font-mono font-semibold whitespace-nowrap">${l.usd.toFixed(4)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {prompt && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-secondary mb-2">
                {isRTL ? 'النص / البرومبت الأصلي' : 'Original prompt / source'}
              </h3>
              <div className="rounded-[var(--radius)] border border-border bg-surface-secondary px-3 py-2 text-xs text-on-surface whitespace-pre-wrap leading-relaxed max-h-[200px] overflow-auto">
                {prompt}
              </div>
            </section>
          )}
        </div>
        <div className="border-t border-border px-4 py-2 flex items-center justify-end gap-2">
          <a href={`${API_BASE_URL}${item.url}`} download className="h-8 px-3 rounded-[var(--radius)] border border-border text-xs text-on-surface-secondary hover:bg-surface-secondary inline-flex items-center gap-1">
            <Download size={12} /> {isRTL ? 'تحميل' : 'Download'}
          </a>
          <button onClick={onClose} className="h-8 px-3 rounded-[var(--radius)] bg-accent text-on-accent text-xs">
            {isRTL ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
