'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import {
  Loader2, Search, ExternalLink, FileText, Brain, Filter,
  Grid3x3, List, Network, X, Pencil, Link2, Tag, Calendar, RefreshCw,
} from 'lucide-react';
import { SayyaqPanel } from '@/components/shared/SayyaqPanel';
import { BacklinksPanel } from '@/components/shared';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface AtomicNote {
  path: string;
  name: string;
  mtime: number;
  tags?: string[];
  type?: string;
  status?: string;
  source?: string;
  category: string;
  connections: string[];
  connectionCount: number;
  preview: string;
  body: string;
  wordCount: number;
}

interface FullNote {
  path: string;
  name: string;
  body: string;
  bodyRaw: string;
  connections: string[];
  frontmatter: Record<string, unknown>;
}

const VAULT_NAME = 'PhD';
type ViewMode = 'grid' | 'list' | 'graph';

const PROSE_CLASSES =
  'text-sm text-on-surface leading-relaxed break-words prose prose-sm max-w-none ' +
  'prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 ' +
  'prose-pre:my-2 prose-code:text-accent prose-code:bg-surface-tertiary prose-code:px-1 ' +
  'prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-surface-tertiary ' +
  'prose-pre:rounded-lg prose-pre:p-3 prose-strong:text-on-surface prose-headings:text-on-surface ' +
  'prose-blockquote:border-accent prose-blockquote:text-on-surface-secondary ' +
  'prose-a:text-accent prose-a:no-underline hover:prose-a:underline';

// ── Graph view ────────────────────────────────────────────────────────
// Force-directed knowledge graph (Obsidian-style):
//   - Physics settles down (alpha decay) and stops — no perpetual drift
//   - Zoom: mouse wheel
//   - Pan: drag empty space
//   - Drag node: click+drag a node to pin it; double-click to unpin
//   - Hover highlights neighbours
//   - Reset view button
function GraphView({
  notes, onSelect, isRTL,
}: { notes: AtomicNote[]; onSelect: (n: AtomicNote) => void; isRTL: boolean }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // View transform (zoom + pan)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // Drag state
  const dragRef = useRef<{ kind: 'pan' | 'node' | null; nodeName?: string; startX: number; startY: number; startPan?: { x: number; y: number } }>({ kind: null, startX: 0, startY: 0 });

  // Group by category for color
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) set.add(n.category);
    return Array.from(set);
  }, [notes]);

  const catColor = (cat: string) => {
    const palette = [
      'var(--color-accent)',
      'var(--color-info)',
      'var(--color-success)',
      'var(--color-warning)',
      'var(--color-error)',
      '#a78bfa', '#f472b6', '#fb923c',
    ];
    return palette[categories.indexOf(cat) % palette.length];
  };

  const edges = useMemo(() => {
    const list: Array<{ from: string; to: string }> = [];
    const names = new Set(notes.map((n) => n.name));
    for (const n of notes) {
      for (const c of n.connections) {
        if (names.has(c)) list.push({ from: n.name, to: c });
      }
    }
    return list;
  }, [notes]);

  const W = 1000, H = 700;
  const simRef = useRef<{
    positions: Map<string, { x: number; y: number; vx: number; vy: number; cat: string; r: number; fixed?: boolean }>;
    initialized: boolean;
    alpha: number; // simulation "heat" — decays to 0; restarts on interaction
  }>({ positions: new Map(), initialized: false, alpha: 1 });

  // Initialize positions in cluster pattern
  useEffect(() => {
    const positions = new Map<string, { x: number; y: number; vx: number; vy: number; cat: string; r: number }>();
    const cx = W / 2, cy = H / 2;
    categories.forEach((cat, ci) => {
      const a0 = (ci / Math.max(1, categories.length)) * 2 * Math.PI;
      const clusterCx = cx + Math.cos(a0) * 240;
      const clusterCy = cy + Math.sin(a0) * 220;
      const items = notes.filter((n) => n.category === cat);
      items.forEach((n, ni) => {
        const a = (ni / Math.max(1, items.length)) * 2 * Math.PI + Math.random() * 0.3;
        const r = 40 + Math.min(80, items.length * 4);
        positions.set(n.name, {
          x: clusterCx + Math.cos(a) * r,
          y: clusterCy + Math.sin(a) * r,
          vx: 0, vy: 0,
          cat,
          r: 5 + Math.min(12, n.connectionCount * 1.2),
        });
      });
    });
    simRef.current = { positions, initialized: true, alpha: 1 };
    setTick((t) => t + 1);
  }, [notes, categories]);

  // Reheat simulation when something changes (drag, etc.)
  const reheat = () => { simRef.current.alpha = 0.6; };

  // Physics loop — runs while alpha > 0.005, then sleeps until reheated
  useEffect(() => {
    if (!simRef.current.initialized) return;
    let raf = 0;
    const animate = () => {
      const sim = simRef.current;
      if (sim.alpha < 0.005) {
        // settled — check periodically (low cost) for a reheat
        raf = requestAnimationFrame(animate);
        return;
      }
      const positions = sim.positions;
      const cx = W / 2, cy = H / 2;

      const REPULSION = 700;
      const SPRING = 0.018;
      const SPRING_REST = 95;
      const CENTER_PULL = 0.004;
      const FRICTION = 0.82;

      // Repulsion (O(n²))
      const arr = Array.from(positions.entries());
      for (let i = 0; i < arr.length; i++) {
        const [, a] = arr[i];
        if (a.fixed) continue;
        for (let j = i + 1; j < arr.length; j++) {
          const [, b] = arr[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const distSq = dx * dx + dy * dy + 1;
          const dist = Math.sqrt(distSq);
          const force = (REPULSION / distSq) * sim.alpha;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (!a.fixed) { a.vx -= fx; a.vy -= fy; }
          if (!b.fixed) { b.vx += fx; b.vy += fy; }
        }
      }

      // Springs
      for (const e of edges) {
        const a = positions.get(e.from);
        const b = positions.get(e.to);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const force = (dist - SPRING_REST) * SPRING * sim.alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (!a.fixed) { a.vx += fx; a.vy += fy; }
        if (!b.fixed) { b.vx -= fx; b.vy -= fy; }
      }

      // Center pull + integration
      for (const [, p] of positions) {
        if (p.fixed) { p.vx = 0; p.vy = 0; continue; }
        p.vx += (cx - p.x) * CENTER_PULL * sim.alpha;
        p.vy += (cy - p.y) * CENTER_PULL * sim.alpha;
        p.vx *= FRICTION;
        p.vy *= FRICTION;
        p.x += p.vx;
        p.y += p.vy;
      }

      // Cool down
      sim.alpha *= 0.985;
      setTick((t) => t + 1);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [edges, simRef.current.initialized]);

  // ── View transform helpers ────────────────────────────────────────
  // Convert screen coords (in SVG client space) to graph coords
  const screenToGraph = (sx: number, sy: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: sx, y: sy };
    const rect = svg.getBoundingClientRect();
    // SVG viewBox is 0..W, 0..H mapped to rect.width × rect.height
    const vx = ((sx - rect.left) / rect.width) * W;
    const vy = ((sy - rect.top) / rect.height) * H;
    return { x: (vx - pan.x) / zoom, y: (vy - pan.y) / zoom };
  };

  // Mouse handlers on SVG
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, startPan: { ...pan } };
  };
  const handleNodeMouseDown = (e: React.MouseEvent, nodeName: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const p = simRef.current.positions.get(nodeName);
    if (p) p.fixed = true;
    dragRef.current = { kind: 'node', nodeName, startX: e.clientX, startY: e.clientY };
    reheat();
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (!drag.kind) return;
    if (drag.kind === 'pan' && drag.startPan) {
      setPan({
        x: drag.startPan.x + (e.clientX - drag.startX),
        y: drag.startPan.y + (e.clientY - drag.startY),
      });
    } else if (drag.kind === 'node' && drag.nodeName) {
      const g = screenToGraph(e.clientX, e.clientY);
      const p = simRef.current.positions.get(drag.nodeName);
      if (p) {
        p.x = g.x;
        p.y = g.y;
        p.vx = 0;
        p.vy = 0;
      }
      reheat();
    }
  };
  const handleMouseUp = () => {
    dragRef.current = { kind: null, startX: 0, startY: 0 };
  };
  const handleNodeDoubleClick = (e: React.MouseEvent, nodeName: string) => {
    e.stopPropagation();
    const p = simRef.current.positions.get(nodeName);
    if (p) p.fixed = false;
    reheat();
  };
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    const newZoom = Math.max(0.25, Math.min(4, zoom * (1 + delta)));
    // Zoom around mouse cursor
    const svg = svgRef.current;
    if (svg) {
      const rect = svg.getBoundingClientRect();
      const sx = ((e.clientX - rect.left) / rect.width) * W;
      const sy = ((e.clientY - rect.top) / rect.height) * H;
      const factor = newZoom / zoom;
      setPan({
        x: sx - (sx - pan.x) * factor,
        y: sy - (sy - pan.y) * factor,
      });
    }
    setZoom(newZoom);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    // Also unpin all nodes and reheat
    for (const [, p] of simRef.current.positions) p.fixed = false;
    reheat();
  };

  const connectedSet = useMemo(() => {
    if (!hovered) return null;
    const s = new Set<string>([hovered]);
    for (const e of edges) {
      if (e.from === hovered) s.add(e.to);
      if (e.to === hovered) s.add(e.from);
    }
    return s;
  }, [hovered, edges]);

  return (
    <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold text-on-surface">
            {isRTL ? 'الرسم المعرفي' : 'Knowledge Graph'}
          </span>
          <span className="text-[11px] text-on-surface-tertiary">
            {notes.length} {isRTL ? 'ملاحظة' : 'notes'} · {edges.length} {isRTL ? 'رابط' : 'edges'}
          </span>
        </div>
        {/* Category legend */}
        <div className="flex items-center gap-2 flex-wrap">
          {categories.slice(0, 6).map((cat) => (
            <div key={cat} className="flex items-center gap-1 text-[10px] text-on-surface-tertiary">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: catColor(cat) }} />
              {cat}
            </div>
          ))}
          {categories.length > 6 && (
            <span className="text-[10px] text-on-surface-tertiary">+{categories.length - 6}</span>
          )}
        </div>
      </div>
      <div className="relative bg-surface" style={{ height: 600 }}>
        {/* Subtle gradient ambience (no animation — keeps the eye still) */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 30% 40%, var(--color-accent), transparent 50%), radial-gradient(circle at 70% 60%, var(--color-info), transparent 50%)',
            filter: 'blur(60px)',
          }}
        />

        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className={cn('relative w-full h-full select-none', dragRef.current.kind === 'pan' ? 'cursor-grabbing' : 'cursor-grab')}
          preserveAspectRatio="xMidYMid meet"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          <defs>
            <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Transform group — applies zoom + pan */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Edges */}
            {edges.map((e, i) => {
              const a = simRef.current.positions.get(e.from);
              const b = simRef.current.positions.get(e.to);
              if (!a || !b) return null;
              const isHighlighted = !!connectedSet && (connectedSet.has(e.from) && connectedSet.has(e.to));
              const isDimmed = !!connectedSet && !isHighlighted;
              return (
                <line
                  key={i}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={isHighlighted ? 'var(--color-accent)' : 'var(--color-border-hover)'}
                  strokeWidth={isHighlighted ? 1.5 / zoom : 0.6 / zoom}
                  opacity={isDimmed ? 0.08 : isHighlighted ? 0.9 : 0.5}
                />
              );
            })}

            {/* Nodes */}
            {notes.map((n) => {
              const p = simRef.current.positions.get(n.name);
              if (!p) return null;
              const isHovered = hovered === n.name;
              const isInCluster = !!connectedSet && connectedSet.has(n.name);
              const isDimmed = !!connectedSet && !isInCluster;
              const r = isHovered ? p.r * 1.3 : p.r;
              return (
                <g
                  key={n.path}
                  transform={`translate(${p.x}, ${p.y})`}
                  className={p.fixed ? 'cursor-move' : 'cursor-pointer'}
                  onMouseEnter={() => setHovered(n.name)}
                  onMouseLeave={() => setHovered(null)}
                  onMouseDown={(ev) => handleNodeMouseDown(ev, n.name)}
                  onDoubleClick={(ev) => handleNodeDoubleClick(ev, n.name)}
                  onClick={(ev) => {
                    // Only trigger select if it wasn't a drag
                    if (!dragRef.current.kind) onSelect(n);
                  }}
                  opacity={isDimmed ? 0.25 : 1}
                >
                  {isHovered && (
                    <circle r={r * 1.8} fill={catColor(p.cat)} opacity={0.15} />
                  )}
                  <circle
                    r={r}
                    fill={catColor(p.cat)}
                    opacity={0.9}
                    filter="url(#node-glow)"
                  />
                  <circle r={r} fill="none" stroke="var(--color-surface)" strokeWidth={1.5 / zoom} />
                  {/* Pin indicator */}
                  {p.fixed && (
                    <circle r={r * 0.4} fill="var(--color-on-surface)" opacity={0.7} />
                  )}
                  {/* Label always visible if zoom is high, else only on hover */}
                  {(isHovered || zoom > 1.5) && (
                    <text
                      y={-r - 6 / zoom}
                      fill="var(--color-on-surface)"
                      fontSize={11 / zoom}
                      fontWeight="600"
                      textAnchor="middle"
                      style={{ paintOrder: 'stroke', stroke: 'var(--color-surface)', strokeWidth: 3 / zoom }}
                    >
                      {n.name.length > 28 ? n.name.slice(0, 28) + '…' : n.name}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Zoom + reset controls */}
        <div className={cn('absolute top-4 flex flex-col gap-1 z-10', isRTL ? 'left-4' : 'right-4')}>
          <button
            onClick={() => setZoom((z) => Math.min(4, z * 1.25))}
            title={isRTL ? 'تكبير' : 'Zoom in'}
            className="h-8 w-8 rounded-lg border border-border bg-surface hover:bg-surface-tertiary text-on-surface-secondary flex items-center justify-center text-base font-bold"
          >+</button>
          <button
            onClick={() => setZoom((z) => Math.max(0.25, z * 0.8))}
            title={isRTL ? 'تصغير' : 'Zoom out'}
            className="h-8 w-8 rounded-lg border border-border bg-surface hover:bg-surface-tertiary text-on-surface-secondary flex items-center justify-center text-base font-bold"
          >−</button>
          <button
            onClick={resetView}
            title={isRTL ? 'إعادة' : 'Reset view'}
            className="h-8 w-8 rounded-lg border border-border bg-surface hover:bg-surface-tertiary text-on-surface-secondary flex items-center justify-center"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <div className="px-2 py-1 rounded text-[10px] text-on-surface-tertiary text-center bg-surface border border-border">
            {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* Hover detail card */}
        {hovered && (() => {
          const n = notes.find((x) => x.name === hovered);
          if (!n) return null;
          return (
            <div className={cn('absolute bottom-4 max-w-sm rounded-xl border border-border bg-surface-secondary backdrop-blur-md p-3 shadow-lg pointer-events-none animate-[fadeInUp_0.15s_ease-out]', isRTL ? 'right-4' : 'left-4')}>
              <div className="flex items-center gap-2 mb-1">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: catColor(n.category) }} />
                <span className="text-[10px] uppercase tracking-wider text-on-surface-tertiary">{n.category}</span>
              </div>
              <p className="text-sm font-semibold text-on-surface">{n.name}</p>
              {n.preview && (
                <p className="text-xs text-on-surface-tertiary line-clamp-2 mt-1">{n.preview}</p>
              )}
              <p className="text-[10px] text-on-surface-tertiary mt-2">
                {n.connectionCount} {isRTL ? 'رابط' : 'connections'} · {n.wordCount}w
              </p>
            </div>
          );
        })()}

        <span className="hidden">{tick}</span>
      </div>
      <div className="px-5 py-2 border-t border-border text-[11px] text-on-surface-tertiary text-center">
        {isRTL
          ? 'عجلة الفأرة: تكبير · سحب الخلفية: تحريك · سحب نقطة: تثبيتها · نقر مزدوج: إلغاء التثبيت · نقر: قراءة'
          : 'Wheel: zoom · Drag bg: pan · Drag node: pin · Double-click: unpin · Click: read'}
      </div>
    </div>
  );
}

// ── Read modal ────────────────────────────────────────────────────────
function ReadModal({
  noteName, onClose, isRTL, onOpenInObsidian,
}: { noteName: string; onClose: () => void; isRTL: boolean; onOpenInObsidian: (path: string) => void }) {
  const [data, setData] = useState<FullNote | null>(null);
  const [loading, setLoading] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Find the note by name to get its path
    (async () => {
      setLoading(true);
      try {
        const list = await apiFetch<{ notes: AtomicNote[] }>('/api/vault/atomic-notes');
        const match = list.notes.find((n) => n.name === noteName);
        if (!match) { setLoading(false); return; }
        const full = await apiFetch<FullNote>(`/api/vault/atomic-notes/${match.path.split('/').map((s) => encodeURIComponent(s)).join('/')}`);
        setData(full);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [noteName]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-[fadeInUp_0.2s_ease-out]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={modalRef}
        className="bg-surface border border-border rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-accent shrink-0" />
            <h2 className="text-base font-semibold text-on-surface truncate">{data?.name ?? noteName}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Edit in platform — Obsidian edit button removed (Law 1) */}
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-surface-secondary text-on-surface-tertiary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-on-surface-tertiary" />
            </div>
          ) : !data ? (
            <p className="text-sm text-on-surface-tertiary text-center py-10">
              {isRTL ? 'تعذّر تحميل الملاحظة' : 'Could not load note'}
            </p>
          ) : (
            <div dir={/[؀-ۿ]/.test(data.body) ? 'rtl' : 'ltr'}>
              <div className={PROSE_CLASSES}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.body}</ReactMarkdown>
              </div>

              {/* Sayyaq writing assistant */}
              <div className="mt-6">
                <SayyaqPanel
                  context={{ title: data.name, body: data.body, kind: 'atomic-note', path: data.path }}
                  onAccept={(newBody) => {
                    // Save + reload
                    apiFetch(`/api/vault/atomic-notes/${data.path.split('/').map((s) => encodeURIComponent(s)).join('/')}`, {
                      method: 'PUT',
                      body: JSON.stringify({ body: newBody }),
                    }).then(() => setData({ ...data, body: newBody }));
                  }}
                />
              </div>

              {/* Connections */}
              {data.connections.length > 0 && (
                <div className="mt-8 pt-6 border-t border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <Link2 className="h-3.5 w-3.5 text-info" />
                    <span className="text-xs uppercase tracking-wider text-on-surface-tertiary">
                      {isRTL ? 'مترابط مع' : 'Connected to'} ({data.connections.length})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.connections.map((c) => (
                      <span
                        key={c}
                        className="text-xs px-3 py-1 rounded-full bg-info/10 text-info"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Backlinks — what references THIS note */}
              <BacklinksPanel
                nodeId={`note-${data.path}`}
                className="mt-6 pt-4 border-t border-border"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────
export function NotesPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [notes, setNotes] = useState<AtomicNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('grid');
  const [openNote, setOpenNote] = useState<string | null>(null); // note name being read

  useEffect(() => {
    apiFetch<{ notes: AtomicNote[] }>('/api/vault/atomic-notes')
      .then((d) => setNotes(d.notes))
      .catch((e) => setError(e instanceof Error ? e.message : 'failed'))
      .finally(() => setLoading(false));
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) for (const t of (n.tags ?? [])) set.add(t);
    return Array.from(set).sort();
  }, [notes]);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) set.add(n.category);
    return Array.from(set).sort();
  }, [notes]);

  const filtered = notes.filter((n) => {
    if (categoryFilter && n.category !== categoryFilter) return false;
    if (tagFilter && !(n.tags ?? []).includes(tagFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      return n.name.toLowerCase().includes(q)
        || n.preview.toLowerCase().includes(q)
        || n.body.toLowerCase().includes(q);
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => b.mtime - a.mtime);

  const openInObsidian = (path: string) => {
    const url = `obsidian://open?vault=${VAULT_NAME}&file=${encodeURIComponent(path.replace(/\.md$/, ''))}`;
    window.open(url, '_blank');
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-surface">
      <Loader2 className="h-8 w-8 animate-spin text-on-surface-tertiary" />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-surface" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="border-b border-border bg-surface-secondary px-6 md:px-10 py-6 sticky top-0 z-10 backdrop-blur-sm bg-surface-secondary/95">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-[var(--radius-lg)] bg-accent/10 text-accent flex items-center justify-center shrink-0">
                <Brain size={22} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-on-surface">
                  {isRTL ? 'الملاحظات الذرية' : 'Atomic Notes'}
                </h1>
                <p className="text-xs text-on-surface-tertiary mt-0.5">
                  {isRTL
                    ? `${notes.length} فكرة ذرية مترابطة — مصدرها Obsidian`
                    : `${notes.length} interconnected atomic ideas — sourced from Obsidian`}
                </p>
              </div>
            </div>

            {/* View mode switcher */}
            <div className="flex items-center gap-1 border border-border rounded-lg p-1 bg-surface">
              {([
                { id: 'grid' as ViewMode, icon: Grid3x3, label: { en: 'Grid', ar: 'شبكة' } },
                { id: 'list' as ViewMode, icon: List, label: { en: 'List', ar: 'قائمة' } },
                { id: 'graph' as ViewMode, icon: Network, label: { en: 'Graph', ar: 'رسم' } },
              ]).map((v) => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  title={v.label[language]}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors',
                    view === v.id
                      ? 'bg-accent text-on-accent'
                      : 'text-on-surface-tertiary hover:text-on-surface-secondary hover:bg-surface-secondary'
                  )}
                >
                  <v.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{v.label[language]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Search + filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              <Search className={cn('absolute top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-tertiary', isRTL ? 'right-3' : 'left-3')} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isRTL ? 'بحث في العنوان أو المحتوى...' : 'Search title or body...'}
                className={cn(
                  'w-full bg-surface border border-border rounded-lg py-2 text-sm text-on-surface placeholder:text-on-surface-tertiary',
                  'focus:outline-none focus:border-accent',
                  isRTL ? 'pr-10 pl-3' : 'pl-10 pr-3'
                )}
              />
            </div>
          </div>

          {/* Category pills */}
          {allCategories.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-3">
              <button
                onClick={() => setCategoryFilter(null)}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-full transition-colors',
                  !categoryFilter ? 'bg-accent text-on-accent' : 'text-on-surface-tertiary bg-surface hover:bg-surface-tertiary'
                )}
              >
                {isRTL ? 'كل التصنيفات' : 'All'} ({notes.length})
              </button>
              {allCategories.map((cat) => {
                const count = notes.filter((n) => n.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                    className={cn(
                      'text-xs px-2.5 py-1 rounded-full transition-colors',
                      categoryFilter === cat
                        ? 'bg-accent text-on-accent'
                        : 'text-on-surface-secondary bg-surface hover:bg-surface-tertiary'
                    )}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Tag pills */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-2">
              <Tag className="h-3 w-3 text-on-surface-tertiary" />
              {allTags.slice(0, 12).map((t) => (
                <button
                  key={t}
                  onClick={() => setTagFilter(tagFilter === t ? null : t)}
                  className={cn(
                    'text-[10px] px-2 py-0.5 rounded-full transition-colors',
                    tagFilter === t ? 'bg-info text-on-accent' : 'text-on-surface-tertiary bg-surface hover:bg-surface-tertiary'
                  )}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-8">
        {error && (
          <div className="rounded-lg border border-warning bg-warning/10 px-4 py-3 text-sm text-warning mb-6">
            {isRTL ? 'تعذّر تحميل الملاحظات' : 'Could not load notes'} — {error}
          </div>
        )}

        {sorted.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-secondary p-12 text-center">
            <FileText className="h-10 w-10 text-on-surface-tertiary mx-auto mb-3 opacity-40" />
            <p className="text-sm text-on-surface-tertiary">
              {isRTL ? 'لا توجد ملاحظات تطابق التصفية' : 'No notes match the filter'}
            </p>
          </div>
        ) : view === 'graph' ? (
          <GraphView notes={sorted} onSelect={(n) => setOpenNote(n.name)} isRTL={isRTL} />
        ) : view === 'list' ? (
          <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden divide-y divide-border">
            {sorted.map((n) => (
              <button
                key={n.path}
                onClick={() => setOpenNote(n.name)}
                className="w-full text-start flex items-start gap-3 px-5 py-3 hover:bg-surface-tertiary transition-colors group"
                dir={/[؀-ۿ]/.test(n.name) ? 'rtl' : 'ltr'}
              >
                <FileText className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-on-surface truncate group-hover:text-accent transition-colors">{n.name}</h3>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-tertiary text-on-surface-tertiary shrink-0">
                      {n.category}
                    </span>
                  </div>
                  {n.preview && (
                    <p className="text-xs text-on-surface-secondary line-clamp-1 mt-1">{n.preview}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-on-surface-tertiary shrink-0">
                  {n.connectionCount > 0 && (
                    <span className="flex items-center gap-1">
                      <Link2 className="h-3 w-3" /> {n.connectionCount}
                    </span>
                  )}
                  <span>{n.wordCount}w</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          // Grid view
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((n) => (
              <div
                key={n.path}
                onClick={() => setOpenNote(n.name)}
                className="group cursor-pointer rounded-xl border border-border bg-surface-secondary hover:border-accent hover:bg-surface-tertiary transition-all p-4 flex flex-col gap-2"
                dir={/[؀-ۿ]/.test(n.name) ? 'rtl' : 'ltr'}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-on-surface line-clamp-2 group-hover:text-accent transition-colors">
                    {n.name}
                  </h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-tertiary text-on-surface-tertiary shrink-0">
                    {n.category}
                  </span>
                </div>
                {n.preview && (
                  <p className="text-xs text-on-surface-secondary line-clamp-3 leading-relaxed">
                    {n.preview}
                  </p>
                )}
                <div className="flex items-center gap-3 text-[10px] text-on-surface-tertiary mt-auto pt-2">
                  {n.connectionCount > 0 && (
                    <span className="flex items-center gap-1">
                      <Link2 className="h-3 w-3" />
                      {n.connectionCount} {isRTL ? 'رابط' : 'links'}
                    </span>
                  )}
                  <span>{n.wordCount} {isRTL ? 'كلمة' : 'words'}</span>
                  {(n.tags ?? []).slice(0, 2).map((t) => (
                    <span key={t} className="px-1.5 py-0.5 rounded bg-surface-tertiary opacity-70">#{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Read modal */}
      {openNote && (
        <ReadModal
          noteName={openNote}
          onClose={() => setOpenNote(null)}
          isRTL={isRTL}
          onOpenInObsidian={openInObsidian}
        />
      )}
    </div>
  );
}
