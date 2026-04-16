'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Wrench,
  Search,
  FileText,
  FilePlus,
  Mail,
  HardDrive,
  Calendar,
  BookOpen,
  Library,
  Gem,
  Hash,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface ToolItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  installed: boolean;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  search: <Search size={24} />,
  'file-text': <FileText size={24} />,
  'file-plus': <FilePlus size={24} />,
  mail: <Mail size={24} />,
  'hard-drive': <HardDrive size={24} />,
  calendar: <Calendar size={24} />,
  'book-open': <BookOpen size={24} />,
  library: <Library size={24} />,
  gem: <Gem size={24} />,
  hash: <Hash size={24} />,
};

const CATEGORY_COLORS: Record<string, string> = {
  research: 'text-purple-400',
  productivity: 'text-blue-400',
  communication: 'text-green-400',
  storage: 'text-amber-400',
};

export function ToolsPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [tools, setTools] = useState<ToolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const fetchTools = useCallback(async () => {
    try {
      const data = await apiFetch<ToolItem[]>('/api/tools');
      setTools(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchTools(); }, [fetchTools]);

  const handleToggle = async (tool: ToolItem) => {
    setTogglingIds((prev) => new Set(prev).add(tool.id));
    try {
      const endpoint = tool.installed
        ? `/api/tools/${tool.id}/uninstall`
        : `/api/tools/${tool.id}/install`;
      const updated = await apiFetch<ToolItem>(endpoint, { method: 'POST' });
      setTools((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch {}
    setTogglingIds((prev) => {
      const next = new Set(prev);
      next.delete(tool.id);
      return next;
    });
  };

  const installedCount = tools.filter((t) => t.installed).length;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Wrench size={24} className="text-on-surface-secondary" />
          <div>
            <h1 className="text-xl font-semibold text-on-surface">
              {isRTL ? 'الأدوات والتكاملات' : 'Tools & Integrations'}
            </h1>
            <p className="text-sm text-on-surface-tertiary mt-0.5">
              {isRTL
                ? `${installedCount} من ${tools.length} مثبت`
                : `${installedCount} of ${tools.length} installed`}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-on-surface-tertiary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((tool) => (
            <div
              key={tool.id}
              className={cn(
                'relative border rounded-[var(--radius-lg)] bg-surface p-5 transition-all',
                tool.installed
                  ? 'border-accent/30'
                  : 'border-border hover:border-border/80'
              )}
            >
              {tool.installed && (
                <div className="absolute top-3 end-3">
                  <CheckCircle2 size={18} className="text-green-400" />
                </div>
              )}

              <div className={cn(
                'w-10 h-10 rounded-[var(--radius)] flex items-center justify-center mb-3',
                tool.installed ? 'bg-accent/10 text-accent' : 'bg-surface-secondary text-on-surface-secondary'
              )}>
                {ICON_MAP[tool.icon] || <Wrench size={24} />}
              </div>

              <h3 className="font-medium text-on-surface mb-1">{typeof tool.name === 'object' ? tool.name[language] : tool.name}</h3>
              <p className="text-sm text-on-surface-tertiary mb-3 line-clamp-2">
                {typeof tool.description === 'object' ? tool.description[language] : tool.description}
              </p>

              <div className="flex items-center justify-between">
                <span className={cn(
                  'text-xs capitalize',
                  CATEGORY_COLORS[tool.category] || 'text-on-surface-tertiary'
                )}>
                  {tool.category}
                </span>

                <button
                  onClick={() => handleToggle(tool)}
                  disabled={togglingIds.has(tool.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-[var(--radius)] text-xs font-medium transition-colors',
                    tool.installed
                      ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                      : 'bg-accent text-on-accent hover:bg-accent-hover',
                    togglingIds.has(tool.id) && 'opacity-50'
                  )}
                >
                  {togglingIds.has(tool.id) ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : tool.installed ? (
                    isRTL ? 'إزالة' : 'Uninstall'
                  ) : (
                    isRTL ? 'تثبيت' : 'Install'
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
