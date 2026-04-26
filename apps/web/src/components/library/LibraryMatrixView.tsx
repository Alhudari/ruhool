'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Eye, EyeOff, Filter, RotateCcw, Upload, Search, ChevronDown, BookOpen, ExternalLink, Trash2, Sparkles, X, Check, Loader2, Folder, FolderPlus, FolderOpen, ChevronRight, Plus, FolderTree, Zap, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch, API_BASE_URL } from '@/lib/api';
import { LibraryAgentChat } from './LibraryAgentChat';

type EntityType = 'paper' | 'book' | 'report' | 'standard' | 'my-writing' | 'thesis-chapter'
  | 'person' | 'organization' | 'conference' | 'project'
  | 'atomic-note' | 'reading-session' | 'research-cluster'
  | 'file' | 'webpage' | 'video' | 'code-repo';

type ColumnKind = 'string' | 'text' | 'number' | 'tags' | 'list' | 'date' | 'url' | 'select' | 'boolean';

interface MatrixColumn {
  key: string;
  labelEn: string;
  labelAr: string;
  kind: ColumnKind;
  options?: string[];
  visible: boolean;
  width?: number;
  order: number;
  source?: 'top-level' | 'custom';
}

interface MatrixSchema {
  type: EntityType;
  columns: MatrixColumn[];
  updatedAt: string;
}

interface LibraryEntity {
  id: string;
  type: EntityType;
  title: string;
  authors?: string;
  year?: number;
  url?: string;
  doi?: string;
  citekey?: string;
  tags: string[];
  readingStatus?: string;
  readingDepth?: string;
  customFields?: Record<string, unknown>;
  collectionIds?: string[];
  createdAt: string;
}

interface LibraryCollection {
  id: string;
  name: string;
  parentId?: string | null;
  zoteroCollectionKey?: string;
  color?: string;
  notes?: string;
  entityCount?: number;
  createdAt: string;
  updatedAt: string;
}

const TYPE_LABELS: Record<string, { en: string; ar: string }> = {
  paper: { en: 'Academic Papers', ar: 'الأوراق الأكاديمية' },
  book: { en: 'Books', ar: 'الكتب' },
  report: { en: 'Reports', ar: 'التقارير' },
  standard: { en: 'Standards', ar: 'المعايير' },
  'my-writing': { en: 'My Writing', ar: 'كتاباتي' },
  'thesis-chapter': { en: 'Thesis Chapters', ar: 'فصول الرسالة' },
  webpage: { en: 'Web Pages', ar: 'صفحات ويب' },
  file: { en: 'Files', ar: 'ملفات' },
};

const PHD_VAULT_LITREV = 'C:\\Users\\alhud\\OneDrive - University of Birmingham\\Obsidian\\PhD\\99 Archive\\2026-04-22 — PhD Reset\\01 PhD\\02 Literature Review\\Academic Literature';

function renderCellValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(String).join(', ');
  return String(v);
}

export function LibraryMatrixView({ initialType = 'paper' as EntityType }: { initialType?: EntityType }) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const router = useRouter();
  const [type, setType] = useState<EntityType>(initialType);
  const [schema, setSchema] = useState<MatrixSchema | null>(null);
  const [entities, setEntities] = useState<LibraryEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Inline cell editing — track the (entityId, columnKey) being edited and the buffered draft.
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyEntity, setBusyEntity] = useState<string | null>(null);
  // Agent-fill modal state
  interface AgentProposal {
    columnKey: string;
    label: string;
    labelAr: string;
    kind: ColumnKind;
    current: unknown;
    proposed: unknown;
    reasoning: string;
    confidence: 'high' | 'medium' | 'low';
    source: 'top-level' | 'custom';
  }
  const [agentEntityId, setAgentEntityId] = useState<string | null>(null);
  const [agentProposals, setAgentProposals] = useState<AgentProposal[]>([]);
  const [agentInstructions, setAgentInstructions] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentApplying, setAgentApplying] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  // Per-row column selection: which columns to ask the agent to fill (empty = all visible)
  const [agentColumnSelection, setAgentColumnSelection] = useState<Set<string>>(new Set());
  // Track which proposals the user has approved/edited; values map keeps the user's edits.
  const [proposalEdits, setProposalEdits] = useState<Record<string, unknown>>({});
  const [proposalApproval, setProposalApproval] = useState<Record<string, boolean>>({});
  // Collections (Phase D) — sidebar tree, filter, manage
  const [collections, setCollections] = useState<LibraryCollection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [collectionsOpen, setCollectionsOpen] = useState(true);
  const [importingZotero, setImportingZotero] = useState(false);
  const [organizingProposals, setOrganizingProposals] = useState<Array<{ entityId: string; addCollectionIds: string[]; reasoning: string }>>([]);
  const [showOrganizer, setShowOrganizer] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [collectionDraft, setCollectionDraft] = useState('');
  // Per-entity "add to collection" popover state
  const [collectionPopoverEntity, setCollectionPopoverEntity] = useState<string | null>(null);
  // Column-suggestion modal — agent proposes new columns based on existing data
  interface ColumnSuggestion {
    key: string;
    labelEn: string;
    labelAr: string;
    kind: ColumnKind;
    options?: string[];
    reasoning: string;
  }
  const [showSuggestColumns, setShowSuggestColumns] = useState(false);
  const [columnSuggestions, setColumnSuggestions] = useState<ColumnSuggestion[]>([]);
  const [suggestingColumns, setSuggestingColumns] = useState(false);
  const [suggestColumnInstructions, setSuggestColumnInstructions] = useState('');
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Set<string>>(new Set());
  // Library Agent Chat panel state — entityId === null means the global thread.
  const [chatEntityId, setChatEntityId] = useState<string | null | undefined>(undefined); // undefined = closed
  // Ref to the latest `load()` so collection callbacks above its declaration
  // can still trigger a refresh without circular deps.
  const loadRef = useRef<(() => Promise<void>) | null>(null);
  // Drag-and-drop state — track which collection node is hover-target so we can
  // give visual feedback while the user is mid-drag.
  const [dragHoverCollectionId, setDragHoverCollectionId] = useState<string | null>(null);
  const draggedEntityRef = useRef<string | null>(null);

  const loadCollections = useCallback(async () => {
    try {
      const r = await apiFetch<{ collections: LibraryCollection[] }>('/api/library/collections');
      setCollections(r.collections ?? []);
    } catch { setCollections([]); }
  }, []);
  useEffect(() => { void loadCollections(); }, [loadCollections]);

  const collectionTree = useMemo(() => {
    type Node = LibraryCollection & { children: Node[] };
    const map = new Map<string, Node>(collections.map((cc) => [cc.id, { ...cc, children: [] }]));
    const roots: Node[] = [];
    for (const node of map.values()) {
      if (node.parentId && map.has(node.parentId)) map.get(node.parentId)!.children.push(node);
      else roots.push(node);
    }
    const sortRec = (nodes: Node[]) => {
      nodes.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      for (const n of nodes) sortRec(n.children);
    };
    sortRec(roots);
    return roots;
  }, [collections]);

  const createCollection = useCallback(async () => {
    const name = prompt(isRTL ? 'اسم الكولكشن:' : 'Collection name:');
    if (!name?.trim()) return;
    try {
      const r = await apiFetch<{ collection: LibraryCollection }>('/api/library/collections', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      setCollections((cc) => [...cc, r.collection]);
    } catch (err) {
      setToast(`Create failed: ${(err as Error).message}`);
      setTimeout(() => setToast(null), 3000);
    }
  }, [isRTL]);

  const renameCollection = useCallback(async (id: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      const r = await apiFetch<{ collection: LibraryCollection }>(`/api/library/collections/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: newName.trim() }),
      });
      setCollections((cc) => cc.map((c) => c.id === id ? r.collection : c));
      setEditingCollectionId(null);
    } catch (err) {
      setToast(`Rename failed: ${(err as Error).message}`);
      setTimeout(() => setToast(null), 3000);
    }
  }, []);

  const deleteCollection = useCallback(async (id: string) => {
    const col = collections.find((c) => c.id === id);
    if (!col) return;
    const hasChildren = collections.some((c) => c.parentId === id);
    let useCascade = false;
    let proceed: boolean;
    if (hasChildren) {
      // Two-step prompt: first asks subtree-delete vs reparent, then confirms.
      useCascade = confirm(
        isRTL
          ? `"${col.name}" يحتوي على كولكشنز فرعية.\n\nOK = حذف شامل (تشمل الفروع)\nCancel = حذف هذا فقط مع إعادة ربط الأطفال بالأب`
          : `"${col.name}" has child collections.\n\nOK = subtree delete (including children)\nCancel = delete only this; reparent children to parent`,
      );
      proceed = confirm(
        isRTL
          ? `تأكيد ${useCascade ? 'الحذف الشامل' : 'الحذف مع إعادة الربط'}؟`
          : `Confirm ${useCascade ? 'subtree delete' : 'delete with reparent'}?`,
      );
    } else {
      proceed = confirm(isRTL ? `حذف "${col.name}"؟ سيُفصل عن الكيانات بدون حذفها.` : `Delete "${col.name}"? Entities will be detached, not deleted.`);
    }
    if (!proceed) return;
    try {
      await apiFetch(`/api/library/collections/${id}${useCascade ? '?cascade=true' : ''}`, { method: 'DELETE' });
      // Server may have soft-deleted multiple — refetch the full list rather
      // than splicing locally.
      void loadCollections();
      if (activeCollectionId === id) setActiveCollectionId(null);
      void loadRef.current?.();
    } catch (err) {
      setToast(`Delete failed: ${(err as Error).message}`);
      setTimeout(() => setToast(null), 3000);
    }
  }, [collections, isRTL, activeCollectionId, loadCollections]);

  const importZoteroCollections = useCallback(async () => {
    setImportingZotero(true);
    try {
      const r = await apiFetch<{ created: number; skipped: number; parented: number; total: number }>(
        '/api/library/collections/import-zotero',
        { method: 'POST', body: JSON.stringify({}) },
      );
      await loadCollections();
      setToast(
        isRTL
          ? `تم: ${r.created} جديد، ${r.skipped} موجود، ${r.parented} مُربط`
          : `Done: ${r.created} new, ${r.skipped} existing, ${r.parented} parented`,
      );
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      setToast(`Import failed: ${(err as Error).message}`);
      setTimeout(() => setToast(null), 3500);
    } finally {
      setImportingZotero(false);
    }
  }, [isRTL, loadCollections]);

  const setEntityCollections = useCallback(async (entityId: string, set: string[]) => {
    try {
      await apiFetch<{ ok: boolean; collectionIds: string[] }>(
        `/api/library/entities/${entityId}/collections`,
        { method: 'POST', body: JSON.stringify({ set }) },
      );
      setEntities((es) => es.map((e) => e.id === entityId ? { ...e, collectionIds: set } : e));
      void loadCollections(); // refresh counts
    } catch (err) {
      setToast(`Failed: ${(err as Error).message}`);
      setTimeout(() => setToast(null), 3000);
    }
  }, [loadCollections]);

  const runOrganizer = useCallback(async () => {
    setOrganizing(true);
    setShowOrganizer(true);
    try {
      const r = await apiFetch<{ assignments: Array<{ entityId: string; addCollectionIds: string[]; reasoning: string }> }>(
        '/api/library/collections/auto-organize',
        { method: 'POST', body: JSON.stringify({ maxItems: 30 }) },
      );
      setOrganizingProposals(r.assignments ?? []);
    } catch (err) {
      setToast(`Organizer failed: ${(err as Error).message}`);
      setTimeout(() => setToast(null), 3000);
      setShowOrganizer(false);
    } finally { setOrganizing(false); }
  }, []);

  const applyOrganizer = useCallback(async () => {
    if (organizingProposals.length === 0) return;
    try {
      const r = await apiFetch<{ applied: number }>(
        '/api/library/collections/apply-organize',
        { method: 'POST', body: JSON.stringify({ assignments: organizingProposals }) },
      );
      setToast(isRTL ? `تم تطبيق ${r.applied} كيان` : `Applied to ${r.applied} entities`);
      setTimeout(() => setToast(null), 2500);
      setShowOrganizer(false);
      setOrganizingProposals([]);
      void loadRef.current?.();
      void loadCollections();
    } catch (err) {
      setToast(`Apply failed: ${(err as Error).message}`);
      setTimeout(() => setToast(null), 3000);
    }
  }, [organizingProposals, isRTL, loadCollections]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [schemaRes, dataRes] = await Promise.all([
        apiFetch<MatrixSchema>(`/api/library/matrix/schema/${type}`),
        apiFetch<{ entities: LibraryEntity[]; total: number }>(`/api/library/matrix/${type}?limit=500`),
      ]);
      setSchema(schemaRes);
      setEntities(dataRes.entities);
    } catch (err) {
      setToast(`Load failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => { loadRef.current = load; void load(); }, [load]);

  const visibleColumns = useMemo(
    () => (schema?.columns ?? []).filter(c => c.visible).sort((a, b) => a.order - b.order),
    [schema]
  );

  const filteredEntities = useMemo(() => {
    let list = entities;
    if (activeCollectionId) {
      list = list.filter((e) => (e.collectionIds ?? []).includes(activeCollectionId));
    }
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(e =>
      e.title.toLowerCase().includes(q)
      || (e.authors ?? '').toLowerCase().includes(q)
      || e.tags.some(t => t.toLowerCase().includes(q))
    );
  }, [entities, search, activeCollectionId]);

  const toggleColumn = useCallback(async (key: string) => {
    if (!schema) return;
    const updated: MatrixSchema = {
      ...schema,
      columns: schema.columns.map(c => c.key === key ? { ...c, visible: !c.visible } : c),
    };
    setSchema(updated);
    try {
      await apiFetch(`/api/library/matrix/schema/${type}`, {
        method: 'PATCH',
        body: JSON.stringify({ columns: updated.columns }),
      });
    } catch { setSchema(schema); /* revert */ }
  }, [schema, type]);

  const resetSchema = useCallback(async () => {
    if (!confirm(isRTL ? 'استعادة الأعمدة الافتراضية؟' : 'Reset to default columns?')) return;
    try {
      const fresh = await apiFetch<MatrixSchema>(`/api/library/matrix/schema/${type}/reset`, { method: 'POST' });
      setSchema(fresh);
      setToast(isRTL ? 'تم استعادة الأعمدة' : 'Columns reset');
      setTimeout(() => setToast(null), 2000);
    } catch { /* ignore */ }
  }, [type, isRTL]);

  const exportCsv = useCallback((visibleOnly: boolean) => {
    const url = `${API_BASE_URL || ''}/api/library/matrix/${type}/export.csv?visibleOnly=${visibleOnly}`;
    window.open(url, '_blank');
  }, [type]);

  const importFromVault = useCallback(async () => {
    const folder = prompt(
      isRTL ? 'مسار المجلد في الـ vault:' : 'Vault folder path:',
      PHD_VAULT_LITREV
    );
    if (!folder) return;
    if (!confirm(isRTL ? `استيراد كل ملفات .md من هذا المجلد كـ ${TYPE_LABELS[type]?.ar || type}؟` : `Import all .md files from this folder as ${TYPE_LABELS[type]?.en || type}?`)) return;
    setImporting(true);
    try {
      const res = await apiFetch<{ stats: { total: number; new: number; updated: number; skipped: number } }>(
        '/api/library/matrix/import-vault',
        { method: 'POST', body: JSON.stringify({ folderPath: folder, type, dryRun: false }) }
      );
      setToast(
        isRTL
          ? `تم: ${res.stats.new} جديد، ${res.stats.updated} مُحدَّث، ${res.stats.skipped} متخطى`
          : `Done: ${res.stats.new} new, ${res.stats.updated} updated, ${res.stats.skipped} skipped`
      );
      void load();
      setTimeout(() => setToast(null), 4000);
    } catch (err) {
      setToast(`Import failed: ${(err as Error).message}`);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setImporting(false);
    }
  }, [type, isRTL, load]);

  const cellValue = (e: LibraryEntity, col: MatrixColumn): string => {
    if (col.source === 'top-level') {
      return renderCellValue((e as unknown as Record<string, unknown>)[col.key]);
    }
    return renderCellValue(e.customFields?.[col.key]);
  };

  // Inline edit: start, save (PATCH), cancel.
  const startEdit = (id: string, col: MatrixColumn) => {
    const ent = entities.find((e) => e.id === id);
    if (!ent) return;
    setEditing({ id, key: col.key });
    setDraft(cellValue(ent, col));
  };
  const cancelEdit = () => { setEditing(null); setDraft(''); };
  const commitEdit = useCallback(async () => {
    if (!editing) return;
    const ent = entities.find((e) => e.id === editing.id);
    const col = schema?.columns.find((c) => c.key === editing.key);
    if (!ent || !col) { cancelEdit(); return; }
    const before = cellValue(ent, col);
    if (before === draft) { cancelEdit(); return; }
    // Coerce types
    let parsed: unknown = draft;
    const trimmed = draft.trim();
    if (col.kind === 'number') {
      if (trimmed === '') {
        parsed = null;
      } else {
        const n = Number(trimmed);
        parsed = Number.isFinite(n) ? n : null;
      }
    } else if (col.kind === 'tags' || col.kind === 'list') {
      parsed = draft.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (col.kind === 'boolean') {
      const v = trimmed.toLowerCase();
      parsed = v === 'true' || v === '1' || v === 'yes' || v === 'y';
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (col.source === 'top-level') {
        body[col.key] = parsed;
      } else {
        body.customFields = { ...(ent.customFields ?? {}), [col.key]: parsed };
      }
      const updated = await apiFetch<LibraryEntity>(`/api/library/entities/${ent.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setEntities((es) => es.map((e) => e.id === ent.id ? { ...e, ...updated } : e));
      cancelEdit();
    } catch (err) {
      setToast(`Save failed: ${(err as Error).message}`);
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(false);
    }
  }, [editing, entities, schema, draft]);

  const deleteEntity = useCallback(async (id: string) => {
    const ent = entities.find((e) => e.id === id);
    if (!ent) return;
    if (!confirm(isRTL ? `حذف "${ent.title}"؟` : `Delete "${ent.title}"?`)) return;
    setBusyEntity(id);
    try {
      await apiFetch(`/api/library/entities/${id}`, { method: 'DELETE' });
      setEntities((es) => es.filter((e) => e.id !== id));
      setToast(isRTL ? 'تم الحذف' : 'Deleted');
      setTimeout(() => setToast(null), 1800);
    } catch (err) {
      setToast(`Delete failed: ${(err as Error).message}`);
      setTimeout(() => setToast(null), 3000);
    } finally {
      setBusyEntity(null);
    }
  }, [entities, isRTL]);

  const viewOriginal = useCallback(async (id: string) => {
    setBusyEntity(id);
    try {
      const r = await apiFetch<{ url: string | null }>(`/api/library/entities/${id}/external-url`);
      if (!r.url) {
        setToast(isRTL ? 'لا يوجد رابط أصلي لهذا العنصر' : 'No original link for this item');
        setTimeout(() => setToast(null), 2500);
        return;
      }
      window.open(r.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setToast(`Failed: ${(err as Error).message}`);
      setTimeout(() => setToast(null), 3000);
    } finally { setBusyEntity(null); }
  }, [isRTL]);

  const runSuggestColumns = useCallback(async () => {
    setShowSuggestColumns(true);
    setSuggestingColumns(true);
    setColumnSuggestions([]);
    setAcceptedSuggestions(new Set());
    try {
      const r = await apiFetch<{ proposals: ColumnSuggestion[]; message?: string }>(
        `/api/library/matrix/${type}/suggest-columns`,
        { method: 'POST', body: JSON.stringify({ userInstructions: suggestColumnInstructions.trim() || undefined }) },
      );
      setColumnSuggestions(r.proposals ?? []);
      if (!r.proposals?.length && r.message) {
        setToast(r.message);
        setTimeout(() => setToast(null), 4000);
      }
    } catch (err) {
      setToast(`Suggest failed: ${(err as Error).message}`);
      setTimeout(() => setToast(null), 3000);
    } finally { setSuggestingColumns(false); }
  }, [type, suggestColumnInstructions]);

  const applyAcceptedColumns = useCallback(async () => {
    const toAdd = columnSuggestions.filter((s) => acceptedSuggestions.has(s.key));
    if (toAdd.length === 0) {
      setToast(isRTL ? 'لم تقبل أي اقتراح' : 'No suggestions accepted');
      return;
    }
    try {
      const r = await apiFetch<{ added: number; schema: MatrixSchema }>(
        `/api/library/matrix/${type}/add-columns`,
        { method: 'POST', body: JSON.stringify({ columns: toAdd }) },
      );
      setSchema(r.schema);
      setShowSuggestColumns(false);
      setColumnSuggestions([]);
      setAcceptedSuggestions(new Set());
      setToast(isRTL ? `أُضيفت ${r.added} أعمدة` : `Added ${r.added} columns`);
      setTimeout(() => setToast(null), 2500);
    } catch (err) {
      setToast(`Apply failed: ${(err as Error).message}`);
      setTimeout(() => setToast(null), 3000);
    }
  }, [columnSuggestions, acceptedSuggestions, type, isRTL]);

  const openAgentForEntity = useCallback(async (id: string) => {
    setAgentEntityId(id);
    setAgentProposals([]);
    setAgentError(null);
    setAgentInstructions('');
    setProposalEdits({});
    setProposalApproval({});
    setAgentColumnSelection(new Set());
  }, []);

  const runAgent = useCallback(async () => {
    if (!agentEntityId) return;
    setAgentLoading(true);
    setAgentError(null);
    try {
      const r = await apiFetch<{ proposals: AgentProposal[] }>(
        `/api/library/matrix/${type}/${agentEntityId}/agent-fill`,
        {
          method: 'POST',
          body: JSON.stringify({
            columnKeys: agentColumnSelection.size > 0 ? Array.from(agentColumnSelection) : undefined,
            userInstructions: agentInstructions.trim() || undefined,
          }),
        },
      );
      setAgentProposals(r.proposals ?? []);
      // Default: pre-approve high-confidence proposals; leave others unchecked
      const approval: Record<string, boolean> = {};
      const edits: Record<string, unknown> = {};
      for (const p of r.proposals ?? []) {
        approval[p.columnKey] = p.confidence === 'high' && p.proposed !== null && p.proposed !== undefined;
        edits[p.columnKey] = p.proposed;
      }
      setProposalApproval(approval);
      setProposalEdits(edits);
    } catch (err) {
      setAgentError((err as Error).message || 'Agent call failed');
    } finally {
      setAgentLoading(false);
    }
  }, [agentEntityId, agentColumnSelection, agentInstructions, type]);

  const applyAgentProposals = useCallback(async () => {
    if (!agentEntityId) return;
    const toApply = agentProposals
      .filter((p) => proposalApproval[p.columnKey])
      .map((p) => ({
        columnKey: p.columnKey,
        value: proposalEdits[p.columnKey],
        source: p.source,
      }));
    if (toApply.length === 0) {
      setAgentError(isRTL ? 'لم تختر أي اقتراح للتطبيق' : 'No proposals selected');
      return;
    }
    setAgentApplying(true);
    setAgentError(null);
    try {
      const r = await apiFetch<{ entity: LibraryEntity }>(
        `/api/library/matrix/${type}/${agentEntityId}/apply-proposals`,
        { method: 'POST', body: JSON.stringify({ proposals: toApply }) },
      );
      setEntities((es) => es.map((e) => e.id === agentEntityId ? { ...e, ...r.entity } : e));
      setToast(isRTL ? `تم تطبيق ${toApply.length} اقتراح` : `Applied ${toApply.length} proposal(s)`);
      setTimeout(() => setToast(null), 2200);
      setAgentEntityId(null);
    } catch (err) {
      setAgentError((err as Error).message || 'Apply failed');
    } finally {
      setAgentApplying(false);
    }
  }, [agentEntityId, agentProposals, proposalApproval, proposalEdits, type, isRTL]);

  const readInMulakhkhis = useCallback(async (id: string) => {
    setBusyEntity(id);
    try {
      const r = await apiFetch<{ sessionId?: string; needsZoteroStart?: boolean; zoteroKey?: string; needsManualStart?: boolean }>(
        `/api/library/entities/${id}/open-reading`,
        { method: 'POST' },
      );
      if (r.sessionId) {
        router.push(`/al-mulakhkhis/read?session=${r.sessionId}`);
        return;
      }
      if (r.needsZoteroStart && r.zoteroKey) {
        // Start a fresh zotero-backed session, then jump to it.
        const session = await apiFetch<{ id: string }>('/api/shwasha/sources/zotero', {
          method: 'POST',
          body: JSON.stringify({ zoteroKey: r.zoteroKey, libraryEntityId: id }),
        });
        router.push(`/al-mulakhkhis/read?session=${session.id}`);
        return;
      }
      // Fallback: drop user at Al-Mulakhkhis source picker
      router.push('/al-mulakhkhis');
    } catch (err) {
      // apiFetch throws an Error with the server's `error` string as message.
      // Backend returns 409 with "No reading session yet..." when the entity has
      // no zoteroKey — drop the user at the source picker instead of toasting an
      // error.
      const msg = (err as Error).message || '';
      if (/no reading session yet/i.test(msg)) {
        router.push('/al-mulakhkhis');
        return;
      }
      setToast(`Failed: ${msg}`);
      setTimeout(() => setToast(null), 3000);
    } finally { setBusyEntity(null); }
  }, [router]);

  // Recursive renderer for the collections tree
  const renderCollectionNode = (node: LibraryCollection & { children: (LibraryCollection & { children: unknown[] })[] }, depth: number): React.ReactNode => {
    const isActive = activeCollectionId === node.id;
    const isEditingThis = editingCollectionId === node.id;
    const isDropTarget = dragHoverCollectionId === node.id;
    return (
      <div key={node.id}>
        <div
          onDragOver={(ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'link'; setDragHoverCollectionId(node.id); }}
          onDragLeave={() => setDragHoverCollectionId((cur) => cur === node.id ? null : cur)}
          onDrop={(ev) => {
            ev.preventDefault();
            setDragHoverCollectionId(null);
            const entityId = draggedEntityRef.current ?? ev.dataTransfer.getData('text/x-entity-id');
            draggedEntityRef.current = null;
            if (!entityId) return;
            const ent = entities.find((e) => e.id === entityId);
            if (!ent) return;
            const next = new Set(ent.collectionIds ?? []);
            if (next.has(node.id)) return; // already in this collection — no-op
            next.add(node.id);
            void setEntityCollections(entityId, Array.from(next));
          }}
          className={cn(
            'group flex items-center gap-1 text-xs py-1 px-1.5 rounded cursor-pointer',
            isActive ? 'bg-accent text-on-accent' : 'hover:bg-surface-secondary text-on-surface',
            isDropTarget && !isActive && 'ring-2 ring-purple-400 bg-purple-500/10',
          )}
          style={{ paddingInlineStart: 6 + depth * 12 }}
        >
          <Folder size={11} className="shrink-0 opacity-60" />
          {isEditingThis ? (
            <input
              autoFocus
              value={collectionDraft}
              onChange={(ev) => setCollectionDraft(ev.target.value)}
              onBlur={() => void renameCollection(node.id, collectionDraft)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); void renameCollection(node.id, collectionDraft); }
                if (ev.key === 'Escape') { ev.preventDefault(); setEditingCollectionId(null); }
              }}
              className="flex-1 bg-input border border-border rounded px-1 text-xs"
            />
          ) : (
            <span
              onClick={() => setActiveCollectionId(isActive ? null : node.id)}
              onDoubleClick={() => { setEditingCollectionId(node.id); setCollectionDraft(node.name); }}
              className="flex-1 truncate"
              title={isRTL ? 'انقر للتصفية · انقر مرتين للتعديل' : 'Click to filter · Double-click to rename'}
            >
              {node.name}
            </span>
          )}
          {typeof node.entityCount === 'number' && node.entityCount > 0 && !isEditingThis && (
            <span className={cn('text-[9px] px-1 rounded', isActive ? 'bg-white/20' : 'bg-surface-tertiary text-on-surface-tertiary')}>
              {node.entityCount}
            </span>
          )}
          {!isEditingThis && (
            <button
              onClick={(ev) => { ev.stopPropagation(); void deleteCollection(node.id); }}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-500/10 rounded text-red-500"
              title={isRTL ? 'حذف' : 'Delete'}
            >
              <X size={10} />
            </button>
          )}
        </div>
        {node.children.length > 0 && (
          <div>
            {(node.children as Array<LibraryCollection & { children: (LibraryCollection & { children: unknown[] })[] }>).map((child) =>
              renderCollectionNode(child, depth + 1),
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Collections sidebar */}
      {collectionsOpen && (
        <aside className="w-56 shrink-0 border-e border-border bg-surface flex flex-col">
          <div className="flex items-center justify-between px-2 py-2 border-b border-border">
            <div className="flex items-center gap-1.5">
              <FolderTree size={12} className="text-on-surface-secondary" />
              <span className="text-xs font-semibold">{isRTL ? 'الكولكشنز' : 'Collections'}</span>
            </div>
            <button onClick={() => setCollectionsOpen(false)} className="p-0.5 rounded hover:bg-surface-secondary" title={isRTL ? 'إخفاء' : 'Hide'}>
              <X size={11} />
            </button>
          </div>
          <div className="flex flex-col gap-1 p-2 border-b border-border">
            <button
              onClick={createCollection}
              className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded bg-surface-secondary hover:bg-surface-tertiary"
            >
              <FolderPlus size={11} />
              {isRTL ? 'كولكشن جديد' : 'New collection'}
            </button>
            <button
              onClick={importZoteroCollections}
              disabled={importingZotero}
              className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded bg-surface-secondary hover:bg-surface-tertiary disabled:opacity-50"
            >
              {importingZotero ? <Loader2 size={11} className="animate-spin" /> : <FolderOpen size={11} />}
              {isRTL ? 'من زوتيرو' : 'From Zotero'}
            </button>
            <button
              onClick={runOrganizer}
              disabled={organizing}
              className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 disabled:opacity-50"
            >
              {organizing ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              {isRTL ? 'تنظيم ذكي' : 'Auto-organize'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            <div
              onClick={() => setActiveCollectionId(null)}
              onDragOver={(ev) => {
                if (!activeCollectionId) return;
                ev.preventDefault();
                ev.dataTransfer.dropEffect = 'move';
                setDragHoverCollectionId('__all__');
              }}
              onDragLeave={() => setDragHoverCollectionId((cur) => cur === '__all__' ? null : cur)}
              onDrop={(ev) => {
                ev.preventDefault();
                setDragHoverCollectionId(null);
                if (!activeCollectionId) return;
                const entityId = draggedEntityRef.current ?? ev.dataTransfer.getData('text/x-entity-id');
                draggedEntityRef.current = null;
                if (!entityId) return;
                const ent = entities.find((e) => e.id === entityId);
                if (!ent) return;
                const next = (ent.collectionIds ?? []).filter((cid) => cid !== activeCollectionId);
                void setEntityCollections(entityId, next);
              }}
              className={cn(
                'flex items-center gap-1 text-xs py-1 px-2 rounded mx-1 cursor-pointer',
                activeCollectionId === null ? 'bg-accent text-on-accent' : 'hover:bg-surface-secondary',
                dragHoverCollectionId === '__all__' && 'ring-2 ring-amber-400 bg-amber-500/10',
              )}
              title={activeCollectionId ? (isRTL ? 'اسحب هنا لإزالة من الكولكشن الحالي' : 'Drop here to remove from current collection') : undefined}
            >
              <FolderOpen size={11} className="opacity-60" />
              <span className="flex-1">{isRTL ? 'الكل' : 'All'}</span>
              <span className={cn('text-[9px]', activeCollectionId === null ? 'opacity-80' : 'text-on-surface-tertiary')}>{entities.length}</span>
            </div>
            <div className="mx-1 mt-1">
              {collectionTree.length === 0 ? (
                <p className="text-[10px] text-on-surface-tertiary px-2 py-2 italic">
                  {isRTL ? 'لا توجد كولكشنز بعد' : 'No collections yet'}
                </p>
              ) : (
                collectionTree.map((root) => renderCollectionNode(root as LibraryCollection & { children: (LibraryCollection & { children: unknown[] })[] }, 0))
              )}
            </div>
          </div>
        </aside>
      )}

    <div className="flex flex-col h-full flex-1 min-w-0" >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-surface">
        {!collectionsOpen && (
          <button onClick={() => setCollectionsOpen(true)} className="p-1.5 rounded hover:bg-surface-secondary" title={isRTL ? 'الكولكشنز' : 'Collections'}>
            <FolderTree size={13} />
          </button>
        )}
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-on-surface">
            {isRTL ? 'مصفوفة المراجع' : 'Library Matrix'}
          </h2>
          <select
            value={type}
            onChange={e => setType(e.target.value as EntityType)}
            className="text-xs rounded-lg border border-border bg-surface-secondary px-2 py-1"
          >
            {Object.keys(TYPE_LABELS).map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t][language]}</option>
            ))}
          </select>
          <span className="text-[10px] text-on-surface-tertiary">
            {filteredEntities.length} / {entities.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <div className="relative">
            <Search size={12} className={cn('absolute top-1/2 -translate-y-1/2 text-on-surface-tertiary', isRTL ? 'right-2' : 'left-2')} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={isRTL ? 'بحث…' : 'Search…'}
              className={cn('text-xs rounded-lg border border-border bg-surface-secondary py-1 w-40', isRTL ? 'pr-7 pl-2' : 'pl-7 pr-2')}
            />
          </div>

          <button
            onClick={() => setShowColumnPicker(v => !v)}
            className="text-xs px-2 py-1 rounded-lg border border-border hover:bg-surface-secondary flex items-center gap-1"
            title={isRTL ? 'إظهار/إخفاء الأعمدة' : 'Show/hide columns'}
          >
            <Filter size={12} />
            {isRTL ? 'الأعمدة' : 'Columns'}
            <ChevronDown size={10} />
          </button>

          <button
            onClick={resetSchema}
            className="text-xs px-2 py-1 rounded-lg border border-border hover:bg-surface-secondary flex items-center gap-1"
            title={isRTL ? 'استعادة الأعمدة الافتراضية' : 'Reset columns'}
          >
            <RotateCcw size={12} />
          </button>

          <button
            onClick={runSuggestColumns}
            disabled={suggestingColumns}
            className="text-xs px-2 py-1 rounded-lg bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 flex items-center gap-1 disabled:opacity-50"
            title={isRTL ? 'الوكيل يقترح أعمدة جديدة' : 'Agent suggests new columns'}
          >
            {suggestingColumns ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {isRTL ? 'اقترح أعمدة' : 'Suggest cols'}
          </button>

          <button
            onClick={() => setChatEntityId(null)}
            className="text-xs px-2 py-1 rounded-lg bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 flex items-center gap-1"
            title={isRTL ? 'محادثة عامة مع وكيل المصفوفة' : 'Open the global matrix-agent chat'}
            aria-label={isRTL ? 'محادثة عامة' : 'Global chat'}
          >
            <MessageSquare size={12} />
            {isRTL ? 'محادثة' : 'Chat'}
          </button>

          <button
            onClick={importFromVault}
            disabled={importing}
            className="text-xs px-2 py-1 rounded-lg bg-accent text-on-accent hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
          >
            <Upload size={12} />
            {importing ? (isRTL ? 'جاري…' : 'Importing…') : (isRTL ? 'استيراد' : 'Import')}
          </button>

          <div className="relative group">
            <button className="text-xs px-2 py-1 rounded-lg border border-border hover:bg-surface-secondary flex items-center gap-1">
              <Download size={12} />
              {isRTL ? 'تصدير' : 'Export'}
              <ChevronDown size={10} />
            </button>
            <div className={cn(
              'absolute top-full mt-1 hidden group-hover:block bg-surface border border-border rounded-lg shadow-lg z-10 w-48',
              isRTL ? 'left-0' : 'right-0'
            )}>
              <button
                onClick={() => exportCsv(true)}
                className="w-full text-xs text-start px-3 py-2 hover:bg-surface-secondary"
              >
                {isRTL ? 'CSV — الأعمدة الظاهرة' : 'CSV — visible columns'}
              </button>
              <button
                onClick={() => exportCsv(false)}
                className="w-full text-xs text-start px-3 py-2 hover:bg-surface-secondary"
              >
                {isRTL ? 'CSV — كل الأعمدة' : 'CSV — all columns'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Column picker dropdown */}
      {showColumnPicker && schema && (
        <div className="bg-surface-secondary border-b border-border px-4 py-2">
          <div className="flex flex-wrap gap-2">
            {schema.columns.sort((a, b) => a.order - b.order).map(col => (
              <button
                key={col.key}
                onClick={() => toggleColumn(col.key)}
                className={cn(
                  'text-xs px-2 py-1 rounded-full border flex items-center gap-1',
                  col.visible
                    ? 'bg-accent text-on-accent border-accent'
                    : 'border-border text-on-surface-tertiary hover:border-border-hover'
                )}
              >
                {col.visible ? <Eye size={10} /> : <EyeOff size={10} />}
                {col[isRTL ? 'labelAr' : 'labelEn']}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="bg-blue-500/10 border-b border-blue-500/30 px-4 py-2 text-xs text-blue-700 dark:text-blue-300">
          {toast}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading && <p className="text-xs text-on-surface-tertiary text-center py-8">Loading…</p>}
        {!loading && filteredEntities.length === 0 && (
          <p className="text-xs text-on-surface-tertiary text-center py-8">
            {isRTL ? 'لا مراجع — استورد من Obsidian أو أضف يدوياً' : 'No entries — import from Obsidian or add manually'}
          </p>
        )}
        {!loading && filteredEntities.length > 0 && (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-surface border-b border-border z-10">
              <tr>
                {visibleColumns.map(col => (
                  <th
                    key={col.key}
                    style={{ minWidth: col.width ?? 120 }}
                    className="text-start px-2 py-2 text-on-surface-secondary font-semibold border-e border-border whitespace-nowrap"
                  >
                    {col[isRTL ? 'labelAr' : 'labelEn']}
                  </th>
                ))}
                <th className="text-start px-2 py-2 text-on-surface-secondary font-semibold whitespace-nowrap" style={{ minWidth: 110 }}>
                  {isRTL ? 'إجراءات' : 'Actions'}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredEntities.map((e, i) => (
                <tr
                  key={e.id}
                  draggable
                  onDragStart={(ev) => {
                    draggedEntityRef.current = e.id;
                    ev.dataTransfer.effectAllowed = 'link';
                    ev.dataTransfer.setData('text/x-entity-id', e.id);
                  }}
                  onDragEnd={() => { draggedEntityRef.current = null; setDragHoverCollectionId(null); }}
                  className={cn(
                    'border-b border-border hover:bg-surface-secondary transition-colors cursor-grab active:cursor-grabbing',
                    i % 2 === 0 ? 'bg-surface' : 'bg-surface/50'
                  )}
                >
                  {visibleColumns.map(col => {
                    const val = cellValue(e, col);
                    const isEditing = editing?.id === e.id && editing.key === col.key;
                    const editable = col.kind !== 'date' && col.key !== 'id';
                    return (
                      <td
                        key={col.key}
                        style={{ minWidth: col.width ?? 120, maxWidth: (col.width ?? 120) + 100 }}
                        className={cn(
                          'px-2 py-2 align-top text-on-surface border-e border-border',
                          editable && !isEditing && 'cursor-text hover:bg-accent/5',
                        )}
                        onDoubleClick={() => editable && !isEditing && startEdit(e.id, col)}
                      >
                        {isEditing ? (
                          col.kind === 'text' ? (
                            <textarea
                              autoFocus
                              value={draft}
                              onChange={(ev) => setDraft(ev.target.value)}
                              onBlur={() => void commitEdit()}
                              onKeyDown={(ev) => {
                                if (ev.key === 'Escape') { ev.preventDefault(); cancelEdit(); }
                                if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); void commitEdit(); }
                              }}
                              className="w-full text-xs bg-input border border-accent rounded px-1 py-0.5 min-h-[60px]"
                              disabled={saving}
                            />
                          ) : col.kind === 'select' ? (
                            <select
                              autoFocus
                              value={draft}
                              onChange={(ev) => setDraft(ev.target.value)}
                              onBlur={() => void commitEdit()}
                              className="w-full text-xs bg-input border border-accent rounded px-1 py-0.5"
                              disabled={saving}
                            >
                              <option value="">—</option>
                              {(col.options ?? []).map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              autoFocus
                              type={col.kind === 'number' ? 'number' : col.kind === 'url' ? 'url' : 'text'}
                              value={draft}
                              onChange={(ev) => setDraft(ev.target.value)}
                              onBlur={() => void commitEdit()}
                              onKeyDown={(ev) => {
                                if (ev.key === 'Escape') { ev.preventDefault(); cancelEdit(); }
                                if (ev.key === 'Enter') { ev.preventDefault(); void commitEdit(); }
                              }}
                              className="w-full text-xs bg-input border border-accent rounded px-1 py-0.5"
                              disabled={saving}
                            />
                          )
                        ) : col.kind === 'url' && val ? (
                          <a href={val} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline truncate block">
                            {val.slice(0, 40)}
                          </a>
                        ) : col.kind === 'tags' || col.kind === 'list' ? (
                          <div className="flex flex-wrap gap-1">
                            {val.split(',').filter(Boolean).slice(0, 5).map((t, j) => (
                              <span key={j} className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-tertiary text-on-surface-tertiary">
                                {t.trim()}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="line-clamp-3 leading-relaxed">{val || <span className="text-on-surface-tertiary italic">—</span>}</div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 align-top whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setChatEntityId(e.id)}
                        title={isRTL ? 'محادثة مع الوكيل' : 'Chat with agent'}
                        className="p-1.5 rounded hover:bg-purple-500/10 text-purple-500 disabled:opacity-50"
                        aria-label={isRTL ? 'محادثة مع الوكيل' : 'Chat with agent'}
                      >
                        <Sparkles size={12} />
                      </button>
                      <button
                        onClick={() => openAgentForEntity(e.id)}
                        disabled={busyEntity === e.id}
                        title={isRTL ? 'تعبئة سريعة بدون محادثة' : 'Quick fill (one-shot, no chat)'}
                        className="p-1.5 rounded hover:bg-purple-500/10 text-purple-500 disabled:opacity-50"
                        aria-label={isRTL ? 'تعبئة سريعة' : 'Quick fill'}
                      >
                        <Zap size={12} />
                      </button>
                      <button
                        onClick={() => readInMulakhkhis(e.id)}
                        disabled={busyEntity === e.id}
                        title={isRTL ? 'افتح في الملخص' : 'Read in Al-Mulakhkhis'}
                        className="p-1.5 rounded hover:bg-accent/10 text-accent disabled:opacity-50"
                      >
                        <BookOpen size={12} />
                      </button>
                      <button
                        onClick={() => viewOriginal(e.id)}
                        disabled={busyEntity === e.id}
                        title={isRTL ? 'الملف الأصلي' : 'View original'}
                        className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-secondary disabled:opacity-50"
                      >
                        <ExternalLink size={12} />
                      </button>
                      <button
                        onClick={() => setCollectionPopoverEntity(e.id)}
                        title={isRTL ? 'الكولكشنز' : 'Collections'}
                        className="p-1.5 rounded hover:bg-surface-tertiary text-on-surface-secondary relative"
                      >
                        <Folder size={12} />
                        {(e.collectionIds?.length ?? 0) > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 text-[8px] bg-accent text-on-accent rounded-full w-3 h-3 flex items-center justify-center">
                            {e.collectionIds!.length}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => deleteEntity(e.id)}
                        disabled={busyEntity === e.id}
                        title={isRTL ? 'حذف' : 'Delete'}
                        className="p-1.5 rounded hover:bg-red-500/10 text-red-500 disabled:opacity-50"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!loading && filteredEntities.length > 0 && (
          <p className="text-[10px] text-on-surface-tertiary px-4 py-2 border-t border-border">
            {isRTL ? 'انقر مرتين على أي خانة للتعديل · Esc يلغي · Enter يحفظ' : 'Double-click any cell to edit · Esc cancels · Enter saves'}
          </p>
        )}
      </div>

      {/* Agent-fill dialog */}
      {agentEntityId && (() => {
        const ent = entities.find((e) => e.id === agentEntityId);
        if (!ent) return null;
        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => !agentLoading && !agentApplying && setAgentEntityId(null)}>
            <div className="bg-surface rounded-t-xl md:rounded-xl w-full md:max-w-3xl max-h-[90vh] flex flex-col border border-border" onClick={(ev) => ev.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-purple-500" />
                  <h3 className="text-sm font-semibold">{isRTL ? 'وكيل المكتبة' : 'Library Agent'}</h3>
                </div>
                <button onClick={() => setAgentEntityId(null)} disabled={agentLoading || agentApplying} className="p-1 rounded hover:bg-surface-secondary disabled:opacity-50">
                  <X size={14} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="text-xs">
                  <p className="font-medium truncate">{ent.title}</p>
                  <p className="text-on-surface-tertiary">{ent.authors}{ent.year ? ` · ${ent.year}` : ''}</p>
                </div>

                {/* Column selection — empty means "all visible" */}
                {agentProposals.length === 0 && (
                  <>
                    <div>
                      <p className="text-[11px] text-on-surface-tertiary mb-1.5 uppercase tracking-wide">
                        {isRTL ? 'اختر الأعمدة (أو اتركها فارغة لكل الأعمدة الظاهرة)' : 'Pick columns (or leave empty for all visible)'}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {visibleColumns.map((col) => {
                          const on = agentColumnSelection.has(col.key);
                          return (
                            <button
                              key={col.key}
                              onClick={() => {
                                setAgentColumnSelection((s) => {
                                  const n = new Set(s);
                                  if (n.has(col.key)) n.delete(col.key); else n.add(col.key);
                                  return n;
                                });
                              }}
                              className={cn(
                                'text-[11px] px-2 py-0.5 rounded-full border',
                                on ? 'bg-purple-500 text-white border-purple-500' : 'border-border text-on-surface-tertiary',
                              )}
                            >
                              {col[isRTL ? 'labelAr' : 'labelEn']}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-on-surface-tertiary mb-1.5 uppercase tracking-wide">
                        {isRTL ? 'تعليمات إضافية (اختياري)' : 'Additional instructions (optional)'}
                      </p>
                      <textarea
                        value={agentInstructions}
                        onChange={(ev) => setAgentInstructions(ev.target.value)}
                        rows={2}
                        placeholder={isRTL ? 'مثال: ركّز على المنهجية الكمية فقط' : 'e.g. focus only on quantitative methodology'}
                        className="w-full text-xs bg-input border border-border rounded-lg px-2 py-1.5"
                      />
                    </div>
                  </>
                )}

                {agentError && (
                  <div className="text-xs text-red-600 bg-red-500/10 px-3 py-2 rounded-lg">{agentError}</div>
                )}

                {agentProposals.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-on-surface-tertiary uppercase tracking-wide">
                      {isRTL ? `الاقتراحات (${agentProposals.length})` : `Proposals (${agentProposals.length})`}
                    </p>
                    {agentProposals.map((p) => {
                      const approved = !!proposalApproval[p.columnKey];
                      const value = proposalEdits[p.columnKey];
                      const isNullProposal = value === null || value === undefined;
                      return (
                        <div key={p.columnKey} className={cn('rounded-lg border p-2.5', approved ? 'border-purple-500 bg-purple-500/5' : 'border-border')}>
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={approved}
                              disabled={isNullProposal}
                              onChange={(ev) => setProposalApproval((s) => ({ ...s, [p.columnKey]: ev.target.checked }))}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-xs font-medium">{p[isRTL ? 'labelAr' : 'label']}</p>
                                <span className={cn(
                                  'text-[10px] px-1.5 py-0.5 rounded-full',
                                  p.confidence === 'high' ? 'bg-green-500/15 text-green-600' :
                                  p.confidence === 'medium' ? 'bg-amber-500/15 text-amber-600' :
                                  'bg-red-500/15 text-red-600',
                                )}>{p.confidence}</span>
                              </div>
                              {p.current !== undefined && p.current !== null && p.current !== '' && (
                                <div className="text-[10px] text-on-surface-tertiary">
                                  <span className="font-medium">{isRTL ? 'الحالي:' : 'Current:'} </span>
                                  <span className="line-through">{renderCellValue(p.current).slice(0, 200)}</span>
                                </div>
                              )}
                              {isNullProposal ? (
                                <div className="text-xs text-on-surface-tertiary italic">
                                  {isRTL ? 'الوكيل لم يستطع الاقتراح:' : 'Agent could not propose:'} {p.reasoning}
                                </div>
                              ) : (
                                <>
                                  {p.kind === 'text' ? (
                                    <textarea
                                      value={String(value ?? '')}
                                      onChange={(ev) => setProposalEdits((s) => ({ ...s, [p.columnKey]: ev.target.value }))}
                                      rows={3}
                                      className="w-full text-xs bg-input border border-border rounded px-1.5 py-1"
                                    />
                                  ) : p.kind === 'tags' || p.kind === 'list' ? (
                                    <input
                                      value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
                                      onChange={(ev) => setProposalEdits((s) => ({ ...s, [p.columnKey]: ev.target.value.split(',').map((x) => x.trim()).filter(Boolean) }))}
                                      className="w-full text-xs bg-input border border-border rounded px-1.5 py-1"
                                    />
                                  ) : (
                                    <input
                                      value={String(value ?? '')}
                                      onChange={(ev) => setProposalEdits((s) => ({ ...s, [p.columnKey]: ev.target.value }))}
                                      className="w-full text-xs bg-input border border-border rounded px-1.5 py-1"
                                    />
                                  )}
                                  {p.reasoning && (
                                    <p className="text-[10px] text-on-surface-tertiary">💡 {p.reasoning}</p>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-border px-4 py-3 flex items-center justify-end gap-2">
                {agentProposals.length === 0 ? (
                  <button
                    onClick={() => void runAgent()}
                    disabled={agentLoading}
                    className="px-3 py-1.5 rounded-lg bg-purple-500 text-white text-xs flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {agentLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    {agentLoading ? (isRTL ? 'يفكّر...' : 'Thinking...') : (isRTL ? 'اطلب اقتراحات' : 'Get proposals')}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => { setAgentProposals([]); setProposalApproval({}); setProposalEdits({}); }}
                      disabled={agentApplying}
                      className="px-3 py-1.5 rounded-lg border border-border text-xs disabled:opacity-50"
                    >
                      {isRTL ? 'حاول مرة أخرى' : 'Retry'}
                    </button>
                    <button
                      onClick={() => void applyAgentProposals()}
                      disabled={agentApplying || Object.values(proposalApproval).every((v) => !v)}
                      className="px-3 py-1.5 rounded-lg bg-purple-500 text-white text-xs flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {agentApplying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      {isRTL ? 'طبّق المعتمد' : 'Apply approved'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Auto-organize proposals dialog */}
      {showOrganizer && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => !organizing && setShowOrganizer(false)}>
          <div className="bg-surface rounded-t-xl md:rounded-xl w-full md:max-w-3xl max-h-[90vh] flex flex-col border border-border" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-purple-500" />
                <h3 className="text-sm font-semibold">{isRTL ? 'التنظيم الذكي' : 'Auto-organize'}</h3>
              </div>
              <button onClick={() => setShowOrganizer(false)} disabled={organizing} className="p-1 rounded hover:bg-surface-secondary disabled:opacity-50">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {organizing && (
                <div className="flex items-center gap-2 justify-center py-8 text-on-surface-tertiary text-xs">
                  <Loader2 size={14} className="animate-spin" />
                  {isRTL ? 'يحلّل ويقترح...' : 'Analyzing and proposing...'}
                </div>
              )}
              {!organizing && organizingProposals.length === 0 && (
                <p className="text-xs text-on-surface-tertiary text-center py-8">
                  {isRTL ? 'لا اقتراحات' : 'No proposals'}
                </p>
              )}
              {organizingProposals.map((a) => {
                const ent = entities.find((e) => e.id === a.entityId);
                if (!ent) return null;
                const colNames = a.addCollectionIds
                  .map((cid) => collections.find((c) => c.id === cid)?.name)
                  .filter(Boolean);
                return (
                  <div key={a.entityId} className="rounded-lg border border-border p-2.5">
                    <p className="text-xs font-medium truncate">{ent.title}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {colNames.map((n, j) => (
                        <span key={j} className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-600">
                          📁 {n}
                        </span>
                      ))}
                    </div>
                    {a.reasoning && <p className="text-[10px] text-on-surface-tertiary mt-1">💡 {a.reasoning}</p>}
                  </div>
                );
              })}
            </div>
            {organizingProposals.length > 0 && (
              <div className="border-t border-border px-4 py-3 flex items-center justify-end gap-2">
                <button onClick={() => setShowOrganizer(false)} className="px-3 py-1.5 rounded-lg border border-border text-xs">
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
                <button onClick={() => void applyOrganizer()} className="px-3 py-1.5 rounded-lg bg-purple-500 text-white text-xs flex items-center gap-1.5">
                  <Check size={12} />
                  {isRTL ? `طبّق (${organizingProposals.length})` : `Apply (${organizingProposals.length})`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Column suggestion dialog */}
      {showSuggestColumns && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => !suggestingColumns && setShowSuggestColumns(false)}>
          <div className="bg-surface rounded-t-xl md:rounded-xl w-full md:max-w-2xl max-h-[90vh] flex flex-col border border-border" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-purple-500" />
                <h3 className="text-sm font-semibold">{isRTL ? 'اقتراح أعمدة جديدة' : 'Suggest new columns'}</h3>
              </div>
              <button onClick={() => setShowSuggestColumns(false)} disabled={suggestingColumns} className="p-1 rounded hover:bg-surface-secondary disabled:opacity-50">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {columnSuggestions.length === 0 && !suggestingColumns && (
                <div>
                  <p className="text-xs text-on-surface-tertiary mb-2">
                    {isRTL ? 'الوكيل سيراجع كياناتك ويقترح أعمدة جديدة مفيدة. أضف توجيهاً اختيارياً:' : 'The agent will review your entities and suggest useful new columns. Optional steering:'}
                  </p>
                  <textarea
                    value={suggestColumnInstructions}
                    onChange={(ev) => setSuggestColumnInstructions(ev.target.value)}
                    rows={2}
                    placeholder={isRTL ? 'مثال: ركّز على الأعمدة المتعلقة بالمنهجية فقط' : 'e.g. focus on methodology-related columns only'}
                    className="w-full text-xs bg-input border border-border rounded-lg px-2 py-1.5"
                  />
                </div>
              )}
              {suggestingColumns && (
                <div className="flex items-center gap-2 justify-center py-8 text-on-surface-tertiary text-xs">
                  <Loader2 size={14} className="animate-spin" />
                  {isRTL ? 'يحلّل البيانات ويقترح...' : 'Analyzing data and proposing...'}
                </div>
              )}
              {columnSuggestions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] text-on-surface-tertiary uppercase tracking-wide">
                    {isRTL ? `الاقتراحات (${columnSuggestions.length})` : `Proposals (${columnSuggestions.length})`}
                  </p>
                  {columnSuggestions.map((s) => {
                    const accepted = acceptedSuggestions.has(s.key);
                    return (
                      <div key={s.key} className={cn('rounded-lg border p-3', accepted ? 'border-purple-500 bg-purple-500/5' : 'border-border')}>
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={accepted}
                            onChange={(ev) => setAcceptedSuggestions((set) => {
                              const next = new Set(set);
                              if (ev.target.checked) next.add(s.key); else next.delete(s.key);
                              return next;
                            })}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs font-medium">{s[isRTL ? 'labelAr' : 'labelEn']}</p>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-tertiary text-on-surface-tertiary font-mono">{s.key}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600">{s.kind}</span>
                            </div>
                            {s.options && s.options.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {s.options.map((o, i) => (
                                  <span key={i} className="text-[9px] px-1 rounded bg-surface-tertiary text-on-surface-tertiary">{o}</span>
                                ))}
                              </div>
                            )}
                            {s.reasoning && <p className="text-[10px] text-on-surface-tertiary">💡 {s.reasoning}</p>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="border-t border-border px-4 py-3 flex items-center justify-end gap-2">
              {columnSuggestions.length === 0 ? (
                <button
                  onClick={() => void runSuggestColumns()}
                  disabled={suggestingColumns}
                  className="px-3 py-1.5 rounded-lg bg-purple-500 text-white text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {suggestingColumns ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {suggestingColumns ? (isRTL ? 'يفكّر...' : 'Thinking...') : (isRTL ? 'اطلب اقتراحات' : 'Get suggestions')}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => { setColumnSuggestions([]); setAcceptedSuggestions(new Set()); }}
                    className="px-3 py-1.5 rounded-lg border border-border text-xs"
                  >
                    {isRTL ? 'حاول مرة أخرى' : 'Retry'}
                  </button>
                  <button
                    onClick={() => void applyAcceptedColumns()}
                    disabled={acceptedSuggestions.size === 0}
                    className="px-3 py-1.5 rounded-lg bg-purple-500 text-white text-xs flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Check size={12} />
                    {isRTL ? `أضف (${acceptedSuggestions.size})` : `Add (${acceptedSuggestions.size})`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Per-entity collection picker popover */}
      {collectionPopoverEntity && (() => {
        const ent = entities.find((e) => e.id === collectionPopoverEntity);
        if (!ent) return null;
        const current = new Set(ent.collectionIds ?? []);
        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setCollectionPopoverEntity(null)}>
            <div className="bg-surface rounded-xl w-full max-w-sm max-h-[70vh] flex flex-col border border-border" onClick={(ev) => ev.stopPropagation()}>
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs font-semibold">{isRTL ? 'كولكشنز للعنصر' : 'Collections for entity'}</span>
                <button onClick={() => setCollectionPopoverEntity(null)} className="p-1 rounded hover:bg-surface-secondary"><X size={11} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {collections.length === 0 && (
                  <p className="text-[11px] text-on-surface-tertiary py-3 text-center italic">
                    {isRTL ? 'لا كولكشنز — أنشئ واحداً' : 'No collections — create one'}
                  </p>
                )}
                {collections.map((cc) => {
                  const checked = current.has(cc.id);
                  return (
                    <label key={cc.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-surface-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(ev) => {
                          const next = new Set(current);
                          if (ev.target.checked) next.add(cc.id); else next.delete(cc.id);
                          void setEntityCollections(ent.id, Array.from(next));
                        }}
                      />
                      <Folder size={11} className="opacity-50" />
                      <span className="text-xs flex-1">{cc.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {chatEntityId !== undefined && (
        <LibraryAgentChat
          entityId={chatEntityId}
          entityType={type}
          entityTitle={chatEntityId ? entities.find((e) => e.id === chatEntityId)?.title : undefined}
          onClose={() => setChatEntityId(undefined)}
          onEntityChanged={() => { void load(); }}
        />
      )}
    </div>
    </div>
  );
}
