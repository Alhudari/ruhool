// Render-queue state (REL-01 stage 2d).
// Serial queue prevents EPERM webpack cache conflicts when multiple
// Remotion renders race to share the same bundle directory.

export type RenderJob = {
  status: string;
  progress: number;
  filename?: string;
  downloadUrl?: string;
  error?: string;
  durationMs?: number;
};

export type RerenderJob = {
  total: number;
  done: number;
  current: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed';
  results: Array<{ filename: string; ok: boolean; error?: string }>;
  startedAt: string;
};

export type RenderQueueLogger = {
  error: (obj: { err: unknown }, msg: string) => void;
};

export function createRenderQueueState(opts: { logger: RenderQueueLogger }) {
  const renderJobs = new Map<string, RenderJob>();
  const rerenderJobs = new Map<string, RerenderJob>();
  const renderQueue: Array<() => Promise<void>> = [];
  let renderRunning = false;

  async function processRenderQueue(): Promise<void> {
    if (renderRunning) return;
    renderRunning = true;
    while (renderQueue.length > 0) {
      const next = renderQueue.shift()!;
      try { await next(); } catch (e) { opts.logger.error({ err: e }, 'queued render failed'); }
    }
    renderRunning = false;
  }

  function enqueueRender(jobId: string, work: () => Promise<void>): void {
    renderJobs.set(jobId, { status: 'queued', progress: 0 });
    renderQueue.push(async () => {
      renderJobs.set(jobId, { status: 'rendering', progress: 0 });
      await work();
    });
    void processRenderQueue();
  }

  function queueStatus(): { queueLength: number; running: boolean } {
    return { queueLength: renderQueue.length, running: renderRunning };
  }

  return {
    renderJobs,
    rerenderJobs,
    renderQueue,
    get renderRunning() { return renderRunning; },
    processRenderQueue,
    enqueueRender,
    queueStatus,
  };
}

export type RenderQueueState = ReturnType<typeof createRenderQueueState>;
