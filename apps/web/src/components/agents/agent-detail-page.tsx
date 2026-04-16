'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bot,
  Compass,
  Search,
  BookOpen,
  PenTool,
  Loader2,
  Save,
  Trash2,
  Brain,
  Eye,
  Plus,
  Download,
  Upload,
  RotateCcw,
  X,
  History,
  Clock,
  Shield,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface Agent {
  id: string;
  moduleId: string;
  name: { en: string; ar: string };
  description: { en: string; ar: string };
  icon: string;
  color: string;
  builtIn: boolean;
  model?: string;
}

interface CustomAgent {
  id: string;
  name: { en: string; ar: string };
  systemPrompt: string;
  icon: string;
  color: string;
  skills: string[];
  tools: string[];
  model: string;
  featured?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Memory {
  id: string;
  agentId: string;
  tier: 'working' | 'short-term' | 'long-term';
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface PromptData {
  id: string;
  name: { en: string; ar: string };
  prompt: string;
  builtIn: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  compass: Compass,
  search: Search,
  'book-open': BookOpen,
  'pen-tool': PenTool,
  crown: Shield,
  bot: Bot,
};

const COLOR_MAP: Record<string, string> = {
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  green: 'bg-green-500/10 text-green-600 dark:text-green-400',
  gray: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  red: 'bg-red-500/10 text-red-600 dark:text-red-400',
  pink: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  cyan: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  gold: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
};

const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
];

export function AgentDetailPage({ agentId }: { agentId: string }) {
  const { language } = useAppStore();
  const router = useRouter();
  const isRTL = language === 'ar';

  const [agent, setAgent] = useState<Agent | null>(null);
  const [customAgent, setCustomAgent] = useState<CustomAgent | null>(null);
  const [promptData, setPromptData] = useState<PromptData | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'transparency' | 'memories' | 'permissions'>('transparency');
  const [transparencyTab, setTransparencyTab] = useState<'prompt' | 'model'>('prompt');

  // Editable states for custom agents
  const [editPrompt, setEditPrompt] = useState('');
  const [editModel, setEditModel] = useState('');
  const [saving, setSaving] = useState(false);

  const isCustom = agentId.startsWith('custom-');
  const customId = isCustom ? agentId.replace('custom-', '') : null;

  // Prompt version history
  const [showPromptHistory, setShowPromptHistory] = useState(false);
  const [promptVersions, setPromptVersions] = useState<{ content: string; timestamp: string }[]>([]);

  // Load prompt versions from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && isCustom) {
      const stored = localStorage.getItem(`ruhool-prompt-versions-${agentId}`);
      if (stored) {
        try {
          setPromptVersions(JSON.parse(stored));
        } catch {}
      }
    }
  }, [agentId, isCustom]);

  // Permissions
  const [permissions, setPermissions] = useState<Record<string, boolean>>({
    canReadFiles: false,
    canWriteFiles: false,
    canSearch: false,
    canAccessInternet: false,
    canModifyAgents: false,
    canAccessPrivate: false,
  });
  const [savingPermissions, setSavingPermissions] = useState(false);

  // Memory creation
  const [newMemoryTier, setNewMemoryTier] = useState<'working' | 'short-term' | 'long-term'>('working');
  const [newMemoryContent, setNewMemoryContent] = useState('');
  const [showNewMemory, setShowNewMemory] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load all agents to find this one
      const agents = await apiFetch<Agent[]>('/api/agents');
      const found = agents.find((a) => a.id === agentId);
      if (found) setAgent(found);

      // Load custom agent detail if applicable
      if (isCustom && customId) {
        const customs = await apiFetch<CustomAgent[]>('/api/custom-agents');
        const ca = customs.find((a) => a.id === customId);
        if (ca) {
          setCustomAgent(ca);
          setEditPrompt(ca.systemPrompt);
          setEditModel(ca.model);
        }
      }

      // Load prompt data
      const prompts = await apiFetch<PromptData[]>('/api/prompts');
      const pd = prompts.find((p) => p.id === agentId);
      if (pd) setPromptData(pd);

      // Load memories
      const mems = await apiFetch<Memory[]>(`/api/agents/${agentId}/memories`);
      setMemories(mems);

      // Load permissions
      try {
        const perms = await apiFetch<Record<string, boolean>>(`/api/agents/${agentId}/permissions`);
        setPermissions(perms);
      } catch { /* ignore */ }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [agentId, isCustom, customId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveCustom = async () => {
    setSaving(true);
    try {
      // Save old prompt version
      const oldPrompt = customAgent?.systemPrompt || promptData?.prompt || '';
      if (oldPrompt && oldPrompt !== editPrompt) {
        const newVersion = { content: oldPrompt, timestamp: new Date().toISOString() };
        const updated = [...promptVersions, newVersion];
        setPromptVersions(updated);
        localStorage.setItem(`ruhool-prompt-versions-${agentId}`, JSON.stringify(updated));
      }

      if (customId) {
        // Custom agent
        await apiFetch(`/api/custom-agents/${customId}`, {
          method: 'PUT',
          body: JSON.stringify({ systemPrompt: editPrompt, model: editModel }),
        });
      } else {
        // Built-in agent — save prompt override
        await apiFetch(`/api/agents/${agentId}/prompt`, {
          method: 'PUT',
          body: JSON.stringify({ prompt: editPrompt }),
        });
      }
      loadData();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const restorePromptVersion = (content: string) => {
    setEditPrompt(content);
    setShowPromptHistory(false);
  };

  const handleDelete = async () => {
    if (!customId) return;
    if (!confirm(isRTL ? 'هل أنت متأكد من حذف هذا الوكيل؟' : 'Are you sure you want to delete this agent?')) return;
    try {
      await apiFetch(`/api/custom-agents/${customId}`, { method: 'DELETE' });
      router.push('/agents');
    } catch {
      // ignore
    }
  };

  const handleAddMemory = async () => {
    if (!newMemoryContent.trim()) return;
    try {
      await apiFetch(`/api/agents/${agentId}/memories`, {
        method: 'POST',
        body: JSON.stringify({ tier: newMemoryTier, content: newMemoryContent }),
      });
      setNewMemoryContent('');
      setShowNewMemory(false);
      loadData();
    } catch {
      // ignore
    }
  };

  const handleDeleteMemory = async (memId: string) => {
    try {
      await apiFetch(`/api/memories/${memId}`, { method: 'DELETE' });
      setMemories((prev) => prev.filter((m) => m.id !== memId));
    } catch {
      // ignore
    }
  };

  const handleResetTier = async (tier: string) => {
    if (!confirm(isRTL ? `مسح كل ذاكرة ${tier}؟` : `Reset all ${tier} memories?`)) return;
    try {
      await apiFetch(`/api/agents/${agentId}/memories?tier=${tier}`, { method: 'DELETE' });
      loadData();
    } catch {
      // ignore
    }
  };

  const handleExportMemories = async () => {
    try {
      const data = await apiFetch<{ agentId: string; memories: Memory[] }>(
        `/api/agents/${agentId}/memories/export`
      );
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `memories-${agentId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  const handleImportMemories = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const memoriesToImport = data.memories || data;
        await apiFetch(`/api/agents/${agentId}/memories/import`, {
          method: 'POST',
          body: JSON.stringify({ memories: memoriesToImport }),
        });
        loadData();
      } catch {
        // ignore
      }
    };
    input.click();
  };

  const handleUpdateMemory = async (memId: string, content: string) => {
    try {
      await apiFetch(`/api/memories/${memId}`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      });
    } catch {
      // ignore
    }
  };

  const handleSavePermissions = async () => {
    setSavingPermissions(true);
    try {
      await apiFetch(`/api/agents/${agentId}/permissions`, {
        method: 'PUT',
        body: JSON.stringify(permissions),
      });
    } catch { /* ignore */ }
    setSavingPermissions(false);
  };

  const togglePermission = (key: string) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-on-surface-tertiary" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8 text-center">
        <p className="text-on-surface-secondary">{isRTL ? 'الوكيل غير موجود' : 'Agent not found'}</p>
        <button onClick={() => router.push('/agents')} className="mt-4 text-accent text-sm">
          {isRTL ? 'العودة' : 'Go back'}
        </button>
      </div>
    );
  }

  const IconComp = ICON_MAP[agent.icon] || Bot;
  const colorClasses = COLOR_MAP[agent.color] || COLOR_MAP.gray;
  const displayModel = customAgent?.model || 'claude-sonnet-4-6';

  const workingMemories = memories.filter((m) => m.tier === 'working');
  const shortTermMemories = memories.filter((m) => m.tier === 'short-term');
  const longTermMemories = memories.filter((m) => m.tier === 'long-term');

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/agents')}
          className="p-2 rounded-[var(--radius)] hover:bg-surface-secondary transition-colors text-on-surface-secondary"
        >
          <ArrowLeft size={20} />
        </button>
        <div className={cn('p-3 rounded-[var(--radius-lg)]', colorClasses)}>
          <IconComp size={24} />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-on-surface">
            {agent.name[language]}
          </h1>
          <p className="text-sm text-on-surface-secondary">{agent.description[language]}</p>
        </div>
        {isCustom && (
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                if (!customId || !customAgent) return;
                const next = !customAgent.featured;
                try {
                  await apiFetch(`/api/custom-agents/${customId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ featured: next }),
                  });
                  setCustomAgent({ ...customAgent, featured: next });
                } catch { /* ignore */ }
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-[var(--radius)] border transition-colors',
                customAgent?.featured
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  : 'border-border text-on-surface-secondary hover:bg-surface-secondary'
              )}
              title={isRTL ? 'ترقية للرئيسية' : 'Promote to Featured'}
            >
              <Star size={14} className={customAgent?.featured ? 'fill-current' : ''} />
              {customAgent?.featured
                ? (isRTL ? 'مميز' : 'Featured')
                : (isRTL ? 'ترقية للرئيسية' : 'Promote to Featured')}
            </button>
            <button
              onClick={handleDelete}
              className="p-2 rounded-[var(--radius)] text-red-500 hover:bg-red-500/10 transition-colors"
              title={isRTL ? 'حذف' : 'Delete'}
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab('transparency')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px',
            activeTab === 'transparency'
              ? 'border-accent text-accent'
              : 'border-transparent text-on-surface-secondary hover:text-on-surface'
          )}
        >
          <Eye size={16} />
          {isRTL ? 'الشفافية' : 'Transparency'}
        </button>
        <button
          onClick={() => setActiveTab('memories')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px',
            activeTab === 'memories'
              ? 'border-accent text-accent'
              : 'border-transparent text-on-surface-secondary hover:text-on-surface'
          )}
        >
          <Brain size={16} />
          {isRTL ? 'الذاكرة' : 'Memories'}
          {memories.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-tertiary text-on-surface-tertiary">
              {memories.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('permissions')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px',
            activeTab === 'permissions'
              ? 'border-accent text-accent'
              : 'border-transparent text-on-surface-secondary hover:text-on-surface'
          )}
        >
          <Shield size={16} />
          {isRTL ? 'الصلاحيات' : 'Permissions'}
        </button>
      </div>

      {/* Transparency Panel */}
      {activeTab === 'transparency' && (
        <div>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setTransparencyTab('prompt')}
              className={cn(
                'px-3 py-1.5 text-sm rounded-[var(--radius)] transition-colors',
                transparencyTab === 'prompt'
                  ? 'bg-accent text-on-accent'
                  : 'bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary'
              )}
            >
              {isRTL ? 'التعليمات' : 'Prompt'}
            </button>
            <button
              onClick={() => setTransparencyTab('model')}
              className={cn(
                'px-3 py-1.5 text-sm rounded-[var(--radius)] transition-colors',
                transparencyTab === 'model'
                  ? 'bg-accent text-on-accent'
                  : 'bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary'
              )}
            >
              {isRTL ? 'النموذج' : 'Model'}
            </button>
          </div>

          {transparencyTab === 'prompt' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-on-surface-secondary">
                  {agent.builtIn
                    ? (isRTL ? 'تعليمات مدمجة (قابلة للتعديل)' : 'Built-in prompt (editable)')
                    : (isRTL ? 'تعليمات مخصصة (قابلة للتعديل)' : 'Custom prompt (editable)')}
                </p>
                {(
                  <div className="flex items-center gap-2">
                    {promptVersions.length > 0 && (
                      <button
                        onClick={() => setShowPromptHistory(!showPromptHistory)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-[var(--radius)] border transition-colors',
                          showPromptHistory
                            ? 'border-accent text-accent bg-accent/10'
                            : 'border-border text-on-surface-secondary hover:bg-surface-secondary'
                        )}
                      >
                        <History size={14} />
                        {isRTL ? 'السجل' : 'History'}
                        <span className="text-[10px] px-1 py-0.5 rounded-full bg-surface-tertiary text-on-surface-tertiary">
                          {promptVersions.length}
                        </span>
                      </button>
                    )}
                    <button
                      onClick={handleSaveCustom}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-[var(--radius)] bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      {isRTL ? 'حفظ' : 'Save'}
                    </button>
                  </div>
                )}
              </div>
              <textarea
                value={editPrompt || promptData?.prompt || ''}
                onChange={(e) => setEditPrompt(e.target.value)}
                rows={16}
                dir="auto"
                className="w-full px-4 py-3 rounded-[var(--radius-lg)] border border-border bg-input text-on-surface text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              />

              {/* Prompt version history panel */}
              {showPromptHistory && promptVersions.length > 0 && (
                <div className="border border-border rounded-[var(--radius-lg)] overflow-hidden">
                  <div className="px-4 py-2.5 bg-surface-secondary border-b border-border flex items-center gap-2">
                    <Clock size={14} className="text-on-surface-tertiary" />
                    <span className="text-sm font-medium text-on-surface">
                      {isRTL ? 'سجل الإصدارات' : 'Version History'}
                    </span>
                  </div>
                  <div className="max-h-64 overflow-auto divide-y divide-border">
                    {[...promptVersions].reverse().map((version, idx) => (
                      <div
                        key={idx}
                        className="px-4 py-3 hover:bg-surface-secondary/50 transition-colors cursor-pointer group"
                        onClick={() => restorePromptVersion(version.content)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-on-surface-tertiary">
                            {new Date(version.timestamp).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                            {isRTL ? 'استعادة' : 'Restore'}
                          </span>
                        </div>
                        <p className="text-xs text-on-surface-secondary line-clamp-2 font-mono">
                          {version.content.slice(0, 150)}{version.content.length > 150 ? '...' : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {transparencyTab === 'model' && (
            <div className="space-y-3">
              <p className="text-sm text-on-surface-secondary">
                {isRTL ? 'النموذج المستخدم' : 'Current model'}
              </p>
              {isCustom ? (
                <div className="space-y-3">
                  <select
                    value={editModel}
                    onChange={(e) => setEditModel(e.target.value)}
                    className="w-full px-3 py-2 rounded-[var(--radius)] border border-border bg-input text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleSaveCustom}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-[var(--radius)] bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {isRTL ? 'حفظ' : 'Save'}
                  </button>
                </div>
              ) : (
                <div className="px-4 py-3 rounded-[var(--radius-lg)] border border-border bg-surface-secondary">
                  <p className="text-sm font-medium text-on-surface">
                    {MODELS.find((m) => m.id === displayModel)?.label || displayModel}
                  </p>
                  <p className="text-xs text-on-surface-tertiary mt-1">
                    {isRTL ? 'النموذج الافتراضي من إعدادات المزود' : 'Default model from provider settings'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Permissions Panel */}
      {activeTab === 'permissions' && (
        <div className="space-y-4">
          <p className="text-sm text-on-surface-secondary">
            {isRTL ? 'تحكم في ما يستطيع هذا الوكيل فعله' : 'Control what this agent can do'}
          </p>
          <div className="space-y-3">
            {[
              { key: 'canReadFiles', label: { en: 'Read Files', ar: 'قراءة الملفات' }, desc: { en: 'Access uploaded papers and documents', ar: 'الوصول للأوراق والمستندات المرفوعة' } },
              { key: 'canWriteFiles', label: { en: 'Write Files', ar: 'كتابة الملفات' }, desc: { en: 'Create or modify files and notes', ar: 'إنشاء أو تعديل الملفات والملاحظات' } },
              { key: 'canSearch', label: { en: 'Search', ar: 'البحث' }, desc: { en: 'Perform research and web searches', ar: 'إجراء بحث عميق وبحث في الإنترنت' } },
              { key: 'canAccessInternet', label: { en: 'Internet Access', ar: 'الوصول للإنترنت' }, desc: { en: 'Access external APIs and websites', ar: 'الوصول لواجهات برمجة خارجية ومواقع' } },
              { key: 'canModifyAgents', label: { en: 'Modify Agents', ar: 'تعديل الوكلاء' }, desc: { en: 'Create, edit, or delete other agents', ar: 'إنشاء أو تعديل أو حذف وكلاء آخرين' } },
              { key: 'canAccessPrivate', label: { en: 'Access Private Data', ar: 'الوصول للبيانات الخاصة' }, desc: { en: 'Access sensitive or private information', ar: 'الوصول لمعلومات حساسة أو خاصة' } },
            ].map((perm) => (
              <div key={perm.key} className="flex items-center justify-between p-3 rounded-[var(--radius-lg)] border border-border bg-surface-secondary">
                <div>
                  <p className="text-sm font-medium text-on-surface">{perm.label[language]}</p>
                  <p className="text-xs text-on-surface-tertiary">{perm.desc[language]}</p>
                </div>
                <button
                  onClick={() => togglePermission(perm.key)}
                  className={cn(
                    'relative w-10 h-6 rounded-full transition-colors shrink-0',
                    permissions[perm.key] ? 'bg-accent' : 'bg-surface-tertiary'
                  )}
                >
                  <span className={cn(
                    'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform',
                    permissions[perm.key] ? (isRTL ? 'start-1' : 'start-5') : (isRTL ? 'start-5' : 'start-1')
                  )} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={handleSavePermissions}
            disabled={savingPermissions}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-[var(--radius)] bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {savingPermissions ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isRTL ? 'حفظ الصلاحيات' : 'Save Permissions'}
          </button>
        </div>
      )}

      {/* Memory Panel */}
      {activeTab === 'memories' && (
        <div>
          {/* Actions bar */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setShowNewMemory(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-[var(--radius)] bg-accent text-on-accent hover:bg-accent-hover transition-colors"
            >
              <Plus size={14} />
              {isRTL ? 'ذاكرة جديدة' : 'Add Memory'}
            </button>
            <button
              onClick={handleExportMemories}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-[var(--radius)] border border-border text-on-surface-secondary hover:bg-surface-secondary transition-colors"
            >
              <Download size={14} />
              {isRTL ? 'تصدير' : 'Export'}
            </button>
            <button
              onClick={handleImportMemories}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-[var(--radius)] border border-border text-on-surface-secondary hover:bg-surface-secondary transition-colors"
            >
              <Upload size={14} />
              {isRTL ? 'استيراد' : 'Import'}
            </button>
          </div>

          {/* New memory form */}
          {showNewMemory && (
            <div className="mb-4 p-4 border border-border rounded-[var(--radius-lg)] bg-surface-secondary">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-on-surface">
                  {isRTL ? 'ذاكرة جديدة' : 'New Memory'}
                </p>
                <button onClick={() => setShowNewMemory(false)} className="text-on-surface-tertiary hover:text-on-surface">
                  <X size={16} />
                </button>
              </div>
              <div className="flex gap-2 mb-3">
                {(['working', 'short-term', 'long-term'] as const).map((tier) => (
                  <button
                    key={tier}
                    onClick={() => setNewMemoryTier(tier)}
                    className={cn(
                      'px-3 py-1 text-xs rounded-full transition-colors',
                      newMemoryTier === tier
                        ? 'bg-accent text-on-accent'
                        : 'bg-surface-tertiary text-on-surface-secondary hover:bg-surface-secondary'
                    )}
                  >
                    {tier === 'working' ? (isRTL ? 'عاملة' : 'Working')
                      : tier === 'short-term' ? (isRTL ? 'قصيرة' : 'Short-term')
                      : (isRTL ? 'طويلة' : 'Long-term')}
                  </button>
                ))}
              </div>
              <textarea
                value={newMemoryContent}
                onChange={(e) => setNewMemoryContent(e.target.value)}
                placeholder={isRTL ? 'محتوى الذاكرة...' : 'Memory content...'}
                rows={3}
                className="w-full px-3 py-2 rounded-[var(--radius)] border border-border bg-input text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y mb-3"
              />
              <button
                onClick={handleAddMemory}
                disabled={!newMemoryContent.trim()}
                className="px-4 py-1.5 text-sm rounded-[var(--radius)] bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {isRTL ? 'إضافة' : 'Add'}
              </button>
            </div>
          )}

          {/* Memory columns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MemoryColumn
              title={isRTL ? 'عاملة' : 'Working'}
              tier="working"
              memories={workingMemories}
              isRTL={isRTL}
              onDelete={handleDeleteMemory}
              onUpdate={handleUpdateMemory}
              onResetTier={() => handleResetTier('working')}
            />
            <MemoryColumn
              title={isRTL ? 'قصيرة المدى' : 'Short-term'}
              tier="short-term"
              memories={shortTermMemories}
              isRTL={isRTL}
              onDelete={handleDeleteMemory}
              onUpdate={handleUpdateMemory}
              onResetTier={() => handleResetTier('short-term')}
            />
            <MemoryColumn
              title={isRTL ? 'طويلة المدى' : 'Long-term'}
              tier="long-term"
              memories={longTermMemories}
              isRTL={isRTL}
              onDelete={handleDeleteMemory}
              onUpdate={handleUpdateMemory}
              onResetTier={() => handleResetTier('long-term')}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MemoryColumn({
  title,
  tier: _tier,
  memories,
  isRTL,
  onDelete,
  onUpdate,
  onResetTier,
}: {
  title: string;
  tier: string;
  memories: Memory[];
  isRTL: boolean;
  onDelete: (id: string) => void;
  onUpdate: (id: string, content: string) => void;
  onResetTier: () => void;
}) {
  return (
    <div className="border border-border rounded-[var(--radius-lg)] p-3">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-on-surface">{title}</p>
        <div className="flex items-center gap-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-tertiary text-on-surface-tertiary">
            {memories.length}
          </span>
          {memories.length > 0 && (
            <button
              onClick={onResetTier}
              className="p-1 text-on-surface-tertiary hover:text-red-500 transition-colors"
              title={isRTL ? 'مسح الكل' : 'Reset'}
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>
      </div>
      <div className="space-y-2 max-h-80 overflow-auto">
        {memories.length === 0 ? (
          <p className="text-xs text-on-surface-tertiary text-center py-4">
            {isRTL ? 'فارغة' : 'Empty'}
          </p>
        ) : (
          memories.map((mem) => (
            <MemoryCard
              key={mem.id}
              memory={mem}
              isRTL={isRTL}
              onDelete={() => onDelete(mem.id)}
              onUpdate={(content) => onUpdate(mem.id, content)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function MemoryCard({
  memory,
  isRTL,
  onDelete,
  onUpdate,
}: {
  memory: Memory;
  isRTL: boolean;
  onDelete: () => void;
  onUpdate: (content: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(memory.content);

  return (
    <div className="p-2 rounded-[var(--radius)] border border-border bg-surface-secondary group">
      {editing ? (
        <div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className="w-full px-2 py-1 rounded text-xs bg-input border border-border text-on-surface focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          />
          <div className="flex gap-1 mt-1">
            <button
              onClick={() => { onUpdate(content); setEditing(false); }}
              className="px-2 py-0.5 text-[10px] rounded bg-accent text-on-accent"
            >
              {isRTL ? 'حفظ' : 'Save'}
            </button>
            <button
              onClick={() => { setContent(memory.content); setEditing(false); }}
              className="px-2 py-0.5 text-[10px] rounded bg-surface-tertiary text-on-surface-secondary"
            >
              {isRTL ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p
            className="text-xs text-on-surface cursor-pointer"
            onClick={() => setEditing(true)}
          >
            {memory.content}
          </p>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-on-surface-tertiary">
              {new Date(memory.createdAt).toLocaleDateString()}
            </span>
            <button
              onClick={onDelete}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-on-surface-tertiary hover:text-red-500 transition-all"
            >
              <Trash2 size={10} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
