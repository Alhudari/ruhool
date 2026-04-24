'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Plus,
  X,
  ZoomIn,
  ZoomOut,
  Maximize,
  Save,
  ArrowLeft,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

// ─── Types ───

interface WorkflowNode {
  id: string;
  agentId: string;
  prompt: string;
  x: number;
  y: number;
  order: number;
}

interface WorkflowData {
  id: string;
  name: string | { en: string; ar: string };
  description: string;
  steps: Array<{ agentId: string; prompt: string }>;
  trigger: { type: string; cron?: string };
  enabled: boolean;
  createdAt: string;
}

const AGENTS = [
  { id: 'manager', label: 'Al-Ra\'i (Manager)', labelAr: 'الراعي (القائد)' },
  { id: 'research', label: 'Al-Bahith (Research)', labelAr: 'عبدان (البحث)' },
  { id: 'reading-helper', label: 'Al-Mulakhkhis (Reading)', labelAr: 'شواشة (القراءة)' },
  { id: 'writing-critic', label: 'Al-Naqid (Writing)', labelAr: 'الصفرا (النقد)' },
];

const NODE_WIDTH = 240;
const NODE_HEIGHT = 120;
const CANVAS_PADDING = 60;

// ─── Component ───

export function WorkflowEditor({
  workflow,
  onBack,
}: {
  workflow: WorkflowData;
  onBack: () => void;
}) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  // Convert steps to nodes with positions
  const initialNodes: WorkflowNode[] = useMemo(
    () =>
      workflow.steps.map((step, i) => ({
        id: `node-${i}-${Date.now()}`,
        agentId: step.agentId,
        prompt: step.prompt,
        x: CANVAS_PADDING + i * (NODE_WIDTH + 80),
        y: 200,
        order: i,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workflow.id]
  );

  const [nodes, setNodes] = useState<WorkflowNode[]>(initialNodes);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Dragging state
  const [dragging, setDragging] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Panning state
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Mouse handlers for dragging nodes ───

  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const svgRect = svgRef.current?.getBoundingClientRect();
      if (!svgRect) return;

      const mouseX = (e.clientX - svgRect.left - pan.x) / zoom;
      const mouseY = (e.clientY - svgRect.top - pan.y) / zoom;

      dragOffset.current = { x: mouseX - node.x, y: mouseY - node.y };
      setDragging(nodeId);
      setSelectedNode(nodeId);
    },
    [nodes, zoom, pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragging) {
        const svgRect = svgRef.current?.getBoundingClientRect();
        if (!svgRect) return;

        const mouseX = (e.clientX - svgRect.left - pan.x) / zoom;
        const mouseY = (e.clientY - svgRect.top - pan.y) / zoom;

        setNodes((prev) =>
          prev.map((n) =>
            n.id === dragging
              ? { ...n, x: mouseX - dragOffset.current.x, y: mouseY - dragOffset.current.y }
              : n
          )
        );
      } else if (isPanning) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        setPan({
          x: panStart.current.panX + dx,
          y: panStart.current.panY + dy,
        });
      }
    },
    [dragging, isPanning, zoom, pan]
  );

  const handleMouseUp = useCallback(() => {
    if (dragging) {
      // Recalculate order based on x position
      setNodes((prev) => {
        const sorted = [...prev].sort((a, b) => a.x - b.x);
        return sorted.map((n, i) => ({ ...n, order: i }));
      });
    }
    setDragging(null);
    setIsPanning(false);
  }, [dragging]);

  // Canvas panning
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === svgRef.current || (e.target as SVGElement).tagName === 'svg') {
        setIsPanning(true);
        panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
        setSelectedNode(null);
      }
    },
    [pan]
  );

  // ─── Zoom ───

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.15, 2));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.15, 0.3));

  const handleFitToScreen = useCallback(() => {
    if (nodes.length === 0 || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();

    const minX = Math.min(...nodes.map((n) => n.x));
    const maxX = Math.max(...nodes.map((n) => n.x + NODE_WIDTH));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxY = Math.max(...nodes.map((n) => n.y + NODE_HEIGHT));

    const contentW = maxX - minX + CANVAS_PADDING * 2;
    const contentH = maxY - minY + CANVAS_PADDING * 2;

    const scaleX = containerRect.width / contentW;
    const scaleY = containerRect.height / contentH;
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.3), 1.5);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setPan({
      x: containerRect.width / 2 - centerX * newZoom,
      y: containerRect.height / 2 - centerY * newZoom,
    });
    setZoom(newZoom);
  }, [nodes]);

  // Fit on first render
  useEffect(() => {
    if (nodes.length > 0) {
      const timeout = setTimeout(handleFitToScreen, 100);
      return () => clearTimeout(timeout);
    }
  }, []);// eslint-disable-line react-hooks/exhaustive-deps

  // ─── Node operations ───

  const addNode = useCallback(() => {
    const maxX = nodes.length > 0 ? Math.max(...nodes.map((n) => n.x)) : 0;
    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      agentId: 'manager',
      prompt: '',
      x: maxX + NODE_WIDTH + 80,
      y: 200,
      order: nodes.length,
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNode(newNode.id);
  }, [nodes]);

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((prev) => {
        const filtered = prev.filter((n) => n.id !== nodeId);
        return filtered
          .sort((a, b) => a.x - b.x)
          .map((n, i) => ({ ...n, order: i }));
      });
      if (selectedNode === nodeId) setSelectedNode(null);
    },
    [selectedNode]
  );

  const updateNode = useCallback(
    (nodeId: string, field: 'agentId' | 'prompt', value: string) => {
      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, [field]: value } : n))
      );
    },
    []
  );

  // ─── Save ───

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      const sortedNodes = [...nodes].sort((a, b) => a.order - b.order);
      const steps = sortedNodes.map((n) => ({
        agentId: n.agentId,
        prompt: n.prompt,
      }));
      await apiFetch(`/api/workflows/${workflow.id}`, {
        method: 'PUT',
        body: JSON.stringify({ steps }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // save failed
    }
    setSaving(false);
  }, [nodes, workflow.id]);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if (e.key === 'Delete' && selectedNode) {
        deleteNode(selectedNode);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, selectedNode, deleteNode]);

  // ─── Connection lines ───

  const sortedNodes = useMemo(
    () => [...nodes].sort((a, b) => a.order - b.order),
    [nodes]
  );

  const connections = useMemo(() => {
    const conns: Array<{ from: WorkflowNode; to: WorkflowNode }> = [];
    for (let i = 0; i < sortedNodes.length - 1; i++) {
      conns.push({ from: sortedNodes[i], to: sortedNodes[i + 1] });
    }
    return conns;
  }, [sortedNodes]);

  const selectedNodeData = nodes.find((n) => n.id === selectedNode);
  const workflowName =
    typeof workflow.name === 'string'
      ? workflow.name
      : workflow.name[language] || workflow.name.en;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius)] text-sm text-on-surface-secondary hover:bg-surface-secondary transition-colors"
          >
            <ArrowLeft size={16} />
            {isRTL ? 'رجوع' : 'Back'}
          </button>
          <div className="w-px h-6 bg-border" />
          <h2 className="text-sm font-medium text-on-surface">{workflowName}</h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={addNode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors"
          >
            <Plus size={14} />
            {isRTL ? 'خطوة' : 'Add Step'}
          </button>

          <div className="w-px h-6 bg-border" />

          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded-[var(--radius)] text-on-surface-tertiary hover:bg-surface-secondary transition-colors"
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-xs text-on-surface-tertiary w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded-[var(--radius)] text-on-surface-tertiary hover:bg-surface-secondary transition-colors"
            title="Zoom In"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={handleFitToScreen}
            className="p-1.5 rounded-[var(--radius)] text-on-surface-tertiary hover:bg-surface-secondary transition-colors"
            title="Fit to Screen"
          >
            <Maximize size={16} />
          </button>

          <div className="w-px h-6 bg-border" />

          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius)] text-sm transition-colors',
              saved
                ? 'bg-green-500/10 text-green-400'
                : 'bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary'
            )}
          >
            <Save size={14} />
            {saving
              ? isRTL
                ? 'جاري الحفظ...'
                : 'Saving...'
              : saved
                ? isRTL
                  ? 'تم الحفظ'
                  : 'Saved'
                : isRTL
                  ? 'حفظ'
                  : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden bg-surface-secondary relative cursor-grab active:cursor-grabbing"
        >
          <svg
            ref={svgRef}
            className="w-full h-full"
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Grid pattern */}
            <defs>
              <pattern
                id="grid"
                width={20 * zoom}
                height={20 * zoom}
                patternUnits="userSpaceOnUse"
                x={pan.x % (20 * zoom)}
                y={pan.y % (20 * zoom)}
              >
                <circle cx={1} cy={1} r={0.5} fill="var(--color-border)" opacity={0.4} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Connection arrows */}
              {connections.map((conn, i) => {
                const fromX = conn.from.x + NODE_WIDTH;
                const fromY = conn.from.y + NODE_HEIGHT / 2;
                const toX = conn.to.x;
                const toY = conn.to.y + NODE_HEIGHT / 2;
                const midX = (fromX + toX) / 2;

                return (
                  <g key={`conn-${i}`}>
                    <path
                      d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}
                      fill="none"
                      stroke="var(--color-accent)"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      opacity={0.6}
                    />
                    {/* Arrow head */}
                    <polygon
                      points={`${toX} ${toY}, ${toX - 8} ${toY - 5}, ${toX - 8} ${toY + 5}`}
                      fill="var(--color-accent)"
                      opacity={0.6}
                    />
                  </g>
                );
              })}

              {/* Nodes */}
              {nodes.map((node) => {
                const isSelected = selectedNode === node.id;
                const agentInfo = AGENTS.find((a) => a.id === node.agentId);

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                    style={{ cursor: dragging === node.id ? 'grabbing' : 'grab' }}
                  >
                    {/* Node background */}
                    <rect
                      width={NODE_WIDTH}
                      height={NODE_HEIGHT}
                      rx={8}
                      ry={8}
                      fill="var(--color-surface)"
                      stroke={isSelected ? 'var(--color-accent)' : 'var(--color-border)'}
                      strokeWidth={isSelected ? 2 : 1}
                    />

                    {/* Order badge */}
                    <circle
                      cx={-8}
                      cy={NODE_HEIGHT / 2}
                      r={12}
                      fill="var(--color-accent)"
                    />
                    <text
                      x={-8}
                      y={NODE_HEIGHT / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="var(--color-on-accent)"
                      fontSize={11}
                      fontWeight={600}
                    >
                      {node.order + 1}
                    </text>

                    {/* Grip icon area */}
                    <rect
                      x={0}
                      y={0}
                      width={NODE_WIDTH}
                      height={28}
                      rx={8}
                      ry={8}
                      fill="var(--color-surface-secondary)"
                    />
                    <rect
                      x={0}
                      y={14}
                      width={NODE_WIDTH}
                      height={14}
                      fill="var(--color-surface-secondary)"
                    />

                    {/* Agent name */}
                    <text
                      x={12}
                      y={18}
                      fill="var(--color-on-surface)"
                      fontSize={12}
                      fontWeight={500}
                    >
                      {isRTL ? agentInfo?.labelAr : agentInfo?.label}
                    </text>

                    {/* Delete button */}
                    <g
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        deleteNode(node.id);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <rect
                        x={NODE_WIDTH - 28}
                        y={2}
                        width={24}
                        height={24}
                        rx={4}
                        fill="transparent"
                      />
                      <line
                        x1={NODE_WIDTH - 20}
                        y1={10}
                        x2={NODE_WIDTH - 12}
                        y2={18}
                        stroke="var(--color-on-surface-tertiary)"
                        strokeWidth={1.5}
                      />
                      <line
                        x1={NODE_WIDTH - 12}
                        y1={10}
                        x2={NODE_WIDTH - 20}
                        y2={18}
                        stroke="var(--color-on-surface-tertiary)"
                        strokeWidth={1.5}
                      />
                    </g>

                    {/* Prompt preview */}
                    <foreignObject x={12} y={36} width={NODE_WIDTH - 24} height={NODE_HEIGHT - 48}>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-on-surface-tertiary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          lineHeight: '1.4',
                          wordBreak: 'break-word',
                        }}
                      >
                        {node.prompt || (isRTL ? '(اضغط للتعديل)' : '(Click to edit)')}
                      </div>
                    </foreignObject>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Empty state */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-on-surface-tertiary">
                <GripVertical size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-lg mb-2">
                  {isRTL ? 'لا توجد خطوات' : 'No steps yet'}
                </p>
                <p className="text-sm">
                  {isRTL
                    ? 'اضغط "خطوة" لإضافة أول خطوة'
                    : 'Click "Add Step" to create your first step'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Properties panel */}
        {selectedNodeData && (
          <div className="w-80 border-l border-border bg-surface p-4 overflow-auto shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-on-surface">
                {isRTL ? 'تعديل الخطوة' : 'Edit Step'}
              </h3>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1 rounded-[var(--radius)] text-on-surface-tertiary hover:bg-surface-secondary transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-on-surface-secondary mb-1.5">
                  {isRTL ? 'الترتيب' : 'Order'}
                </label>
                <div className="text-sm text-on-surface bg-surface-secondary px-3 py-2 rounded-[var(--radius)]">
                  {isRTL ? `الخطوة ${selectedNodeData.order + 1}` : `Step ${selectedNodeData.order + 1}`}
                </div>
              </div>

              <div>
                <label className="block text-xs text-on-surface-secondary mb-1.5">
                  {isRTL ? 'الوكيل' : 'Agent'}
                </label>
                <select
                  value={selectedNodeData.agentId}
                  onChange={(e) =>
                    updateNode(selectedNodeData.id, 'agentId', e.target.value)
                  }
                  className="w-full px-3 py-2 rounded-[var(--radius)] bg-surface-secondary border border-border text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  {AGENTS.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {isRTL ? agent.labelAr : agent.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-on-surface-secondary mb-1.5">
                  {isRTL ? 'الأمر' : 'Prompt'}
                </label>
                <textarea
                  value={selectedNodeData.prompt}
                  onChange={(e) =>
                    updateNode(selectedNodeData.id, 'prompt', e.target.value)
                  }
                  rows={6}
                  className="w-full px-3 py-2 rounded-[var(--radius)] bg-surface-secondary border border-border text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                  placeholder={
                    isRTL ? 'اكتب الأمر لهذه الخطوة...' : 'Write the prompt for this step...'
                  }
                />
              </div>

              <button
                onClick={() => deleteNode(selectedNodeData.id)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-[var(--radius)] text-sm text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors"
              >
                <X size={14} />
                {isRTL ? 'حذف الخطوة' : 'Delete Step'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
