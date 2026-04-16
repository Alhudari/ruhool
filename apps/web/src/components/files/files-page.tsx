'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FolderOpen,
  FileText,
  Upload,
  Trash2,
  Loader2,
  BookOpen,
  StickyNote,
  PenLine,
  GraduationCap,
  File,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch, API_BASE_URL } from '@/lib/api';

interface FileItem {
  id: string;
  filename: string;
  category: string;
  size: number;
  createdAt: string;
}

const SECTIONS = [
  {
    id: 'research',
    icon: BookOpen,
    color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    name: { en: 'Research', ar: 'بحث' },
    desc: { en: 'Research papers and articles', ar: 'أوراق بحثية ومقالات' },
  },
  {
    id: 'notes',
    icon: StickyNote,
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    name: { en: 'Notes', ar: 'ملاحظات' },
    desc: { en: 'Personal notes and memos', ar: 'ملاحظات ومذكرات شخصية' },
  },
  {
    id: 'drafts',
    icon: PenLine,
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    name: { en: 'Drafts', ar: 'مسودات' },
    desc: { en: 'Work-in-progress documents', ar: 'مستندات قيد العمل' },
  },
  {
    id: 'papers',
    icon: GraduationCap,
    color: 'bg-green-500/10 text-green-600 dark:text-green-400',
    name: { en: 'Papers', ar: 'أوراق' },
    desc: { en: 'Published and final papers', ar: 'أوراق منشورة ونهائية' },
  },
] as const;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilesPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('research');
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    try {
      // Reuse the papers API and also try a general files endpoint
      const papers = await apiFetch<FileItem[]>('/api/papers').catch(() => []);
      // Map papers to our format
      const mapped = papers.map((p) => ({
        ...p,
        category: p.category || 'papers',
      }));
      setFiles(mapped);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async (category: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(category);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);
      const res = await fetch(`${API_BASE_URL}/api/papers`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) await load();
    } catch {
      // Upload failed silently
    } finally {
      setUploading(null);
      const ref = fileRefs.current[category];
      if (ref) ref.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(isRTL ? 'حذف هذا الملف؟' : 'Delete this file?')) return;
    try {
      await apiFetch(`/api/papers/${id}`, { method: 'DELETE' });
      await load();
    } catch {
      // Delete failed
    }
  };

  const sectionFiles = (sectionId: string) =>
    files.filter((f) => f.category === sectionId);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-8">
        <FolderOpen size={24} className="text-on-surface-secondary" />
        <h1 className="text-xl font-semibold text-on-surface">
          {isRTL ? 'الملفات' : 'Files'}
        </h1>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm whitespace-nowrap transition-colors border',
              activeSection === section.id
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-on-surface-secondary hover:bg-surface-secondary'
            )}
          >
            <section.icon size={16} />
            {section.name[language]}
          </button>
        ))}
      </div>

      {/* Active section */}
      {SECTIONS.filter((s) => s.id === activeSection).map((section) => (
        <div key={section.id}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-medium text-on-surface">
                {section.name[language]}
              </h2>
              <p className="text-sm text-on-surface-tertiary">{section.desc[language]}</p>
            </div>
            <div>
              <input
                ref={(el) => { fileRefs.current[section.id] = el; }}
                type="file"
                onChange={(e) => handleUpload(section.id, e)}
                className="hidden"
              />
              <button
                onClick={() => fileRefs.current[section.id]?.click()}
                disabled={uploading === section.id}
                className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {uploading === section.id ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Upload size={16} />
                )}
                {isRTL ? 'رفع ملف' : 'Upload File'}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-on-surface-tertiary">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : sectionFiles(section.id).length === 0 ? (
            <div className="text-center py-16 text-on-surface-tertiary border border-dashed border-border rounded-[var(--radius-lg)]">
              <File size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-sm">
                {isRTL
                  ? 'لا توجد ملفات في هذا القسم بعد.'
                  : 'No files in this section yet.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sectionFiles(section.id).map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between gap-4 p-4 border border-border rounded-[var(--radius-lg)] hover:bg-surface-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText size={20} className="text-on-surface-tertiary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">
                        {file.filename}
                      </p>
                      <div className="flex gap-3 text-xs text-on-surface-tertiary mt-0.5">
                        {file.size > 0 && <span>{formatFileSize(file.size)}</span>}
                        <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(file.id)}
                    className="p-2 text-on-surface-tertiary hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
