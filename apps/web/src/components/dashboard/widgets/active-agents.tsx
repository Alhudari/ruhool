'use client';

import { useState, useEffect } from 'react';
import { Bot, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface Agent {
  id: string;
  name: { en: string; ar: string };
  description: { en: string; ar: string };
}

export function ActiveAgentsWidget() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Agent[]>('/api/agents')
      .then(setAgents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="border border-border rounded-[var(--radius-lg)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Bot size={18} className="text-accent" />
        <h2 className="text-sm font-medium text-on-surface">
          {isRTL ? 'الوكلاء النشطون' : 'Active Agents'}
        </h2>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-on-surface-tertiary py-4 justify-center">
          <Loader2 size={14} className="animate-spin" />
        </div>
      ) : (
        <>
          <p className="text-3xl font-bold text-on-surface mb-3">{agents.length}</p>
          <div className="space-y-2">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-2 text-sm"
              >
                <div className="w-2 h-2 rounded-full bg-success shrink-0" />
                <span className="text-on-surface-secondary">{agent.name[language]}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
