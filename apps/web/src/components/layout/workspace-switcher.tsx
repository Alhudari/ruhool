'use client';

import { useEffect, useState, useCallback } from 'react';
import { GraduationCap, Home, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface Workspace {
  id: string;
  label: { ar: string; en: string };
  icon?: string;
}

const STORAGE_KEY = 'ruhool.active-workspace';
const DEFAULT_WORKSPACES: Workspace[] = [
  { id: 'phd', label: { ar: 'الدكتوراه', en: 'PhD' }, icon: 'graduation-cap' },
  { id: 'life', label: { ar: 'الحياة', en: 'Life' }, icon: 'home' },
];

function iconFor(icon?: string) {
  switch (icon) {
    case 'graduation-cap': return GraduationCap;
    case 'home': return Home;
    default: return Home;
  }
}

// Simple shared state via storage events so any consumer re-renders when
// the active workspace changes elsewhere.
function readActive(): string {
  if (typeof window === 'undefined') return 'phd';
  return window.localStorage.getItem(STORAGE_KEY) || 'phd';
}

function writeActive(id: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, id);
  window.dispatchEvent(new CustomEvent('ruhool:workspace-change', { detail: id }));
}

export function useActiveWorkspace(): [string, (id: string) => void] {
  const [active, setActive] = useState<string>('phd');
  useEffect(() => {
    setActive(readActive());
    const onChange = () => setActive(readActive());
    window.addEventListener('ruhool:workspace-change', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('ruhool:workspace-change', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);
  const set = useCallback((id: string) => {
    writeActive(id);
    setActive(id);
  }, []);
  return [active, set];
}

export function WorkspaceSwitcher({ compact }: { compact?: boolean }) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [workspaces, setWorkspaces] = useState<Workspace[]>(DEFAULT_WORKSPACES);
  const [active, setActive] = useActiveWorkspace();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    apiFetch<{ org: { workspaces?: Workspace[] } }>('/api/agent-org')
      .then((r) => {
        if (r.org && Array.isArray(r.org.workspaces) && r.org.workspaces.length > 0) {
          setWorkspaces(r.org.workspaces.map((w) => ({ id: w.id, label: w.label, icon: w.icon })));
        }
      })
      .catch(() => { /* keep defaults */ });
  }, []);

  const activeWs = workspaces.find((w) => w.id === active) ?? workspaces[0];
  const ActiveIcon = iconFor(activeWs?.icon);

  if (!activeWs) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius)] border border-border bg-surface-secondary hover:bg-surface-tertiary text-sm transition-colors',
          compact && 'px-2',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={isRTL ? 'بدّل الغرفة' : 'Switch workspace'}
      >
        <ActiveIcon size={14} className="text-accent shrink-0" />
        {!compact && <span className="text-on-surface">{activeWs.label[language]}</span>}
        <ChevronDown size={12} className={cn('text-on-surface-tertiary transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className={cn(
              'absolute top-full mt-1 bg-surface border border-border rounded-[var(--radius-lg)] shadow-xl py-1 min-w-[180px] z-40',
              isRTL ? 'right-0' : 'left-0',
            )}
            role="listbox"
          >
            {workspaces.map((w) => {
              const Icon = iconFor(w.icon);
              const selected = w.id === active;
              return (
                <button
                  key={w.id}
                  role="option"
                  aria-selected={selected}
                  onClick={() => { setActive(w.id); setOpen(false); }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-secondary transition-colors',
                    selected ? 'text-accent' : 'text-on-surface',
                  )}
                >
                  <Icon size={14} className="shrink-0" />
                  <span className="flex-1 text-start">{w.label[language]}</span>
                  {selected && <span className="text-accent text-xs">•</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
