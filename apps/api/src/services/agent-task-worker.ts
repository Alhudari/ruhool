import crypto from 'node:crypto';
import type { StoreData, AgentTaskRecord } from '../store/types.js';

export interface WorkerDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  runTask: (task: AgentTaskRecord) => Promise<string>;
}

const POLL_INTERVAL_MS = 30_000;

export function startAgentTaskWorker(deps: WorkerDeps): () => void {
  const { getStore, saveStore, runTask } = deps;

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
      // lazy import to avoid circular dep at module load time
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
        const result = await runTask(task);
        task.status = 'done';
        task.result = result;
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
            bodyMarkdown: result,
            html: `<pre style="white-space:pre-wrap;font-family:inherit">${result.slice(0, 180)}…</pre>`,
          });
          store.reportInbox = inbox;
        }
      } catch (err) {
        task.status = 'failed';
        task.result = err instanceof Error ? err.message : String(err);
      }

      task.updatedAt = new Date().toISOString();
      saveStore();
    }
  };

  const interval = setInterval(() => { void tick(); }, POLL_INTERVAL_MS);
  void tick();

  return () => clearInterval(interval);
}
