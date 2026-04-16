'use client';

import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  agentId: string;
  agentName: string;
  avatarInitial?: string;
  avatarColor?: string;
  isRTL?: boolean;
}

/**
 * CHAT_V2 Wave D: per-agent "typing" bubble. Rendered between
 * `message.start` and `message.done` for a given agent.
 * Visually a compact 3-dot pulser aligned like a real assistant bubble so
 * it blends with the thread and doesn't jitter the scroll.
 */
export function TypingIndicator({
  agentName,
  avatarInitial,
  avatarColor,
  isRTL,
}: TypingIndicatorProps) {
  return (
    <div className="flex gap-3 items-end" dir={isRTL ? 'rtl' : 'ltr'}>
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-medium shadow-sm',
          avatarColor || 'bg-on-surface-tertiary/40'
        )}
      >
        {avatarInitial || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-on-surface-tertiary mb-1">
          {agentName}
          <span className="opacity-70 mx-1">·</span>
          <span className="italic">{isRTL ? 'يكتب…' : 'typing…'}</span>
        </p>
        <div
          className={cn(
            'inline-flex items-center gap-1 px-3 py-2 rounded-[var(--radius)]',
            'bg-surface-secondary border border-border/60'
          )}
        >
          <Dot delay="0ms" />
          <Dot delay="160ms" />
          <Dot delay="320ms" />
        </div>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full bg-on-surface-tertiary animate-bounce"
      style={{ animationDelay: delay, animationDuration: '1s' }}
    />
  );
}
