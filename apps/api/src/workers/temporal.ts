import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../server/logging.js';
import type { WorkflowActivities } from '../workflows/activities/workflow-activities.js';

const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE || 'ruhool-research';
const DAG_TASK_QUEUE = process.env.TEMPORAL_DAG_TASK_QUEUE || 'ruhool-workflows';

export async function startResearchWorker(address: string): Promise<void> {
  const { Worker, NativeConnection } = await import('@temporalio/worker');
  const activities = await import('./temporal-activities.js');

  const connection = await NativeConnection.connect({ address });
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const workflowsPath = path.resolve(__dirname, '../workflows/research-workflow.js');

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: TASK_QUEUE,
    workflowsPath,
    activities: {
      searchSources: activities.searchSources,
      summarizeSources: activities.summarizeSources,
      storeResearchResult: activities.storeResearchResult,
    },
  });

  // Run in background; do NOT block the boot path.
  worker.run().catch((err) => {
    logger.error({ err: err instanceof Error ? err.message : err }, 'Temporal worker crashed');
  });
}

/**
 * Phase 3: DAG workflow worker. Starts a second Temporal Worker bound to
 * `DAG_TASK_QUEUE` that registers `dagWorkflow` + provided activities.
 * Skips silently if address is falsy.
 */
export async function startDagWorkflowWorker(
  address: string,
  dagActivities: WorkflowActivities
): Promise<void> {
  if (!address) return;
  const { Worker, NativeConnection } = await import('@temporalio/worker');
  const connection = await NativeConnection.connect({ address });
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const workflowsPath = path.resolve(__dirname, '../workflows/dag-workflow.js');

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: DAG_TASK_QUEUE,
    workflowsPath,
    activities: {
      executeWorkflowStep: dagActivities.executeWorkflowStep,
      markRunStatus: dagActivities.markRunStatus,
      broadcastRunEvent: dagActivities.broadcastRunEvent,
    },
  });

  worker.run().catch((err) => {
    logger.error({ err: err instanceof Error ? err.message : err }, 'Temporal DAG worker crashed');
  });
}

export async function startResearchWorkflow(input: {
  query: string;
  requestId?: string;
}): Promise<string> {
  const { Client, Connection } = await import('@temporalio/client');
  const address = process.env.TEMPORAL_ADDRESS;
  if (!address) throw new Error('TEMPORAL_ADDRESS not set');
  const connection = await Connection.connect({ address });
  const client = new Client({ connection, namespace: process.env.TEMPORAL_NAMESPACE || 'default' });
  const workflowId = `research-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await client.workflow.start('researchWorkflow', {
    taskQueue: TASK_QUEUE,
    workflowId,
    args: [input],
  });
  return workflowId;
}

/**
 * Phase 3: durable DAG run. Returns the Temporal workflowId (`run-<runId>`).
 * Throws if TEMPORAL_ADDRESS unset — callers must fall back to BullMQ.
 */
export async function startDagWorkflow(input: {
  runId: string;
  stepIds: string[];
  throttleMs?: number;
}): Promise<string> {
  const { Client, Connection } = await import('@temporalio/client');
  const address = process.env.TEMPORAL_ADDRESS;
  if (!address) throw new Error('TEMPORAL_ADDRESS not set');
  const connection = await Connection.connect({ address });
  const client = new Client({ connection, namespace: process.env.TEMPORAL_NAMESPACE || 'default' });
  const workflowId = `run-${input.runId}`;
  await client.workflow.start('dagWorkflow', {
    taskQueue: DAG_TASK_QUEUE,
    workflowId,
    args: [input],
  });
  return workflowId;
}

export async function signalDagWorkflow(
  runId: string,
  signalName: 'cancelRun' | 'pauseRun' | 'resumeRun'
): Promise<boolean> {
  const { Client, Connection } = await import('@temporalio/client');
  const address = process.env.TEMPORAL_ADDRESS;
  if (!address) return false;
  try {
    const connection = await Connection.connect({ address });
    const client = new Client({ connection, namespace: process.env.TEMPORAL_NAMESPACE || 'default' });
    const handle = client.workflow.getHandle(`run-${runId}`);
    await handle.signal(signalName);
    return true;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err, runId, signalName },
      'Temporal signal failed'
    );
    return false;
  }
}

export async function describeDagWorkflow(
  runId: string
): Promise<{ found: boolean; status?: string; workflowId?: string }> {
  const { Client, Connection } = await import('@temporalio/client');
  const address = process.env.TEMPORAL_ADDRESS;
  if (!address) return { found: false };
  try {
    const connection = await Connection.connect({ address });
    const client = new Client({ connection, namespace: process.env.TEMPORAL_NAMESPACE || 'default' });
    const handle = client.workflow.getHandle(`run-${runId}`);
    const desc = await handle.describe();
    return {
      found: true,
      status: desc.status?.name,
      workflowId: `run-${runId}`,
    };
  } catch {
    return { found: false };
  }
}
