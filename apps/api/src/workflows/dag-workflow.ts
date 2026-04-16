/**
 * Phase 3 — Temporal DAG workflow for Ruhool multi-agent runs.
 *
 * Iterates a list of `stepIds` sequentially, invoking the
 * `executeWorkflowStep` activity for each. The activity delegates to the
 * Phase 2 orchestrator, so Temporal durability wraps the existing execution
 * engine without changing its semantics.
 *
 * Signals:
 *   - `cancelRun`  → aborts remaining steps after the current one settles.
 *   - `pauseRun`   → blocks before the next step until `resumeRun` fires.
 *   - `resumeRun`  → clears the paused flag and proceeds.
 *
 * Retry policy (applied per-activity attempt):
 *   { maximumAttempts: 3, initialInterval: '10s',
 *     backoffCoefficient: 2, maximumInterval: '5m' }
 *
 * Per-activity timeout: 1 hour by default. Per-step override supported via
 * the activity's internal lookup on `step.metadata.timeoutMs` — the workflow
 * itself uses the default ceiling.
 */
import {
  proxyActivities,
  defineSignal,
  setHandler,
  condition,
  sleep,
  CancellationScope,
  isCancellation,
} from '@temporalio/workflow';

export interface DagActivityResult {
  status: 'completed' | 'failed' | 'skipped';
  output?: string;
  artifacts?: unknown;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface DagActivities {
  executeWorkflowStep(input: {
    runId: string;
    stepId: string;
  }): Promise<DagActivityResult>;
  markRunStatus(input: {
    runId: string;
    status: string;
    error?: string;
  }): Promise<void>;
  broadcastRunEvent(input: {
    runId: string;
    event: string;
    data: Record<string, unknown>;
  }): Promise<void>;
}

const activities = proxyActivities<DagActivities>({
  startToCloseTimeout: '1 hour',
  retry: {
    maximumAttempts: 3,
    initialInterval: '10s',
    backoffCoefficient: 2,
    maximumInterval: '5m',
  },
});

export interface DagWorkflowInput {
  runId: string;
  stepIds: string[];
  throttleMs?: number;
}

export const cancelRunSignal = defineSignal('cancelRun');
export const pauseRunSignal = defineSignal('pauseRun');
export const resumeRunSignal = defineSignal('resumeRun');

export async function dagWorkflow(input: DagWorkflowInput): Promise<{
  completed: number;
  failed: number;
  canceled: boolean;
}> {
  const { runId, stepIds, throttleMs } = input;

  let canceled = false;
  let paused = false;

  setHandler(cancelRunSignal, () => {
    canceled = true;
  });
  setHandler(pauseRunSignal, () => {
    paused = true;
  });
  setHandler(resumeRunSignal, () => {
    paused = false;
  });

  let completed = 0;
  let failed = 0;

  try {
    await activities.broadcastRunEvent({
      runId,
      event: 'workflow-run-started',
      data: { runId, mode: 'temporal' },
    });
  } catch {
    /* broadcast best effort */
  }

  for (const stepId of stepIds) {
    if (canceled) break;

    // Honor pause: wait until resumed or canceled.
    if (paused) {
      await condition(() => !paused || canceled);
      if (canceled) break;
    }

    let result: DagActivityResult;
    try {
      result = await CancellationScope.nonCancellable(() =>
        activities.executeWorkflowStep({ runId, stepId })
      );
    } catch (err) {
      if (isCancellation(err)) {
        canceled = true;
        break;
      }
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      try {
        await activities.markRunStatus({ runId, status: 'failed', error: msg });
      } catch {
        /* ignore */
      }
      return { completed, failed, canceled };
    }

    if (result.status === 'completed') completed += 1;
    else if (result.status === 'failed') {
      failed += 1;
      return { completed, failed, canceled };
    }

    if (throttleMs && throttleMs > 0 && stepId !== stepIds[stepIds.length - 1]) {
      await sleep(throttleMs);
    }
  }

  if (canceled) {
    try {
      await activities.markRunStatus({ runId, status: 'canceled' });
    } catch {
      /* ignore */
    }
  } else if (failed === 0) {
    try {
      await activities.markRunStatus({ runId, status: 'completed' });
    } catch {
      /* ignore */
    }
  }

  return { completed, failed, canceled };
}
