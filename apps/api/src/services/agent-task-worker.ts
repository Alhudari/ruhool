import crypto from 'node:crypto';
import type { StoreData, AgentTaskRecord, NotificationRecord } from '../store/types.js';
import { RuhoolError } from './errors.js';
import { flag } from './flags.js';

export interface WorkerDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  runTask: (task: AgentTaskRecord) => Promise<string>;
}

// FIX-5: shared regex — ensures parse and strip stay in sync
const NOTIFY_BLOCK_RE = /\[NOTIFY\]\s*(\{[\s\S]*?\})/g;

function processNotifications(store: StoreData, output: string, agentId: string): { processedRanges: Array<[number, number]> } {
  const ranges: Array<[number, number]> = [];
  for (const match of output.matchAll(NOTIFY_BLOCK_RE)) {
    if (match.index === undefined) continue;
    try {
      const data = JSON.parse(match[1]);
      if (!data.title) continue;
      if (!store.notificationRecords) store.notificationRecords = [];
      const rec: NotificationRecord = {
        id: crypto.randomUUID(),
        agentId,
        title: String(data.title),
        message: String(data.message || ''),
        type: (data.type as NotificationRecord['type']) || 'info',
        link: data.link,
        linkLabel: data.linkLabel,
        read: false,
        priority: (data.priority as NotificationRecord['priority']) || 'normal',
        createdAt: new Date().toISOString(),
      };
      store.notificationRecords.push(rec);
      ranges.push([match.index, match.index + match[0].length]);
    } catch { /* skip malformed */ }
  }
  return { processedRanges: ranges };
}

// Strip ONLY the ranges we successfully parsed — keeps malformed [NOTIFY] visible to user
function stripProcessedRanges(text: string, ranges: Array<[number, number]>): string {
  if (ranges.length === 0) return text;
  let out = '';
  let lastEnd = 0;
  for (const [start, end] of ranges.sort((a, b) => a[0] - b[0])) {
    out += text.slice(lastEnd, start);
    lastEnd = end;
  }
  out += text.slice(lastEnd);
  return out.trim();
}

const POLL_INTERVAL_MS = 30_000;
const RETRY_BACKOFF_MS = [30_000, 120_000, 300_000]; // 30s → 2m → 5m
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes
const STALE_RUNNING_MS = 10 * 60_000; // 10 minutes

// B-7: reconcile tasks stuck at 'running' from a previous server process
function reconcileStuckTasks(deps: WorkerDeps): void {
  if (!flag('CRASH_RECOVERY')) return;
  const store = deps.getStore();
  const now = Date.now();
  let changed = false;

  for (const task of (store.agentTasks ?? [])) {
    if (task.status !== 'running' || task.deletedAt) continue;
    const startedAt = task.startedAt ? new Date(task.startedAt).getTime() : 0;
    if (now - startedAt < STALE_RUNNING_MS) continue;

    const retryCount = (task.retryCount ?? 0) + 1;
    const maxRetries = task.maxRetries ?? DEFAULT_MAX_RETRIES;

    if (retryCount <= maxRetries) {
      task.status = 'queued';
      task.startedAt = null;
      task.retryCount = retryCount;
      task.lastError = 'server_restart_recovery';
      task.scheduledFor = null;
    } else {
      task.status = 'failed';
      task.lastError = 'server_restart_max_retries_exceeded';
    }
    task.updatedAt = new Date().toISOString();
    changed = true;
  }

  // B-7: pipelines stuck at 'running' — mark failed (they can be re-run manually)
  for (const p of (store.agentPipelines ?? [])) {
    if (p.status === 'running' && !p.deletedAt) {
      p.status = 'failed';
      p.updatedAt = new Date().toISOString();
      changed = true;
    }
  }

  if (changed) deps.saveStore();
}

// B-5: wrap runTask with a timeout
async function runWithTimeout(
  task: AgentTaskRecord,
  runTask: WorkerDeps['runTask']
): Promise<string> {
  const ms = task.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return Promise.race([
    runTask(task),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new RuhoolError('E_TASK_TIMEOUT', `Task timed out after ${ms}ms`, { taskId: task.id })),
        ms
      )
    ),
  ]);
}

export function startAgentTaskWorker(deps: WorkerDeps): () => void {
  const { getStore, saveStore, runTask } = deps;

  // B-7: reconcile stuck tasks before starting
  reconcileStuckTasks(deps);

  const tick = async () => {
    const store = getStore();

    // Scheduled pipelines (A-5)
    const duePipelines = (store.agentPipelines ?? []).filter(
      (p) =>
        p.status === 'scheduled' &&
        !p.deletedAt &&
        p.scheduledFor != null &&
        new Date(p.scheduledFor) <= new Date()
    );
    if (duePipelines.length > 0) {
      const { runPipeline } = await import('../routes/agent-pipelines.js');
      for (const p of duePipelines) {
        p.stepOutputs = {};
        p.currentStepIndex = 0;
        p.startedAt = null;
        p.completedAt = null;
        void runPipeline(p, { getStore, saveStore, runTask });
      }
    }

    if (!store.agentTasks) return;

    const now = new Date();
    const due = store.agentTasks.filter(
      (t) =>
        t.status === 'queued' &&
        !t.deletedAt &&
        (t.scheduledFor === null || new Date(t.scheduledFor) <= now)
    );

    for (const task of due) {
      task.status = 'running';
      task.startedAt = now.toISOString();
      task.updatedAt = now.toISOString();
      saveStore();

      try {
        // B-5: run with timeout
        const result = flag('TASK_RETRY')
          ? await runWithTimeout(task, runTask)
          : await runTask(task);

        // Process [NOTIFY] markers before saving result
        const { processedRanges } = processNotifications(store, result, task.agentId);
        const cleanResult = stripProcessedRanges(result, processedRanges) || result;

        task.status = 'done';
        task.result = cleanResult;
        task.completedAt = new Date().toISOString();

        if (task.reportOnComplete) {
          const inbox = (store.reportInbox ?? []);
          inbox.push({
            id: crypto.randomUUID(),
            reportId: null,
            runId: null,
            subject: task.label ?? task.prompt.slice(0, 80),
            from: task.agentId,
            sentAt: new Date().toISOString(),
            read: false,
            starred: false,
            tags: ['agent-task'],
            bodyMarkdown: cleanResult,
            html: `<pre style="white-space:pre-wrap;font-family:inherit">${cleanResult.slice(0, 500)}${cleanResult.length > 500 ? '…' : ''}</pre>`,
          });
          store.reportInbox = inbox;
        }
      } catch (err) {
        // B-5: retry with exponential backoff
        if (flag('TASK_RETRY')) {
          const retryCount = (task.retryCount ?? 0) + 1;
          const maxRetries = task.maxRetries ?? DEFAULT_MAX_RETRIES;
          task.retryCount = retryCount;
          task.lastError = err instanceof Error ? err.message : String(err);

          if (retryCount <= maxRetries) {
            const delay = RETRY_BACKOFF_MS[retryCount - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
            task.status = 'queued';
            task.startedAt = null;
            task.scheduledFor = new Date(Date.now() + delay).toISOString();
          } else {
            task.status = 'failed';
            task.result = task.lastError;
          }
        } else {
          task.status = 'failed';
          task.result = err instanceof Error ? err.message : String(err);
        }
      }

      task.updatedAt = new Date().toISOString();
      saveStore();
    }
  };

  const interval = setInterval(() => { void tick(); }, POLL_INTERVAL_MS);
  void tick();

  return () => clearInterval(interval);
}
