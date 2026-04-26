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

// ── Zotero snapshot periodic sync ─────────────────────────────────
// Pulls items + collections in the background so the user's offline cache
// stays warm. Failure is silent and never wipes the existing snapshot —
// the route already implements the keep-old-on-failure semantics.
//
// Runs once on startup (after a small delay), then every `intervalMs`.
// Default 6 hours — Zotero changes are not high-frequency.
export interface ZoteroSnapshotSyncDeps {
  syncOnce: () => Promise<{ ok: boolean; itemsCount: number; collectionsCount: number; errors: string[] }>;
  isConfigured: () => boolean;
  logger: { info: (m: string) => void; warn: (obj: { err: unknown }, m: string) => void };
  intervalMs?: number;
  initialDelayMs?: number;
}

export function startZoteroSnapshotSync(deps: ZoteroSnapshotSyncDeps): { stop: () => void } {
  const intervalMs = deps.intervalMs ?? 6 * 60 * 60 * 1000;
  const initialDelayMs = deps.initialDelayMs ?? 60 * 1000; // 1 min after boot
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    if (!deps.isConfigured()) return; // skip silently when Zotero not set up
    try {
      const r = await deps.syncOnce();
      if (r.ok) {
        deps.logger.info(`[zotero-sync] OK — items=${r.itemsCount}, collections=${r.collectionsCount}`);
      } else {
        deps.logger.warn({ err: r.errors.join('; ') }, '[zotero-sync] partial failure (snapshot kept)');
      }
    } catch (err) {
      // Defensive: even if syncOnce throws, never let the periodic loop die.
      deps.logger.warn({ err }, '[zotero-sync] tick threw');
    }
  };

  const initialTimer = setTimeout(() => { void tick(); }, initialDelayMs);
  const interval = setInterval(() => { void tick(); }, intervalMs);

  return {
    stop: () => {
      stopped = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
    },
  };
}

// ── Zotero refresh-overdue checker ─────────────────────────────────
// Once a day, checks if it's been > 14 days since last Zotero refresh,
// and creates a notification if overdue (no auto-refresh — user-triggered only).
export interface ZoteroRefreshCheckerDeps {
  getStore: () => { zoteroLastRefreshAt?: string };
  createNotification: (input: { agentId: string; title: string; message: string; link?: string; priority?: 'low' | 'normal' | 'high'; bypassSettings?: boolean }) => unknown;
  logger: { info: (m: string) => void; warn: (obj: { err: unknown }, m: string) => void };
}

export function startZoteroRefreshChecker(deps: ZoteroRefreshCheckerDeps): NodeJS.Timeout {
  let lastNotifiedDay: string | null = null;
  const check = () => {
    try {
      const store = deps.getStore();
      const last = store.zoteroLastRefreshAt;
      const today = new Date().toISOString().slice(0, 10);
      // Avoid spamming — only one notification per day
      if (lastNotifiedDay === today) return;
      const days = last
        ? Math.floor((Date.now() - new Date(last).getTime()) / (24 * 60 * 60 * 1000))
        : 999;
      if (days >= 14) {
        deps.createNotification({
          agentId: 'system',
          title: '⏰ Zotero يحتاج تحديثاً',
          message: last
            ? `مرّ ${days} يوماً منذ آخر تحديث للأرقام من OpenAlex. الاستشهادات قد تكون قديمة.`
            : `لم تقم بتحديث أرقام Zotero بعد. اضغط "حدّث الآن" في /zotero.`,
          link: '/zotero',
          priority: 'normal',
        });
        lastNotifiedDay = today;
        deps.logger.info(`[zotero-refresh] notified user (${days} days since last refresh)`);
      }
    } catch (err) { deps.logger.warn({ err }, '[zotero-refresh] check error'); }
  };
  // Run once on boot, then every 6 hours
  setTimeout(check, 30_000);
  return setInterval(check, 6 * 60 * 60 * 1000);
}

// ── Round 6 — Habit spawner ───────────────────────────────────────
// Calls the habit-spawn logic shortly after boot and then once per hour.
// Hourly gives us margin on midnight roll-overs + timezone edge cases
// without burning cycles — the endpoint is idempotent.
export interface HabitSpawnerDeps {
  spawn: () => Promise<{ created: number }>;
  logger: { info: (m: string) => void; warn: (obj: { err: unknown }, m: string) => void };
}

export function startHabitSpawnerChecker(deps: HabitSpawnerDeps): NodeJS.Timeout {
  const tick = async () => {
    try {
      const r = await deps.spawn();
      if (r.created > 0) deps.logger.info(`[habit-spawner] created ${r.created} instance(s)`);
    } catch (err) {
      deps.logger.warn({ err }, '[habit-spawner] tick failed');
    }
  };
  setTimeout(tick, 45_000);
  return setInterval(tick, 60 * 60 * 1000);
}
