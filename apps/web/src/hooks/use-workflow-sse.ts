'use client';

import { useEffect, useRef, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || '';

export type WorkflowStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'canceled';

export type WorkflowRunStatus =
  | 'pending'
  | 'planning'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface WorkflowArtifact {
  id?: string;
  type: 'image' | 'video' | 'audio' | 'file' | string;
  url?: string;
  name?: string;
  mimeType?: string;
  size?: number;
}

export interface WorkflowStep {
  id: string;
  index: number;
  specialistId: string;
  task: string;
  expectedOutput?: string;
  status: WorkflowStepStatus;
  output?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cost?: number;
  };
  artifacts?: WorkflowArtifact[];
  timeoutMs?: number;
  attemptCount?: number;
  maxAttempts?: number;
}

export interface WorkflowRun {
  id: string;
  title: string;
  userRequest?: string;
  status: WorkflowRunStatus;
  startedAt?: string;
  completedAt?: string;
  totalCost?: number;
  steps: WorkflowStep[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkflowSSEState {
  status: WorkflowRunStatus | 'unknown';
  steps: WorkflowStep[];
  lastEvent: { name: string; data: unknown } | null;
  connected: boolean;
  error: string | null;
}

/**
 * Hook to connect to the workflow runs SSE stream.
 * Uses fetch + ReadableStream (like apiStream) to allow auth headers on GET.
 */
export function useWorkflowSSE(runId: string | null | undefined): WorkflowSSEState {
  const [status, setStatus] = useState<WorkflowRunStatus | 'unknown'>('unknown');
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [lastEvent, setLastEvent] = useState<{ name: string; data: unknown } | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    abortRef.current = controller;

    const headers: Record<string, string> = {};
    if (API_TOKEN) headers.Authorization = `Bearer ${API_TOKEN}`;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/workflow-runs/${runId}/events`, {
          headers,
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          setError(`SSE connection failed (${res.status})`);
          return;
        }
        setConnected(true);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          for (const part of parts) {
            let eventName = '';
            let dataStr = '';
            for (const line of part.split('\n')) {
              if (line.startsWith('event: ')) eventName = line.slice(7).trim();
              else if (line.startsWith('data: ')) dataStr = line.slice(6);
            }
            if (!eventName || !dataStr) continue;
            let data: unknown;
            try {
              data = JSON.parse(dataStr);
            } catch {
              continue;
            }
            setLastEvent({ name: eventName, data });
            applyEvent(eventName, data, {
              setStatus,
              setSteps,
            });
          }
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setError((e as Error).message);
        }
      } finally {
        setConnected(false);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [runId]);

  return { status, steps, lastEvent, connected, error };
}

/**
 * Map an event name emitted by the orchestrator / SSE route to a canonical
 * action. Accepts both dotted (`step.start`) and dashed
 * (`workflow-step-started`) variants — the orchestrator emits the dashed
 * form, while some legacy consumers / future emitters may use the dotted
 * form. Exported for unit testing.
 */
export function canonicalizeEventName(name: string): string {
  switch (name) {
    case 'workflow-run-started':
    case 'run.start':
    case 'run.status':
    case 'status':
      return 'run.status';
    case 'run.snapshot':
    case 'snapshot':
      return 'run.snapshot';
    case 'workflow-run-completed':
    case 'workflow-run-failed':
    case 'workflow-run-paused':
    case 'workflow-run-canceled':
      return 'run.status';
    case 'workflow-step-started':
    case 'step.start':
      return 'step.start';
    case 'workflow-step-completed':
    case 'step.complete':
      return 'step.complete';
    case 'workflow-step-failed':
    case 'step.fail':
      return 'step.fail';
    case 'step.update':
    case 'step.status':
      return 'step.update';
    case 'step.output':
    case 'step.chunk':
      return 'step.chunk';
    case 'step.artifact':
    case 'artifact':
      return 'step.artifact';
    default:
      return name;
  }
}

/**
 * Derive the status implied by a run-level event name. Returns `null` if the
 * name does not encode a run status transition.
 */
function statusFromEventName(name: string): WorkflowRunStatus | null {
  switch (name) {
    case 'workflow-run-started':
      return 'running';
    case 'workflow-run-completed':
      return 'completed';
    case 'workflow-run-failed':
      return 'failed';
    case 'workflow-run-paused':
      return 'paused';
    case 'workflow-run-canceled':
      return 'canceled';
    default:
      return null;
  }
}

function applyEvent(
  name: string,
  data: unknown,
  set: {
    setStatus: (s: WorkflowRunStatus | 'unknown') => void;
    setSteps: React.Dispatch<React.SetStateAction<WorkflowStep[]>>;
  }
) {
  const d = data as Record<string, unknown>;
  const canonical = canonicalizeEventName(name);
  // Run status transitions encoded purely in the event name.
  const impliedStatus = statusFromEventName(name);
  if (impliedStatus) set.setStatus(impliedStatus);

  switch (canonical) {
    case 'run.snapshot': {
      const run = (d.run as WorkflowRun | undefined) || (d as unknown as WorkflowRun);
      if (run?.status) set.setStatus(run.status);
      if (Array.isArray(run?.steps)) set.setSteps(run.steps);
      if (Array.isArray(d.steps)) set.setSteps(d.steps as WorkflowStep[]);
      break;
    }
    case 'run.status': {
      if (typeof d.status === 'string') set.setStatus(d.status as WorkflowRunStatus);
      break;
    }
    case 'step.start':
    case 'step.complete':
    case 'step.fail':
    case 'step.update': {
      // Accept either a `{ step: {...} }` envelope or a flat event.
      const stepLike = (d.step as WorkflowStep | undefined) || (d as unknown as WorkflowStep);
      // Orchestrator emits flat events with stepId/stepIndex/specialist/output
      // — synthesize a WorkflowStep patch from those fields.
      const stepId = (stepLike?.id as string | undefined)
        ?? (d.stepId as string | undefined);
      if (!stepId) break;
      const patch: Partial<WorkflowStep> = { id: stepId };
      if (typeof d.stepIndex === 'number') patch.index = d.stepIndex as number;
      if (typeof d.specialist === 'string') patch.specialistId = d.specialist as string;
      if (typeof d.output === 'string') patch.output = d.output as string;
      if (typeof d.error === 'string') patch.error = d.error as string;
      if (canonical === 'step.start') patch.status = 'running';
      if (canonical === 'step.complete') patch.status = 'completed';
      if (canonical === 'step.fail') patch.status = 'failed';
      // Merge in anything from the envelope form.
      const merged: Partial<WorkflowStep> = { ...(stepLike || {}), ...patch };
      set.setSteps((prev) => {
        const idx = prev.findIndex((s) => s.id === stepId);
        if (idx === -1) {
          return [...prev, merged as WorkflowStep].sort(
            (a, b) => (a.index ?? 0) - (b.index ?? 0),
          );
        }
        const next = [...prev];
        next[idx] = { ...next[idx], ...merged };
        return next;
      });
      break;
    }
    case 'step.chunk': {
      const stepId = d.stepId as string | undefined;
      const chunk = (d.chunk as string) ?? (d.output as string) ?? '';
      if (!stepId) break;
      set.setSteps((prev) =>
        prev.map((s) =>
          s.id === stepId
            ? { ...s, output: (s.output || '') + chunk }
            : s
        )
      );
      break;
    }
    case 'step.artifact': {
      const stepId = d.stepId as string | undefined;
      const artifact = d.artifact as WorkflowArtifact | undefined;
      if (!stepId || !artifact) break;
      set.setSteps((prev) =>
        prev.map((s) =>
          s.id === stepId
            ? { ...s, artifacts: [...(s.artifacts || []), artifact] }
            : s
        )
      );
      break;
    }
    default:
      break;
  }
}
