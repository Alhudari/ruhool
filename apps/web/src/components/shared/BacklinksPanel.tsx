'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Link2 } from 'lucide-react';

interface Backlink {
  nodeId: string;
  nodeType: string;
  nodeTitle: string;
  context: string;
}

interface Props {
  nodeId: string;
  className?: string;
}

export function BacklinksPanel({ nodeId, className }: Props) {
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!nodeId) return;
    apiFetch<{ backlinks: Backlink[] }>(`/api/links/backlinks?nodeId=${encodeURIComponent(nodeId)}`)
      .then(r => setBacklinks(r.backlinks ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [nodeId]);

  if (loading || backlinks.length === 0) return null;

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-tertiary mb-2">
        <Link2 size={12} />
        Referenced by ({backlinks.length})
      </div>
      <div className="space-y-1">
        {backlinks.map((b, i) => (
          <div key={i} className="rounded px-2 py-1.5 bg-surface-secondary text-xs overflow-hidden">
            <span className="font-medium text-on-surface">{b.nodeTitle}</span>
            <span className="text-on-surface-tertiary mx-1">·</span>
            <span className="block text-on-surface-secondary italic overflow-hidden text-ellipsis whitespace-nowrap max-w-full">{b.context}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
