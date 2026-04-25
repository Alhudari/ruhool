import crypto from 'node:crypto';
import type { Hono } from 'hono';
import type { StoreData, AgentPipelineRecord, AgentPipelineStep, AgentTaskRecord, PipelineFailPolicy } from '../store/types.js';
import { parseNaturalTime } from '../services/natural-time.js';
import { RuhoolError } from '../services/errors.js';
import { flag } from '../services/flags.js';

// F-005: HTML-escape pipeline output before embedding in inbox HTML
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '"' ? '&quot;' :
    '&#39;'
  );
}

export type AgentPipelinesDeps = {
  getStore: () => StoreData;
  saveStore: () => void;
  runTask: (task: AgentTaskRecord) => Promise<string>;
};

/** Interpolate step template: {{input}}, {{step_N_output}}, {{documents}}.
 * FIX-16: escape literal braces in inserted values so step output containing
 * "{{step_2_output}}" doesn't trigger nested substitution. */
function escapeBraces(s: string): string {
  return s.replace(/\{\{/g, '{ {').replace(/\}\}/g, '} }');
}

function buildPrompt(template: string, input: string, stepOutputs: Record<number, string>, documents: string[]): string {
  let prompt = template
    .replace(/\{\{input\}\}/g, escapeBraces(input))
    .replace(/\{\{documents\}\}/g, escapeBraces(documents.join('\n\n')));

  const stepRe = /\{\{step_(\d+)_output\}\}/g;
  prompt = prompt.replace(stepRe, (_, n) => escapeBraces(stepOutputs[parseInt(n, 10)] ?? ''));
  return prompt;
}

export async function runPipeline(
  pipeline: AgentPipelineRecord,
  deps: { getStore: () => StoreData; saveStore: () => void; runTask: (task: AgentTaskRecord) => Promise<string> }
): Promise<void> {
  const { getStore, saveStore, runTask } = deps;

  pipeline.status = 'running';
  pipeline.startedAt = new Date().toISOString();
  pipeline.updatedAt = new Date().toISOString();
  saveStore();

  const input = pipeline.documents.join('\n\n');

  try {
    let hadFailure = false;
    // C-3: determine start step (resume from checkpoint if set)
    const startFrom = pipeline.resumeFromStep ?? 0;
    if (startFrom > 0) pipeline.resumeFromStep = undefined; // clear after resuming

    for (const step of pipeline.steps.sort((a, b) => a.stepIndex - b.stepIndex)) {
      // C-3 + F-010: skip if before resume point AND has either a checkpoint OR is already done with a result
      if (step.stepIndex < startFrom) {
        const saved = pipeline.checkpoints?.find(c => c.stepIndex === step.stepIndex);
        if (saved) {
          pipeline.stepOutputs[step.stepIndex] = saved.output;
          step.status = 'done';
          step.result = saved.output;
          continue;
        }
        // F-010: also skip if step was completed in this run (status=done with a result)
        if (step.status === 'done' && step.result != null) {
          pipeline.stepOutputs[step.stepIndex] = step.result;
          continue;
        }
      }
      pipeline.currentStepIndex = step.stepIndex;
      pipeline.updatedAt = new Date().toISOString();
      step.status = 'running';
      step.error = null;
      saveStore();

      const prompt = buildPrompt(step.promptTemplate, input, pipeline.stepOutputs, pipeline.documents);

      const taskRecord: AgentTaskRecord = {
        id: crypto.randomUUID(),
        agentId: step.agentId,
        prompt,
        status: 'queued',
        scheduledFor: null,
        startedAt: null,
        completedAt: null,
        result: null,
        conversationId: null,
        pipelineId: pipeline.id,
        pipelineStepIndex: step.stepIndex,
        createdBy: 'pipeline',
        label: step.label ?? `${pipeline.name.ar} — خطوة ${step.stepIndex + 1}`,
        reportOnComplete: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      try {
        const result = await runTask(taskRecord);
        step.status = 'done';
        step.result = result;
        pipeline.stepOutputs[step.stepIndex] = result;

        // C-3: save checkpoint after each successful step (gated by F-022 flag)
        if (flag('PIPELINE_CHECKPOINT')) {
          if (!pipeline.checkpoints) pipeline.checkpoints = [];
          const existing = pipeline.checkpoints.findIndex(c => c.stepIndex === step.stepIndex);
          const cp = { stepIndex: step.stepIndex, output: result, savedAt: new Date().toISOString() };
          if (existing >= 0) pipeline.checkpoints[existing] = cp;
          else pipeline.checkpoints.push(cp);
        }

      } catch (err) {
        step.status = 'failed';
        step.error = err instanceof Error ? err.message : String(err);
        hadFailure = true;

        const policy: PipelineFailPolicy = step.onFail ?? 'abort';
        if (!flag('PIPELINE_RESILIENCE') || policy === 'abort') {
          throw new RuhoolError(
            'E_PIPELINE_STEP_FAILED',
            `Pipeline step ${step.stepIndex} failed: ${step.error}`,
            { pipelineId: pipeline.id, stepIndex: step.stepIndex }
          );
        } else if (policy === 'skip') {
          step.status = 'skipped';
          pipeline.stepOutputs[step.stepIndex] = '';
          // continue to next step
        } else if (policy === 'ask_user') {
          pipeline.status = 'awaiting_user';
          pipeline.updatedAt = new Date().toISOString();
          saveStore();
          return; // pause and wait
        }
      }

      pipeline.updatedAt = new Date().toISOString();
      saveStore();
    }

    pipeline.status = hadFailure ? 'partial-failure' : 'done';
    pipeline.completedAt = new Date().toISOString();

    if (pipeline.reportOnComplete) {
      const lastOutput = pipeline.stepOutputs[pipeline.steps.length - 1] ?? '';
      const freshStore = getStore();
      const inbox = freshStore.reportInbox ?? [];
      inbox.push({
        id: crypto.randomUUID(),
        reportId: null,
        runId: null,
        subject: pipeline.reportSubject ?? pipeline.name.ar,
        from: pipeline.steps[pipeline.steps.length - 1]?.agentId ?? 'system',
        sentAt: new Date().toISOString(),
        read: false,
        starred: false,
        tags: ['pipeline'],
        bodyMarkdown: lastOutput,
        html: `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(lastOutput.slice(0, 500))}…</pre>`,
      });
      freshStore.reportInbox = inbox;
    }
  } catch (err) {
    pipeline.status = 'failed';
    pipeline.updatedAt = new Date().toISOString();
  }

  pipeline.updatedAt = new Date().toISOString();
  saveStore();
}

export function registerAgentPipelinesRoutes(app: Hono, deps: AgentPipelinesDeps): void {
  const { getStore, saveStore, runTask } = deps;

  // GET /api/agent-pipelines
  app.get('/api/agent-pipelines', (c) => {
    const store = getStore();
    const pipelines = (store.agentPipelines ?? []).filter((p) => !p.deletedAt);
    c.header('Cache-Control', 'private, max-age=10');
    return c.json({ pipelines });
  });

  // POST /api/agent-pipelines
  app.post('/api/agent-pipelines', async (c) => {
    const store = getStore();
    const body = await c.req.json<{
      name: { en: string; ar: string };
      steps: AgentPipelineStep[];
      documents?: string[];
      reportOnComplete?: boolean;
      reportSubject?: string;
    }>();

    if (!body.name || !Array.isArray(body.steps) || body.steps.length === 0) {
      return c.json({ error: 'name and steps[] are required' }, 400);
    }

    const now = new Date().toISOString();
    const pipeline: AgentPipelineRecord = {
      id: crypto.randomUUID(),
      name: body.name,
      steps: body.steps,
      status: 'draft',
      scheduledFor: null,
      startedAt: null,
      completedAt: null,
      currentStepIndex: 0,
      stepOutputs: {},
      documents: body.documents ?? [],
      reportOnComplete: body.reportOnComplete ?? false,
      reportSubject: body.reportSubject ?? null,
      createdAt: now,
      updatedAt: now,
    };

    if (!store.agentPipelines) store.agentPipelines = [];
    store.agentPipelines.push(pipeline);
    saveStore();

    return c.json({ pipeline }, 201);
  });

  // GET /api/agent-pipelines/:id
  app.get('/api/agent-pipelines/:id', (c) => {
    const store = getStore();
    const pipeline = (store.agentPipelines ?? []).find(
      (p) => p.id === c.req.param('id') && !p.deletedAt
    );
    if (!pipeline) return c.json({ error: 'Not found' }, 404);
    return c.json({ pipeline });
  });

  // PATCH /api/agent-pipelines/:id
  app.patch('/api/agent-pipelines/:id', async (c) => {
    const store = getStore();
    const pipeline = (store.agentPipelines ?? []).find(
      (p) => p.id === c.req.param('id') && !p.deletedAt
    );
    if (!pipeline) return c.json({ error: 'Not found' }, 404);

    const body = await c.req.json<Partial<Pick<AgentPipelineRecord, 'name' | 'steps' | 'documents' | 'reportOnComplete' | 'reportSubject'>>>();
    if (body.name !== undefined) pipeline.name = body.name;
    if (body.steps !== undefined) pipeline.steps = body.steps;
    if (body.documents !== undefined) pipeline.documents = body.documents;
    if (body.reportOnComplete !== undefined) pipeline.reportOnComplete = body.reportOnComplete;
    if (body.reportSubject !== undefined) pipeline.reportSubject = body.reportSubject;
    pipeline.updatedAt = new Date().toISOString();
    saveStore();

    return c.json({ pipeline });
  });

  // DELETE /api/agent-pipelines/:id — soft delete
  app.delete('/api/agent-pipelines/:id', (c) => {
    const store = getStore();
    const pipeline = (store.agentPipelines ?? []).find(
      (p) => p.id === c.req.param('id')
    );
    if (!pipeline) return c.json({ error: 'Not found' }, 404);
    pipeline.deletedAt = new Date().toISOString();
    pipeline.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ ok: true });
  });

  // POST /api/agent-pipelines/:id/run — immediate run
  app.post('/api/agent-pipelines/:id/run', async (c) => {
    const store = getStore();
    const pipeline = (store.agentPipelines ?? []).find(
      (p) => p.id === c.req.param('id') && !p.deletedAt
    );
    if (!pipeline) return c.json({ error: 'Not found' }, 404);
    if (pipeline.status === 'running') {
      return c.json({ error: 'Pipeline is already running' }, 409);
    }

    // Reset before run
    pipeline.stepOutputs = {};
    pipeline.currentStepIndex = 0;
    pipeline.startedAt = null;
    pipeline.completedAt = null;

    // Fire-and-forget
    void runPipeline(pipeline, { getStore, saveStore, runTask });

    return c.json({ ok: true, pipelineId: pipeline.id });
  });

  // POST /api/agent-pipelines/:id/schedule
  app.post('/api/agent-pipelines/:id/schedule', async (c) => {
    const store = getStore();
    const pipeline = (store.agentPipelines ?? []).find(
      (p) => p.id === c.req.param('id') && !p.deletedAt
    );
    if (!pipeline) return c.json({ error: 'Not found' }, 404);

    const body = await c.req.json<{ scheduleText?: string; scheduledFor?: string }>();
    const scheduledFor = body.scheduleText
      ? parseNaturalTime(body.scheduleText)
      : (body.scheduledFor ?? null);

    if (!scheduledFor) {
      return c.json({ error: 'Provide scheduleText or scheduledFor' }, 400);
    }

    pipeline.scheduledFor = scheduledFor;
    pipeline.status = 'scheduled';
    pipeline.updatedAt = new Date().toISOString();
    saveStore();

    return c.json({ pipeline });
  });

  // C-3: POST /api/agent-pipelines/:id/resume — resume from last checkpoint
  app.post('/api/agent-pipelines/:id/resume', async (c) => {
    const store = getStore();
    const pipeline = (store.agentPipelines ?? []).find(
      (p) => p.id === c.req.param('id') && !p.deletedAt
    );
    if (!pipeline) return c.json({ error: 'Not found' }, 404);
    if (pipeline.status === 'running') {
      return c.json({ error: 'Pipeline is already running' }, 409);
    }

    // Find the highest completed checkpoint
    const checkpoints = pipeline.checkpoints ?? [];
    const lastCheckpoint = checkpoints
      .sort((a, b) => b.stepIndex - a.stepIndex)[0];

    const resumeFromStep = lastCheckpoint ? lastCheckpoint.stepIndex + 1 : 0;
    pipeline.resumeFromStep = resumeFromStep;
    pipeline.status = 'scheduled'; // will be picked up by worker or run immediately
    pipeline.updatedAt = new Date().toISOString();
    saveStore();

    // Fire immediately
    void runPipeline(pipeline, { getStore, saveStore, runTask });

    return c.json({ ok: true, resumeFromStep, pipelineId: pipeline.id });
  });

  // D-2 + F-010 + F-011: POST /api/agent-pipelines/:id/respond — Human-in-the-Loop response
  app.post('/api/agent-pipelines/:id/respond', async (c) => {
    const store = getStore();
    const pipeline = (store.agentPipelines ?? []).find(
      (p) => p.id === c.req.param('id') && !p.deletedAt
    );
    if (!pipeline) return c.json({ error: 'Not found' }, 404);
    if (pipeline.status !== 'awaiting_user') {
      return c.json({ error: `Pipeline is not awaiting user input (status: ${pipeline.status})` }, 409);
    }

    const body = await c.req.json<{ stepIndex: number; response: string }>();
    // F-011: stale request guard — only accept the actual paused step
    if (body.stepIndex !== pipeline.currentStepIndex) {
      return c.json({
        error: `Step index mismatch — pipeline is paused at step ${pipeline.currentStepIndex}, not ${body.stepIndex}`,
      }, 409);
    }
    const step = pipeline.steps.find(s => s.stepIndex === body.stepIndex);
    if (!step) return c.json({ error: `Step ${body.stepIndex} not found` }, 404);
    if (step.status !== 'failed' && step.status !== 'pending') {
      return c.json({ error: `Step ${body.stepIndex} is not waiting (status: ${step.status})` }, 409);
    }

    // Apply user's response as step output
    step.status = 'done';
    step.result = body.response;
    step.error = null;
    pipeline.stepOutputs[body.stepIndex] = body.response;

    // F-010: persist as a checkpoint so resume skips this step instead of re-running it
    if (!pipeline.checkpoints) pipeline.checkpoints = [];
    const existingCp = pipeline.checkpoints.findIndex(c => c.stepIndex === body.stepIndex);
    const cp = { stepIndex: body.stepIndex, output: body.response, savedAt: new Date().toISOString() };
    if (existingCp >= 0) pipeline.checkpoints[existingCp] = cp;
    else pipeline.checkpoints.push(cp);

    // Resume from next step
    pipeline.resumeFromStep = body.stepIndex + 1;
    pipeline.updatedAt = new Date().toISOString();
    saveStore();

    // Fire pipeline continuation
    void runPipeline(pipeline, { getStore, saveStore, runTask });

    return c.json({ ok: true, resumedFromStep: body.stepIndex + 1 });
  });

  // D-2: GET /api/agent-pipelines/awaiting — list pipelines awaiting user input
  app.get('/api/agent-pipelines/awaiting', (c) => {
    const store = getStore();
    const awaiting = (store.agentPipelines ?? [])
      .filter(p => p.status === 'awaiting_user' && !p.deletedAt)
      .map(p => {
        const step = p.steps.find(s => s.stepIndex === p.currentStepIndex);
        return {
          id: p.id,
          name: p.name,
          currentStepIndex: p.currentStepIndex,
          stepLabel: step?.label ?? `خطوة ${p.currentStepIndex + 1}`,
          stepError: step?.error,
          updatedAt: p.updatedAt,
        };
      });
    c.header('Cache-Control', 'private, max-age=10');
    return c.json({ pipelines: awaiting, count: awaiting.length });
  });
}
