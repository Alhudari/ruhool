'use client';

import { useState, useEffect } from 'react';
import { HardDrive, Plus, RotateCcw, Loader2, Check, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface Backup {
  id: string;
  filename: string;
  createdAt: string;
  size: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(iso: string, lang: 'en' | 'ar'): string {
  const d = new Date(iso);
  return d.toLocaleDateString(lang === 'ar' ? 'ar-KW' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function BackupsSettings() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadBackups = async () => {
    try {
      const data = await apiFetch<Backup[]>('/api/backups');
      setBackups(data);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    setMessage(null);
    try {
      await apiFetch('/api/backups', { method: 'POST' });
      setMessage({
        type: 'success',
        text: isRTL ? 'تم إنشاء النسخة الاحتياطية بنجاح' : 'Backup created successfully',
      });
      loadBackups();
    } catch {
      setMessage({
        type: 'error',
        text: isRTL ? 'فشل إنشاء النسخة الاحتياطية' : 'Failed to create backup',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (id: string) => {
    setRestoring(id);
    setConfirmRestore(null);
    setMessage(null);
    try {
      await apiFetch(`/api/backups/${id}/restore`, { method: 'POST' });
      setMessage({
        type: 'success',
        text: isRTL ? 'تم استعادة النسخة الاحتياطية بنجاح' : 'Backup restored successfully',
      });
    } catch {
      setMessage({
        type: 'error',
        text: isRTL ? 'فشل استعادة النسخة الاحتياطية' : 'Failed to restore backup',
      });
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-medium text-on-surface mb-1">
            {isRTL ? 'النسخ الاحتياطية' : 'Backups'}
          </h2>
          <p className="text-sm text-on-surface-secondary">
            {isRTL
              ? 'انسخ بياناتك احتياطيا واستعدها عند الحاجة'
              : 'Back up your data and restore it when needed'}
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50 shrink-0"
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          {isRTL ? 'نسخة جديدة' : 'Create Backup'}
        </button>
      </div>

      {/* Status message */}
      {message && (
        <div
          className={cn(
            'flex items-center gap-2 px-4 py-3 rounded-[var(--radius)] text-sm',
            message.type === 'success' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
          )}
        >
          {message.type === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />}
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-on-surface-tertiary py-8 justify-center">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">{isRTL ? 'جاري التحميل...' : 'Loading...'}</span>
        </div>
      ) : backups.length === 0 ? (
        <div className="text-center py-12">
          <HardDrive size={32} className="mx-auto text-on-surface-tertiary mb-3" />
          <p className="text-sm text-on-surface-secondary">
            {isRTL ? 'لا توجد نسخ احتياطية بعد' : 'No backups yet'}
          </p>
          <p className="text-xs text-on-surface-tertiary mt-1">
            {isRTL
              ? 'أنشئ نسختك الاحتياطية الأولى لحماية بياناتك'
              : 'Create your first backup to protect your data'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {backups.map((backup) => (
            <div
              key={backup.id}
              className="flex items-center gap-3 px-4 py-3 border border-border rounded-[var(--radius-lg)]"
            >
              <HardDrive size={16} className="text-on-surface-tertiary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-on-surface truncate">{backup.filename}</p>
                <p className="text-xs text-on-surface-tertiary mt-0.5">
                  {formatDate(backup.createdAt, language)} -- {formatBytes(backup.size)}
                </p>
              </div>
              <div className="shrink-0">
                {confirmRestore === backup.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-on-surface-secondary">
                      {isRTL ? 'متأكد؟' : 'Are you sure?'}
                    </span>
                    <button
                      onClick={() => handleRestore(backup.id)}
                      className="px-3 py-1.5 rounded-[var(--radius)] text-xs bg-error/10 text-error hover:bg-error/20 transition-colors"
                    >
                      {isRTL ? 'نعم' : 'Yes'}
                    </button>
                    <button
                      onClick={() => setConfirmRestore(null)}
                      className="px-3 py-1.5 rounded-[var(--radius)] text-xs bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary transition-colors"
                    >
                      {isRTL ? 'لا' : 'No'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmRestore(backup.id)}
                    disabled={restoring === backup.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius)] text-xs bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary transition-colors disabled:opacity-50"
                  >
                    {restoring === backup.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RotateCcw size={12} />
                    )}
                    {isRTL ? 'استعادة' : 'Restore'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
