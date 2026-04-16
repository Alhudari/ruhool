'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Search, FileText, PenTool } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

interface TaskData {
  id: string;
  type: string;
  status: 'queued' | 'searching' | 'analyzing' | 'writing' | 'complete' | 'failed';
  query: string;
  depth: string;
  language: string;
  progress: number;
  result?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

interface TaskProgressCardProps {
  taskId: string;
  isRTL: boolean;
  onComplete?: (result: string) => void;
}

const STATUS_CONFIG = {
  queued: {
    icon: Loader2,
    labelEn: 'Queued',
    labelAr: 'في الانتظار',
    color: 'text-on-surface-tertiary',
    animate: true,
  },
  searching: {
    icon: Search,
    labelEn: 'Searching',
    labelAr: 'جاري البحث',
    color: 'text-blue-500',
    animate: true,
  },
  analyzing: {
    icon: FileText,
    labelEn: 'Analyzing',
    labelAr: 'جاري التحليل',
    color: 'text-purple-500',
    animate: true,
  },
  writing: {
    icon: PenTool,
    labelEn: 'Writing Report',
    labelAr: 'كتابة التقرير',
    color: 'text-amber-500',
    animate: true,
  },
  complete: {
    icon: CheckCircle2,
    labelEn: 'Complete',
    labelAr: 'مكتمل',
    color: 'text-green-500',
    animate: false,
  },
  failed: {
    icon: AlertCircle,
    labelEn: 'Failed',
    labelAr: 'فشل',
    color: 'text-red-500',
    animate: false,
  },
};

export function TaskProgressCard({ taskId, isRTL, onComplete }: TaskProgressCardProps) {
  const [task, setTask] = useState<TaskData | null>(null);
  const [polling, setPolling] = useState(true);

  const fetchTask = useCallback(async () => {
    try {
      const data = await apiFetch<TaskData>(`/api/research/tasks/${taskId}`);
      setTask(data);
      if (data.status === 'complete') {
        setPolling(false);
        if (data.result) onComplete?.(data.result);
      } else if (data.status === 'failed') {
        setPolling(false);
      }
    } catch {
      // Task not found or network error
    }
  }, [taskId, onComplete]);

  useEffect(() => {
    fetchTask();
    if (!polling) return;

    const interval = setInterval(fetchTask, 2000);
    return () => clearInterval(interval);
  }, [fetchTask, polling]);

  if (!task) return null;

  const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.queued;
  const Icon = config.icon;

  return (
    <div className="border border-accent/20 rounded-[var(--radius-lg)] bg-surface-secondary/30 overflow-hidden my-2">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Icon
            size={16}
            className={cn(config.color, config.animate && 'animate-spin')}
          />
          <span className={cn('text-sm font-medium', config.color)}>
            {isRTL ? config.labelAr : config.labelEn}
          </span>
          <span className="text-xs text-on-surface-tertiary ml-auto">
            {task.progress}%
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              task.status === 'complete' ? 'bg-green-500' :
              task.status === 'failed' ? 'bg-red-500' :
              'bg-accent'
            )}
            style={{ width: `${task.progress}%` }}
          />
        </div>

        <p className="text-xs text-on-surface-tertiary mt-2 truncate" dir={isRTL ? 'rtl' : 'ltr'}>
          {task.query}
        </p>

        {task.error && (
          <p className="text-xs text-red-400 mt-1">{task.error}</p>
        )}
      </div>
    </div>
  );
}
