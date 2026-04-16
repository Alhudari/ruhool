'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { WorkflowEditor } from '@/components/workflows/workflow-editor';
import { apiFetch } from '@/lib/api';

interface WorkflowData {
  id: string;
  name: string | { en: string; ar: string };
  description: string;
  steps: Array<{ agentId: string; prompt: string }>;
  trigger: { type: string; cron?: string };
  enabled: boolean;
  createdAt: string;
}

export default function WorkflowEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [workflow, setWorkflow] = useState<WorkflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Fetch all workflows and find by ID (API has list but no single-get)
        const all = await apiFetch<WorkflowData[]>('/api/workflows');
        const found = all.find((w) => w.id === id);
        if (found) {
          setWorkflow(found);
        } else {
          setError('Workflow not found');
        }
      } catch {
        setError('Failed to load workflow');
      }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full">
          <Loader2 size={24} className="animate-spin text-on-surface-tertiary" />
        </div>
      </AppShell>
    );
  }

  if (error || !workflow) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-full text-on-surface-tertiary">
          <p className="text-lg mb-4">{error || 'Workflow not found'}</p>
          <button
            onClick={() => router.push('/workflows')}
            className="px-4 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors"
          >
            Back to Workflows
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <WorkflowEditor
        workflow={workflow}
        onBack={() => router.push('/workflows')}
      />
    </AppShell>
  );
}
