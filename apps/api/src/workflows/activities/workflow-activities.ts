/**
 * Phase 3 — Temporal activities for dagWorkflow.
 *
 * Factory pattern + deps injection. Activities wrap the Phase 2 orchestrator's
 * `executeStep` so durable execution reuses the exact same code path as the
 * BullMQ + in-process fallbacks. Retries + timeouts are enforced by Temporal.
 */
import type { WorkflowOrchestrator, WorkflowEvent } from '../../services/workflow/orchestrator.js';
import type { StoreData } from '../../store/types.js';
import type { Channel } from '../../sse/broadcast.js';
import * as runsRepo from '../../store/repositories/workflow-runs.repo.js';
import * as stepsRepo from '../../store/repositories/workflow-steps.repo.js';

export interface WorkflowActivitiesDeps {
  getStore: () => StoreData;
  orchestrator: Pick<WorkflowOrchestrator, 'executeStep'>;
  sseBroadcast?: Channel<WorkflowEvent>;
  getRunChannel?: (runId: string) => Channel<WorkflowEvent>;
  logger?: {
    info: (obj: Record<string, unknown>, msg?: string) => void;
    warn?: (obj: Record<string, unknown>, msg?: string) => void;
    error?: (obj: Record<string, unknown>, msg?: string) => void;
  };
}

export interface ExecuteStepInput {
  runId: string;
  stepId: string;
}

export interface ExecuteStepResult {
  status: 'completed' | 'failed' | 'skipped';
  output?: string;
  artifacts?: unknown;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface WorkflowActivities {
  executeWorkflowStep(input: ExecuteStepInput): Promise<ExecuteStepResult>;
  markRunStatus(input: { runId: string; status: string; error?: string }): Promise<void>;
  broadcastRunEvent(input: {
    runId: string;
    event: string;
    data: Record<string, unknown>;
  }): Promise<void>;
}

export function createWorkflowActivities(deps: WorkflowActivitiesDeps): WorkflowActivities {
  return {
    async executeWorkflowStep({ runId, stepId }) {
      const store = deps.getStore();
      // Delegate to the Phase 2 orchestrator — already emits SSE + persists.
      await deps.orchestrator.executeStep(stepId);
      // Re-read to report status back to the workflow.
      const step = await stepsRepo.getStep(store, stepId);
      if (!step) {
        return { status: 'skipped' };
      }
      if (step.status === 'failed') {
        return { status: 'failed', output: step.error || undefined };
      }
      if (step.status === 'completed') {
        return {
          status: 'completed',
          output: step.output || undefined,
          artifacts: step.artifacts ?? undefined,
          usage: step.usage
            ? { inputTokens: step.usage.inputTokens, outputTokens: step.usage.outputTokens }
            : undefined,
        };
      }
      return { status: 'skipped' };
      void runId;
    },

    async markRunStatus({ runId, status, error }) {
      const store = deps.getStore();
      const patch: Record<string, unknown> = { status };
      if (status === 'completed' || status === 'failed' || status === 'canceled') {
        patch.completedAt = new Date().toISOString();
      }
      if (error) patch.error = error;
      await runsRepo.updateRun(store, runId, patch);
    },

    async broadcastRunEvent({ runId, event, data }) {
      const ev = { type: event, runId, ...data } as unknown as WorkflowEvent;
      try {
        deps.sseBroadcast?.publish(ev);
      } catch {
        /* ignore */
      }
      try {
        const ch = deps.getRunChannel?.(runId);
        ch?.publish(ev);
      } catch {
        /* ignore */
      }
    },
  };
}
