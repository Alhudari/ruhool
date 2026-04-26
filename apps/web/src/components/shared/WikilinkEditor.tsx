'use client';
import { useRef, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

interface LinkNode {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
}

const NODE_ICON: Record<string, string> = {
  meeting: '📋', note: '📝', paper: '📄', source: '🗂',
  task: '✅', conversation: '💬', grs2: '📊', zotero: '🔗',
};

interface Props {
  value: string;
  onChange: (val: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  dir?: 'auto' | 'ltr' | 'rtl';
}

export function WikilinkEditor({ value, onChange, onBlur, placeholder, rows = 4, className, dir = 'auto' }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<LinkNode[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [linkStart, setLinkStart] = useState(-1);

  const fetchNodes = useCallback(async (q: string) => {
    if (q === undefined) return;
    try {
      const res = await apiFetch<{ nodes: LinkNode[] }>(`/api/links/nodes?q=${encodeURIComponent(q)}&limit=8`);
      setSuggestions(res.nodes ?? []);
      setSelectedIdx(0);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart ?? 0;
    onChange(val);

    // Detect [[ opening
    const textBefore = val.slice(0, cursor);
    const lastOpen = textBefore.lastIndexOf('[[');
    const lastClose = textBefore.lastIndexOf(']]');

    if (lastOpen > lastClose && lastOpen >= 0) {
      const q = textBefore.slice(lastOpen + 2);
      setQuery(q);
      setLinkStart(lastOpen);
      setShowDropdown(true);
      fetchNodes(q);
    } else {
      setShowDropdown(false);
      setLinkStart(-1);
    }
  };

  const insertLink = (node: LinkNode) => {
    if (!textareaRef.current || linkStart < 0) return;
    const cursor = textareaRef.current.selectionStart ?? 0;
    const before = value.slice(0, linkStart);
    const after = value.slice(cursor);
    const inserted = `[[${node.title}]]`;
    const newVal = before + inserted + after;
    onChange(newVal);
    setShowDropdown(false);
    setLinkStart(-1);
    // Move cursor after inserted link
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursor = before.length + inserted.length;
        textareaRef.current.setSelectionRange(newCursor, newCursor);
        textareaRef.current.focus();
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && suggestions[selectedIdx]) { e.preventDefault(); insertLink(suggestions[selectedIdx]); }
    if (e.key === 'Escape') { setShowDropdown(false); }
  };

  // Suppress unused variable warning — query is set but used only for display/debug context
  void query;

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => { setTimeout(() => setShowDropdown(false), 200); onBlur?.(); }}
        placeholder={placeholder}
        rows={rows}
        dir={dir}
        className={cn(
          'w-full bg-input border border-border rounded-[var(--radius)] px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring',
          className
        )}
      />

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 mt-1 w-72 rounded-[var(--radius-lg)] border border-border bg-surface shadow-lg overflow-hidden">
          <div className="px-2 py-1 text-[10px] text-on-surface-tertiary border-b border-border">
            Link to…
          </div>
          {suggestions.map((node, i) => (
            <button
              key={node.id}
              onMouseDown={(e) => { e.preventDefault(); insertLink(node); }}
              className={cn(
                'w-full text-start px-3 py-2 text-sm flex items-center gap-2 hover:bg-surface-secondary',
                i === selectedIdx && 'bg-surface-secondary'
              )}
            >
              <span className="text-base shrink-0">{NODE_ICON[node.type] ?? '🔗'}</span>
              <div className="min-w-0">
                <div className="truncate font-medium text-on-surface">{node.title}</div>
                {node.subtitle && <div className="text-[10px] text-on-surface-tertiary truncate">{node.subtitle}</div>}
              </div>
              <span className="ms-auto text-[10px] text-on-surface-tertiary shrink-0">{node.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
