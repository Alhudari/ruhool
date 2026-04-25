'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, StickyNote } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface UserNotesPanelProps {
  sessionId: string;
  pageNumber: number;
  initialContent: string;
  isRTL: boolean;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function UserNotesPanel({ sessionId, pageNumber, initialContent, isRTL }: UserNotesPanelProps) {
  const [content, setContent] = useState(initialContent);
  const [state, setState] = useState<SaveState>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>(initialContent);

  // Sync if parent switches page and passes new initial content.
  useEffect(() => {
    setContent(initialContent);
    lastSavedRef.current = initialContent;
    setState('idle');
  }, [pageNumber, initialContent]);

  const schedule = (next: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState('saving');
    timerRef.current = setTimeout(() => {
      void save(next);
    }, 500);
  };

  const save = async (value: string) => {
    if (value === lastSavedRef.current) {
      setState('idle');
      return;
    }
    try {
      await apiFetch(`/api/shwasha/sessions/${sessionId}/notes`, {
        method: 'PATCH',
        body: JSON.stringify({ pageNumber, content: value }),
      });
      lastSavedRef.current = value;
      setState('saved');
      // fade back to idle after a moment
      setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 1200);
    } catch {
      setState('error');
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface-secondary/20 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-on-surface-tertiary font-medium">
          <StickyNote size={12} />
          {isRTL ? 'ملاحظاتي' : 'My notes'}
        </h3>
        <span className="inline-flex items-center gap-1 text-[10px] text-on-surface-tertiary min-h-[14px]">
          {state === 'saving' && (
            <>
              <Loader2 size={10} className="animate-spin" />
              {isRTL ? 'يحفظ…' : 'Saving…'}
            </>
          )}
          {state === 'saved' && (
            <>
              <Check size={10} className="text-success" />
              {isRTL ? 'محفوظ' : 'Saved'}
            </>
          )}
          {state === 'error' && (
            <span className="text-error">{isRTL ? 'فشل الحفظ' : 'Save failed'}</span>
          )}
        </span>
      </div>
      <textarea
        value={content}
        onChange={(e) => {
          const v = e.target.value;
          setContent(v);
          schedule(v);
        }}
        dir="auto"
        rows={4}
        placeholder={isRTL ? 'اكتب ملاحظاتك على هذه الصفحة…' : 'Write notes on this page…'}
        className="w-full px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring resize-y leading-relaxed"
      />
    </section>
  );
}
