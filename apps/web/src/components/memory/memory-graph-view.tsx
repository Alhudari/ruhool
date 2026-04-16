'use client';

import { useEffect, useState, useMemo } from 'react';
import { Network, User, FolderKanban, Building2, Handshake, Calendar, Hash, Tag, Trash2, Search, Plus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { ClippyHelp } from '@/components/help/clippy-help';

const MEMORY_HELP = [
  { illustration: '🧠', title: { ar: 'ما هو الرسم المعرفي؟', en: 'What is Memory Graph?' },
    body: { ar: 'شبكة من الكيانات (أشخاص، مشاريع، منظمات) والعلاقات بينها. النظام يبنيها تلقائياً من محادثاتك.', en: 'A network of entities (people, projects, orgs) and relations between them — auto-built from your chats.' } },
  { illustration: '🤖', title: { ar: 'من يملأه؟', en: 'Who populates it?' },
    body: { ar: 'بعد كل محادثة، وكيل خفيف (Haiku) يستخرج الأسماء والعلاقات. ولا يخترع — فقط ما ذُكر صراحة.', en: 'After each chat, a Haiku agent extracts names and relations. It never invents — only what was stated.' } },
  { illustration: '👆', title: { ar: 'كيف أستخدمه؟', en: 'How do I use it?' },
    body: { ar: 'اضغط أي كيان لترى علاقاته. فلتر بالنوع. الوكلاء يستعلمونه تلقائياً للإجابات الدقيقة.', en: 'Click any node to see its relations. Filter by type. Agents query it automatically for precise answers.' } },
];

interface GraphNode {
  id: string;
  type: string;
  label: string;
  props?: Record<string, string | number | boolean>;
  confidence?: number;
  createdAt: string;
}
interface GraphEdge {
  id: string;
  from: string;
  to: string;
  relation: string;
  confidence?: number;
}

const TYPE_ICON: Record<string, LucideIcon> = {
  person: User,
  project: FolderKanban,
  organization: Building2,
  agreement: Handshake,
  appointment: Calendar,
  topic: Hash,
  other: Tag,
};

const TYPE_COLOR: Record<string, string> = {
  person: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  project: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  organization: 'bg-violet-500/15 text-violet-600 border-violet-500/30',
  agreement: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  appointment: 'bg-rose-500/15 text-rose-600 border-rose-500/30',
  topic: 'bg-cyan-500/15 text-cyan-600 border-cyan-500/30',
  other: 'bg-slate-500/15 text-slate-600 border-slate-500/30',
};

export function MemoryGraphView() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selected, setSelected] = useState<string | null>(null);

  const load = () => {
    apiFetch<{ nodes: GraphNode[]; edges: GraphEdge[] }>('/api/graph')
      .then((r) => { setNodes(r.nodes); setEdges(r.edges); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filteredNodes = useMemo(() => {
    const q = search.toLowerCase().trim();
    return nodes.filter((n) => {
      if (typeFilter !== 'all' && n.type !== typeFilter) return false;
      if (q && !n.label.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [nodes, search, typeFilter]);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selected), [nodes, selected]);
  const selectedEdges = useMemo(() => {
    if (!selected) return [];
    return edges.filter((e) => e.from === selected || e.to === selected);
  }, [edges, selected]);

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of nodes) c[n.type] = (c[n.type] || 0) + 1;
    return c;
  }, [nodes]);

  const deleteNode = async (id: string) => {
    if (!confirm(isRTL ? 'حذف هذا الكيان مع علاقاته؟' : 'Delete this node and its edges?')) return;
    await apiFetch(`/api/graph/nodes/${id}`, { method: 'DELETE' });
    setSelected(null);
    load();
  };

  const deleteEdge = async (id: string) => {
    await apiFetch(`/api/graph/edges/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className={cn('max-w-7xl mx-auto px-6 py-6 space-y-4', isRTL && 'rtl')} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-[var(--radius-lg)] bg-accent/10 text-accent flex items-center justify-center">
          <Network size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-on-surface">{isRTL ? 'الرسم المعرفي' : 'Memory Graph'}</h1>
          <p className="text-xs text-on-surface-tertiary">{isRTL ? 'كيانات وعلاقات يستخرجها النظام تلقائياً' : 'Entities and relations the system extracts automatically'}</p>
        </div>
        <div className="ms-auto"><ClippyHelp steps={MEMORY_HELP} title={{ ar: 'الرسم المعرفي', en: 'Memory Graph' }} /></div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={14} className="absolute top-1/2 -translate-y-1/2 text-on-surface-tertiary" style={isRTL ? { right: 10 } : { left: 10 }} />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={isRTL ? 'ابحث في الكيانات...' : 'Search entities...'}
            className={cn('w-full bg-input border border-border rounded-[var(--radius)] py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring', isRTL ? 'pr-8 pl-3' : 'pl-8 pr-3')}
          />
        </div>
        <button
          onClick={() => setTypeFilter('all')}
          className={cn('px-2.5 py-1.5 rounded-[var(--radius)] text-xs', typeFilter === 'all' ? 'bg-accent text-on-accent font-semibold' : 'bg-surface border border-border')}
        >
          {isRTL ? 'الكل' : 'All'} ({nodes.length})
        </button>
        {Object.keys(TYPE_ICON).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={cn('px-2.5 py-1.5 rounded-[var(--radius)] text-xs border', typeFilter === t ? TYPE_COLOR[t] + ' font-semibold' : 'bg-surface border-border')}
          >
            {t} {typeCounts[t] ? `(${typeCounts[t]})` : ''}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        {/* Node grid */}
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 min-h-[400px]">
          {loading ? (
            <div className="text-center text-xs text-on-surface-tertiary py-12">{isRTL ? 'جاري التحميل…' : 'Loading…'}</div>
          ) : filteredNodes.length === 0 ? (
            <div className="text-center text-xs text-on-surface-tertiary py-12">
              {isRTL ? 'لا توجد كيانات بعد. النظام سيستخرجها تلقائياً من محادثاتك.' : 'No entities yet. They are extracted automatically from your conversations.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {filteredNodes.map((n) => {
                const Icon = TYPE_ICON[n.type] || Tag;
                const color = TYPE_COLOR[n.type] || TYPE_COLOR.other;
                const isSelected = selected === n.id;
                return (
                  <button
                    key={n.id}
                    onClick={() => setSelected(n.id)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-[var(--radius)] border text-start transition-colors',
                      isSelected ? 'ring-2 ring-accent' : '',
                      color
                    )}
                  >
                    <Icon size={14} />
                    <span className="truncate flex-1 text-xs font-medium">{n.label}</span>
                    {n.confidence !== undefined && n.confidence < 0.7 && (
                      <span className="text-[9px] opacity-60">~</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Details panel */}
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 h-fit sticky top-4">
          {!selectedNode ? (
            <div className="text-xs text-on-surface-tertiary italic">
              {isRTL ? 'اختر كياناً لعرض علاقاته' : 'Select an entity to view its relations'}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-wide text-on-surface-tertiary">{selectedNode.type}</div>
                  <div className="text-sm font-semibold text-on-surface">{selectedNode.label}</div>
                  <div className="text-[10px] text-on-surface-tertiary mt-0.5">
                    {isRTL ? 'أُضيف' : 'Added'}: {new Date(selectedNode.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <button onClick={() => deleteNode(selectedNode.id)} className="p-1 text-red-500 hover:bg-red-500/10 rounded">
                  <Trash2 size={14} />
                </button>
              </div>

              {selectedNode.props && Object.keys(selectedNode.props).length > 0 && (
                <div className="text-xs space-y-1 pt-2 border-t border-border">
                  {Object.entries(selectedNode.props).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-on-surface-tertiary min-w-[60px]">{k}:</span>
                      <span className="text-on-surface">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-border">
                <div className="text-[10px] uppercase tracking-wide text-on-surface-tertiary mb-1.5">
                  {isRTL ? 'العلاقات' : 'Relations'} ({selectedEdges.length})
                </div>
                {selectedEdges.length === 0 ? (
                  <div className="text-xs text-on-surface-tertiary italic">{isRTL ? 'لا علاقات' : 'No relations'}</div>
                ) : (
                  <div className="space-y-1">
                    {selectedEdges.map((e) => {
                      const other = e.from === selectedNode.id ? nodes.find((n) => n.id === e.to) : nodes.find((n) => n.id === e.from);
                      const arrow = e.from === selectedNode.id ? '→' : '←';
                      return (
                        <div key={e.id} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-surface-secondary">
                          <span className="text-on-surface-tertiary">{arrow}</span>
                          <span className="text-accent italic">{e.relation}</span>
                          <span className="text-on-surface-tertiary">→</span>
                          <button onClick={() => setSelected(other?.id || null)} className="text-on-surface hover:underline truncate">
                            {other?.label || '?'}
                          </button>
                          <button onClick={() => deleteEdge(e.id)} className="ms-auto text-red-500 opacity-60 hover:opacity-100">
                            <Trash2 size={10} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
