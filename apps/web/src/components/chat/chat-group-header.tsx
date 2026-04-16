'use client';

import { useState } from 'react';
import { Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentVisual {
  id: string;
  name: { ar: string; en: string };
  color: string;
  bgColor: string;
  initial: string;
}

interface ChatGroupHeaderProps {
  title: string;
  participantIds: string[];
  agentDisplay: Record<
    string,
    { name: { ar: string; en: string }; color: string; bgColor: string; initial: string }
  >;
  language: 'ar' | 'en';
  isRTL: boolean;
  activeAgentIds?: string[];
}

const MAX_VISIBLE = 5;

/**
 * WhatsApp-style group header. Sticky ~56–64px tall.
 *  - Title + participant count on one side.
 *  - Overlapping avatar stack (up to 5) on the other; click to open drawer.
 */
export function ChatGroupHeader({
  title,
  participantIds,
  agentDisplay,
  language,
  isRTL,
  activeAgentIds = [],
}: ChatGroupHeaderProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const visuals: AgentVisual[] = participantIds
    .map((id) => {
      const d = agentDisplay[id];
      if (!d) return null;
      return { id, ...d };
    })
    .filter((v): v is AgentVisual => Boolean(v));

  const shown = visuals.slice(0, MAX_VISIBLE);
  const overflow = visuals.length - shown.length;

  return (
    <div
      className={cn(
        'sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur',
        'h-14 md:h-16 shrink-0'
      )}
    >
      <div className="h-full max-w-3xl mx-auto px-4 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-on-surface truncate">{title}</p>
          <p className="text-[11px] text-on-surface-tertiary flex items-center gap-1">
            <Users size={11} />
            <span>
              {participantIds.length}{' '}
              {isRTL
                ? participantIds.length === 1
                  ? 'مشارك'
                  : 'مشاركين'
                : participantIds.length === 1
                  ? 'member'
                  : 'members'}
            </span>
          </p>
        </div>

        <button
          onClick={() => setDrawerOpen(true)}
          className="flex items-center shrink-0 py-1 -my-1 rounded-full hover:bg-surface-secondary transition-colors px-1.5"
          title={isRTL ? 'عرض المشاركين' : 'Show members'}
          aria-label={isRTL ? 'عرض المشاركين' : 'Show members'}
        >
          <div className={cn('flex items-center', isRTL ? 'flex-row-reverse' : '')}>
            {shown.map((v, i) => (
              <span
                key={v.id}
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium',
                  'ring-2 ring-surface shadow-sm',
                  v.bgColor,
                  activeAgentIds.includes(v.id) && 'animate-pulse'
                )}
                style={{
                  marginInlineStart: i === 0 ? 0 : '-8px',
                  zIndex: shown.length - i,
                }}
                title={v.name[language]}
              >
                {v.initial}
              </span>
            ))}
            {overflow > 0 && (
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold bg-surface-secondary text-on-surface-secondary ring-2 ring-surface shadow-sm"
                style={{ marginInlineStart: '-8px' }}
              >
                +{overflow}
              </span>
            )}
          </div>
        </button>
      </div>

      {drawerOpen && (
        <MemberDrawer
          visuals={visuals}
          language={language}
          isRTL={isRTL}
          activeAgentIds={activeAgentIds}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}

function MemberDrawer({
  visuals,
  language,
  isRTL,
  activeAgentIds,
  onClose,
}: {
  visuals: AgentVisual[];
  language: 'ar' | 'en';
  isRTL: boolean;
  activeAgentIds: string[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex"
      onClick={onClose}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="flex-1 bg-black/30" />
      <div
        className={cn(
          'w-80 max-w-[85vw] h-full bg-surface border-border shadow-2xl flex flex-col',
          isRTL ? 'border-l' : 'border-r'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-border shrink-0">
          <p className="text-sm font-semibold text-on-surface">
            {isRTL ? 'المشاركون' : 'Members'} ({visuals.length})
          </p>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-surface-secondary text-on-surface-tertiary"
            aria-label={isRTL ? 'إغلاق' : 'Close'}
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {visuals.map((v) => (
            <div
              key={v.id}
              className="px-4 py-3 flex items-center gap-3 border-b border-border/50 hover:bg-surface-secondary transition-colors"
            >
              <span
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0',
                  v.bgColor,
                  activeAgentIds.includes(v.id) && 'animate-pulse ring-2 ring-accent'
                )}
              >
                {v.initial}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-on-surface font-medium truncate">
                  {language === 'ar' ? v.name.ar : v.name.en}
                </p>
                <p className="text-[11px] text-on-surface-tertiary truncate" dir="ltr">
                  {language === 'ar' ? v.name.en : v.name.ar}
                </p>
              </div>
              {activeAgentIds.includes(v.id) && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent shrink-0">
                  {isRTL ? 'نشط' : 'active'}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
