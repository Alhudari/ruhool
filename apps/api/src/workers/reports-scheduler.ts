/**
 * Reports scheduler — every 60s scans enabled reports, fires any whose
 * nextRunAt has passed. Computes nextRunAt if missing. Skips disabled
 * reports. Cheap to run when nothing is scheduled (just a filter).
 */
import type { ReportDefinition } from '../store/types.js';
import { computeNextRunAt } from '../services/reports/schedule.js';
import { sendReport, type SendReportDeps } from '../services/reports/send.js';

export interface ReportsSchedulerDeps extends SendReportDeps {}

async function tick(deps: ReportsSchedulerDeps): Promise<void> {
  const store = deps.getStore();
  const reports = (store.reports ?? []) as ReportDefinition[];
  if (reports.length === 0) return;

  const now = new Date();
  let stored = false;

  for (const r of reports) {
    if (!r.enabled) continue;
    if (r.schedule.type === 'manual') continue;

    // Seed nextRunAt if missing.
    if (!r.nextRunAt) {
      r.nextRunAt = computeNextRunAt(r.schedule, now);
      r.updatedAt = new Date().toISOString();
      stored = true;
      continue;
    }

    const due = new Date(r.nextRunAt).getTime() <= now.getTime();
    if (!due) continue;

    // Fire — sendReport advances nextRunAt and saves.
    try {
      await sendReport(deps, r.id, 'schedule');
    } catch (err) {
      deps.logger.warn({ err }, `[reports-scheduler] unexpected error for "${r.name}"`);
    }
  }

  if (stored) deps.saveStore();
}

export function startReportsScheduler(deps: ReportsSchedulerDeps): NodeJS.Timeout {
  // Delay first run to let boot settle.
  setTimeout(() => { void tick(deps); }, 60_000);
  return setInterval(() => { void tick(deps); }, 60_000);
}
