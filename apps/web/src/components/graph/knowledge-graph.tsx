'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Network, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface Paper {
  id: string;
  title: string;
  authors: string;
  noteCount: number;
}

interface Note {
  id: string;
  paperId: string;
  section: string;
  type: string;
  content: string;
  themes: string[];
}

interface GraphNode {
  id: string;
  type: 'paper' | 'note';
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  data: Paper | Note;
}

interface GraphLink {
  source: string;
  target: string;
  type: 'paper-note' | 'theme';
}

const NOTE_COLORS: Record<string, string> = {
  claim: '#60a5fa',
  evidence: '#34d399',
  method: '#a78bfa',
  critique: '#f87171',
  question: '#fbbf24',
  connection: '#f472b6',
};

export function KnowledgeGraph() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [papers, setPapers] = useState<Paper[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const [viewBox, setViewBox] = useState({ x: -400, y: -300, w: 800, h: 600 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const [, forceUpdate] = useState(0);
  const animRef = useRef<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [papersData, notesData] = await Promise.all([
        apiFetch<Paper[]>('/api/papers'),
        apiFetch<Note[]>('/api/notes'),
      ]);
      setPapers(papersData);
      setNotes(notesData);
    } catch {
      // silent
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build graph layout
  useEffect(() => {
    if (papers.length === 0 && notes.length === 0) return;

    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    // Paper nodes in a circle
    const paperCount = papers.length;
    const radius = Math.max(150, paperCount * 40);
    papers.forEach((p, i) => {
      const angle = (2 * Math.PI * i) / Math.max(paperCount, 1);
      nodes.push({
        id: `paper-${p.id}`,
        type: 'paper',
        label: p.title.length > 30 ? p.title.slice(0, 28) + '...' : p.title,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        radius: 24,
        color: '#7c5aed',
        data: p,
      });
    });

    // Note nodes near their paper
    notes.forEach((n, i) => {
      const paperNode = nodes.find((nd) => nd.id === `paper-${n.paperId}`);
      const baseX = paperNode ? paperNode.x : 0;
      const baseY = paperNode ? paperNode.y : 0;
      const spread = 80;
      const angle = (2 * Math.PI * i) / Math.max(notes.length, 1) + Math.random() * 0.5;
      nodes.push({
        id: `note-${n.id}`,
        type: 'note',
        label: n.content.length > 20 ? n.content.slice(0, 18) + '...' : n.content,
        x: baseX + Math.cos(angle) * spread + (Math.random() - 0.5) * 40,
        y: baseY + Math.sin(angle) * spread + (Math.random() - 0.5) * 40,
        vx: 0,
        vy: 0,
        radius: 10,
        color: NOTE_COLORS[n.type] || '#94a3b8',
        data: n,
      });

      // Link note to paper
      links.push({
        source: `paper-${n.paperId}`,
        target: `note-${n.id}`,
        type: 'paper-note',
      });
    });

    // Theme links between notes sharing themes
    const themeMap = new Map<string, string[]>();
    notes.forEach((n) => {
      (n.themes || []).forEach((theme) => {
        if (!themeMap.has(theme)) themeMap.set(theme, []);
        themeMap.get(theme)!.push(`note-${n.id}`);
      });
    });
    themeMap.forEach((noteIds) => {
      for (let i = 0; i < noteIds.length; i++) {
        for (let j = i + 1; j < noteIds.length; j++) {
          links.push({ source: noteIds[i], target: noteIds[j], type: 'theme' });
        }
      }
    });

    nodesRef.current = nodes;
    linksRef.current = links;

    // Simple force simulation
    let iterations = 0;
    const maxIterations = 120;

    function simulate() {
      const nodes = nodesRef.current;
      const links = linksRef.current;

      // Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = nodes[i].radius + nodes[j].radius + 30;
          if (dist < minDist) {
            const force = (minDist - dist) * 0.05;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            nodes[i].vx -= fx;
            nodes[i].vy -= fy;
            nodes[j].vx += fx;
            nodes[j].vy += fy;
          }
        }
      }

      // Attraction along links
      for (const link of links) {
        const s = nodes.find((n) => n.id === link.source);
        const t = nodes.find((n) => n.id === link.target);
        if (!s || !t) continue;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const idealDist = link.type === 'paper-note' ? 80 : 120;
        const force = (dist - idealDist) * 0.003;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        s.vx += fx;
        s.vy += fy;
        t.vx -= fx;
        t.vy -= fy;
      }

      // Apply velocities with damping
      for (const node of nodes) {
        node.vx *= 0.85;
        node.vy *= 0.85;
        node.x += node.vx;
        node.y += node.vy;
      }

      iterations++;
      forceUpdate((v) => v + 1);

      if (iterations < maxIterations) {
        animRef.current = requestAnimationFrame(simulate);
      }
    }

    animRef.current = requestAnimationFrame(simulate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [papers, notes]);

  // Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const scale = e.deltaY > 0 ? 1.1 : 0.9;
    setViewBox((v) => {
      const cx = v.x + v.w / 2;
      const cy = v.y + v.h / 2;
      const nw = v.w * scale;
      const nh = v.h * scale;
      return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
    });
  };

  // Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as SVGElement).tagName === 'svg' || (e.target as SVGElement).tagName === 'rect') {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = (e.clientX - panStart.x) * (viewBox.w / (svgRef.current?.clientWidth || 800));
    const dy = (e.clientY - panStart.y) * (viewBox.h / (svgRef.current?.clientHeight || 600));
    setViewBox((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
    setPanStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => setIsPanning(false);

  const nodes = nodesRef.current;
  const links = linksRef.current;

  const themeLinks = links.filter((l) => l.type === 'theme').length;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Network size={24} className="text-on-surface-secondary" />
          <h1 className="text-xl font-semibold text-on-surface">
            {isRTL ? 'خريطة المعرفة' : 'Knowledge Graph'}
          </h1>
        </div>
        <div className="flex items-center gap-4 text-xs text-on-surface-tertiary">
          <span>{papers.length} {isRTL ? 'ورقة' : 'papers'}</span>
          <span>{notes.length} {isRTL ? 'ملاحظة' : 'notes'}</span>
          <span>{themeLinks} {isRTL ? 'روابط' : 'connections'}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-on-surface-tertiary" />
        </div>
      ) : papers.length === 0 && notes.length === 0 ? (
        <div className="text-center py-16 text-on-surface-tertiary">
          <Network size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg mb-2">{isRTL ? 'لا توجد بيانات' : 'No data yet'}</p>
          <p className="text-sm">
            {isRTL
              ? 'ارفع أوراق وأضف ملاحظات لبناء خريطة المعرفة'
              : 'Upload papers and create notes to build your knowledge graph'}
          </p>
        </div>
      ) : (
        <div className="relative border border-border rounded-[var(--radius-lg)] bg-surface overflow-hidden">
          <svg
            ref={svgRef}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            className="w-full"
            style={{ height: 'calc(100vh - 200px)', minHeight: '400px', cursor: isPanning ? 'grabbing' : 'grab' }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Background */}
            <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="transparent" />

            {/* Links */}
            {links.map((link, i) => {
              const s = nodes.find((n) => n.id === link.source);
              const t = nodes.find((n) => n.id === link.target);
              if (!s || !t) return null;
              return (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={link.type === 'theme' ? '#f472b6' : '#4b5563'}
                  strokeWidth={link.type === 'theme' ? 1.5 : 1}
                  strokeDasharray={link.type === 'theme' ? '4,4' : undefined}
                  opacity={0.4}
                />
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => setSelectedNode(node)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  r={node.radius}
                  fill={node.color}
                  opacity={0.85}
                  stroke={selectedNode?.id === node.id ? '#fff' : 'transparent'}
                  strokeWidth={2}
                />
                {node.type === 'paper' && (
                  <text
                    y={node.radius + 14}
                    textAnchor="middle"
                    fill="currentColor"
                    className="text-on-surface-secondary"
                    fontSize={10}
                    style={{ pointerEvents: 'none' }}
                  >
                    {node.label}
                  </text>
                )}
              </g>
            ))}
          </svg>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-[#7c5aed]" /> {isRTL ? 'ورقة' : 'Paper'}
            </span>
            {Object.entries(NOTE_COLORS).map(([type, color]) => (
              <span key={type} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="text-on-surface-tertiary">{type}</span>
              </span>
            ))}
          </div>

          {/* Detail panel */}
          {selectedNode && (
            <div className="absolute top-3 right-3 w-72 bg-surface border border-border rounded-[var(--radius-lg)] p-4 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded-full',
                  selectedNode.type === 'paper'
                    ? 'bg-purple-500/10 text-purple-400'
                    : 'bg-blue-500/10 text-blue-400'
                )}>
                  {selectedNode.type === 'paper' ? (isRTL ? 'ورقة' : 'Paper') : (isRTL ? 'ملاحظة' : 'Note')}
                </span>
                <button onClick={() => setSelectedNode(null)} className="p-1 hover:bg-surface-secondary rounded">
                  <X size={14} />
                </button>
              </div>

              {selectedNode.type === 'paper' ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-on-surface">{(selectedNode.data as Paper).title}</p>
                  <p className="text-xs text-on-surface-tertiary">{(selectedNode.data as Paper).authors}</p>
                  <p className="text-xs text-on-surface-secondary">
                    {(selectedNode.data as Paper).noteCount} {isRTL ? 'ملاحظات' : 'notes'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-on-surface-tertiary">
                    {(selectedNode.data as Note).type} | {(selectedNode.data as Note).section}
                  </p>
                  <p className="text-sm text-on-surface">{(selectedNode.data as Note).content}</p>
                  {(selectedNode.data as Note).themes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(selectedNode.data as Note).themes.map((theme) => (
                        <span key={theme} className="text-xs px-1.5 py-0.5 rounded bg-surface-secondary text-on-surface-secondary">
                          {theme}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
