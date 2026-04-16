// Server boot IIFE — extracted from index.ts (REL-01 stage 2d final trim).
// Runs postgres probe, module loader, optional temporal worker, BullMQ research
// worker, schedule checker, watcher, and finally serve().

import { serve } from '@hono/node-server';
import path from 'node:path';
import { Worker } from 'bullmq';
import type { Hono } from 'hono';
import type { WorkflowActivities } from '../workflows/activities/workflow-activities.js';

export interface BootDeps {
  /** Phase 3: Temporal DAG activities. If undefined, durable path disabled. */
  dagActivities?: WorkflowActivities;
  /**
   * Phase 3: called once at boot after workers are up. Returns the number of
   * runs reconciled. Implementation decides policy (mark failed vs re-enqueue).
   */
  reconcileRunningRuns?: () => Promise<number>;
  logger: { info: (obj: unknown, m?: string) => void; warn: (obj: unknown, m?: string) => void; error: (obj: unknown, m?: string) => void };
  setupDatabase: () => Promise<void>;
  serviceHealth: { redis: boolean; bullmq: boolean; postgres: boolean };
  scanAndLoadModules: (root: string) => Promise<unknown>;
  initResearchQueue: () => void;
  startResearchBullMQWorker: (opts: {
    connection: { host: string; port: number };
    runResearch: (taskId: string) => Promise<void>;
    logger: { info: (m: string) => void; error: (obj: { err: unknown }, m: string) => void };
  }) => Worker | null;
  redisConnection: { host: string; port: number };
  runResearch: (taskId: string) => Promise<void>;
  startScheduleChecker: () => void;
  startWatcherWorker: (opts: { scan: () => number; onChange: () => void; logger: { info: (m: string) => void; warn: (obj: { err: unknown }, m: string) => void } }) => unknown;
  watcherScan: () => number;
  onWatcherChange: () => void;
  storeFile: string;
  providersCount: () => number;
  onServerStart: (port: number) => void;
  port: number;
  app: Hono;
}

export async function startServer(deps: BootDeps): Promise<unknown> {
  const {
    logger, setupDatabase, serviceHealth, scanAndLoadModules, initResearchQueue,
    startResearchBullMQWorker, redisConnection, runResearch, startScheduleChecker,
    startWatcherWorker, watcherScan, onWatcherChange, storeFile, providersCount,
    onServerStart, port, app,
  } = deps;

  try {
    await setupDatabase();
    serviceHealth.postgres = true;
    logger.info('PostgreSQL connected');
  } catch (err) {
    serviceHealth.postgres = false;
    logger.warn({ err: err instanceof Error ? err.message : err }, 'PostgreSQL not available (using JSON store)');
  }

  try {
    const modulesRoot = path.resolve(process.cwd(), '..', '..', 'modules');
    await scanAndLoadModules(modulesRoot);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, 'Module loader failed');
  }

  if (process.env.TEMPORAL_ADDRESS) {
    try {
      const { startResearchWorker, startDagWorkflowWorker } = await import('../workers/temporal.js');
      await startResearchWorker(process.env.TEMPORAL_ADDRESS);
      logger.info({ addr: process.env.TEMPORAL_ADDRESS }, 'Temporal worker started');
      if (deps.dagActivities) {
        try {
          await startDagWorkflowWorker(process.env.TEMPORAL_ADDRESS, deps.dagActivities);
          logger.info('Temporal DAG workflow worker started');
        } catch (err) {
          logger.warn(
            { err: err instanceof Error ? err.message : err },
            'Temporal DAG worker failed to start; durable path unavailable',
          );
        }
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : err }, 'Temporal worker failed to start; continuing');
    }
  } else {
    logger.info('Temporal disabled (set TEMPORAL_ADDRESS to enable)');
  }

  // Phase 3 boot resilience: reconcile stale running runs after restart.
  if (deps.reconcileRunningRuns) {
    try {
      const n = await deps.reconcileRunningRuns();
      if (n > 0) logger.info({ reconciled: n }, 'Phase 3: reconciled stale workflow runs');
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : err },
        'Phase 3: run reconciliation failed; continuing',
      );
    }
  }

  initResearchQueue();
  const researchWorker: Worker | null = startResearchBullMQWorker({
    connection: redisConnection,
    runResearch,
    logger,
  });

  startScheduleChecker();
  logger.info('  Schedule checker started (60s interval)');

  startWatcherWorker({ scan: watcherScan, onChange: onWatcherChange, logger });
  logger.info('  Watcher started (10min interval)');

  serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
    onServerStart(info.port);
    logger.info(
      { port: info.port, storeFile, providers: providersCount() },
      'Ruhool API running',
    );
  });

  return researchWorker;
}
