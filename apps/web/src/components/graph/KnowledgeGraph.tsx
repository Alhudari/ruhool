'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Network, Loader2, X, RefreshCw, Search,
  Users, ExternalLink, Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type NodeType =
  | 'agent' | 'meeting' | 'note' | 'paper' | 'source'
  | 'task' | 'conversation' | 'zotero' | 'tag' | 'grs2';

type FilterType = 'all' | 'meetings' | 'notes' | 'agents' | 'zotero' | 'tags';

interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  href?: string;
  date?: string;
  tags?: string[];
  props?: Record<string, string | number | boolean>;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation?: string;
  type?: string;
}

interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── Internal simulation node ───────────────────────────────────────────────

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

// ── Color + size helpers ───────────────────────────────────────────────────

const NODE_COLOR: Record<NodeType, string> = {
  agent:        '#7c5aed',
  meeting:      '#3b82f6',
  note:         '#10b981',
  paper:        '#f59e0b',
  source:       '#f59e0b',
  task:         '#ef4444',
  conversation: '#6366f1',
  zotero:       '#8b5cf6',
  tag:          '#14b8a6',
  grs2:         '#f97316',
};

const NODE_RADIUS: Record<NodeType, number> = {
  agent:        18,
  meeting:      12,
  paper:        12,
  source:       12,
  note:         8,
  task:         8,
  conversation: 10,
  zotero:       10,
  tag:          6,
  grs2:         10,
};

const NODE_EMOJI: Record<NodeType, string> = {
  agent:        '🤖',
  meeting:      '📅',
  note:         '📝',
  paper:        '📄',
  source:       '📄',
  task:         '✅',
  conversation: '💬',
  zotero:       '📚',
  tag:          '#',
  grs2:         '🔬',
};

const TYPE_LABEL_EN: Record<NodeType, string> = {
  agent:        'Agent',
  meeting:      'Meeting',
  note:         'Note',
  paper:        'Paper',
  source:       'Source',
  task:         'Task',
  conversation: 'Conversation',
  zotero:       'Zotero',
  tag:          'Tag',
  grs2:         'GRS2',
};

const FILTER_LABELS: Record<FilterType, string> = {
  all:      'All',
  meetings: 'Meetings',
  notes:    'Notes',
  agents:   'Agents',
  zotero:   'Zotero',
  tags:     'Tags',
};

const FILTER_TO_TYPES: Record<FilterType, NodeType[]> = {
  all:      [],
  meetings: ['meeting'],
  notes:    ['note', 'task', 'conversation'],
  agents:   ['agent'],
  zotero:   ['zotero', 'paper', 'source'],
  tags:     ['tag'],
};

function nodeColor(type: NodeType): string {
  return NODE_COLOR[type] ?? '#94a3b8';
}

function nodeRadius(type: NodeType): number {
  return NODE_RADIUS[type] ?? 8;
}

// ── Edge style helpers ─────────────────────────────────────────────────────

const EDGE_COLOR: Record<string, string> = {
  'wikilink':   '#7c5aed',  // purple — knowledge links
  'agent-work': '#3b82f6',  // blue — agent activity
  'sequence':   '#94a3b8',  // grey — chronological chain
  'tag':        '#14b8a6',  // teal — tag associations
  'reference':  '#f59e0b',  // amber — references
};

const EDGE_STROKE_WIDTH: Record<string, number> = {
  'wikilink':   2,
  'agent-work': 1.5,
  'sequence':   1,
  'tag':        1.5,
  'reference':  1.5,
};

const EDGE_OPACITY: Record<string, number> = {
  'wikilink':   0.7,
  'agent-work': 0.5,
  'sequence':   0.3,
  'tag':        0.5,
  'reference':  0.6,
};

function edgeColor(type?: string): string {
  return EDGE_COLOR[type ?? ''] ?? '#94a3b8';
}

function edgeStrokeWidth(type?: string): number {
  return EDGE_STROKE_WIDTH[type ?? ''] ?? 1;
}

function edgeOpacity(type?: string): number {
  return EDGE_OPACITY[type ?? ''] ?? 0.35;
}

// ── Force simulation ───────────────────────────────────────────────────────

function buildSimNodes(nodes: GraphNode[]): SimNode[] {
  const angleStep = (2 * Math.PI) / Math.max(nodes.length, 1);
  const spread = Math.max(160, nodes.length * 18);
  return nodes.map((n, i) => ({
    ...n,
    x: Math.cos(angleStep * i) * spread + (Math.random() - 0.5) * 40,
    y: Math.sin(angleStep * i) * spread + (Math.random() - 0.5) * 40,
    vx: 0,
    vy: 0,
    radius: nodeRadius(n.type),
    color: nodeColor(n.type),
  }));
}

function runSimIteration(
  simNodes: SimNode[],
  edges: GraphEdge[],
): void {
  const len = simNodes.length;

  // Repulsion
  for (let i = 0; i < len; i++) {
    for (let j = i + 1; j < len; j++) {
      const a = simNodes[i];
      const b = simNodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const minDist = a.radius + b.radius + 40;
      if (dist < minDist) {
        const force = (minDist - dist) * 0.06;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }
  }

  // Global weak centering gravity
  for (const node of simNodes) {
    node.vx -= node.x * 0.0008;
    node.vy -= node.y * 0.0008;
  }

  // Edge attraction
  for (const edge of edges) {
    const s = simNodes.find((n) => n.id === edge.source);
    const t = simNodes.find((n) => n.id === edge.target);
    if (!s || !t) continue;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const idealDist = (s.type === 'agent' || t.type === 'agent') ? 120 : 80;
    const force = (dist - idealDist) * 0.004;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    s.vx += fx;
    s.vy += fy;
    t.vx -= fx;
    t.vy -= fy;
  }

  // Apply + damp
  for (const node of simNodes) {
    node.vx *= 0.82;
    node.vy *= 0.82;
    node.x += node.vx;
    node.y += node.vy;
  }
}

// ── Legend chip ────────────────────────────────────────────────────────────

const LEGEND_ITEMS: { type: NodeType; label: string }[] = [
  { type: 'agent',        label: 'Agent' },
  { type: 'meeting',      label: 'Meeting' },
  { type: 'note',         label: 'Note' },
  { type: 'paper',        label: 'Paper/Source' },
  { type: 'task',         label: 'Task' },
  { type: 'conversation', label: 'Conversation' },
  { type: 'zotero',       label: 'Zotero' },
  { type: 'tag',          label: 'Tag' },
];

// ── Main component ─────────────────────────────────────────────────────────

export function KnowledgeGraph() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [rawNodes, setRawNodes]     = useState<GraphNode[]>([]);
  const [rawEdges, setRawEdges]     = useState<GraphEdge[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState<FilterType>('all');
  const [showAgents, setShowAgents] = useState(true);
  const [search, setSearch]         = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // SVG pan/zoom
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewBox, setViewBox] = useState({ x: -500, y: -350, w: 1000, h: 700 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });

  // Simulation
  const simNodesRef = useRef<SimNode[]>([]);
  const animRef     = useRef<number | null>(null);
  const itersRef    = useRef(0);
  const [tick, setTick] = useState(0); // forces re-render each frame

  // ── Fetch ───────────────────────────────────────────────────────────────

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<GraphResponse>('/api/graph/full');
      setRawNodes(data.nodes ?? []);
      setRawEdges(data.edges ?? []);
    } catch {
      // silent — graph may not exist yet
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  // ── Filter nodes ────────────────────────────────────────────────────────

  const visibleNodes = rawNodes.filter((n) => {
    if (!showAgents && n.type === 'agent') return false;
    if (filter !== 'all') {
      const allowed = FILTER_TO_TYPES[filter];
      if (!allowed.includes(n.type)) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!n.label.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = rawEdges.filter(
    (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
  );

  // ── Re-run simulation when visible set changes ──────────────────────────

  useEffect(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    itersRef.current = 0;
    simNodesRef.current = buildSimNodes(visibleNodes);

    function tick() {
      runSimIteration(simNodesRef.current, visibleEdges);
      itersRef.current++;
      setTick((v) => v + 1);
      if (itersRef.current < 150) {
        animRef.current = requestAnimationFrame(tick);
      }
    }
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, showAgents, search, rawNodes.length]);

  // ── Selected node helpers ────────────────────────────────────────────────

  const selectedSimNode = simNodesRef.current.find((n) => n.id === selectedId) ?? null;
  const connectedEdges  = visibleEdges.filter(
    (e) => e.source === selectedId || e.target === selectedId,
  );
  const connectedNodes  = connectedEdges.map((e) => {
    const otherId = e.source === selectedId ? e.target : e.source;
    return simNodesRef.current.find((n) => n.id === otherId);
  }).filter(Boolean) as SimNode[];

  // ── SVG interactions ─────────────────────────────────────────────────────

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const scale = e.deltaY > 0 ? 1.12 : 0.9;
    setViewBox((v) => {
      const cx = v.x + v.w / 2;
      const cy = v.y + v.h / 2;
      return { x: cx - (v.w * scale) / 2, y: cy - (v.h * scale) / 2, w: v.w * scale, h: v.h * scale };
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const tag = (e.target as SVGElement).tagName;
    if (tag === 'svg' || tag === 'rect') {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    const svgW = svgRef.current?.clientWidth || 800;
    const svgH = svgRef.current?.clientHeight || 600;
    const dx = (e.clientX - panStart.current.x) * (viewBox.w / svgW);
    const dy = (e.clientY - panStart.current.y) * (viewBox.h / svgH);
    setViewBox((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
    panStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => setIsPanning(false);

  // ── Render ───────────────────────────────────────────────────────────────

  const simNodes = simNodesRef.current;

  return (
    <div
      className={cn('flex flex-col h-full', isRTL && 'rtl')}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-border shrink-0">
        {/* Title */}
        <div className="flex items-center gap-2 me-2 shrink-0">
          <div className="w-8 h-8 rounded-[var(--radius)] bg-accent/10 text-accent flex items-center justify-center shrink-0">
            <Network size={16} />
          </div>
          <div>
            <span className="text-sm font-semibold text-on-surface leading-none block">
              {isRTL ? 'خريطة المعرفة' : 'Knowledge Graph'}
            </span>
            <span className="text-[10px] text-on-surface-tertiary leading-none">
              {isRTL ? 'الروابط المعرفية للبحث' : 'PhD knowledge connections'}
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search size={13} className={cn('absolute top-1/2 -translate-y-1/2 text-on-surface-tertiary', isRTL ? 'right-2.5' : 'left-2.5')} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isRTL ? 'ابحث في العقد…' : 'Search nodes…'}
            className={cn(
              'w-full h-8 bg-input border border-border rounded-[var(--radius)] text-xs focus:outline-none focus:ring-1 focus:ring-ring',
              isRTL ? 'pe-2.5 ps-8' : 'pl-8 pr-2.5',
            )}
          />
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1">
          {(Object.keys(FILTER_LABELS) as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-2.5 py-1 rounded-[var(--radius)] text-xs border transition-colors',
                filter === f
                  ? 'bg-accent text-on-accent border-accent font-semibold'
                  : 'bg-surface border-border text-on-surface-secondary hover:bg-surface-secondary',
              )}
            >
              {isRTL ? FILTER_LABELS_AR[f] : FILTER_LABELS[f]}
            </button>
          ))}
        </div>

        {/* Toggle agents */}
        <button
          onClick={() => setShowAgents((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius)] text-xs border transition-colors',
            showAgents
              ? 'bg-[#7c5aed]/10 border-[#7c5aed]/40 text-[#7c5aed]'
              : 'bg-surface border-border text-on-surface-tertiary',
          )}
        >
          <Users size={13} />
          {isRTL ? 'الوكلاء' : 'Agents'}
        </button>

        {/* Refresh */}
        <button
          onClick={fetchGraph}
          className="p-1.5 rounded-[var(--radius)] border border-border hover:bg-surface-secondary text-on-surface-secondary"
          title={isRTL ? 'تحديث' : 'Refresh'}
        >
          <RefreshCw size={13} />
        </button>

        {/* Stats */}
        <span className="ms-auto text-xs text-on-surface-tertiary whitespace-nowrap">
          {visibleNodes.length} {isRTL ? 'عقدة' : 'nodes'} · {visibleEdges.length} {isRTL ? 'رابط' : 'edges'}
        </span>
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* SVG canvas */}
        <div className="relative flex-1 bg-surface overflow-hidden">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 size={28} className="animate-spin text-on-surface-tertiary" />
            </div>
          ) : visibleNodes.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-on-surface-tertiary gap-3">
              <Network size={48} className="opacity-20" />
              <p className="text-sm">
                {isRTL ? 'لا توجد بيانات تطابق الفلتر' : 'No nodes match this filter'}
              </p>
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
              className="w-full h-full"
              style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Hit target background */}
              <rect
                x={viewBox.x} y={viewBox.y}
                width={viewBox.w} height={viewBox.h}
                fill="transparent"
              />

              {/* Edges */}
              <g>
                {visibleEdges.map((edge, i) => {
                  const s = simNodes.find((n) => n.id === edge.source);
                  const t = simNodes.find((n) => n.id === edge.target);
                  if (!s || !t) return null;
                  const isConnected = connectedEdges.some((ce) => ce.id === edge.id);
                  return (
                    <line
                      key={edge.id ?? i}
                      x1={s.x} y1={s.y}
                      x2={t.x} y2={t.y}
                      stroke={isConnected ? '#a78bfa' : edgeColor(edge.type)}
                      strokeWidth={isConnected ? 2.5 : edgeStrokeWidth(edge.type)}
                      opacity={isConnected ? 0.9 : edgeOpacity(edge.type)}
                    />
                  );
                })}
              </g>

              {/* Nodes */}
              {simNodes.map((node) => {
                const isSelected = node.id === selectedId;
                const isConnected = connectedNodes.some((cn) => cn.id === node.id);
                const isDimmed = selectedId && !isSelected && !isConnected;
                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x},${node.y})`}
                    onClick={() => setSelectedId(node.id === selectedId ? null : node.id)}
                    style={{ cursor: 'pointer' }}
                    opacity={isDimmed ? 0.25 : 1}
                  >
                    {/* Tag nodes: dashed ring */}
                    {node.type === 'tag' ? (
                      <circle
                        r={node.radius}
                        fill={node.color + '30'}
                        stroke={node.color}
                        strokeWidth={1.5}
                        strokeDasharray="3,2"
                      />
                    ) : (
                      <circle
                        r={node.radius}
                        fill={node.color}
                        opacity={0.88}
                        stroke={isSelected ? '#fff' : 'transparent'}
                        strokeWidth={2.5}
                      />
                    )}
                    {/* Agent glow ring */}
                    {node.type === 'agent' && (
                      <circle
                        r={node.radius + 4}
                        fill="none"
                        stroke={node.color}
                        strokeWidth={1}
                        opacity={0.3}
                      />
                    )}
                    {/* Emoji for agent/larger nodes */}
                    {(node.type === 'agent' || node.radius >= 12) && (
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={node.type === 'agent' ? 12 : 9}
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {NODE_EMOJI[node.type] ?? ''}
                      </text>
                    )}
                    {/* Label */}
                    {(node.radius >= 8 || isSelected) && (
                      <text
                        y={node.radius + 12}
                        textAnchor="middle"
                        fill="currentColor"
                        className="text-on-surface"
                        fontSize={9}
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {node.label.length > 22 ? node.label.slice(0, 20) + '…' : node.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}

          {/* Legend overlay */}
          {!loading && visibleNodes.length > 0 && (
            <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5 text-[10px] bg-surface/80 backdrop-blur rounded-[var(--radius)] px-2 py-1.5 border border-border">
              {LEGEND_ITEMS.map(({ type, label }) => (
                <span key={type} className="flex items-center gap-1 text-on-surface-secondary">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ background: nodeColor(type) }}
                  />
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        {selectedSimNode && (
          <aside className="w-72 shrink-0 border-s border-border bg-surface overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 p-4 border-b border-border">
              <div className="min-w-0 flex-1">
                <span
                  className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold mb-1"
                  style={{
                    background: nodeColor(selectedSimNode.type) + '20',
                    color: nodeColor(selectedSimNode.type),
                  }}
                >
                  {TYPE_LABEL_EN[selectedSimNode.type] ?? selectedSimNode.type}
                </span>
                <p className="text-sm font-semibold text-on-surface leading-tight mt-0.5">
                  {selectedSimNode.label}
                </p>
                {selectedSimNode.date && (
                  <p className="text-[10px] text-on-surface-tertiary mt-0.5">
                    {new Date(selectedSimNode.date).toLocaleDateString(isRTL ? 'ar' : 'en-GB')}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="p-1 rounded hover:bg-surface-secondary text-on-surface-tertiary shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            {/* Open button */}
            {selectedSimNode.href && (
              <div className="px-4 pt-3">
                <a
                  href={selectedSimNode.href}
                  className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-[var(--radius)] bg-accent text-on-accent text-xs font-medium hover:opacity-90 transition-opacity"
                >
                  <ExternalLink size={12} />
                  {isRTL ? 'فتح' : 'Open'}
                </a>
              </div>
            )}

            {/* Tags */}
            {(selectedSimNode.tags ?? []).length > 0 && (
              <div className="px-4 pt-3">
                <p className="text-[10px] uppercase tracking-wide text-on-surface-tertiary mb-1.5 flex items-center gap-1">
                  <Tag size={10} />
                  {isRTL ? 'الوسوم' : 'Tags'}
                </p>
                <div className="flex flex-wrap gap-1">
                  {(selectedSimNode.tags ?? []).map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 text-[10px] font-medium"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Props */}
            {selectedSimNode.props && Object.keys(selectedSimNode.props).length > 0 && (
              <div className="px-4 pt-3 space-y-1">
                {Object.entries(selectedSimNode.props).map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-xs">
                    <span className="text-on-surface-tertiary min-w-[70px] shrink-0">{k}:</span>
                    <span className="text-on-surface">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Connected nodes */}
            <div className="px-4 pt-3 pb-4">
              <p className="text-[10px] uppercase tracking-wide text-on-surface-tertiary mb-1.5">
                {isRTL ? 'العقد المتصلة' : 'Connected nodes'} ({connectedNodes.length})
              </p>
              {connectedNodes.length === 0 ? (
                <p className="text-xs text-on-surface-tertiary italic">
                  {isRTL ? 'لا اتصالات' : 'No connections'}
                </p>
              ) : (
                <div className="space-y-1">
                  {connectedNodes.map((cn) => {
                    const edge = connectedEdges.find(
                      (e) => e.source === cn.id || e.target === cn.id,
                    );
                    return (
                      <button
                        key={cn.id}
                        onClick={() => setSelectedId(cn.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius)] bg-surface-secondary hover:bg-surface-tertiary text-start transition-colors"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: nodeColor(cn.type) }}
                        />
                        <span className="flex-1 text-xs text-on-surface truncate">
                          {cn.label}
                        </span>
                        {edge?.relation && (
                          <span className="text-[10px] text-on-surface-tertiary italic shrink-0">
                            {edge.relation}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Suppress unused tick warning */}
      <span style={{ display: 'none' }}>{tick}</span>
    </div>
  );
}

const FILTER_LABELS_AR: Record<FilterType, string> = {
  all:      'الكل',
  meetings: 'الاجتماعات',
  notes:    'الملاحظات',
  agents:   'الوكلاء',
  zotero:   'زوتيرو',
  tags:     'الوسوم',
};
