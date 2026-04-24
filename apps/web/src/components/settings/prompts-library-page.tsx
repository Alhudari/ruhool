'use client';

import { useState, useEffect } from 'react';
import { useGuardedRouter } from '@/lib/navigation/guarded-router';
import {
  ArrowLeft,
  FileText,
  Loader2,
  ChevronDown,
  ChevronRight,
  Lock,
  Edit3,
} from 'lucide-react';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface PromptEntry {
  id: string;
  name: { en: string; ar: string };
  prompt: string;
  builtIn: boolean;
}

export function PromptsLibraryPage() {
  const { language } = useAppStore();
  const router = useGuardedRouter();
  const isRTL = language === 'ar';

  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PromptEntry[]>('/api/prompts')
      .then(setPrompts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-on-surface-tertiary" />
      </div>
    );
  }

  const builtIn = prompts.filter((p) => p.builtIn);
  const custom = prompts.filter((p) => !p.builtIn);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.push('/settings')}
          className="p-2 rounded-[var(--radius)] hover:bg-surface-secondary transition-colors text-on-surface-secondary"
        >
          <ArrowLeft size={20} />
        </button>
        <FileText size={24} className="text-on-surface-secondary" />
        <h1 className="text-xl font-semibold text-on-surface">
          {isRTL ? 'مكتبة التعليمات' : 'Prompts Library'}
        </h1>
      </div>

      {/* Built-in Prompts */}
      <div className="mb-8">
        <p className="text-xs text-on-surface-tertiary uppercase tracking-wider mb-3 px-1">
          {isRTL ? 'تعليمات النظام' : 'System Prompts'}
        </p>
        <div className="space-y-2">
          {builtIn.map((prompt) => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              language={language}
              isRTL={isRTL}
              expanded={expandedId === prompt.id}
              onToggle={() => setExpandedId(expandedId === prompt.id ? null : prompt.id)}
              onEdit={() => router.push(`/agents/${prompt.id}`)}
            />
          ))}
        </div>
      </div>

      {/* Custom Prompts */}
      {custom.length > 0 && (
        <div>
          <p className="text-xs text-on-surface-tertiary uppercase tracking-wider mb-3 px-1">
            {isRTL ? 'تعليمات مخصصة' : 'Custom Prompts'}
          </p>
          <div className="space-y-2">
            {custom.map((prompt) => (
              <PromptCard
                key={prompt.id}
                prompt={prompt}
                language={language}
                isRTL={isRTL}
                expanded={expandedId === prompt.id}
                onToggle={() => setExpandedId(expandedId === prompt.id ? null : prompt.id)}
                onEdit={() => router.push(`/agents/${prompt.id}`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PromptCard({
  prompt,
  language,
  isRTL,
  expanded,
  onToggle,
  onEdit,
}: {
  prompt: PromptEntry;
  language: 'en' | 'ar';
  isRTL: boolean;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="border border-border rounded-[var(--radius-lg)] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-secondary transition-colors text-start"
      >
        {expanded ? <ChevronDown size={16} className="text-on-surface-tertiary shrink-0" /> : <ChevronRight size={16} className="text-on-surface-tertiary shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-on-surface">
            {prompt.name[language]}
          </p>
          <p className="text-xs text-on-surface-tertiary mt-0.5">
            {prompt.prompt.slice(0, 80)}...
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {prompt.builtIn ? (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-surface-tertiary text-on-surface-tertiary">
              <Lock size={10} />
              {isRTL ? 'للقراءة فقط' : 'Read-only'}
            </span>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
            >
              <Edit3 size={10} />
              {isRTL ? 'تعديل' : 'Edit'}
            </button>
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-border">
          <pre className="mt-3 text-xs font-mono text-on-surface whitespace-pre-wrap max-h-96 overflow-auto p-3 rounded-[var(--radius)] bg-surface-secondary">
            {prompt.prompt}
          </pre>
        </div>
      )}
    </div>
  );
}
