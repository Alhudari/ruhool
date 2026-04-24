'use client';
import { cn } from '@/lib/utils';

interface Props {
  text: string;
  className?: string;
  onLinkClick?: (target: string) => void;
}

/**
 * Renders text with [[wikilinks]] as clickable inline chips.
 * [[Target Name]] → <button class="wikilink">Target Name</button>
 * [[Target|Alias]] → shows Alias, links to Target
 */
export function WikilinkRenderer({ text, className, onLinkClick }: Props) {
  if (!text) return null;

  // Split text by [[...]] pattern
  const parts = text.split(/(\[\[[^\]]+\]\])/g);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        const match = part.match(/^\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]$/);
        if (match) {
          const target = match[1].trim();
          const display = match[2]?.trim() || target;
          return (
            <button
              key={i}
              onClick={() => onLinkClick?.(target)}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded text-xs font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-colors cursor-pointer border border-accent/20"
            >
              <span className="opacity-60 text-[10px]">[[</span>
              {display}
              <span className="opacity-60 text-[10px]">]]</span>
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
