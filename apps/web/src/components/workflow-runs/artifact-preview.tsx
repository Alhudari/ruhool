'use client';

import { Download, FileText } from 'lucide-react';
import type { WorkflowArtifact } from '@/hooks/use-workflow-sse';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';

function resolveUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function ArtifactPreview({ artifact, isRTL }: { artifact: WorkflowArtifact; isRTL: boolean }) {
  const url = resolveUrl(artifact.url);
  const type = (artifact.type || '').toLowerCase();
  const mime = (artifact.mimeType || '').toLowerCase();
  const isImage = type === 'image' || mime.startsWith('image/');
  const isVideo = type === 'video' || mime.startsWith('video/');
  const isAudio = type === 'audio' || mime.startsWith('audio/');

  if (!url) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-[var(--radius)] bg-surface-secondary text-xs text-on-surface-tertiary">
        <FileText size={14} />
        <span>{artifact.name || (isRTL ? 'مستند' : 'Artifact')}</span>
      </div>
    );
  }

  if (isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={artifact.name || 'artifact'}
        className="rounded-[var(--radius)] border border-border max-h-[300px] object-contain bg-surface"
      />
    );
  }

  if (isVideo) {
    return (
      <video
        src={url}
        controls
        className="rounded-[var(--radius)] border border-border max-h-[300px] bg-black"
      />
    );
  }

  if (isAudio) {
    return <audio src={url} controls className="w-full" />;
  }

  return (
    <a
      href={url}
      download={artifact.name}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 px-3 py-2 rounded-[var(--radius)] bg-surface-secondary hover:bg-surface-tertiary text-sm text-on-surface-secondary transition-colors"
    >
      <Download size={14} />
      <span>{artifact.name || (isRTL ? 'تنزيل' : 'Download')}</span>
    </a>
  );
}
