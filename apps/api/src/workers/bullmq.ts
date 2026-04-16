// BullMQ research queue + worker init — extracted from index.ts (REL-01 stage 2d).
import { Queue, Worker } from 'bullmq';

export interface ServiceHealth {
  redis: boolean;
  bullmq: boolean;
  postgres: boolean;
}

export const serviceHealth: ServiceHealth = {
  redis: false,
  bullmq: false,
  postgres: false,
};

export interface BullMQConnection {
  host: string;
  port: number;
}

export interface InitResearchQueueDeps {
  connection: BullMQConnection;
  logger: { info: (m: string) => void; error: (obj: { err: unknown }, m: string) => void };
}

export interface ResearchQueueHandle {
  queue: Queue | null;
  worker: Worker | null;
}

export function initResearchQueue(deps: InitResearchQueueDeps): Queue | null {
  try {
    const q = new Queue('research', { connection: deps.connection });
    serviceHealth.redis = true;
    serviceHealth.bullmq = true;
    deps.logger.info('  BullMQ research queue connected to Redis');
    return q;
  } catch (err) {
    serviceHealth.redis = false;
    serviceHealth.bullmq = false;
    deps.logger.error({ err: err instanceof Error ? err.message : err }, '[bullmq] ERROR: queue init failed — research jobs will not be processed');
    return null;
  }
}

export interface StartResearchWorkerDeps {
  connection: BullMQConnection;
  runResearch: (taskId: string) => Promise<void>;
  logger: { info: (m: string) => void; error: (obj: { err: unknown }, m: string) => void };
}

export function startResearchWorker(deps: StartResearchWorkerDeps): Worker | null {
  try {
    const worker = new Worker('research', async (job) => {
      const { taskId } = job.data as { taskId: string };
      await deps.runResearch(taskId);
    }, { connection: deps.connection, concurrency: 1 });
    worker.on('failed', (job, err) => {
      deps.logger.error({ err: err.message }, `[bullmq] Research job ${job?.id} failed`);
    });
    deps.logger.info('  BullMQ research worker started (concurrency: 1)');
    return worker;
  } catch (err) {
    serviceHealth.bullmq = false;
    deps.logger.error({ err: err instanceof Error ? err.message : err }, '[bullmq] ERROR: worker init failed — queued research jobs will NOT run');
    return null;
  }
}
