'use client';

import { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Check,
  MessageCircleQuestion,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Wand2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  HighlightSwatch,
  highlightLabel,
  type HighlightColor,
} from './HighlightSwatch';
import { TagPill } from './TagPill';
import { LinkedPaperCard, type LinkedPaper } from './LinkedPaperCard';

export interface HighlightItem {
  color: HighlightColor;
  text: string;
  reason?: string;
}

export interface AnalysisData {
  analysisId?: string;
  mainIdea?: string;
  tags?: string[];
  highlights?: HighlightItem[];
  libraryLink?: { paper: LinkedPaper; note?: string } | null;
  phdRelevance?: string;
  question?: string;
  arabicTakeaway?: string[];
  humanEdited?: boolean;
}

// Snake-case partial used by the backend PATCH /api/shwasha/analyses/:id.
export interface AnalysisEditPatch {
  main_idea?: string;
  phd_relevance?: string;
  question?: string | null;
  tags?: string[];
  highlights?: HighlightItem[];
  arabic_takeaway?: string[];
}

interface AnalysisPanelProps {
  analysis: AnalysisData | null;
  isStreaming: boolean;
  /** Character count of the in-flight JSON stream. We never render the raw
   *  stream; we use this to drive a progress bar and counter. */
  streamProgress?: number;
  isRTL: boolean;
  viewingOlderVersion?: boolean;
  onApprove?: () => void;
  onRefine?: () => void;
  onRegenerate?: () => void;
  onAsk?: () => void;
  onSave?: () => void;
  onRemoveTag?: (tag: string) => void;
  onEdit?: (patch: AnalysisEditPatch) => void;
  footer?: React.ReactNode;
}

const HIGHLIGHT_COLORS: HighlightColor[] = ['yellow', 'green', 'red', 'blue', 'purple', 'orange'];

export function AnalysisPanel({
  analysis,
  isStreaming,
  streamProgress,
  isRTL,
  viewingOlderVersion,
  onApprove,
  onRefine,
  onRegenerate,
  onAsk,
  onSave,
  onRemoveTag,
  onEdit,
  footer,
}: AnalysisPanelProps) {
  const showSkeleton = isStreaming && !analysis;
  const canEdit = !!onEdit && !!analysis && !isStreaming;

  return (
    <div className="flex flex-col h-full bg-surface-secondary/30">
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {(analysis?.humanEdited || viewingOlderVersion) && (
          <div className="flex flex-wrap gap-2">
            {analysis?.humanEdited && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                <BadgeCheck size={11} />
                {isRTL ? 'مُعدَّل يدويًا' : 'Human-edited'}
              </span>
            )}
            {viewingOlderVersion && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20">
                {isRTL ? 'نسخة أقدم' : 'Viewing older version'}
              </span>
            )}
          </div>
        )}

        {showSkeleton ? (
          <StreamingProgress isRTL={isRTL} progress={streamProgress ?? 0} />
        ) : !analysis ? (
          <div className="text-center py-12 text-on-surface-tertiary text-sm">
            {isRTL ? 'لا يوجد تحليل بعد لهذه الصفحة.' : 'No analysis for this page yet.'}
          </div>
        ) : (
          <>
            <Section title={isRTL ? 'الفكرة الرئيسية' : 'Main Idea'}>
              <EditableText
                value={analysis.mainIdea ?? ''}
                placeholder={isRTL ? 'أضف فكرة رئيسية…' : 'Add a main idea…'}
                isRTL={isRTL}
                multiline
                disabled={!canEdit}
                onCommit={(v) => onEdit?.({ main_idea: v })}
              />
            </Section>

            <Section title={isRTL ? 'الوسوم' : 'Tags'}>
              <EditableTags
                tags={analysis.tags ?? []}
                disabled={!canEdit}
                isRTL={isRTL}
                onRemoveLegacy={onRemoveTag}
                onCommit={(tags) => onEdit?.({ tags })}
              />
            </Section>

            <Section title={isRTL ? 'الاقتباسات المميّزة' : 'Highlights'}>
              <EditableHighlights
                items={analysis.highlights ?? []}
                disabled={!canEdit}
                isRTL={isRTL}
                onCommit={(highlights) => onEdit?.({ highlights })}
              />
            </Section>

            {analysis.libraryLink && (
              <Section title={isRTL ? 'روابط من المكتبة' : 'Library Link'}>
                <LinkedPaperCard paper={analysis.libraryLink.paper} note={analysis.libraryLink.note} />
              </Section>
            )}

            <Section title={isRTL ? 'الصلة بأطروحة الدكتوراه' : 'PhD Relevance'}>
              <EditableText
                value={analysis.phdRelevance ?? ''}
                placeholder={isRTL ? 'أضف صلة بالأطروحة…' : 'Add PhD relevance…'}
                isRTL={isRTL}
                multiline
                muted
                disabled={!canEdit}
                onCommit={(v) => onEdit?.({ phd_relevance: v })}
              />
            </Section>

            <Section title={isRTL ? 'سؤال للتأمل' : 'Question'}>
              <EditableText
                value={analysis.question ?? ''}
                placeholder={isRTL ? 'أضف سؤالاً للتأمل…' : 'Add a reflection question…'}
                isRTL={isRTL}
                italic
                disabled={!canEdit}
                onCommit={(v) => onEdit?.({ question: v || null })}
              />
            </Section>

            <section className="rounded-[var(--radius-lg)] border border-accent/30 bg-accent/5 p-3" dir="rtl">
              <h3 className="text-[11px] uppercase tracking-wider text-accent mb-1.5 font-medium">
                خلاصة المُلخِّص — ركّز على
              </h3>
              <EditableBullets
                items={analysis.arabicTakeaway ?? []}
                disabled={!canEdit}
                isRTL={true}
                onCommit={(items) => onEdit?.({ arabic_takeaway: items })}
              />
            </section>
          </>
        )}
      </div>

      {footer && <div className="border-t border-border px-4 py-2 shrink-0">{footer}</div>}

      <div className="border-t border-border px-3 py-2 flex flex-wrap gap-2 shrink-0 bg-surface">
        <ActionButton icon={Check} label={isRTL ? 'موافق' : 'Approve'} onClick={onApprove} variant="primary" />
        <ActionButton icon={Wand2} label={isRTL ? 'صقل' : 'Refine'} onClick={onRefine} />
        <ActionButton icon={RefreshCw} label={isRTL ? 'إعادة' : 'Regenerate'} onClick={onRegenerate} />
        <ActionButton icon={MessageCircleQuestion} label={isRTL ? 'اسأل' : 'Ask'} onClick={onAsk} />
        <ActionButton icon={Save} label={isRTL ? 'حفظ' : 'Save'} onClick={onSave} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] uppercase tracking-wider text-on-surface-tertiary mb-1.5 font-medium">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  variant = 'default',
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  variant?: 'default' | 'primary';
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius)] text-xs transition-colors',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        variant === 'primary'
          ? 'bg-accent text-on-accent hover:bg-accent-hover'
          : 'bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary'
      )}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

// Typical Al-Mulakhkhis analyze output is ~2500-3500 chars of JSON. Use 3000 as
// baseline for the % estimate; cap at 99% until `message.done` lands.
const STREAM_EXPECTED_CHARS = 3000;

function StreamingProgress({ isRTL, progress }: { isRTL: boolean; progress: number }) {
  const pct = Math.min(99, Math.round((progress / STREAM_EXPECTED_CHARS) * 100));
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-5">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-2 border-accent/20" />
        <div className="absolute inset-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles size={20} className="text-accent" />
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-on-surface">
          {isRTL ? 'يحلل المُلخِّص هذه الصفحة…' : 'Al-Mulakhkhis is analyzing this page…'}
        </p>
        <p className="text-xs text-on-surface-tertiary tabular-nums" dir="ltr">
          {pct}% · {progress.toLocaleString()} {isRTL ? 'حرفًا' : 'chars'}
        </p>
      </div>

      <div className="w-56 h-1.5 rounded-full bg-surface-tertiary overflow-hidden">
        <div
          className="h-full bg-accent transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="text-[11px] text-on-surface-tertiary max-w-xs leading-relaxed">
        {isRTL
          ? 'سيظهر التحليل منسّقًا فور الانتهاء — لا داعي لمتابعة النصوص الخام.'
          : 'The formatted analysis appears the moment it finishes — no need to watch the raw stream.'}
      </p>
    </div>
  );
}

interface EditableTextProps {
  value: string;
  placeholder: string;
  isRTL: boolean;
  multiline?: boolean;
  italic?: boolean;
  muted?: boolean;
  disabled?: boolean;
  onCommit: (value: string) => void;
}

function EditableText({ value, placeholder, isRTL, multiline, italic, muted, disabled, onCommit }: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = () => {
    const next = draft.trim();
    if (next !== (value ?? '').trim()) onCommit(next);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    const commonCls = 'w-full px-2 py-1.5 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-ring';
    return (
      <div className="space-y-1">
        {multiline ? (
          <textarea
            value={draft}
            autoFocus
            rows={4}
            dir="auto"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
            }}
            className={cn(commonCls, 'resize-y leading-relaxed')}
          />
        ) : (
          <input
            type="text"
            value={draft}
            autoFocus
            dir="auto"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
            }}
            className={commonCls}
          />
        )}
        <p className="text-[10px] text-on-surface-tertiary">
          {isRTL ? 'Enter للحفظ • Esc للإلغاء' : 'Enter to save • Esc to cancel'}
        </p>
      </div>
    );
  }

  const textCls = cn(
    'text-sm leading-relaxed',
    muted ? 'text-on-surface-secondary' : 'text-on-surface',
    italic && 'italic'
  );

  if (!value.trim()) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 text-xs text-on-surface-tertiary hover:text-on-surface disabled:opacity-50"
      >
        <Plus size={12} />
        {placeholder}
      </button>
    );
  }

  return (
    <div
      className={cn(
        'group relative rounded-[var(--radius)] -mx-1 px-1 py-0.5',
        !disabled && 'hover:bg-surface-secondary/60 cursor-text'
      )}
      onClick={() => !disabled && setEditing(true)}
      role={disabled ? undefined : 'button'}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          setEditing(true);
        }
      }}
    >
      <p className={textCls} dir="auto">{value}</p>
      {!disabled && (
        <Pencil
          size={10}
          className={cn(
            'absolute top-1 opacity-0 group-hover:opacity-100 text-on-surface-tertiary transition-opacity',
            isRTL ? 'left-1' : 'right-1'
          )}
        />
      )}
    </div>
  );
}

interface EditableTagsProps {
  tags: string[];
  disabled?: boolean;
  isRTL: boolean;
  onRemoveLegacy?: (tag: string) => void;
  onCommit: (tags: string[]) => void;
}

function EditableTags({ tags, disabled, isRTL, onRemoveLegacy, onCommit }: EditableTagsProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const handleAdd = () => {
    const v = draft.trim();
    if (!v) {
      setAdding(false);
      return;
    }
    if (!tags.includes(v)) onCommit([...tags, v]);
    setDraft('');
    setAdding(false);
  };

  const handleRemove = (tag: string) => {
    onCommit(tags.filter((t) => t !== tag));
    onRemoveLegacy?.(tag);
  };

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {tags.map((t) => (
        <TagPill key={t} tag={t} onRemove={disabled ? undefined : () => handleRemove(t)} />
      ))}
      {!disabled && (
        adding ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleAdd}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setDraft('');
                setAdding(false);
              }
            }}
            placeholder={isRTL ? 'وسم…' : 'tag…'}
            dir="auto"
            className="text-xs px-2 py-0.5 bg-input border border-border rounded-full text-on-surface w-24 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-dashed border-border text-on-surface-tertiary hover:text-on-surface hover:border-border-hover transition-colors"
          >
            <Plus size={10} />
            {isRTL ? 'أضف' : 'Add'}
          </button>
        )
      )}
      {tags.length === 0 && disabled && (
        <span className="text-xs text-on-surface-tertiary">
          {isRTL ? 'لا توجد وسوم.' : 'No tags.'}
        </span>
      )}
    </div>
  );
}

interface EditableHighlightsProps {
  items: HighlightItem[];
  disabled?: boolean;
  isRTL: boolean;
  onCommit: (items: HighlightItem[]) => void;
}

function EditableHighlights({ items, disabled, isRTL, onCommit }: EditableHighlightsProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftReason, setDraftReason] = useState('');

  const startEdit = (i: number) => {
    setEditingIdx(i);
    setDraftText(items[i]?.text ?? '');
    setDraftReason(items[i]?.reason ?? '');
  };

  const commitEdit = () => {
    if (editingIdx === null) return;
    const next = items.map((h, i) =>
      i === editingIdx ? { ...h, text: draftText.trim(), reason: draftReason.trim() || undefined } : h
    );
    onCommit(next);
    setEditingIdx(null);
  };

  const changeColor = (i: number, color: HighlightColor) => {
    onCommit(items.map((h, idx) => (idx === i ? { ...h, color } : h)));
  };

  const remove = (i: number) => {
    onCommit(items.filter((_, idx) => idx !== i));
    if (editingIdx === i) setEditingIdx(null);
  };

  if (items.length === 0) {
    return (
      <p className="text-xs text-on-surface-tertiary">
        {isRTL ? 'لا توجد اقتباسات مميّزة.' : 'No highlights.'}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((h, i) => {
        const isEditing = editingIdx === i;
        return (
          <li key={i} className="flex gap-2 items-start">
            <div className="relative group shrink-0 mt-0.5">
              <HighlightSwatch color={h.color} isRTL={isRTL} />
              {!disabled && (
                <div className="absolute z-10 top-4 start-0 hidden group-hover:flex gap-0.5 p-1 rounded-[var(--radius)] border border-border bg-surface shadow">
                  {HIGHLIGHT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => changeColor(i, c)}
                      aria-label={highlightLabel(c, isRTL)}
                      className={cn(
                        'w-4 h-4 rounded-full ring-1 ring-border',
                        c === 'yellow' && 'bg-yellow-400/70',
                        c === 'green' && 'bg-green-400/70',
                        c === 'red' && 'bg-red-400/70',
                        c === 'blue' && 'bg-blue-400/70',
                        c === 'purple' && 'bg-purple-400/70',
                        c === 'orange' && 'bg-orange-400/70',
                        h.color === c && 'ring-2 ring-accent'
                      )}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              {isEditing ? (
                <div className="space-y-1">
                  <textarea
                    value={draftText}
                    autoFocus
                    rows={2}
                    dir="auto"
                    onChange={(e) => setDraftText(e.target.value)}
                    className="w-full text-xs px-2 py-1 bg-input border border-border rounded-[var(--radius)] text-on-surface focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                    placeholder={isRTL ? 'نص الاقتباس' : 'Highlight text'}
                  />
                  <input
                    type="text"
                    value={draftReason}
                    dir="auto"
                    onChange={(e) => setDraftReason(e.target.value)}
                    className="w-full text-xs px-2 py-1 bg-input border border-border rounded-[var(--radius)] text-on-surface focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder={isRTL ? 'السبب (اختياري)' : 'Reason (optional)'}
                  />
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={commitEdit}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-accent text-on-accent hover:bg-accent-hover"
                    >
                      <Check size={10} />
                      {isRTL ? 'حفظ' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingIdx(null)}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary"
                    >
                      {isRTL ? 'إلغاء' : 'Cancel'}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    'group rounded-[var(--radius)] -mx-1 px-1 py-0.5',
                    !disabled && 'hover:bg-surface-secondary/60 cursor-text'
                  )}
                  onClick={() => !disabled && startEdit(i)}
                >
                  <p className="text-xs text-on-surface" dir="auto">
                    <span className="text-on-surface-tertiary me-1">{i + 1}.</span>
                    {h.text}
                    {!disabled && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(i);
                        }}
                        aria-label={isRTL ? 'حذف' : 'Remove'}
                        className="ms-1 opacity-0 group-hover:opacity-100 inline-flex align-middle p-0.5 rounded-full hover:bg-error/20 text-on-surface-tertiary hover:text-error"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </p>
                  <p className="text-[11px] text-on-surface-tertiary mt-0.5" dir="auto">
                    <span className="uppercase tracking-wide">{highlightLabel(h.color, isRTL)}</span>
                    {h.reason ? ` — ${h.reason}` : ''}
                  </p>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

interface EditableBulletsProps {
  items: string[];
  disabled?: boolean;
  isRTL: boolean;
  onCommit: (items: string[]) => void;
}

function EditableBullets({ items, disabled, isRTL, onCommit }: EditableBulletsProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const commit = () => {
    if (editingIdx === null) return;
    const next = [...items];
    const v = draft.trim();
    if (v) next[editingIdx] = v;
    else next.splice(editingIdx, 1);
    onCommit(next);
    setEditingIdx(null);
  };

  const handleAdd = () => {
    const v = draft.trim();
    if (v) onCommit([...items, v]);
    setDraft('');
    setAdding(false);
  };

  if (items.length === 0 && !adding) {
    if (disabled) {
      return (
        <p className="text-xs text-on-surface-tertiary" dir="auto">
          {isRTL ? 'لا توجد خلاصة بعد.' : 'No takeaway yet.'}
        </p>
      );
    }
    return (
      <button
        type="button"
        onClick={() => {
          setDraft('');
          setAdding(true);
        }}
        className="inline-flex items-center gap-1 text-xs text-on-surface-tertiary hover:text-on-surface"
      >
        <Plus size={12} />
        {isRTL ? 'أضف نقطة' : 'Add bullet'}
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <ul className="space-y-1.5 list-disc ps-5">
        {items.map((b, i) => (
          <li key={i} className="text-sm text-on-surface leading-relaxed">
            {editingIdx === i ? (
              <div className="flex gap-1 items-start -ms-5">
                <textarea
                  value={draft}
                  autoFocus
                  rows={2}
                  dir="auto"
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingIdx(null);
                    }
                  }}
                  className="flex-1 text-sm px-2 py-1 bg-input border border-border rounded-[var(--radius)] text-on-surface focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                />
              </div>
            ) : (
              <span
                className={cn('group inline-flex items-start gap-1', !disabled && 'cursor-text')}
                onClick={() => {
                  if (disabled) return;
                  setDraft(b);
                  setEditingIdx(i);
                }}
              >
                <span dir="auto">{b}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCommit(items.filter((_, idx) => idx !== i));
                    }}
                    aria-label={isRTL ? 'حذف' : 'Remove'}
                    className="opacity-0 group-hover:opacity-100 inline-flex p-0.5 rounded-full hover:bg-error/20 text-on-surface-tertiary hover:text-error"
                  >
                    <X size={10} />
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
      {adding ? (
        <textarea
          value={draft}
          autoFocus
          rows={2}
          dir="auto"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleAdd}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setDraft('');
              setAdding(false);
            }
          }}
          placeholder={isRTL ? 'نقطة جديدة…' : 'New bullet…'}
          className="w-full text-sm px-2 py-1 bg-input border border-border rounded-[var(--radius)] text-on-surface focus:outline-none focus:ring-2 focus:ring-ring resize-y"
        />
      ) : (
        !disabled && (
          <button
            type="button"
            onClick={() => {
              setDraft('');
              setAdding(true);
            }}
            className="inline-flex items-center gap-1 text-xs text-on-surface-tertiary hover:text-on-surface"
          >
            <Plus size={12} />
            {isRTL ? 'أضف نقطة' : 'Add bullet'}
          </button>
        )
      )}
    </div>
  );
}
