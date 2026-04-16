// Interval-based schedulers — extracted from index.ts (REL-01 stage 2d).
// Three schedulers:
//   - subscriptionRulesChecker: 30 min — subscription notification rules
//   - scheduleChecker: 60 s — per-schedule nextRunAt + automated notification digests
//   - watcher: 10 min — scanForAlerts() file/phase2 watcher

export interface ScheduleCheckerDeps {
  getSchedules: () => Array<{ enabled: boolean; nextRunAt?: string }>;
  runSchedule: (schedule: { enabled: boolean; nextRunAt?: string }) => Promise<void> | void;
  sendAutomatedNotifications: () => void;
  logger: { warn: (obj: { err: unknown }, m: string) => void };
}

export function startScheduleChecker(deps: ScheduleCheckerDeps): NodeJS.Timeout {
  return setInterval(() => {
    const now = new Date();
    const schedules = deps.getSchedules();
    if (schedules) {
      for (const schedule of schedules) {
        if (!schedule.enabled || !schedule.nextRunAt) continue;
        const nextRun = new Date(schedule.nextRunAt);
        if (now >= nextRun) {
          Promise.resolve(deps.runSchedule(schedule)).catch(() => {});
        }
      }
    }
    try { deps.sendAutomatedNotifications(); } catch (err) { deps.logger.warn({ err }, '[notifications] digest error'); }
  }, 60_000);
}

export interface SubscriptionCheckerDeps {
  checkSubscriptionRules: () => Promise<void>;
}

export function startSubscriptionChecker(deps: SubscriptionCheckerDeps): NodeJS.Timeout {
  return setInterval(() => { deps.checkSubscriptionRules().catch(() => {}); }, 30 * 60 * 1000);
}

export interface WatcherDeps {
  scan: () => number;
  onChange: () => void;
  logger: { info: (m: string) => void; warn: (obj: { err: unknown }, m: string) => void };
}

export function startWatcher(deps: WatcherDeps): NodeJS.Timeout {
  return setInterval(() => {
    try {
      const count = deps.scan();
      if (count > 0) {
        deps.onChange();
        deps.logger.info(`[watcher] ${count} new alert(s)`);
      }
    } catch (err) { deps.logger.warn({ err }, '[watcher] scan error'); }
  }, 10 * 60 * 1000);
}
