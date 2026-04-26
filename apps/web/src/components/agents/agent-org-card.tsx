'use client';

import { useEffect, useState } from 'react';
import { Network, ChevronRight, Users, Crown, Briefcase, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface OrgDepartment {
  id: string;
  label: { ar: string; en: string };
  manager: string;
  workers: string[];
}

interface OrgWorkspace {
  id: string;
  label: { ar: string; en: string };
  ceo: string;
  departments: OrgDepartment[];
}

interface OrgResolved {
  workspaces: Array<{
    id: string;
    label: { ar: string; en: string };
    ceo: { id: string; name: { ar: string; en: string } | null };
    departments: Array<{
      id: string;
      label: { ar: string; en: string };
      manager: { id: string; name: { ar: string; en: string } | null };
      workers: Array<{ id: string; name: { ar: string; en: string } | null }>;
    }>;
  }>;
}

export function AgentOrgCard() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [org, setOrg] = useState<OrgResolved | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ resolved: OrgResolved }>('/api/agent-org');
      setOrg(data.resolved);
    } catch {
      setOrg(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const getName = (agent: { id: string; name: { ar: string; en: string } | null } | null) => {
    if (!agent) return '—';
    return agent.name?.[language as 'ar' | 'en'] ?? agent.id;
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
      <RefreshCw className="h-4 w-4 animate-spin" />
      {isRTL ? 'جاري التحميل...' : 'Loading...'}
    </div>
  );

  if (!org || org.workspaces.length === 0) return (
    <div className="text-sm text-muted-foreground py-4 text-center">
      {isRTL ? 'لا يوجد هيكل تنظيمي — قم بتهيئته من إعدادات الـ Dispatch' : 'No org structure — configure it in Dispatch settings'}
    </div>
  );

  return (
    <div className={cn('space-y-3', isRTL && 'rtl')}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Network className="h-4 w-4 text-primary" />
          {isRTL ? 'هيكل الوكلاء' : 'Agent Organization'}
        </div>
        <button
          onClick={() => void load()}
          className="p-1 rounded hover:bg-muted transition-colors"
          title={isRTL ? 'تحديث' : 'Refresh'}
        >
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {org.workspaces.map((ws) => (
        <div key={ws.id} className="border border-border rounded-lg overflow-hidden">
          {/* Workspace header */}
          <button
            className="w-full flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted transition-colors text-left"
            onClick={() => setExpanded(e => ({ ...e, [ws.id]: !e[ws.id] }))}
          >
            <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium flex-1">{ws.label[language as 'ar' | 'en'] ?? ws.id}</span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Crown className="h-3 w-3" />
              {getName(ws.ceo)}
            </div>
            <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', expanded[ws.id] && 'rotate-90')} />
          </button>

          {/* Departments */}
          {expanded[ws.id] && (
            <div className="divide-y divide-border/50">
              {ws.departments.map((dept) => (
                <div key={dept.id} className="px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium text-on-surface">
                      {dept.label[language as 'ar' | 'en'] ?? dept.id}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ← {getName(dept.manager)}
                    </span>
                  </div>
                  {dept.workers.length > 0 && (
                    <div className="flex flex-wrap gap-1 ps-5">
                      {dept.workers.map((w) => (
                        <span
                          key={w.id}
                          className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground"
                        >
                          {getName(w)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {ws.departments.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {isRTL ? 'لا توجد أقسام' : 'No departments'}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
