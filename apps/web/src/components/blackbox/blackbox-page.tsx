'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  MessageSquare,
  Cpu,
  ListChecks,
  ShieldCheck,
  Brain,
  AlertTriangle,
  Download,
  Trash2,
  ChevronDown,
  ChevronUp,
  Bot,
  HardDrive,
  Upload,
  Archive,
  Server,
  Activity,
  UserPlus,
  UserMinus,
  Sun,
  Moon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

// ─── Types ───
interface ActivityRecord {
  id: string;
  timestamp: string;
  type: 'chat' | 'api_call' | 'task' | 'approval' | 'memory' | 'agent_created' | 'agent_deleted' | 'file_upload' | 'backup' | 'error' | 'system';
  agentId?: string;
  agentName?: string;
  action: string;
  details: string;
  metadata?: Record<string, unknown>;
}

type FilterType = 'all' | ActivityRecord['type'];

// ─── Constants ───
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FILTER_OPTIONS: { id: FilterType; label: { en: string; ar: string }; icon: React.ComponentType<any> }[] = [
  { id: 'all', label: { en: 'All', ar: 'الكل' }, icon: Activity },
  { id: 'chat', label: { en: 'Chat', ar: 'محادثة' }, icon: MessageSquare },
  { id: 'api_call', label: { en: 'API', ar: 'واجهة' }, icon: Cpu },
  { id: 'task', label: { en: 'Tasks', ar: 'مهام' }, icon: ListChecks },
  { id: 'approval', label: { en: 'Approvals', ar: 'موافقات' }, icon: ShieldCheck },
  { id: 'memory', label: { en: 'Memory', ar: 'ذاكرة' }, icon: Brain },
  { id: 'error', label: { en: 'Errors', ar: 'أخطاء' }, icon: AlertTriangle },
  { id: 'system', label: { en: 'System', ar: 'نظام' }, icon: Server },
];

const TYPE_COLORS: Record<string, string> = {
  chat: 'text-blue-400',
  api_call: 'text-purple-400',
  task: 'text-amber-400',
  approval: 'text-emerald-400',
  memory: 'text-cyan-400',
  agent_created: 'text-lime-400',
  agent_deleted: 'text-red-400',
  file_upload: 'text-orange-400',
  backup: 'text-teal-400',
  error: 'text-red-500',
  system: 'text-gray-400',
};

const TYPE_BG: Record<string, string> = {
  chat: 'bg-blue-500/10',
  api_call: 'bg-purple-500/10',
  task: 'bg-amber-500/10',
  approval: 'bg-emerald-500/10',
  memory: 'bg-cyan-500/10',
  agent_created: 'bg-lime-500/10',
  agent_deleted: 'bg-red-500/10',
  file_upload: 'bg-orange-500/10',
  backup: 'bg-teal-500/10',
  error: 'bg-red-500/10',
  system: 'bg-gray-500/10',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  chat: MessageSquare,
  api_call: Cpu,
  task: ListChecks,
  approval: ShieldCheck,
  memory: Brain,
  agent_created: UserPlus,
  agent_deleted: UserMinus,
  file_upload: Upload,
  backup: Archive,
  error: AlertTriangle,
  system: Server,
};

// ─── Relative Time ───
function relativeTime(ts: string, lang: 'en' | 'ar'): string {
  const diff = Date.now() - new Date(ts).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (lang === 'ar') {
    if (seconds < 5) return 'الآن';
    if (seconds < 60) return `قبل ${seconds} ثانية`;
    if (minutes < 60) return `قبل ${minutes} دقيقة`;
    if (hours < 24) return `قبل ${hours} ساعة`;
    return `قبل ${days} يوم`;
  }
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// ─── Activity Row ───
function ActivityRow({ record, language, terminal }: { record: ActivityRecord; language: 'en' | 'ar'; terminal: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TYPE_ICONS[record.type] || Server;

  return (
    <div
      className={cn(
        'group border-b transition-colors cursor-pointer',
        'animate-in fade-in slide-in-from-top-1 duration-300',
        terminal
          ? 'border-green-900/20 hover:bg-green-950/30'
          : 'border-border hover:bg-surface-secondary'
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-3 px-4 py-2.5">
        {/* Timestamp */}
        <span className={cn('text-[11px] font-mono w-20 shrink-0 text-center', terminal ? 'text-green-600/70' : 'text-on-surface-tertiary')}>
          {relativeTime(record.timestamp, language)}
        </span>

        {/* Type icon */}
        <span className={cn('shrink-0 p-1.5 rounded', TYPE_BG[record.type])}>
          <Icon size={14} className={TYPE_COLORS[record.type]} />
        </span>

        {/* Agent badge */}
        {record.agentName && (
          <span className={cn(
            'shrink-0 text-[10px] px-2 py-0.5 rounded-full font-mono border',
            terminal
              ? 'bg-green-900/40 text-green-300 border-green-800/40'
              : 'bg-surface-tertiary text-on-surface-secondary border-border'
          )}>
            <Bot size={10} className="inline mr-1 -mt-0.5" />
            {record.agentName}
          </span>
        )}

        {/* Action */}
        <span className={cn('text-sm truncate flex-1 font-mono', terminal ? 'text-green-200/90' : 'text-on-surface')}>
          {record.action}
        </span>

        {/* Metadata badges */}
        {record.metadata?.cost !== undefined && (
          <span className="text-[10px] font-mono text-amber-400/80 shrink-0">
            ${(record.metadata.cost as number).toFixed(4)}
          </span>
        )}
        {record.metadata?.durationMs !== undefined && (
          <span className="text-[10px] font-mono text-purple-400/60 shrink-0">
            {(record.metadata.durationMs as number)}ms
          </span>
        )}

        {/* Expand */}
        <span className={cn('shrink-0 transition-colors', terminal ? 'text-green-700 group-hover:text-green-500' : 'text-on-surface-tertiary group-hover:text-on-surface-secondary')}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-3 pl-[7.5rem]">
          <div className={cn('text-xs font-mono whitespace-pre-wrap break-all leading-relaxed', terminal ? 'text-green-500/60' : 'text-on-surface-secondary')}>
            {record.details}
          </div>
          {record.metadata && Object.keys(record.metadata).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(record.metadata).map(([key, value]) => (
                <span key={key} className={cn(
                  'text-[9px] font-mono px-1.5 py-0.5 rounded border',
                  terminal
                    ? 'bg-green-900/30 text-green-500/50 border-green-800/20'
                    : 'bg-surface-tertiary text-on-surface-tertiary border-border'
                )}>
                  {key}: {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </span>
              ))}
            </div>
          )}
          <div className={cn('mt-1.5 text-[9px] font-mono', terminal ? 'text-green-800/50' : 'text-on-surface-tertiary')}>
            {new Date(record.timestamp).toLocaleString()} | ID: {record.id.slice(0, 8)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stats Card ───
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StatCard({ label, value, icon: Icon, color, terminal = true }: { label: string; value: string | number; icon: React.ComponentType<any>; color: string; terminal?: boolean }) {
  return (
    <div className={cn(
      'shrink-0 border rounded-lg px-4 py-3 min-w-[140px]',
      terminal ? 'bg-black/40 border-green-900/30' : 'bg-surface-secondary border-border'
    )}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className={color} />
        <span className={cn('text-[10px] font-mono uppercase tracking-wider', terminal ? 'text-green-600/60' : 'text-on-surface-tertiary')}>{label}</span>
      </div>
      <div className={cn('text-xl font-mono font-bold', terminal ? 'text-green-300' : 'text-on-surface')}>{value}</div>
    </div>
  );
}

// ─── Main Component ───
export function BlackBoxPage() {
  const { language } = useAppStore();
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [terminalMode, setTerminalMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ruhool-blackbox-mode') !== 'light';
    }
    return true;
  });
  const feedRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);

  const isRTL = language === 'ar';

  const toggleMode = () => {
    const next = !terminalMode;
    setTerminalMode(next);
    localStorage.setItem('ruhool-blackbox-mode', next ? 'terminal' : 'light');
  };

  // ─── Fetch activity log ───
  const fetchActivity = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (filter !== 'all') params.set('type', filter);
      const data = await apiFetch<ActivityRecord[]>(`/api/activity?${params}`);
      setRecords(data);
    } catch {
      // API not available
    }
  }, [filter]);

  // Initial fetch + polling
  useEffect(() => {
    fetchActivity();
    const interval = setInterval(fetchActivity, 2000);
    return () => clearInterval(interval);
  }, [fetchActivity]);

  // Auto-scroll when new records arrive
  useEffect(() => {
    if (autoScroll && records.length > prevLengthRef.current && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
    prevLengthRef.current = records.length;
  }, [records.length, autoScroll]);

  // Handle scroll to detect manual scrolling
  const handleScroll = useCallback(() => {
    if (!feedRef.current) return;
    const { scrollTop } = feedRef.current;
    setAutoScroll(scrollTop < 50);
  }, []);

  // ─── Stats ───
  const allRecords = records; // already filtered by type if needed
  const chatCount = records.filter(r => filter === 'all' ? r.type === 'chat' : true).length;
  const apiCount = records.filter(r => r.type === 'api_call').length;
  const errorCount = records.filter(r => r.type === 'error').length;
  const taskCount = records.filter(r => r.type === 'task').length;
  const totalCost = records
    .filter(r => r.type === 'api_call' && r.metadata?.cost)
    .reduce((sum, r) => sum + ((r.metadata?.cost as number) || 0), 0);
  const uniqueAgents = [...new Set(records.filter(r => r.agentName).map(r => r.agentName!))];
  const pendingApprovals = records.filter(r => r.type === 'approval' && r.action.includes('requested')).length;

  // Agent activity counts for bar chart
  const agentCounts: Record<string, number> = {};
  for (const r of records) {
    if (r.agentName) {
      agentCounts[r.agentName] = (agentCounts[r.agentName] || 0) + 1;
    }
  }
  const maxAgentCount = Math.max(...Object.values(agentCounts), 1);

  // ─── Export ───
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blackbox-log-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Clear ───
  const handleClear = async () => {
    try {
      await apiFetch('/api/activity', { method: 'DELETE' });
      setRecords([]);
      setShowClearConfirm(false);
    } catch { /* ignore */ }
  };

  return (
    <div className={cn(
      'h-full flex flex-col overflow-hidden',
      terminalMode ? 'bg-[#0a0f0a] text-green-300 blackbox-terminal' : 'bg-surface text-on-surface'
    )}>
      {/* Scanline overlay (terminal only) */}
      {terminalMode && (
        <div className="pointer-events-none fixed inset-0 z-50 opacity-[0.03] bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,255,0,0.1)_2px,rgba(0,255,0,0.1)_4px)]" />
      )}

      {/* Header */}
      <div className={cn(
        'shrink-0 border-b backdrop-blur-sm',
        terminalMode ? 'border-green-900/30 bg-black/60' : 'border-border bg-surface'
      )}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Box size={22} className={terminalMode ? 'text-green-400' : 'text-accent'} />
            <div>
              <h1 className={cn('text-lg font-mono font-bold', terminalMode ? 'text-green-200' : 'text-on-surface')}>
                {isRTL ? 'الصندوق الأسود' : 'Black Box'}
              </h1>
              <p className={cn('text-[10px] font-mono', terminalMode ? 'text-green-700' : 'text-on-surface-tertiary')}>
                {isRTL ? 'مراقب النشاط في الوقت الحقيقي' : 'Real-time Activity Monitor'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Mode toggle */}
            <button
              onClick={toggleMode}
              className={cn(
                'p-2 rounded-[var(--radius)] transition-colors',
                terminalMode
                  ? 'text-green-600 hover:text-green-400 hover:bg-green-900/30'
                  : 'text-on-surface-secondary hover:text-on-surface hover:bg-surface-secondary'
              )}
              title={terminalMode ? (isRTL ? 'الوضع الفاتح' : 'Light mode') : (isRTL ? 'وضع الطرفية' : 'Terminal mode')}
            >
              {terminalMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Live indicator */}
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
              </span>
              <span className={cn('text-xs font-mono', terminalMode ? 'text-green-400' : 'text-green-600')}>
                {isRTL ? 'مباشر' : 'Live'}
              </span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1.5 px-4 pb-3 overflow-x-auto no-scrollbar">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setFilter(opt.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono transition-all shrink-0 border',
                terminalMode
                  ? filter === opt.id
                    ? 'bg-green-900/40 text-green-300 border-green-700/50'
                    : 'bg-transparent text-green-700 border-green-900/20 hover:text-green-500 hover:border-green-800/40'
                  : filter === opt.id
                    ? 'bg-accent/10 text-accent border-accent/30'
                    : 'bg-transparent text-on-surface-secondary border-border hover:text-on-surface hover:border-border-hover'
              )}
            >
              <opt.icon size={12} />
              {opt.label[language]}
            </button>
          ))}
        </div>
      </div>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Feed */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile stats strip */}
          <div className={cn(
            'lg:hidden shrink-0 flex gap-2 px-4 py-2 overflow-x-auto no-scrollbar border-b',
            terminalMode ? 'border-green-900/20 bg-black/30' : 'border-border bg-surface-secondary'
          )}>
            <StatCard label={isRTL ? 'وكلاء' : 'Agents'} value={uniqueAgents.length} icon={Bot} color="text-green-400" terminal={terminalMode} />
            <StatCard label={isRTL ? 'رسائل' : 'Messages'} value={chatCount} icon={MessageSquare} color="text-blue-400" terminal={terminalMode} />
            <StatCard label={isRTL ? 'واجهات' : 'API'} value={apiCount} icon={Cpu} color="text-purple-400" terminal={terminalMode} />
            <StatCard label={isRTL ? 'تكلفة' : 'Cost'} value={`$${totalCost.toFixed(3)}`} icon={HardDrive} color="text-amber-400" terminal={terminalMode} />
            <StatCard label={isRTL ? 'أخطاء' : 'Errors'} value={errorCount} icon={AlertTriangle} color="text-red-400" terminal={terminalMode} />
          </div>

          {/* Activity feed */}
          <div
            ref={feedRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto"
          >
            {records.length === 0 ? (
              <div className={cn('flex flex-col items-center justify-center h-full font-mono', terminalMode ? 'text-green-800' : 'text-on-surface-tertiary')}>
                <Box size={48} className="mb-4 opacity-30" />
                <p className="text-sm">{isRTL ? 'لا يوجد نشاط بعد' : 'No activity yet'}</p>
                <p className="text-xs mt-1 opacity-50">{isRTL ? 'سيظهر النشاط هنا في الوقت الحقيقي' : 'Activity will appear here in real-time'}</p>
              </div>
            ) : (
              records.map((record) => (
                <ActivityRow key={record.id} record={record} language={language} terminal={terminalMode} />
              ))
            )}
          </div>

          {/* Auto-scroll indicator */}
          {!autoScroll && records.length > 0 && (
            <button
              onClick={() => {
                setAutoScroll(true);
                if (feedRef.current) feedRef.current.scrollTop = 0;
              }}
              className={cn(
                'absolute bottom-16 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full text-xs font-mono transition-colors backdrop-blur-sm border',
                terminalMode
                  ? 'bg-green-900/60 border-green-700/40 text-green-300 hover:bg-green-800/60'
                  : 'bg-surface-secondary border-border text-on-surface-secondary hover:bg-surface-tertiary'
              )}
            >
              {isRTL ? 'العودة للأحدث' : 'Scroll to latest'}
            </button>
          )}

          {/* Footer */}
          <div className={cn(
            'shrink-0 flex items-center justify-between px-4 py-2 border-t',
            terminalMode ? 'border-green-900/30 bg-black/40' : 'border-border bg-surface-secondary'
          )}>
            <span className={cn('text-[10px] font-mono', terminalMode ? 'text-green-800' : 'text-on-surface-tertiary')}>
              {allRecords.length} {isRTL ? 'سجل' : 'records'}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExport}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono transition-colors border',
                  terminalMode
                    ? 'text-green-600 hover:text-green-400 hover:bg-green-900/30 border-green-900/20'
                    : 'text-on-surface-secondary hover:text-on-surface hover:bg-surface-tertiary border-border'
                )}
              >
                <Download size={11} />
                {isRTL ? 'تصدير' : 'Export'}
              </button>
              {showClearConfirm ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleClear}
                    className="px-2.5 py-1 rounded text-[10px] font-mono bg-red-900/40 text-red-400 hover:bg-red-900/60 border border-red-800/40 transition-colors"
                  >
                    {isRTL ? 'تأكيد' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className={cn(
                      'px-2.5 py-1 rounded text-[10px] font-mono transition-colors',
                      terminalMode ? 'text-green-700 hover:text-green-500' : 'text-on-surface-secondary hover:text-on-surface'
                    )}
                  >
                    {isRTL ? 'إلغاء' : 'Cancel'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono transition-colors border',
                    terminalMode
                      ? 'text-green-700 hover:text-red-400 hover:bg-red-900/20 border-green-900/20'
                      : 'text-on-surface-secondary hover:text-red-500 hover:bg-red-500/10 border-border'
                  )}
                >
                  <Trash2 size={11} />
                  {isRTL ? 'مسح' : 'Clear'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar (desktop) */}
        <div className={cn(
          'hidden lg:flex flex-col w-72 border-l overflow-y-auto',
          terminalMode ? 'border-green-900/30 bg-black/30' : 'border-border bg-surface-secondary'
        )}>
          {/* Stats */}
          <div className="p-4 space-y-3">
            <h3 className={cn('text-[10px] font-mono uppercase tracking-wider mb-3', terminalMode ? 'text-green-700' : 'text-on-surface-tertiary')}>
              {isRTL ? 'إحصائيات مباشرة' : 'Live Stats'}
            </h3>

            <div className="space-y-2">
              {[
                { label: isRTL ? 'الوكلاء النشطون' : 'Active Agents', value: uniqueAgents.length, icon: Bot, iconColor: 'text-green-400', valColor: terminalMode ? 'text-green-300' : 'text-on-surface' },
                { label: isRTL ? 'الرسائل' : 'Messages', value: chatCount, icon: MessageSquare, iconColor: 'text-blue-400', valColor: terminalMode ? 'text-green-300' : 'text-on-surface' },
                { label: isRTL ? 'استدعاءات API' : 'API Calls', value: apiCount, icon: Cpu, iconColor: 'text-purple-400', valColor: terminalMode ? 'text-green-300' : 'text-on-surface' },
                { label: isRTL ? 'التكلفة' : 'Cost', value: `$${totalCost.toFixed(4)}`, icon: HardDrive, iconColor: 'text-amber-400', valColor: 'text-amber-400' },
                { label: isRTL ? 'المهام' : 'Tasks', value: taskCount, icon: ListChecks, iconColor: 'text-amber-400', valColor: terminalMode ? 'text-green-300' : 'text-on-surface' },
                { label: isRTL ? 'موافقات معلقة' : 'Pending Approvals', value: pendingApprovals, icon: ShieldCheck, iconColor: 'text-emerald-400', valColor: terminalMode ? 'text-green-300' : 'text-on-surface' },
                { label: isRTL ? 'أخطاء' : 'Errors', value: errorCount, icon: AlertTriangle, iconColor: 'text-red-400', valColor: 'text-red-400' },
              ].map((item) => (
                <div key={item.label} className={cn(
                  'flex items-center justify-between py-1.5 px-2 rounded border',
                  terminalMode ? 'bg-black/30 border-green-900/20' : 'bg-surface border-border'
                )}>
                  <span className={cn('flex items-center gap-2 text-xs font-mono', terminalMode ? 'text-green-600' : 'text-on-surface-secondary')}>
                    <item.icon size={12} className={item.iconColor} />
                    {item.label}
                  </span>
                  <span className={cn('text-sm font-mono font-bold', item.valColor)}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Agent names */}
          {uniqueAgents.length > 0 && (
            <div className="px-4 pb-2">
              <p className={cn('text-[9px] font-mono mb-1.5', terminalMode ? 'text-green-800' : 'text-on-surface-tertiary')}>{isRTL ? 'الوكلاء:' : 'Agents:'}</p>
              <div className="flex flex-wrap gap-1">
                {uniqueAgents.map((name) => (
                  <span key={name} className={cn(
                    'text-[9px] font-mono px-2 py-0.5 rounded-full border',
                    terminalMode
                      ? 'bg-green-900/30 text-green-500 border-green-800/30'
                      : 'bg-surface-tertiary text-on-surface-secondary border-border'
                  )}>
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Agent activity chart */}
          {Object.keys(agentCounts).length > 0 && (
            <div className={cn('p-4 border-t', terminalMode ? 'border-green-900/20' : 'border-border')}>
              <h3 className={cn('text-[10px] font-mono uppercase tracking-wider mb-3', terminalMode ? 'text-green-700' : 'text-on-surface-tertiary')}>
                {isRTL ? 'نشاط الوكلاء' : 'Agent Activity'}
              </h3>
              <div className="space-y-2">
                {Object.entries(agentCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, count]) => (
                    <div key={name} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className={cn('text-[10px] font-mono', terminalMode ? 'text-green-500' : 'text-on-surface-secondary')}>{name}</span>
                        <span className={cn('text-[9px] font-mono', terminalMode ? 'text-green-700' : 'text-on-surface-tertiary')}>{count}</span>
                      </div>
                      <div className={cn('h-1.5 rounded-full overflow-hidden', terminalMode ? 'bg-green-950' : 'bg-surface-tertiary')}>
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            terminalMode ? 'bg-gradient-to-r from-green-600 to-green-400' : 'bg-accent'
                          )}
                          style={{ width: `${(count / maxAgentCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Inline styles for terminal aesthetic */}
      <style jsx global>{`
        .blackbox-terminal {
          font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', 'Consolas', monospace;
          background: radial-gradient(ellipse at center, #0a1a0a 0%, #050a05 100%);
        }
        .blackbox-terminal * {
          scrollbar-width: thin;
          scrollbar-color: rgba(34, 197, 94, 0.2) transparent;
        }
        .blackbox-terminal ::-webkit-scrollbar {
          width: 4px;
        }
        .blackbox-terminal ::-webkit-scrollbar-track {
          background: transparent;
        }
        .blackbox-terminal ::-webkit-scrollbar-thumb {
          background: rgba(34, 197, 94, 0.2);
          border-radius: 4px;
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slide-in-from-top-1 { from { transform: translateY(-4px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-in { animation: fade-in 0.3s ease-out, slide-in-from-top-1 0.3s ease-out; }
      `}</style>
    </div>
  );
}
