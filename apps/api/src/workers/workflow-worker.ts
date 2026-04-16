/**
 * Workflow BullMQ worker — Phase 2.
 *
 * Consumes `workflow-step` jobs and invokes `orchestrator.executeStep(stepId)`.
 * If Redis is unreachable, `startWorkflowWorker` logs a warning and returns
 * null — the orchestrator falls back to in-process execution transparently.
 */
import { Queue, Worker } from 'bullmq';

export interface WorkflowQueueDeps {
  connection: { host: string; port: number };
  logger: { info: (m: string) => void; warn?: (obj: Record<string, unknown>, m?: string) => void; error: (obj: Record<string, unknown>, m: string) => void };
}

export function initWorkflowQueue(deps: WorkflowQueueDeps): Queue | null {
  try {
    const q = new Queue('workflow-step', { connection: deps.connection });
    deps.logger.info('  BullMQ workflow-step queue connected to Redis');
    return q;
  } catch (err) {
    deps.logger.warn?.(
      { err: err instanceof Error ? err.message : err },
      '[workflow-worker] queue init failed — workflow execution falls back to in-process',
    );
    return null;
  }
}

export interface StartWorkflowWorkerDeps {
  connection: { host: string; port: number };
  executeStep: (stepId: string) => Promise<void>;
  logger: { info: (m: string) => void; warn?: (obj: Record<string, unknown>, m?: string) => void; error: (obj: Record<string, unknown>, m: string) => void };
}

export function startWorkflowWorker(deps: StartWorkflowWorkerDeps): Worker | null {
  try {
    const w = new Worker(
      'workflow-step',
      async (job) => {
        const { stepId } = job.data as { stepId: string };
        if (!stepId) return;
        await deps.executeStep(stepId);
      },
      { connection: deps.connection, concurrency: 2 },
    );
    w.on('failed', (job, err) => {
      deps.logger.error(
        { err: err.message, stepId: (job?.data as { stepId?: string })?.stepId },
        `[workflow-worker] job ${job?.id} failed`,
      );
    });
    deps.logger.info('  BullMQ workflow-step worker started (concurrency: 2)');
    return w;
  } catch (err) {
    deps.logger.warn?.(
      { err: err instanceof Error ? err.message : err },
      '[workflow-worker] worker init failed — workflow execution falls back to in-process',
    );
    return null;
  }
}
