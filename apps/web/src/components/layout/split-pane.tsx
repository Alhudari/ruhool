'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Columns2, Rows2, X, ExternalLink, Monitor, BookOpen, FileText, Layers, Network, Search, PenLine, MessageSquare, Inbox, ListTodo, Users, Calendar, Library, GraduationCap, Zap, Plus } from 'lucide-react';
import { useAppStore } from '@/store/app';
import { cn } from '@/lib/utils';

const QUICK_ROUTES: Array<{ route: string; ar: string; en: string; icon: React.ElementType; group: 'research' | 'work' | 'agents' | 'system' }> = [
  // Research
  { route: '/zotero',         ar: 'Zotero',          en: 'Zotero',          icon: BookOpen,     group: 'research' },
  { route: '/library',        ar: 'المكتبة',         en: 'Library',         icon: Library,      group: 'research' },
  { route: '/sources',        ar: 'المصادر',         en: 'Sources',         icon: FileText,     group: 'research' },
  { route: '/papers',         ar: 'الأوراق',         en: 'Papers',          icon: FileText,     group: 'research' },
  { route: '/atomic-notes',   ar: 'ملاحظات ذرية',   en: 'Atomic Notes',    icon: Zap,          group: 'research' },
  { route: '/reading-queue',  ar: 'قائمة القراءة',  en: 'Reading Queue',   icon: BookOpen,     group: 'research' },
  { route: '/shwasha',        ar: 'المُلخِّص (قراءة)',  en: 'Al-Mulakhkhis (read)',  icon: BookOpen,     group: 'research' },
  { route: '/canvas',         ar: 'كانفس',          en: 'Canvas',          icon: Layers,       group: 'research' },
  { route: '/graph',          ar: 'خريطة المعرفة',  en: 'Knowledge Graph', icon: Network,      group: 'research' },
  { route: '/search',         ar: 'بحث',             en: 'Search',          icon: Search,       group: 'research' },
  // Work
  { route: '/writing',        ar: 'الكتابة',         en: 'Writing',         icon: PenLine,      group: 'work' },
  { route: '/tasks',          ar: 'المهام',          en: 'Tasks',           icon: ListTodo,     group: 'work' },
  { route: '/inbox',          ar: 'الإدخال السريع', en: 'Inbox',           icon: Inbox,        group: 'work' },
  { route: '/phd',            ar: 'لوحة الدكتوراه', en: 'PhD',             icon: GraduationCap,group: 'work' },
  { route: '/supervision',    ar: 'الإشراف',         en: 'Supervision',     icon: Users,        group: 'work' },
  { route: '/meetings',       ar: 'الاجتماعات',     en: 'Meetings',        icon: Calendar,     group: 'work' },
  { route: '/dashboard',      ar: 'اللوحة الرئيسية', en: 'Dashboard',      icon: Layers,       group: 'work' },
  { route: '/notes',          ar: 'الملاحظات',      en: 'Notes',           icon: FileText,     group: 'work' },
  { route: '/files',          ar: 'الملفات',         en: 'Files',           icon: FileText,     group: 'work' },
  { route: '/projects',       ar: 'المشاريع',        en: 'Projects',        icon: Layers,       group: 'work' },
  // Agents
  { route: '/companion',      ar: 'الخوي',           en: 'Al-Khuwy',          icon: MessageSquare,group: 'agents' },
  { route: '/mudawwin',       ar: 'المدوّن',         en: 'Mudawwin',        icon: MessageSquare,group: 'agents' },
  { route: '/agents',         ar: 'كل الوكلاء',      en: 'All Agents',      icon: Users,        group: 'agents' },
  { route: '/conversations',  ar: 'المحادثات',       en: 'Conversations',   icon: MessageSquare,group: 'agents' },
  { route: '/chat',           ar: 'دردشة',           en: 'Chat',            icon: MessageSquare,group: 'agents' },
  { route: '/memory',         ar: 'الذاكرة',         en: 'Memory',          icon: Layers,       group: 'agents' },
  // System
  { route: '/approvals',      ar: 'الموافقات',       en: 'Approvals',       icon: ListTodo,     group: 'system' },
  { route: '/notifications',  ar: 'التنبيهات',       en: 'Notifications',   icon: Inbox,        group: 'system' },
  { route: '/audit-log',      ar: 'سجل التدقيق',    en: 'Audit Log',       icon: FileText,     group: 'system' },
  { route: '/schedules',      ar: 'الجدولة',         en: 'Schedules',       icon: Calendar,     group: 'system' },
  { route: '/runs',           ar: 'التشغيلات',       en: 'Runs',            icon: ListTodo,     group: 'system' },
  { route: '/settings',       ar: 'الإعدادات',       en: 'Settings',        icon: Layers,       group: 'system' },
];

// State model: a list of side panes (in addition to the main "current page" pane).
// Each side pane has a route + a relative size. Direction is shared across all.
interface SidePane {
  id: string;
  route: string;
  size: number; // 1-10 ratio weight
}
interface SplitState {
  dir: 'horizontal' | 'vertical' | null;
  panes: SidePane[]; // 0..3 side panes (main + N = up to 4 total)
  mainSize: number;  // ratio weight for the main pane
}

const STORAGE_KEY = 'ruhool.split-pane.v2';
const MAX_PANES = 3; // total visible = 1 main + 3 = 4

// Panes start with no route — user picks via launcher inside the empty pane.
// Avoids forcing /zotero as default when user might want anything else.
function newPane(route = ''): SidePane {
  return { id: Math.random().toString(36).slice(2), route, size: 5 };
}

export function SplitPaneArea({ children }: { children: React.ReactNode }) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [state, setState] = useState<SplitState>(() => {
    if (typeof window === 'undefined') return { dir: null, panes: [], mainSize: 5 };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '');
      if (saved && typeof saved === 'object' && Array.isArray(saved.panes)) return saved;
    } catch {}
    return { dir: null, panes: [], mainSize: 5 };
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  const containerRef = useRef<HTMLDivElement>(null);

  const popOut = (route?: string) => {
    const url = route ?? window.location.pathname;
    const w = window.screen.availWidth > 1600 ? 1200 : 900;
    const h = window.screen.availHeight - 100;
    window.open(url, '_blank', `width=${w},height=${h},menubar=no,toolbar=no,status=no`);
  };

  const split = (dir: 'horizontal' | 'vertical') => {
    setState((s) => {
      if (s.panes.length === 0) return { dir, panes: [newPane()], mainSize: 5 };
      return { ...s, dir };
    });
  };

  const addPane = () => setState((s) => {
    if (s.panes.length >= MAX_PANES) return s;
    return { ...s, panes: [...s.panes, newPane()] };
  });

  const closePane = (id: string) => setState((s) => {
    const next = { ...s, panes: s.panes.filter((p) => p.id !== id) };
    if (next.panes.length === 0) return { dir: null, panes: [], mainSize: 5 };
    return next;
  });

  const setPaneRoute = (id: string, route: string) => setState((s) => ({
    ...s, panes: s.panes.map((p) => p.id === id ? { ...p, route } : p),
  }));

  // Keyboard shortcut: Ctrl+\ adds/removes a pane
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        if (state.panes.length === 0) split('horizontal');
        else if (e.shiftKey) addPane();
        else closePane(state.panes[state.panes.length - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Resize between any two adjacent panes (index i and i+1 in the layout array)
  const resizeAt = useCallback((leftIndex: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    const startPos = state.dir === 'horizontal' ? e.clientX : e.clientY;
    // Build current sizes array: [mainSize, ...panes.size]
    const sizes = [state.mainSize, ...state.panes.map((p) => p.size)];
    const startLeft = sizes[leftIndex];
    const startRight = sizes[leftIndex + 1];

    const onMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const total = state.dir === 'horizontal' ? rect.width : rect.height;
      const totalRatio = sizes.reduce((a, b) => a + b, 0);
      const cur = state.dir === 'horizontal' ? ev.clientX : ev.clientY;
      let delta = cur - startPos;
      if (state.dir === 'horizontal' && isRTL) delta = -delta;
      const deltaRatio = (delta / total) * totalRatio;
      const newLeft = Math.max(1, startLeft + deltaRatio);
      const newRight = Math.max(1, startRight - deltaRatio);
      setState((s) => {
        const newSizes = [s.mainSize, ...s.panes.map((p) => p.size)];
        newSizes[leftIndex] = newLeft;
        newSizes[leftIndex + 1] = newRight;
        return {
          ...s,
          mainSize: newSizes[0],
          panes: s.panes.map((p, i) => ({ ...p, size: newSizes[i + 1] })),
        };
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [state, isRTL]);

  // No splits — just render the main page with floating split toolbar
  if (!state.dir || state.panes.length === 0) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <main className="flex-1 overflow-auto pb-14 md:pb-0">{children}</main>
        <SplitToolbar
          isRTL={isRTL}
          onSplit={(preset) => setState(preset)}
          onPopOut={() => popOut()}
        />
      </div>
    );
  }

  // Split mode — main + N side panes in a flex row/column
  const totalRatio = state.mainSize + state.panes.reduce((a, p) => a + p.size, 0);
  const sizePct = (n: number) => `${(n / totalRatio) * 100}%`;

  return (
    <div
      ref={containerRef}
      className={cn('flex-1 flex overflow-hidden', state.dir === 'vertical' ? 'flex-col' : 'flex-row')}
      dir={state.dir === 'horizontal' && isRTL ? 'rtl' : 'ltr'}
    >
      {/* Main pane (the current page) */}
      <div
        style={state.dir === 'horizontal' ? { width: sizePct(state.mainSize) } : { height: sizePct(state.mainSize) }}
        className="overflow-auto bg-surface relative"
      >
        <main className="flex-1">{children}</main>
        {/* "+ Add pane" floating button on the main pane */}
        {state.panes.length < MAX_PANES && (
          <button
            onClick={addPane}
            title={isRTL ? `أضف لوحة جانبية (${state.panes.length + 1}/${MAX_PANES + 1})` : `Add side pane (${state.panes.length + 1}/${MAX_PANES + 1})`}
            className="absolute top-2 end-12 z-30 p-1.5 rounded bg-accent/15 hover:bg-accent text-accent hover:text-on-accent border border-accent/30 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Side panes */}
      {state.panes.map((pane, idx) => (
        <Pane
          key={pane.id}
          pane={pane}
          dir={state.dir!}
          sizeStyle={state.dir === 'horizontal' ? { width: sizePct(pane.size) } : { height: sizePct(pane.size) }}
          isRTL={isRTL}
          onClose={() => closePane(pane.id)}
          onSetRoute={(r) => setPaneRoute(pane.id, r)}
          onPopOut={() => popOut(pane.route)}
          onResizeStart={resizeAt(idx)} // resize between this pane and the one before it
          isFirst={idx === 0}
        />
      ))}
    </div>
  );
}

function Pane({ pane, dir, sizeStyle, isRTL, onClose, onSetRoute, onPopOut, onResizeStart, isFirst }: {
  pane: SidePane;
  dir: 'horizontal' | 'vertical';
  sizeStyle: React.CSSProperties;
  isRTL: boolean;
  onClose: () => void;
  onSetRoute: (route: string) => void;
  onPopOut: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
  isFirst: boolean;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const meta = QUICK_ROUTES.find((r) => r.route === pane.route);
  const Icon = meta?.icon ?? ExternalLink;

  return (
    <>
      {/* Resizable divider — sits BEFORE this pane */}
      <div
        onMouseDown={onResizeStart}
        className={cn(
          'group bg-border hover:bg-accent transition-colors flex items-center justify-center shrink-0 z-10',
          dir === 'horizontal' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize',
          isFirst && 'border-accent/20'
        )}
      >
        <div className={cn(
          'opacity-0 group-hover:opacity-100 bg-accent rounded transition-opacity',
          dir === 'horizontal' ? 'w-1 h-12' : 'h-1 w-12'
        )} />
      </div>

      <div style={sizeStyle} className="overflow-hidden bg-surface flex flex-col relative">
        {/* Pane header */}
        <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-surface-secondary shrink-0">
          <div className="relative flex-1 min-w-0">
            <button
              onClick={() => setShowPicker((v) => !v)}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-on-surface hover:bg-surface-tertiary font-medium max-w-full"
            >
              <Icon className="h-3.5 w-3.5 text-accent shrink-0" />
              <span className="truncate">{meta ? (isRTL ? meta.ar : meta.en) : pane.route}</span>
              <ExternalLink className="h-3 w-3 opacity-40 shrink-0" />
            </button>
            {showPicker && (
              <div className="absolute top-full mt-1 start-0 bg-surface border border-border rounded-lg shadow-xl z-30 w-64 max-h-96 overflow-y-auto py-1">
                {(['research', 'work', 'agents', 'system'] as const).map((g) => (
                  <div key={g}>
                    <p className="text-[9px] uppercase tracking-wider text-on-surface-tertiary px-3 pt-2 pb-1">
                      {g === 'research' ? (isRTL ? '🔬 البحث' : '🔬 Research')
                        : g === 'work' ? (isRTL ? '💼 العمل' : '💼 Work')
                        : g === 'agents' ? (isRTL ? '🤖 الوكلاء' : '🤖 Agents')
                        : (isRTL ? '⚙️ النظام' : '⚙️ System')}
                    </p>
                    {QUICK_ROUTES.filter((r) => r.group === g).map((r) => {
                      const RIcon = r.icon;
                      return (
                        <button
                          key={r.route}
                          onClick={() => { onSetRoute(r.route); setShowPicker(false); }}
                          className={cn('w-full flex items-center gap-2 text-start px-3 py-1.5 text-xs hover:bg-surface-tertiary',
                            pane.route === r.route && 'bg-accent/15 text-accent')}
                        >
                          <RIcon className="h-3.5 w-3.5 shrink-0" />
                          <span className="flex-1 truncate">{isRTL ? r.ar : r.en}</span>
                          <span className="text-on-surface-tertiary text-[10px] font-mono">{r.route}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onPopOut}
            title={isRTL ? 'افتح في نافذة جديدة' : 'Pop out'}
            className="p-1 rounded hover:bg-surface-tertiary text-on-surface-tertiary hover:text-accent shrink-0"
          >
            <Monitor className="h-3 w-3" />
          </button>
          <button
            onClick={onClose}
            title={isRTL ? 'أغلق هذه اللوحة' : 'Close pane'}
            className="p-1 rounded hover:bg-surface-tertiary text-on-surface-tertiary hover:text-error shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        {pane.route ? (
          <iframe
            key={pane.route}
            src={pane.route + (pane.route.includes('?') ? '&embed=1' : '?embed=1')}
            className="flex-1 w-full border-0"
            title={pane.route}
          />
        ) : (
          <PaneLauncher onPick={onSetRoute} isRTL={isRTL} />
        )}
      </div>
    </>
  );
}

// Empty pane launcher — search + quick-icons grid (no default route)
function PaneLauncher({ onPick, isRTL }: { onPick: (route: string) => void; isRTL: boolean }) {
  const [query, setQuery] = useState('');
  const filtered = QUICK_ROUTES.filter((r) =>
    !query.trim() ||
    r.route.toLowerCase().includes(query.toLowerCase()) ||
    r.ar.includes(query) ||
    r.en.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto bg-gradient-to-br from-surface to-surface-secondary">
      <div className="w-full max-w-md">
        <div className="relative mb-4">
          <Search className={cn('absolute top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-tertiary', isRTL ? 'right-3' : 'left-3')} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && filtered[0]) onPick(filtered[0].route); }}
            placeholder={isRTL ? 'ابحث عن صفحة...' : 'Search for a page...'}
            className={cn('w-full bg-surface border border-border rounded-lg px-3 py-3 text-sm text-on-surface focus:outline-none focus:border-accent shadow-sm',
              isRTL ? 'pr-10' : 'pl-10')}
          />
        </div>

        <p className="text-[10px] uppercase tracking-wider text-on-surface-tertiary text-center mb-3">
          {isRTL ? 'أو اختر بسرعة' : 'Or pick quickly'}
        </p>

        {(['research', 'work', 'agents', 'system'] as const).map((g) => {
          const items = filtered.filter((r) => r.group === g);
          if (items.length === 0) return null;
          return (
            <div key={g} className="mb-4">
              <p className="text-[10px] uppercase tracking-wider text-on-surface-tertiary mb-2">
                {g === 'research' ? (isRTL ? '🔬 البحث' : '🔬 Research')
                  : g === 'work' ? (isRTL ? '💼 العمل' : '💼 Work')
                  : g === 'agents' ? (isRTL ? '🤖 الوكلاء' : '🤖 Agents')
                  : (isRTL ? '⚙️ النظام' : '⚙️ System')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {items.map((r) => {
                  const RIcon = r.icon;
                  return (
                    <button
                      key={r.route}
                      onClick={() => onPick(r.route)}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border bg-surface hover:border-accent hover:bg-surface-secondary text-on-surface transition-all group"
                    >
                      <RIcon className="h-5 w-5 text-on-surface-secondary group-hover:text-accent transition-colors" />
                      <span className="text-[11px] text-center line-clamp-1">{isRTL ? r.ar : r.en}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-center text-xs text-on-surface-tertiary py-6">
            {isRTL ? 'لا نتائج' : 'No matches'}
          </p>
        )}
      </div>
    </div>
  );
}

// Compact toolbar — collapsed by default, expands on hover. Positioned in
// bottom-right where it doesn't overlap with page actions in top-right.
function SplitToolbar({ isRTL, onSplit, onPopOut }: {
  isRTL: boolean;
  onSplit: (state: SplitState) => void;
  onPopOut: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="hidden md:block fixed bottom-4 end-4 z-30"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div className={cn(
        'bg-surface-secondary/95 backdrop-blur border border-border rounded-full shadow-xl transition-all duration-200 overflow-hidden',
        expanded ? 'w-auto px-2' : 'w-10'
      )}>
        <div className="flex items-center gap-0.5 h-10">
          {/* Always-visible trigger */}
          <button
            onClick={() => onSplit({ dir: 'horizontal', panes: [newPane()], mainSize: 5 })}
            title={isRTL ? 'تقسيم الشاشة (Ctrl+\\)' : 'Split screen (Ctrl+\\)'}
            className="p-2 rounded-full hover:bg-accent hover:text-on-accent text-on-surface-secondary transition-colors shrink-0"
          >
            <Columns2 className="h-4 w-4" />
          </button>
          {expanded && (
            <>
              <button
                onClick={() => onSplit({ dir: 'vertical', panes: [newPane()], mainSize: 5 })}
                title={isRTL ? 'لوحتان عمودي 50/50' : '2 vertical 50/50'}
                className="p-1.5 rounded hover:bg-accent hover:text-on-accent text-on-surface-secondary transition-colors"
              >
                <Rows2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onSplit({ dir: 'horizontal', panes: [newPane()], mainSize: 7 })}
                title={isRTL ? 'لوحتان 70/30' : '70/30 split'}
                className="px-2 py-1 rounded hover:bg-accent hover:text-on-accent text-on-surface-secondary transition-colors text-[10px] font-bold"
              >
                70/30
              </button>
              <button
                onClick={() => onSplit({ dir: 'horizontal', panes: [newPane(), newPane()], mainSize: 4 })}
                title={isRTL ? '3 لوحات' : '3 panes'}
                className="px-2 py-1 rounded hover:bg-accent hover:text-on-accent text-on-surface-secondary transition-colors text-[10px] font-bold"
              >
                3
              </button>
              <button
                onClick={() => onSplit({ dir: 'horizontal', panes: [newPane(), newPane(), newPane()], mainSize: 3 })}
                title={isRTL ? '4 لوحات' : '4 panes'}
                className="px-2 py-1 rounded hover:bg-accent hover:text-on-accent text-on-surface-secondary transition-colors text-[10px] font-bold"
              >
                4
              </button>
              <div className="w-px h-4 bg-border" />
              <button
                onClick={onPopOut}
                title={isRTL ? 'افتح في نافذة جديدة' : 'Pop out'}
                className="p-1.5 rounded-full hover:bg-accent hover:text-on-accent text-on-surface-secondary transition-colors"
              >
                <Monitor className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
