'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  Plus, Save, Loader2, Trash2, Type, FileText, Link2, Image as ImageIcon,
  Youtube, Film, ZoomIn, ZoomOut, Layers, X, Maximize2, Minimize2,
  Palette, Search, Sparkles, MoveRight, ExternalLink, Undo2, Redo2,
  Pencil, Eye, LayoutTemplate,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

// Cache vault note bodies so file nodes don't re-fetch on every render
const noteCache = new Map<string, { body: string; name: string; frontmatter?: Record<string, unknown> }>();

async function fetchNote(p: string): Promise<{ body: string; name: string; frontmatter?: Record<string, unknown> } | null> {
  if (!p?.trim()) return null;
  const key = p.trim();
  if (noteCache.has(key)) return noteCache.get(key)!;
  try {
    const segs = key.split('/').map(encodeURIComponent).join('/');
    const r = await apiFetch<{ body: string; name: string; frontmatter?: Record<string, unknown> }>(`/api/vault/notes/${segs}`);
    noteCache.set(key, r);
    return r;
  } catch {
    return null;
  }
}

type NodeType = 'text' | 'file' | 'link' | 'image' | 'youtube' | 'video';

interface CanvasNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  url?: string;
  src?: string;
  videoId?: string;
  color?: string;
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  color?: string;
  label?: string;
}

interface CanvasFile {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

interface CanvasMeta { name: string; filename: string; mtime: number; }

const COLORS = [
  { id: 'default', val: 'var(--color-accent)' },
  { id: 'red',     val: '#ef4444' },
  { id: 'orange',  val: '#fb923c' },
  { id: 'yellow',  val: '#fbbf24' },
  { id: 'green',   val: '#34d399' },
  { id: 'blue',    val: '#60a5fa' },
  { id: 'purple',  val: '#a78bfa' },
  { id: 'pink',    val: '#f472b6' },
];

const DEFAULT_NEW_NODE = (type: NodeType, x: number, y: number): CanvasNode => {
  const base = { id: crypto.randomUUID(), type, x, y, color: 'var(--color-accent)' };
  if (type === 'text')    return { ...base, width: 240, height: 120, text: 'فكرة جديدة' };
  if (type === 'file')    return { ...base, width: 320, height: 220, file: '01 PhD/02 Atomic Notes/' };
  if (type === 'link')    return { ...base, width: 240, height: 80,  url: 'https://' };
  if (type === 'image')   return { ...base, width: 280, height: 200, src: '' };
  if (type === 'youtube') return { ...base, width: 320, height: 200, url: 'https://youtu.be/' };
  if (type === 'video')   return { ...base, width: 320, height: 200, src: '' };
  return { ...base, width: 200, height: 100 };
};

// ── Canvas templates (PRISMA, Snowballing, Concept map, Gap analysis) ──
type CanvasTemplateId = 'prisma' | 'snowballing' | 'concept' | 'gap';

interface CanvasTemplate {
  id: CanvasTemplateId;
  label: { ar: string; en: string };
  description: { ar: string; en: string };
  build: () => CanvasFile;
  suggestedName: { ar: string; en: string };
}

const TEXT_NODE = (
  x: number, y: number, text: string,
  opts?: { width?: number; height?: number; color?: string },
): CanvasNode => ({
  id: crypto.randomUUID(),
  type: 'text',
  x, y,
  width: opts?.width ?? 220,
  height: opts?.height ?? 100,
  text,
  color: opts?.color ?? 'var(--color-accent)',
});

const EDGE = (from: CanvasNode, to: CanvasNode, label?: string, color?: string): CanvasEdge => ({
  id: crypto.randomUUID(),
  fromNode: from.id,
  toNode: to.id,
  label,
  color,
});

const CANVAS_TEMPLATES: CanvasTemplate[] = [
  {
    id: 'prisma',
    label: { ar: 'PRISMA 2020', en: 'PRISMA 2020' },
    description: {
      ar: 'مخطط PRISMA لتصفية الدراسات: تحديد ← فحص ← أهلية ← إدراج',
      en: 'Classic PRISMA flow: Identification → Screening → Eligibility → Included',
    },
    suggestedName: { ar: 'PRISMA', en: 'PRISMA' },
    build: () => {
      const title = TEXT_NODE(0, 0, '# PRISMA 2020 Flow\n_Edit counts as you screen._', { width: 380, height: 80, color: '#60a5fa' });
      const idTitle   = TEXT_NODE(0, 120, '## Identification', { width: 220, height: 50, color: '#a78bfa' });
      const idRecords = TEXT_NODE(0, 190, 'Records from databases\n(n = ?)\n\n- Scopus: ?\n- WoS: ?\n- CrossRef: ?', { width: 260, height: 140 });
      const idOther   = TEXT_NODE(290, 190, 'Records from other sources\n(n = ?)\n\n- Citation chasing: ?\n- Hand search: ?', { width: 260, height: 140 });

      const scTitle    = TEXT_NODE(0, 370, '## Screening', { width: 220, height: 50, color: '#a78bfa' });
      const scDedup    = TEXT_NODE(0, 440, 'After duplicates removed\n(n = ?)', { width: 260, height: 80 });
      const scScreened = TEXT_NODE(0, 540, 'Title/abstract screened\n(n = ?)', { width: 260, height: 80 });
      const scExcl1    = TEXT_NODE(290, 540, 'Excluded\n(n = ?)\nReasons:\n- ?', { width: 260, height: 120, color: '#ef4444' });

      const elTitle   = TEXT_NODE(0, 680, '## Eligibility', { width: 220, height: 50, color: '#a78bfa' });
      const elFull    = TEXT_NODE(0, 750, 'Full-text assessed\n(n = ?)', { width: 260, height: 80 });
      const elExcl    = TEXT_NODE(290, 750, 'Excluded\n(n = ?)\nReasons:\n- Not BIM-focused: ?\n- Not in scope: ?\n- Wrong methodology: ?', { width: 260, height: 140, color: '#ef4444' });

      const inTitle   = TEXT_NODE(0, 910, '## Included', { width: 220, height: 50, color: '#34d399' });
      const inFinal   = TEXT_NODE(0, 980, 'Studies included in review\n(n = ?)', { width: 260, height: 80, color: '#34d399' });

      const nodes = [title, idTitle, idRecords, idOther, scTitle, scDedup, scScreened, scExcl1, elTitle, elFull, elExcl, inTitle, inFinal];
      const edges = [
        EDGE(idRecords, scDedup),
        EDGE(idOther, scDedup),
        EDGE(scDedup, scScreened),
        EDGE(scScreened, elFull, 'passed'),
        EDGE(scScreened, scExcl1, 'excluded'),
        EDGE(elFull, inFinal, 'passed'),
        EDGE(elFull, elExcl, 'excluded'),
      ];
      return { nodes, edges };
    },
  },
  {
    id: 'snowballing',
    label: { ar: 'تتبع الاستشهادات', en: 'Snowballing' },
    description: {
      ar: 'ورقة مركزية + مراجع خلفية ومرجعيات لاحقة',
      en: 'Seed paper with backward and forward citation branches',
    },
    suggestedName: { ar: 'Snowball', en: 'Snowball' },
    build: () => {
      const center = TEXT_NODE(400, 400, '## Seed paper\n\n**Title:**\n_Edit to enter_\n\n**Authors:** ?\n**Year:** ?\n**DOI:** ?', { width: 280, height: 160, color: '#fbbf24' });
      const backLabel = TEXT_NODE(20, 400, '## Backward\n(references cited by seed)', { width: 220, height: 80, color: '#60a5fa' });
      const fwdLabel  = TEXT_NODE(780, 400, '## Forward\n(papers citing seed)', { width: 220, height: 80, color: '#34d399' });
      const back1 = TEXT_NODE(20, 180, 'Ref #1\n_title_ · _year_', { width: 200, height: 90 });
      const back2 = TEXT_NODE(20, 300, 'Ref #2\n_title_ · _year_', { width: 200, height: 90 });
      const back3 = TEXT_NODE(20, 560, 'Ref #3\n_title_ · _year_', { width: 200, height: 90 });
      const back4 = TEXT_NODE(20, 680, 'Ref #4\n_title_ · _year_', { width: 200, height: 90 });
      const fwd1 = TEXT_NODE(780, 180, 'Citing #1\n_title_ · _year_', { width: 200, height: 90 });
      const fwd2 = TEXT_NODE(780, 300, 'Citing #2\n_title_ · _year_', { width: 200, height: 90 });
      const fwd3 = TEXT_NODE(780, 560, 'Citing #3\n_title_ · _year_', { width: 200, height: 90 });
      const fwd4 = TEXT_NODE(780, 680, 'Citing #4\n_title_ · _year_', { width: 200, height: 90 });
      const nodes = [center, backLabel, fwdLabel, back1, back2, back3, back4, fwd1, fwd2, fwd3, fwd4];
      const edges = [
        EDGE(back1, center, 'cited by'),
        EDGE(back2, center, 'cited by'),
        EDGE(back3, center, 'cited by'),
        EDGE(back4, center, 'cited by'),
        EDGE(center, fwd1, 'cited in'),
        EDGE(center, fwd2, 'cited in'),
        EDGE(center, fwd3, 'cited in'),
        EDGE(center, fwd4, 'cited in'),
      ];
      return { nodes, edges };
    },
  },
  {
    id: 'concept',
    label: { ar: 'خريطة مفاهيم', en: 'Concept map' },
    description: {
      ar: 'مفهوم مركزي + 4 فروع: نظريات، منهجيات، فجوات، مناطق',
      en: 'Central concept with 4 branches: theories, methods, gaps, regions',
    },
    suggestedName: { ar: 'Concept', en: 'Concept' },
    build: () => {
      const center = TEXT_NODE(400, 350, '## Central concept\n\n_Edit — e.g. BIM adoption_', { width: 260, height: 120, color: '#a78bfa' });
      const theories = TEXT_NODE(40, 80, '### Theories\n- TAM\n- UTAUT\n- DOI\n- ?', { width: 240, height: 160, color: '#60a5fa' });
      const methods  = TEXT_NODE(780, 80, '### Methods\n- Survey\n- Case study\n- Interviews\n- Mixed methods', { width: 240, height: 160, color: '#60a5fa' });
      const gaps     = TEXT_NODE(40, 600, '### Gaps\n- GCC under-studied\n- SME perspective\n- Longitudinal\n- ?', { width: 240, height: 160, color: '#ef4444' });
      const regions  = TEXT_NODE(780, 600, '### Regions\n- Kuwait\n- GCC\n- MENA\n- Global', { width: 240, height: 160, color: '#34d399' });
      const nodes = [center, theories, methods, gaps, regions];
      const edges = [
        EDGE(center, theories, 'informed by'),
        EDGE(center, methods, 'studied via'),
        EDGE(center, gaps, 'reveals'),
        EDGE(center, regions, 'contextualised in'),
      ];
      return { nodes, edges };
    },
  },
  {
    id: 'gap',
    label: { ar: 'تحليل فجوات', en: 'Gap analysis' },
    description: {
      ar: 'الأدبيات الحالية ← الفجوات ← أسئلة البحث',
      en: 'Existing literature → identified gaps → research questions',
    },
    suggestedName: { ar: 'Gaps', en: 'Gaps' },
    build: () => {
      const litTitle = TEXT_NODE(0,   40, '## Existing literature', { width: 260, height: 60, color: '#60a5fa' });
      const lit1 = TEXT_NODE(0, 120, 'Theme A\n_Summary…_', { width: 260, height: 110 });
      const lit2 = TEXT_NODE(0, 250, 'Theme B\n_Summary…_', { width: 260, height: 110 });
      const lit3 = TEXT_NODE(0, 380, 'Theme C\n_Summary…_', { width: 260, height: 110 });

      const gapTitle = TEXT_NODE(310, 40, '## Identified gaps', { width: 260, height: 60, color: '#ef4444' });
      const gap1 = TEXT_NODE(310, 120, 'Gap 1\n_What is missing?_', { width: 260, height: 110, color: '#ef4444' });
      const gap2 = TEXT_NODE(310, 250, 'Gap 2\n_What is missing?_', { width: 260, height: 110, color: '#ef4444' });
      const gap3 = TEXT_NODE(310, 380, 'Gap 3\n_What is missing?_', { width: 260, height: 110, color: '#ef4444' });

      const rqTitle = TEXT_NODE(620, 40, '## Research questions', { width: 260, height: 60, color: '#34d399' });
      const rq1 = TEXT_NODE(620, 120, 'RQ1\n_…?_', { width: 260, height: 110, color: '#34d399' });
      const rq2 = TEXT_NODE(620, 250, 'RQ2\n_…?_', { width: 260, height: 110, color: '#34d399' });
      const rq3 = TEXT_NODE(620, 380, 'RQ3\n_…?_', { width: 260, height: 110, color: '#34d399' });

      const nodes = [litTitle, lit1, lit2, lit3, gapTitle, gap1, gap2, gap3, rqTitle, rq1, rq2, rq3];
      const edges = [
        EDGE(lit1, gap1, 'reveals'),
        EDGE(lit2, gap2, 'reveals'),
        EDGE(lit3, gap3, 'reveals'),
        EDGE(gap1, rq1, 'motivates'),
        EDGE(gap2, rq2, 'motivates'),
        EDGE(gap3, rq3, 'motivates'),
      ];
      return { nodes, edges };
    },
  },
];

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([\w-]+)/,
    /youtu\.be\/([\w-]+)/,
    /youtube\.com\/embed\/([\w-]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function CanvasPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [canvases, setCanvases] = useState<CanvasMeta[]>([]);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [data, setData] = useState<CanvasFile>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 100, y: 100 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newCanvasName, setNewCanvasName] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [showVaultBrowser, setShowVaultBrowser] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [bgPattern, setBgPattern] = useState<'dots' | 'grid' | 'lines' | 'blank'>('dots');
  const [showBgMenu, setShowBgMenu] = useState(false);
  const [previewPath, setPreviewPath] = useState<string | null>(null);

  // History for undo/redo (stores serialized snapshots of `data`)
  const historyRef = useRef<{ past: CanvasFile[]; future: CanvasFile[] }>({ past: [], future: [] });
  const skipHistoryRef = useRef(false);
  const pushHistory = useCallback((current: CanvasFile) => {
    if (skipHistoryRef.current) return;
    historyRef.current.past.push(JSON.parse(JSON.stringify(current)) as CanvasFile);
    if (historyRef.current.past.length > 50) historyRef.current.past.shift();
    historyRef.current.future = [];
  }, []);
  const undo = useCallback(() => {
    const prev = historyRef.current.past.pop();
    if (!prev) return;
    historyRef.current.future.push(JSON.parse(JSON.stringify(data)) as CanvasFile);
    skipHistoryRef.current = true;
    setData(prev);
    queueMicrotask(() => { skipHistoryRef.current = false; });
  }, [data]);
  const redo = useCallback(() => {
    const next = historyRef.current.future.pop();
    if (!next) return;
    historyRef.current.past.push(JSON.parse(JSON.stringify(data)) as CanvasFile);
    skipHistoryRef.current = true;
    setData(next);
    queueMicrotask(() => { skipHistoryRef.current = false; });
  }, [data]);

  // Drag state — three modes
  const dragRef = useRef<{
    mode: 'none' | 'pan' | 'node' | 'edge' | 'resize';
    nodeId?: string;
    offsetX: number;
    offsetY: number;
    startPan?: { x: number; y: number };
    edgeStart?: { x: number; y: number };
    // For resize: the node's starting size/position and mouse start point.
    resizeStart?: { width: number; height: number; mouseX: number; mouseY: number };
  }>({ mode: 'none', offsetX: 0, offsetY: 0 });
  const [edgeFrom, setEdgeFrom] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const loadCanvases = useCallback(async () => {
    try {
      const r = await apiFetch<{ canvases: CanvasMeta[] }>('/api/canvas');
      setCanvases(r.canvases);
      if (!activeName && r.canvases.length > 0) setActiveName(r.canvases[0].name);
    } catch {}
    setLoading(false);
  }, [activeName]);

  useEffect(() => { loadCanvases(); }, [loadCanvases]);

  useEffect(() => {
    if (!activeName) return;
    apiFetch<CanvasFile>(`/api/canvas/${activeName}`)
      .then(setData)
      .catch(() => setData({ nodes: [], edges: [] }));
  }, [activeName]);

  // Auto-save 5 seconds after last change
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!activeName) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => save(), 5000);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const save = async () => {
    if (!activeName) return;
    setSaving(true);
    try {
      await apiFetch(`/api/canvas/${activeName}`, { method: 'PUT', body: JSON.stringify(data) });
    } catch {}
    setSaving(false);
  };

  const createCanvas = async () => {
    if (!newCanvasName.trim()) return;
    const name = newCanvasName.trim();
    try {
      await apiFetch(`/api/canvas/${name}`, { method: 'PUT', body: JSON.stringify({ nodes: [], edges: [] }) });
      setActiveName(name); setNewCanvasName(''); loadCanvases();
    } catch {}
  };

  // Fit-to-content: compute the bounding box of all nodes and zoom/pan
  // so they fit inside the current viewport with a small padding. Called
  // after template load and from a toolbar button.
  const fitToContent = useCallback((nodes?: CanvasNode[]) => {
    const ns = nodes ?? data.nodes;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || ns.length === 0) return;
    const padding = 40;
    const minX = Math.min(...ns.map((n) => n.x));
    const minY = Math.min(...ns.map((n) => n.y));
    const maxX = Math.max(...ns.map((n) => n.x + n.width));
    const maxY = Math.max(...ns.map((n) => n.y + n.height));
    const contentW = Math.max(maxX - minX, 1);
    const contentH = Math.max(maxY - minY, 1);
    const availW = rect.width - padding * 2;
    const availH = rect.height - padding * 2;
    const z = Math.min(availW / contentW, availH / contentH, 1.5);
    setZoom(z);
    // Pan so content center is in viewport center.
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const contentCX = (minX + maxX) / 2;
    const contentCY = (minY + maxY) / 2;
    setPan({ x: cx - contentCX * z, y: cy - contentCY * z });
  }, [data.nodes]);

  const createFromTemplate = async (tpl: CanvasTemplate) => {
    const today = new Date().toISOString().slice(0, 10);
    const base = tpl.suggestedName[language];
    // Avoid collisions if user keeps stacking templates.
    const existing = new Set(canvases.map((c) => c.name));
    let name = `${base} — ${today}`;
    let attempt = 2;
    while (existing.has(name)) {
      name = `${base} — ${today} (${attempt})`;
      attempt += 1;
    }
    const file = tpl.build();
    try {
      await apiFetch(`/api/canvas/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: JSON.stringify(file),
      });
      setActiveName(name);
      setShowTemplateMenu(false);
      loadCanvases();
      // Auto-zoom to fit once the template's nodes finish loading.
      // The effect that reads `/api/canvas/:name` fires on setActiveName;
      // we wait a tick for state to settle then fit.
      setTimeout(() => fitToContent(file.nodes), 200);
    } catch {}
  };

  const deleteCanvas = async () => {
    if (!activeName) return;
    if (!confirm(isRTL ? `حذف الكانفس "${activeName}"؟ لا يمكن التراجع.` : `Delete canvas "${activeName}"? Cannot be undone.`)) return;
    try {
      await apiFetch(`/api/canvas/${activeName}`, { method: 'DELETE' });
      setActiveName(null);
      setData({ nodes: [], edges: [] });
      loadCanvases();
    } catch (e) {
      alert(isRTL ? `فشل الحذف: ${e}` : `Delete failed: ${e}`);
    }
  };

  const addNode = (type: NodeType) => {
    pushHistory(data);
    const x = -pan.x / zoom + 200;
    const y = -pan.y / zoom + 200;
    const node = DEFAULT_NEW_NODE(type, x, y);
    setData((d) => ({ ...d, nodes: [...d.nodes, node] }));
    setSelectedId(node.id);
  };

  const deleteNode = (id: string) => {
    pushHistory(data);
    setData((d) => ({
      nodes: d.nodes.filter((n) => n.id !== id),
      edges: d.edges.filter((e) => e.fromNode !== id && e.toNode !== id),
    }));
    setSelectedId(null);
  };

  const updateNode = (id: string, patch: Partial<CanvasNode>) => {
    setData((d) => ({ ...d, nodes: d.nodes.map((n) => n.id === id ? { ...n, ...patch } : n) }));
  };

  const updateEdge = (id: string, patch: Partial<CanvasEdge>) => {
    setData((d) => ({ ...d, edges: d.edges.map((e) => e.id === id ? { ...e, ...patch } : e) }));
  };

  const deleteEdge = (id: string) => {
    pushHistory(data);
    setData((d) => ({ ...d, edges: d.edges.filter((e) => e.id !== id) }));
  };

  // ── Coords ─────────────────────────────────────────────────────
  const screenToCanvas = (sx: number, sy: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: sx, y: sy };
    return { x: (sx - rect.left - pan.x) / zoom, y: (sy - rect.top - pan.y) / zoom };
  };

  // ── Pan with mouse drag on background ─────────────────────────
  const handleBgMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setSelectedId(null);
    dragRef.current = { mode: 'pan', offsetX: 0, offsetY: 0, startPan: { ...pan } };
    dragRef.current.offsetX = e.clientX;
    dragRef.current.offsetY = e.clientY;
  };

  // ── Drag node ─────────────────────────────────────────────────
  const handleNodeMouseDown = (e: React.MouseEvent, node: CanvasNode) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setSelectedId(node.id);
    if (e.shiftKey) {
      // Start edge creation
      pushHistory(data);
      dragRef.current = { mode: 'edge', nodeId: node.id, offsetX: 0, offsetY: 0 };
      setEdgeFrom(node.id);
      return;
    }
    pushHistory(data);
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    dragRef.current = { mode: 'node', nodeId: node.id, offsetX: x - node.x, offsetY: y - node.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    const drag = dragRef.current;
    if (drag.mode === 'pan' && drag.startPan) {
      setPan({
        x: drag.startPan.x + (e.clientX - drag.offsetX),
        y: drag.startPan.y + (e.clientY - drag.offsetY),
      });
    } else if (drag.mode === 'node' && drag.nodeId) {
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      updateNode(drag.nodeId, { x: x - drag.offsetX, y: y - drag.offsetY });
    } else if (drag.mode === 'resize' && drag.nodeId && drag.resizeStart) {
      // Translate mouse delta (screen px) → canvas-space delta via zoom.
      const dx = (e.clientX - drag.resizeStart.mouseX) / zoom;
      const dy = (e.clientY - drag.resizeStart.mouseY) / zoom;
      const nextW = Math.max(120, drag.resizeStart.width + dx);
      const nextH = Math.max(80, drag.resizeStart.height + dy);
      updateNode(drag.nodeId, { width: nextW, height: nextH });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (drag.mode === 'edge' && drag.nodeId) {
      // Find which node we ended on
      const target = (e.target as Element).closest('[data-node-id]')?.getAttribute('data-node-id');
      if (target && target !== drag.nodeId) {
        const newEdge: CanvasEdge = {
          id: crypto.randomUUID(),
          fromNode: drag.nodeId,
          toNode: target,
        };
        setData((d) => ({ ...d, edges: [...d.edges, newEdge] }));
      }
    }
    setEdgeFrom(null);
    dragRef.current = { mode: 'none', offsetX: 0, offsetY: 0 };
  };

  // Wheel zoom around cursor
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const newZoom = Math.max(0.2, Math.min(4, zoom * (1 + (-e.deltaY * 0.001))));
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const factor = newZoom / zoom;
      setPan({ x: sx - (sx - pan.x) * factor, y: sy - (sy - pan.y) * factor });
    }
    setZoom(newZoom);
  };

  // Keyboard delete
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        deleteNode(selectedId);
      }
      if (e.key === 'Escape') {
        setSelectedId(null); setFullscreen(false); setShowVaultBrowser(false); setShowGenerateModal(false);
      }
      if (e.key === 'f' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault(); setFullscreen((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        e.preventDefault(); undo();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        e.preventDefault(); redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, undo, redo]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-surface">
      <Loader2 className="h-7 w-7 animate-spin text-on-surface-tertiary" />
    </div>
  );

  const selectedNode = data.nodes.find((n) => n.id === selectedId);

  return (
    <div className={cn('h-full min-h-[600px] flex flex-col bg-surface', fullscreen && 'fixed inset-0 z-50 h-screen')} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Toolbar */}
      <div className="border-b border-border bg-surface-secondary px-4 py-2 flex items-center gap-2 flex-wrap shrink-0">
        <Layers className="h-4 w-4 text-accent" />
        <select
          value={activeName ?? ''}
          onChange={(e) => setActiveName(e.target.value || null)}
          className="bg-surface border border-border rounded px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-accent"
        >
          <option value="">{isRTL ? '— اختر —' : '— pick —'}</option>
          {canvases.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
        <input
          value={newCanvasName}
          onChange={(e) => setNewCanvasName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') createCanvas(); }}
          placeholder={isRTL ? 'اسم جديد' : 'New name'}
          className="bg-surface border border-border rounded px-2 py-1 text-xs text-on-surface w-28 focus:outline-none focus:border-accent"
        />
        <button onClick={createCanvas} className="text-xs px-2 py-1 rounded bg-accent text-on-accent" title={isRTL ? 'أنشئ' : 'Create'}>
          <Plus className="h-3 w-3" />
        </button>
        {activeName && (
          <button
            onClick={deleteCanvas}
            title={isRTL ? 'حذف الكانفس' : 'Delete canvas'}
            className="text-xs p-1 rounded text-on-surface-tertiary hover:bg-error/15 hover:text-error"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}

        {activeName && <>
          <div className="w-px h-5 bg-border mx-1" />
          {/* Add nodes */}
          {([
            { type: 'text' as NodeType, icon: Type, label: 'نص' },
            { type: 'file' as NodeType, icon: FileText, label: 'ملف' },
            { type: 'link' as NodeType, icon: Link2, label: 'رابط' },
            { type: 'image' as NodeType, icon: ImageIcon, label: 'صورة' },
            { type: 'youtube' as NodeType, icon: Youtube, label: 'يوتيوب' },
            { type: 'video' as NodeType, icon: Film, label: 'فيديو' },
          ]).map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              onClick={() => addNode(type)}
              title={label}
              className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-secondary"
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
          <button
            onClick={() => setShowVaultBrowser(true)}
            title={isRTL ? 'إضافة من vault' : 'Add from vault'}
            className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-secondary"
          ><Search className="h-4 w-4" /></button>
          <button
            onClick={() => setShowGenerateModal(true)}
            title={isRTL ? 'توليد كانفس بالذكاء' : 'AI generate'}
            className="p-1.5 rounded hover:bg-surface-tertiary text-success"
          ><Sparkles className="h-4 w-4" /></button>

          <div className="relative">
            <button
              onClick={() => setShowTemplateMenu((v) => !v)}
              title={isRTL ? 'قوالب جاهزة (PRISMA، تتبع استشهادات، …)' : 'Templates (PRISMA, snowballing, …)'}
              className={cn(
                'p-1.5 rounded hover:bg-surface-tertiary text-on-surface-secondary',
                showTemplateMenu && 'bg-surface-tertiary text-accent',
              )}
            ><LayoutTemplate className="h-4 w-4" /></button>
            {showTemplateMenu && (
              <div className="absolute top-full mt-1 start-0 bg-surface-secondary border border-border rounded-lg shadow-xl p-1 z-30 w-72">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-xs font-semibold text-on-surface">
                    {isRTL ? 'أنشئ كانفس من قالب' : 'Create canvas from template'}
                  </p>
                  <p className="text-[10px] text-on-surface-tertiary mt-0.5">
                    {isRTL ? 'يُحفظ ككانفس جديد — يمكنك التعديل بحرية' : 'Saves as a new canvas — edit freely'}
                  </p>
                </div>
                {CANVAS_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => createFromTemplate(tpl)}
                    className="w-full text-start px-3 py-2 rounded hover:bg-surface-tertiary group"
                  >
                    <div className="text-xs font-semibold text-on-surface group-hover:text-accent">
                      {tpl.label[language]}
                    </div>
                    <div className="text-[10px] text-on-surface-tertiary mt-0.5 leading-relaxed">
                      {tpl.description[language]}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Undo / Redo */}
          <button
            onClick={undo}
            disabled={historyRef.current.past.length === 0}
            title={isRTL ? 'تراجع (Ctrl+Z)' : 'Undo (Ctrl+Z)'}
            className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-secondary disabled:opacity-30"
          ><Undo2 className="h-4 w-4" /></button>
          <button
            onClick={redo}
            disabled={historyRef.current.future.length === 0}
            title={isRTL ? 'إعادة (Ctrl+Y)' : 'Redo (Ctrl+Y)'}
            className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-secondary disabled:opacity-30"
          ><Redo2 className="h-4 w-4" /></button>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Background pattern picker */}
          <div className="relative">
            <button
              onClick={() => setShowBgMenu((v) => !v)}
              title={isRTL ? 'تخطيط الخلفية' : 'Background pattern'}
              className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-secondary"
            >
              <span className="block h-4 w-4 rounded-sm border border-current grid grid-cols-2 grid-rows-2">
                {bgPattern === 'dots' && <><span className="bg-current rounded-full h-1 w-1 m-auto"/><span className="bg-current rounded-full h-1 w-1 m-auto"/><span className="bg-current rounded-full h-1 w-1 m-auto"/><span className="bg-current rounded-full h-1 w-1 m-auto"/></>}
                {bgPattern === 'grid' && <><span className="border-e border-b border-current"/><span className="border-b border-current"/><span className="border-e border-current"/><span /></>}
                {bgPattern === 'lines' && <><span className="border-b border-current col-span-2"/><span className="col-span-2"/></>}
              </span>
            </button>
            {showBgMenu && (
              <div className="absolute top-full mt-1 start-0 bg-surface-secondary border border-border rounded-lg shadow-xl p-1 z-30 w-32">
                {(['dots', 'grid', 'lines', 'blank'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => { setBgPattern(p); setShowBgMenu(false); }}
                    className={cn(
                      'w-full text-start px-3 py-1.5 rounded text-xs hover:bg-surface-tertiary',
                      bgPattern === p ? 'bg-accent/15 text-accent' : 'text-on-surface-secondary'
                    )}
                  >
                    {isRTL
                      ? (p === 'dots' ? '● نقاط' : p === 'grid' ? '▦ شبكة' : p === 'lines' ? '☰ خطوط' : '◯ بدون')
                      : (p === 'dots' ? '● Dots' : p === 'grid' ? '▦ Grid' : p === 'lines' ? '☰ Lines' : '◯ Blank')}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => setZoom((z) => z * 1.2)} className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-secondary" title={isRTL ? 'تكبير' : 'Zoom in'}><ZoomIn className="h-3.5 w-3.5" /></button>
          <button onClick={() => setZoom((z) => z / 1.2)} className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-secondary" title={isRTL ? 'تصغير' : 'Zoom out'}><ZoomOut className="h-3.5 w-3.5" /></button>
          <button
            onClick={() => fitToContent()}
            disabled={data.nodes.length === 0}
            title={isRTL ? 'املأ الشاشة' : 'Fit to content'}
            className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-secondary disabled:opacity-30"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <span className="text-[11px] text-on-surface-tertiary px-1">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setFullscreen((v) => !v)}
            title={fullscreen ? (isRTL ? 'خروج' : 'Exit') : (isRTL ? 'ملء الشاشة' : 'Fullscreen')}
            className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-secondary"
          >{fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>

          {/* PNG Export — uses html-to-image-style canvas serialization */}
          <button
            onClick={async () => {
              if (!activeName) return;
              try {
                // Compute bounding box of all nodes
                if (data.nodes.length === 0) { alert(isRTL ? 'لا عقد للتصدير' : 'No nodes to export'); return; }
                const minX = Math.min(...data.nodes.map((n) => n.x)) - 40;
                const minY = Math.min(...data.nodes.map((n) => n.y)) - 40;
                const maxX = Math.max(...data.nodes.map((n) => n.x + n.width)) + 40;
                const maxY = Math.max(...data.nodes.map((n) => n.y + n.height)) + 40;
                const w = maxX - minX, h = maxY - minY;
                // Serialize as SVG → render to canvas → PNG
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${minX} ${minY} ${w} ${h}">
                  <rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="#0a0a0a"/>
                  ${data.edges.map((e) => {
                    const a = data.nodes.find((n) => n.id === e.fromNode);
                    const b = data.nodes.find((n) => n.id === e.toNode);
                    if (!a || !b) return '';
                    const x1 = a.x + a.width / 2, y1 = a.y + a.height / 2;
                    const x2 = b.x + b.width / 2, y2 = b.y + b.height / 2;
                    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${e.color ?? '#7c5aed'}" stroke-width="2" opacity="0.7"/>${e.label ? `<text x="${(x1+x2)/2}" y="${(y1+y2)/2}" fill="#fff" font-size="11" text-anchor="middle">${e.label.replace(/[<>&]/g, '')}</text>` : ''}`;
                  }).join('')}
                  ${data.nodes.map((n) => {
                    const text = (n.text ?? n.file ?? n.url ?? '').slice(0, 80).replace(/[<>&]/g, '');
                    return `<g><rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" fill="#1a1a1a" stroke="${n.color ?? '#7c5aed'}" stroke-width="2" rx="8"/>
                      <text x="${n.x + 10}" y="${n.y + 24}" fill="#fff" font-size="13" font-family="sans-serif"><tspan>${text}</tspan></text></g>`;
                  }).join('')}
                </svg>`;
                const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(svgBlob);
                const img = new Image();
                img.onload = () => {
                  const canvas = document.createElement('canvas');
                  canvas.width = w; canvas.height = h;
                  const ctx = canvas.getContext('2d');
                  if (!ctx) return;
                  ctx.drawImage(img, 0, 0);
                  URL.revokeObjectURL(url);
                  canvas.toBlob((blob) => {
                    if (!blob) return;
                    const pngUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = pngUrl;
                    a.download = `${activeName}.png`;
                    a.click();
                    URL.revokeObjectURL(pngUrl);
                  }, 'image/png');
                };
                img.src = url;
              } catch (e) {
                alert(e instanceof Error ? e.message : 'export failed');
              }
            }}
            title={isRTL ? 'صدّر كصورة PNG' : 'Export as PNG'}
            className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-secondary"
          >
            <ImageIcon className="h-4 w-4" />
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="ms-auto flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-accent text-on-accent disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            {isRTL ? 'احفظ' : 'Save'}
          </button>
        </>}
      </div>

      {/* Canvas viewport */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-surface"
        style={{ cursor: dragRef.current.mode === 'pan' ? 'grabbing' : 'default' }}
        onMouseDown={handleBgMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { dragRef.current.mode = 'none'; setEdgeFrom(null); }}
        onWheel={handleWheel}
      >
        {!activeName ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center max-w-md">
              <Layers className="h-12 w-12 text-on-surface-tertiary mx-auto mb-3 opacity-30" />
              <p className="text-sm text-on-surface-tertiary">
                {isRTL ? 'اختر أو أنشئ canvas' : 'Pick or create a canvas'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Background pattern (dots / grid / lines / blank) */}
            {bgPattern !== 'blank' && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage:
                    bgPattern === 'dots'
                      ? `radial-gradient(circle, var(--color-border) 1px, transparent 1px)`
                      : bgPattern === 'grid'
                      ? `linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)`
                      : `linear-gradient(var(--color-border) 1px, transparent 1px)`,
                  backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
                  backgroundPosition: `${pan.x}px ${pan.y}px`,
                  opacity: 0.35,
                }}
              />
            )}

            {/* Edges */}
            <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-accent)" />
                </marker>
              </defs>
              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {data.edges.map((e) => {
                  const a = data.nodes.find((n) => n.id === e.fromNode);
                  const b = data.nodes.find((n) => n.id === e.toNode);
                  if (!a || !b) return null;
                  const x1 = a.x + a.width / 2, y1 = a.y + a.height / 2;
                  const x2 = b.x + b.width / 2, y2 = b.y + b.height / 2;
                  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
                  const stroke = e.color ?? 'var(--color-accent)';
                  return (
                    <g key={e.id}>
                      {/* invisible thick hit area for easy clicking */}
                      <line
                        x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke="transparent" strokeWidth={14 / zoom}
                        className="cursor-pointer pointer-events-auto"
                        onDoubleClick={() => {
                          const label = window.prompt(isRTL ? 'تسمية العلاقة (فارغ = حذف):' : 'Relation label (empty = delete):', e.label ?? '');
                          if (label === null) return;
                          if (label === '') deleteEdge(e.id);
                          else updateEdge(e.id, { label });
                        }}
                      />
                      <line
                        x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={stroke}
                        strokeWidth={2 / zoom}
                        opacity={0.75}
                        markerEnd="url(#arrow)"
                        pointerEvents="none"
                      />
                      {e.label && (
                        <g pointerEvents="none">
                          <rect
                            x={mx - (e.label.length * 4) / zoom}
                            y={my - 9 / zoom}
                            width={(e.label.length * 8) / zoom}
                            height={18 / zoom}
                            fill="var(--color-surface)"
                            stroke={stroke}
                            strokeWidth={1 / zoom}
                            rx={4 / zoom}
                            opacity={0.95}
                          />
                          <text
                            x={mx} y={my + 4 / zoom}
                            textAnchor="middle"
                            fontSize={11 / zoom}
                            fill="var(--color-on-surface)"
                          >{e.label}</text>
                        </g>
                      )}
                    </g>
                  );
                })}
                {/* Edge being drawn */}
                {edgeFrom && (() => {
                  const from = data.nodes.find((n) => n.id === edgeFrom);
                  if (!from) return null;
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (!rect) return null;
                  const tx = (mousePos.x - rect.left - pan.x) / zoom;
                  const ty = (mousePos.y - rect.top - pan.y) / zoom;
                  return (
                    <line
                      x1={from.x + from.width / 2} y1={from.y + from.height / 2}
                      x2={tx} y2={ty}
                      stroke="var(--color-accent)"
                      strokeWidth={2 / zoom}
                      strokeDasharray={`${5 / zoom} ${5 / zoom}`}
                    />
                  );
                })()}
              </g>
            </svg>

            {/* Nodes */}
            {data.nodes.map((node) => (
              <NodeView
                key={node.id}
                node={node}
                zoom={zoom}
                pan={pan}
                selected={selectedId === node.id}
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                onUpdate={(patch) => updateNode(node.id, patch)}
                onDelete={() => deleteNode(node.id)}
                onOpenLink={(p) => setPreviewPath(p)}
                onResizeStart={(e) => {
                  e.stopPropagation();
                  dragRef.current = {
                    mode: 'resize',
                    nodeId: node.id,
                    offsetX: 0,
                    offsetY: 0,
                    resizeStart: { width: node.width, height: node.height, mouseX: e.clientX, mouseY: e.clientY },
                  };
                  setSelectedId(node.id);
                }}
                isRTL={isRTL}
              />
            ))}

            {/* Hint when empty */}
            {data.nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center text-on-surface-tertiary">
                  <p className="text-sm">{isRTL ? 'استخدم أزرار العلوية لإضافة عقد' : 'Use the toolbar to add nodes'}</p>
                  <p className="text-xs mt-1">{isRTL ? 'اضغط Shift وسحب من عقدة لإنشاء رابط' : 'Shift + drag from a node to link'}</p>
                </div>
              </div>
            )}

            {/* Selected node controls */}
            {selectedNode && (
              <div
                className="absolute top-4 left-1/2 -translate-x-1/2 bg-surface-secondary border border-border rounded-lg shadow-lg px-3 py-2 flex items-center gap-2 z-20"
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
              >
                <Palette className="h-3.5 w-3.5 text-on-surface-tertiary" />
                {COLORS.map((c) => (
                  <button
                    key={c.id}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); updateNode(selectedNode.id, { color: c.val }); }}
                    style={{ backgroundColor: c.val }}
                    className={cn(
                      'h-5 w-5 rounded-full border-2 transition-all',
                      selectedNode.color === c.val ? 'border-white scale-110' : 'border-transparent'
                    )}
                  />
                ))}
                <div className="w-px h-4 bg-border" />
                <button onClick={() => deleteNode(selectedNode.id)} className="text-on-surface-tertiary hover:text-error">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Vault browser modal */}
      {showVaultBrowser && (
        <VaultBrowserModal
          onClose={() => setShowVaultBrowser(false)}
          onPick={(filePath) => {
            const x = -pan.x / zoom + 200;
            const y = -pan.y / zoom + 200;
            const node: CanvasNode = { ...DEFAULT_NEW_NODE('file', x, y), file: filePath };
            setData((d) => ({ ...d, nodes: [...d.nodes, node] }));
            setShowVaultBrowser(false);
          }}
          isRTL={isRTL}
        />
      )}

      {/* Generate modal */}
      {showGenerateModal && (
        <GenerateModal
          onClose={() => setShowGenerateModal(false)}
          onGenerated={(name) => { setActiveName(name); setShowGenerateModal(false); loadCanvases(); }}
          isRTL={isRTL}
        />
      )}

      {/* Doc preview modal — opened from file nodes + wikilinks */}
      {previewPath && (
        <DocPreviewModal path={previewPath} isRTL={isRTL} onClose={() => setPreviewPath(null)} />
      )}
    </div>
  );
}

// ── Node renderer ──────────────────────────────────────────────────────
function NodeView({
  node, zoom, pan, selected, onMouseDown, onUpdate, onDelete: _onDelete, onOpenLink, onResizeStart, isRTL,
}: {
  node: CanvasNode;
  zoom: number;
  pan: { x: number; y: number };
  selected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onUpdate: (patch: Partial<CanvasNode>) => void;
  onDelete: () => void;
  onOpenLink: (vaultPath: string) => void;
  onResizeStart: (e: React.MouseEvent) => void;
  isRTL: boolean;
}) {
  const Icon =
    node.type === 'text' ? Type :
    node.type === 'file' ? FileText :
    node.type === 'link' ? Link2 :
    node.type === 'image' ? ImageIcon :
    node.type === 'youtube' ? Youtube : Film;

  const color = node.color ?? 'var(--color-accent)';
  const youtubeId = node.type === 'youtube' && node.url ? extractYouTubeId(node.url) : null;

  return (
    <div
      data-node-id={node.id}
      onMouseDown={onMouseDown}
      style={{
        position: 'absolute',
        left: node.x * zoom + pan.x,
        top: node.y * zoom + pan.y,
        width: node.width * zoom,
        height: node.height * zoom,
        borderColor: selected ? color : `${color}40`,
        borderWidth: selected ? 3 : 2,
      }}
      className={cn(
        'group rounded-lg bg-surface-secondary p-2 cursor-move shadow-md transition-shadow hover:shadow-lg overflow-hidden flex flex-col'
      )}
    >
      <div className="flex items-center justify-between gap-1 mb-1 shrink-0">
        <Icon className="h-3 w-3 shrink-0" style={{ color }} />
        <span className="text-[9px] uppercase tracking-wider text-on-surface-tertiary">{node.type}</span>
      </div>

      {node.type === 'text' && (
        <TextNodeBody
          value={node.text ?? ''}
          fontSize={13 * zoom}
          onChange={(v) => onUpdate({ text: v })}
          onOpenLink={onOpenLink}
        />
      )}

      {node.type === 'file' && (
        <FileNodeBody
          path={node.file ?? ''}
          fontSize={12 * zoom}
          onChangePath={(v) => onUpdate({ file: v })}
          onPreview={onOpenLink}
        />
      )}

      {node.type === 'link' && (
        <input
          value={node.url ?? ''}
          onChange={(e) => onUpdate({ url: e.target.value })}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="https://"
          className="w-full bg-transparent text-on-surface focus:outline-none truncate"
          style={{ fontSize: 11 * zoom }}
        />
      )}

      {node.type === 'image' && (
        <>
          {node.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={node.src} alt="" className="flex-1 object-cover w-full rounded" onMouseDown={(e) => e.stopPropagation()} />
          ) : (
            <input
              value={node.src ?? ''}
              onChange={(e) => onUpdate({ src: e.target.value })}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="image URL"
              className="w-full bg-transparent text-on-surface focus:outline-none"
              style={{ fontSize: 11 * zoom }}
            />
          )}
        </>
      )}

      {node.type === 'youtube' && (
        <>
          {youtubeId ? (
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}`}
              className="flex-1 w-full rounded"
              onMouseDown={(e) => e.stopPropagation()}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <input
              value={node.url ?? ''}
              onChange={(e) => onUpdate({ url: e.target.value })}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="YouTube URL"
              className="w-full bg-transparent text-on-surface focus:outline-none"
              style={{ fontSize: 11 * zoom }}
            />
          )}
        </>
      )}

      {node.type === 'video' && (
        <>
          {node.src ? (
            <video src={node.src} controls className="flex-1 w-full rounded" onMouseDown={(e) => e.stopPropagation()} />
          ) : (
            <input
              value={node.src ?? ''}
              onChange={(e) => onUpdate({ src: e.target.value })}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="video URL or vault path"
              className="w-full bg-transparent text-on-surface focus:outline-none"
              style={{ fontSize: 11 * zoom }}
            />
          )}
        </>
      )}

      {/* Edge handle hint (top-right) */}
      {selected && (
        <div
          className="absolute -top-2 -right-2 bg-surface border border-border rounded-full p-1 shadow text-[9px] text-on-surface-tertiary"
          title={isRTL ? 'Shift + سحب لإنشاء رابط' : 'Shift + drag to link'}
        >
          <MoveRight className="h-2.5 w-2.5" />
        </div>
      )}

      {/* Resize handle (bottom-right) — visible on hover + always when selected */}
      <div
        onMouseDown={onResizeStart}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-end justify-end pr-0.5 pb-0.5',
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-60',
        )}
        title={isRTL ? 'اسحب لتغيير الحجم' : 'Drag to resize'}
        aria-label={isRTL ? 'مقبض تغيير الحجم' : 'Resize handle'}
        style={{ touchAction: 'none' }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 10 L10 0 M4 10 L10 4 M8 10 L10 8" stroke="currentColor" strokeWidth="1.5" className="text-on-surface-tertiary" />
        </svg>
      </div>
    </div>
  );
}

// ── Vault browser modal ────────────────────────────────────────────────
function VaultBrowserModal({ onClose, onPick, isRTL }: { onClose: () => void; onPick: (path: string) => void; isRTL: boolean }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Array<{ path?: string; title: string; kind: string }>>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch<{ hits: Array<{ path?: string; title: string; kind: string }> }>(`/api/search?q=${encodeURIComponent(q)}&scope=phd`);
        setHits(r.hits.filter((h) => h.path));
      } catch {}
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-on-surface-tertiary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={isRTL ? 'ابحث في الملفات...' : 'Search vault files...'}
            autoFocus
            className="flex-1 bg-transparent text-sm text-on-surface focus:outline-none"
          />
          {searching && <Loader2 className="h-4 w-4 animate-spin text-on-surface-tertiary" />}
          <button onClick={onClose} className="text-on-surface-tertiary hover:text-on-surface"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto divide-y divide-border">
          {hits.map((h, i) => h.path && (
            <button key={i} onClick={() => onPick(h.path!)} className="w-full text-start px-4 py-2 hover:bg-surface-secondary">
              <p className="text-sm text-on-surface line-clamp-1">{h.title}</p>
              <p className="text-[10px] text-on-surface-tertiary font-mono truncate">{h.path}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Generate modal — 3 modes: search / paste-paths / since-meeting ──
function GenerateModal({ onClose, onGenerated, isRTL }: { onClose: () => void; onGenerated: (name: string) => void; isRTL: boolean }) {
  const [mode, setMode] = useState<'search' | 'paste' | 'since-meeting' | 'ai-prompt'>('search');
  const [name, setName] = useState('');
  const [pathQuery, setPathQuery] = useState('');
  const [pastedPaths, setPastedPaths] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [layout, setLayout] = useState<'grid' | 'circle'>('grid');
  const [generating, setGenerating] = useState(false);
  const [foundFiles, setFoundFiles] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (mode !== 'search') return;
    if (pathQuery.trim().length < 2) { setFoundFiles([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch<{ hits: Array<{ path?: string }> }>(`/api/search?q=${encodeURIComponent(pathQuery)}&scope=phd`);
        setFoundFiles(r.hits.map((h) => h.path).filter((p): p is string => !!p));
      } catch {}
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [pathQuery, mode]);

  // Effective files based on mode
  const effectiveFiles = (() => {
    if (mode === 'paste') return pastedPaths.split('\n').map((s) => s.trim()).filter(Boolean);
    return foundFiles;
  })();

  const generate = async () => {
    if (!name.trim()) return;
    setGenerating(true);
    try {
      // AI prompt mode — no files needed; AI generates nodes
      if (mode === 'ai-prompt') {
        if (!aiPrompt.trim()) {
          alert(isRTL ? 'اكتب وصف الموضوع أولاً' : 'Type a topic prompt first');
          setGenerating(false);
          return;
        }
        try {
          const r = await apiFetch<{ ok: boolean; nodeCount: number }>('/api/canvas/generate-from-prompt', {
            method: 'POST',
            body: JSON.stringify({ name: name.trim(), prompt: aiPrompt.trim(), layout }),
          });
          if (r.ok) {
            onGenerated(name.trim());
          }
        } catch (e) {
          alert(`Error: ${e instanceof Error ? e.message : 'failed'}`);
        }
        setGenerating(false);
        return;
      }

      let files = effectiveFiles;

      if (mode === 'since-meeting') {
        // Read audit log + extract paths created/modified since last meeting date.
        // Falls back gracefully if no meetings exist yet — uses last 7 days of audit log instead.
        try {
          const supRes = await apiFetch<{ meetings: Array<{ date?: string }> }>('/api/vault/supervision').catch(() => ({ meetings: [] }));
          let sinceIso = supRes.meetings?.[0]?.date;
          if (!sinceIso) {
            // Fallback: last 7 days
            sinceIso = new Date(Date.now() - 7 * 86400_000).toISOString();
          }
          const auditRes = await apiFetch<{ entries: Array<{ path?: string; ts: string }> }>(
            `/api/audit-log?limit=300&since=${encodeURIComponent(String(sinceIso))}`
          );
          files = Array.from(new Set(
            auditRes.entries.map((e) => e.path).filter((p): p is string => !!p && p.endsWith('.md'))
          ));
        } catch (e) {
          alert(isRTL ? `خطأ في قراءة السجل: ${e}` : `Audit log error: ${e}`);
        }
      }

      if (files.length === 0) {
        setGenerating(false);
        alert(isRTL ? 'لم أجد أي ملفات لإنشاء كانفس منها' : 'No files found to build a canvas from');
        return;
      }

      await apiFetch('/api/canvas/generate-from-files', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), files, layout }),
      });
      onGenerated(name.trim());
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : 'failed'}`);
    }
    setGenerating(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-xl shadow-2xl">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-success" />
            <h2 className="text-sm font-semibold text-on-surface">{isRTL ? 'توليد كانفس' : 'Generate canvas'}</h2>
          </div>
          <button onClick={onClose}><X className="h-4 w-4 text-on-surface-tertiary" /></button>
        </div>
        <div className="p-5 space-y-3">
          {/* Mode tabs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1 border border-border rounded-lg p-1 bg-surface-secondary">
            {([
              { id: 'search', en: 'Search vault', ar: 'بحث' },
              { id: 'paste', en: 'Paste paths', ar: 'لصق' },
              { id: 'since-meeting', en: 'Since meeting', ar: 'منذ اجتماع' },
              { id: 'ai-prompt', en: '✨ AI prompt', ar: '✨ بالذكاء' },
            ] as const).map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={cn('flex-1 text-xs px-2 py-1.5 rounded transition-colors',
                  mode === m.id ? 'bg-accent text-on-accent' : 'text-on-surface-secondary hover:bg-surface-tertiary')}
              >
                {isRTL ? m.ar : m.en}
              </button>
            ))}
          </div>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isRTL ? 'اسم الكانفس' : 'Canvas name'}
            className="w-full bg-surface-secondary border border-border rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-accent"
          />

          {mode === 'search' && (
            <>
              <input
                value={pathQuery}
                onChange={(e) => setPathQuery(e.target.value)}
                placeholder={isRTL ? 'كلمة بحث: BIM، Kuwait...' : 'Search term: BIM, Kuwait...'}
                className="w-full bg-surface-secondary border border-border rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-accent"
              />
              {searching && <p className="text-xs text-on-surface-tertiary"><Loader2 className="inline h-3 w-3 animate-spin me-1" />بحث...</p>}
            </>
          )}

          {mode === 'paste' && (
            <textarea
              value={pastedPaths}
              onChange={(e) => setPastedPaths(e.target.value)}
              placeholder={isRTL
                ? 'مسار في كل سطر:\n01 PhD/01 Sources/Papers/note1.md\n01 PhD/02 Atomic Notes/idea.md'
                : 'One path per line:\n01 PhD/01 Sources/Papers/note1.md\n01 PhD/02 Atomic Notes/idea.md'}
              rows={5}
              className="w-full bg-surface-secondary border border-border rounded-lg px-3 py-2 text-xs font-mono text-on-surface focus:outline-none focus:border-accent resize-none"
            />
          )}

          {mode === 'since-meeting' && (
            <p className="text-xs text-on-surface-tertiary p-2 bg-info/5 border border-info/20 rounded-lg">
              {isRTL
                ? 'يقرأ سجل النشاط منذ آخر اجتماع، أو آخر 7 أيام لو لا اجتماعات.'
                : 'Reads activity log since last meeting, or last 7 days if no meetings.'}
            </p>
          )}

          {mode === 'ai-prompt' && (
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={isRTL
                ? 'مثلاً: ابحث في الإنترنت وابنِ كانفس عن استراتيجيات تبني BIM في الخليج، مع روابط للمصادر'
                : 'e.g.: Research the web and build a canvas about BIM adoption strategies in GCC, with source links'}
              rows={4}
              className="w-full bg-surface-secondary border border-border rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-success resize-none"
            />
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-tertiary">{isRTL ? 'تنظيم:' : 'Layout:'}</span>
            <button onClick={() => setLayout('grid')} className={cn('text-xs px-2 py-1 rounded', layout === 'grid' ? 'bg-accent text-on-accent' : 'bg-surface-secondary text-on-surface-tertiary')}>
              {isRTL ? 'شبكة' : 'Grid'}
            </button>
            <button onClick={() => setLayout('circle')} className={cn('text-xs px-2 py-1 rounded', layout === 'circle' ? 'bg-accent text-on-accent' : 'bg-surface-secondary text-on-surface-tertiary')}>
              {isRTL ? 'دائرة' : 'Circle'}
            </button>
          </div>

          {effectiveFiles.length > 0 && mode !== 'since-meeting' && (
            <div className="rounded-lg border border-border bg-surface-secondary p-3 max-h-32 overflow-y-auto">
              <p className="text-xs text-on-surface-tertiary mb-1">
                {isRTL ? `${effectiveFiles.length} ملف` : `${effectiveFiles.length} files`}
              </p>
              {effectiveFiles.slice(0, 8).map((f) => (
                <p key={f} className="text-[10px] text-on-surface-secondary font-mono truncate">{f}</p>
              ))}
              {effectiveFiles.length > 8 && <p className="text-[10px] text-on-surface-tertiary">+{effectiveFiles.length - 8}</p>}
            </div>
          )}

          <button
            onClick={generate}
            disabled={!name.trim() || generating}
            className="w-full flex items-center justify-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-accent text-on-accent disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isRTL ? 'ولّد الكانفس' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Text node body — supports [[wikilinks]] and inline editing ──────
function TextNodeBody({ value, fontSize, onChange, onOpenLink }: {
  value: string;
  fontSize: number;
  onChange: (v: string) => void;
  onOpenLink: (path: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  // Render with [[wikilinks]] as clickable spans
  const segments = useMemo(() => {
    const out: Array<{ text: string; link?: string }> = [];
    const re = /\[\[([^\]]+)\]\]/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(value)) !== null) {
      if (m.index > last) out.push({ text: value.slice(last, m.index) });
      out.push({ text: m[1], link: m[1] });
      last = m.index + m[0].length;
    }
    if (last < value.length) out.push({ text: value.slice(last) });
    return out;
  }, [value]);

  if (editing) {
    return (
      <textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex-1 w-full bg-transparent text-on-surface focus:outline-none resize-none"
        style={{ fontSize }}
      />
    );
  }

  return (
    <div
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className="flex-1 w-full text-on-surface overflow-auto whitespace-pre-wrap break-words"
      style={{ fontSize }}
    >
      {segments.length === 0 || (segments.length === 1 && !segments[0].link && !segments[0].text)
        ? <span className="text-on-surface-tertiary italic">double-click to edit</span>
        : segments.map((s, i) =>
            s.link
              ? (
                <button
                  key={i}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); resolveAndOpenWikilink(s.link!, onOpenLink); }}
                  className="text-accent hover:underline font-medium"
                >
                  {s.text}
                </button>
              )
              : <span key={i}>{s.text}</span>
          )}
    </div>
  );
}

// ── File node body — fetches the actual note and shows live preview ──
function FileNodeBody({ path, fontSize, onChangePath, onPreview }: {
  path: string;
  fontSize: number;
  onChangePath: (v: string) => void;
  onPreview: (path: string) => void;
}) {
  const [editing, setEditing] = useState(!path || path.endsWith('/'));
  const [note, setNote] = useState<{ body: string; name: string; frontmatter?: Record<string, unknown> } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!path || path.endsWith('/')) { setNote(null); return; }
    let cancelled = false;
    setLoading(true);
    fetchNote(path).then((n) => {
      if (!cancelled) { setNote(n); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [path]);

  if (editing) {
    return (
      <div className="flex flex-col gap-1 flex-1 min-h-0">
        <input
          autoFocus
          value={path}
          onChange={(e) => onChangePath(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => { if (e.key === 'Enter') setEditing(false); }}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="01 PhD/02 Atomic Notes/..."
          className="w-full bg-surface border border-border rounded px-1.5 py-0.5 text-on-surface focus:outline-none focus:border-accent"
          style={{ fontSize }}
        />
        <p className="text-[10px] text-on-surface-tertiary">Enter to confirm</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-1">
      <div className="flex items-center justify-between gap-1 shrink-0">
        <p className="text-[11px] text-accent font-semibold truncate flex-1" title={path}>
          {note?.name ?? path.split('/').pop()?.replace(/\.md$/, '') ?? path}
        </p>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className="text-on-surface-tertiary hover:text-accent shrink-0"
          title="edit path"
        ><Pencil className="h-3 w-3" /></button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onPreview(path); }}
          className="text-on-surface-tertiary hover:text-accent shrink-0"
          title="open full note"
        ><Eye className="h-3 w-3" /></button>
      </div>
      <div
        className="flex-1 overflow-auto bg-surface/50 rounded px-2 py-1.5 text-on-surface-secondary leading-snug"
        style={{ fontSize: fontSize * 0.95 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {loading ? (
          <span className="text-on-surface-tertiary text-[10px]">loading…</span>
        ) : !note ? (
          <span className="text-warning text-[10px]">⚠ note not found</span>
        ) : (
          <p className="whitespace-pre-wrap break-words">
            {note.body.replace(/^#+\s*/gm, '').replace(/\[\[([^\]]+)\]\]/g, '$1').slice(0, 800)}
            {note.body.length > 800 && '…'}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Resolve a wikilink (just a name, or a full path) to a real vault path ──
async function resolveAndOpenWikilink(target: string, open: (path: string) => void) {
  const t = target.trim();
  // If it has a slash and ends with .md (or is plain), assume it's already a path
  const looksLikePath = t.includes('/');
  if (looksLikePath) {
    open(t.endsWith('.md') ? t : `${t}.md`);
    return;
  }
  // Otherwise, search for a note matching the name
  try {
    const r = await apiFetch<{ results: Array<{ path: string }> }>(`/api/vault/search?q=${encodeURIComponent(t)}&limit=1`);
    if (r.results?.[0]?.path) { open(r.results[0].path); return; }
  } catch {}
  // Fallback: try common locations
  open(`01 PhD/02 Atomic Notes/${t}.md`);
}

// ── Doc preview modal — shows full note content ─────────────────────
function DocPreviewModal({ path, isRTL, onClose }: { path: string; isRTL: boolean; onClose: () => void }) {
  const [note, setNote] = useState<{ body: string; name: string; frontmatter?: Record<string, unknown> } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNote(path).then((n) => { setNote(n); setLoading(false); });
  }, [path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="bg-surface border border-border rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-accent shrink-0" />
            <h2 className="text-base font-semibold text-on-surface truncate">{note?.name ?? path.split('/').pop()}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={`obsidian://open?vault=PhD&file=${encodeURIComponent(path.replace(/\.md$/, ''))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25"
            >
              <ExternalLink className="h-3 w-3" />
              {isRTL ? 'فتح في Obsidian' : 'Open in Obsidian'}
            </a>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-secondary text-on-surface-tertiary">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-on-surface-tertiary" /></div>
          ) : !note ? (
            <p className="text-sm text-warning text-center py-10">{isRTL ? 'تعذّر تحميل الملاحظة' : 'Could not load note'}</p>
          ) : (
            <div
              className="prose prose-sm max-w-none text-on-surface prose-headings:text-on-surface prose-strong:text-on-surface prose-a:text-accent"
              dir={/[\u0600-\u06FF]/.test(note.body) ? 'rtl' : 'ltr'}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.body}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
