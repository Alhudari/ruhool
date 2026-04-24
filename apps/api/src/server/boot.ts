// Server boot IIFE — extracted from index.ts (REL-01 stage 2d final trim).
// Runs postgres probe, module loader, optional temporal worker, BullMQ research
// worker, schedule checker, watcher, and finally serve().

import { serve } from '@hono/node-server';
import path from 'node:path';
import { Worker } from 'bullmq';
import type { Hono } from 'hono';
import type { WorkflowActivities } from '../workflows/activities/workflow-activities.js';
import { getVaultRoot } from '@ruhool/core';

// Tracks each worker's init outcome so /api/health can answer factually.
type WorkerStatus = 'ok' | 'skipped' | 'failed';
interface BootReport {
  postgres: WorkerStatus;
  temporal: WorkerStatus;
  schedule: WorkerStatus;
  zoteroRefresh: WorkerStatus;
  zoteroVaultSync: WorkerStatus;
  watcher: WorkerStatus;
  research: WorkerStatus;
  habitSpawner: WorkerStatus;
  googleTasksSync: WorkerStatus;
  vaultRootDetected: boolean;
  startedAtMs: number;
  reasons: Record<string, string | undefined>;
}

export const bootReport: BootReport = {
  postgres: 'skipped',
  temporal: 'skipped',
  schedule: 'skipped',
  zoteroRefresh: 'skipped',
  zoteroVaultSync: 'skipped',
  watcher: 'skipped',
  research: 'skipped',
  habitSpawner: 'skipped',
  googleTasksSync: 'skipped',
  vaultRootDetected: false,
  startedAtMs: Date.now(),
  reasons: {},
};

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
  startZoteroRefreshChecker: () => void;
  startZoteroVaultSync: () => void;
  startHabitSpawnerChecker: () => void;
  startGoogleTasksSync: () => void;
  startWatcherWorker: (opts: { scan: () => number; onChange: () => void; logger: { info: (m: string) => void; warn: (obj: { err: unknown }, m: string) => void } }) => unknown;
  watcherScan: () => number;
  onWatcherChange: () => void;
  storeFile: string;
  providersCount: () => number;
  onServerStart: (port: number) => void;
  port: number;
  app: Hono;
}

function setStatus(key: keyof BootReport, value: WorkerStatus): void {
  (bootReport as unknown as Record<string, unknown>)[key as string] = value;
}

function tryStart(label: keyof BootReport, fn: () => void, reasonsKey?: string): WorkerStatus {
  try {
    fn();
    setStatus(label, 'ok');
    return 'ok';
  } catch (err) {
    setStatus(label, 'failed');
    if (reasonsKey) bootReport.reasons[reasonsKey] = err instanceof Error ? err.message : String(err);
    return 'failed';
  }
}

export async function startServer(deps: BootDeps): Promise<unknown> {
  const {
    logger, setupDatabase, serviceHealth, scanAndLoadModules, initResearchQueue,
    startResearchBullMQWorker, redisConnection, runResearch, startScheduleChecker,
    startZoteroRefreshChecker, startZoteroVaultSync, startHabitSpawnerChecker, startGoogleTasksSync,
    startWatcherWorker, watcherScan, onWatcherChange, storeFile, providersCount,
    onServerStart, port, app,
  } = deps;

  try {
    await setupDatabase();
    serviceHealth.postgres = true;
    bootReport.postgres = 'ok';
    logger.info('PostgreSQL connected');
  } catch (err) {
    serviceHealth.postgres = false;
    bootReport.postgres = 'skipped';
    bootReport.reasons.postgres = err instanceof Error ? err.message : String(err);
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
      bootReport.temporal = 'ok';
    } catch (err) {
      bootReport.temporal = 'failed';
      bootReport.reasons.temporal = err instanceof Error ? err.message : String(err);
      logger.warn({ err: err instanceof Error ? err.message : err }, 'Temporal worker failed to start; continuing');
    }
  } else {
    bootReport.temporal = 'skipped';
    bootReport.reasons.temporal = 'TEMPORAL_ADDRESS not set';
    logger.info('Temporal disabled (set TEMPORAL_ADDRESS to enable)');
  }

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
  bootReport.research = researchWorker ? 'ok' : 'skipped';
  if (!researchWorker) bootReport.reasons.research = 'BullMQ not available';

  tryStart('schedule', () => {
    startScheduleChecker();
    logger.info('  Schedule checker started (60s interval)');
  }, 'schedule');

  tryStart('zoteroRefresh', () => {
    startZoteroRefreshChecker();
    logger.info('  Zotero refresh checker started (6h interval)');
  }, 'zoteroRefresh');

  // Precheck the vault root before starting the vault-dependent sync. If it's
  // not resolvable, skip rather than schedule a worker that will fail every
  // hour for the life of the process.
  try {
    const vault = getVaultRoot();
    bootReport.vaultRootDetected = !!vault;
    if (!vault) {
      bootReport.zoteroVaultSync = 'skipped';
      bootReport.reasons.zoteroVaultSync = 'Vault root not found';
      logger.warn({ vault }, '[boot] Vault root not found; Zotero-Vault sync scheduler disabled this run');
    } else {
      tryStart('zoteroVaultSync', () => {
        startZoteroVaultSync();
        logger.info({ vault }, '  Zotero ↔ Vault sync scheduler started (60min interval)');
      }, 'zoteroVaultSync');
    }
  } catch (err) {
    bootReport.zoteroVaultSync = 'failed';
    bootReport.reasons.zoteroVaultSync = err instanceof Error ? err.message : String(err);
    logger.warn({ err: err instanceof Error ? err.message : err }, '[boot] Vault probe failed');
  }

  tryStart('watcher', () => {
    startWatcherWorker({ scan: watcherScan, onChange: onWatcherChange, logger });
    logger.info('  Watcher started (10min interval)');
  }, 'watcher');

  tryStart('habitSpawner', () => {
    startHabitSpawnerChecker();
    logger.info('  Habit spawner started (hourly, idempotent)');
  }, 'habitSpawner');

  tryStart('googleTasksSync', () => {
    startGoogleTasksSync();
    logger.info('  Google Tasks sync scheduler started (15min interval)');
  }, 'googleTasksSync');

  // Structured boot summary — one line, greppable, captures every worker.
  const summary = [
    `postgres=${bootReport.postgres}`,
    `temporal=${bootReport.temporal}`,
    `schedule=${bootReport.schedule}`,
    `zotero-refresh=${bootReport.zoteroRefresh}`,
    `zotero-vault-sync=${bootReport.zoteroVaultSync}`,
    `watcher=${bootReport.watcher}`,
    `research=${bootReport.research}`,
    `habit-spawner=${bootReport.habitSpawner}`,
    `google-tasks-sync=${bootReport.googleTasksSync}`,
    `vault=${bootReport.vaultRootDetected ? 'ok' : 'missing'}`,
  ].join(', ');
  logger.info({ bootReport }, `[boot] workers: ${summary}`);

  serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
    onServerStart(info.port);
    logger.info(
      { port: info.port, storeFile, providers: providersCount() },
      'Ruhool API running',
    );
  });

  return researchWorker;
}
