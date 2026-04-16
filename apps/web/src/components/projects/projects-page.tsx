'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderKanban, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface Project {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  color?: string;
  pinned?: boolean;
  archived?: boolean;
}

export function ProjectsPageView() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Project[]>('/api/projects')
      .then((p) => setProjects(p || []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  const active = projects.filter((p) => !p.archived);

  return (
    <div className={cn('max-w-5xl mx-auto px-6 py-6 space-y-4', isRTL && 'rtl')} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-2">
        <FolderKanban size={20} className="text-on-surface-secondary" />
        <h1 className="text-xl font-semibold">{isRTL ? 'المشاريع' : 'Projects'}</h1>
        <Link
          href="/conversations"
          className="ms-auto inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-variant"
        >
          <Plus size={14} />
          {isRTL ? 'إدارة المشاريع' : 'Manage in Conversations'}
        </Link>
      </div>

      {loading && (
        <p className="text-sm text-on-surface-tertiary">
          {isRTL ? 'جارِ التحميل…' : 'Loading…'}
        </p>
      )}

      {!loading && active.length === 0 && (
        <p className="text-sm text-on-surface-tertiary">
          {isRTL ? 'لا توجد مشاريع بعد.' : 'No projects yet.'}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {active.map((p) => (
          <div
            key={p.id}
            className="rounded-[var(--radius)] border border-border bg-surface p-4 space-y-2"
            style={p.color ? { borderInlineStartColor: p.color, borderInlineStartWidth: 4 } : undefined}
          >
            <div className="font-medium">{p.name}</div>
            {p.description && (
              <p className="text-sm text-on-surface-secondary line-clamp-3">{p.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
