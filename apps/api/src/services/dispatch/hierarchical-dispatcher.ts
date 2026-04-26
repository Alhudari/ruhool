import type {
  DispatchRequest,
  DispatchResult,
  DispatchChainEntry,
  DispatchError,
  DispatcherDeps,
} from './types.js';
import {
  buildCeoPrompt,
  buildDepartmentManagerPrompt,
  buildWorkerSubtaskEnvelope,
  fallbackNoResponse,
  budgetCappedMessage,
} from '../../prompts/hierarchy.js';

/**
 * Hierarchical dispatcher — implements the state machine from
 * docs/architecture/dispatch-contract.md. Kept framework-free so the
 * chat.ts integration can call it from anywhere.
 *
 * State transitions (each is a small private function):
 *   routed → dept-selected → worker-selected → worker-responded*
 *   → synthesized
 */

// Worker timeout in ms. Configurable via env for ops + CI tuning.
const WORKER_TIMEOUT_MS = Number(process.env.DISPATCH_WORKER_TIMEOUT_MS ?? 45_000);

/** Tiny structured-output parser: pulls a JSON object out of an LLM reply. */
function parseJsonish(text: string): Record<string, unknown> | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: ${label} > ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function dispatchHierarchical(
  req: DispatchRequest,
  deps: DispatcherDeps,
): Promise<DispatchResult> {
  const startMs = Date.now();
  const budgetUsd = req.budgetUsd ?? deps.getLimits().hierarchicalDispatchUsd;
  const maxFanout = req.maxFanout ?? deps.getLimits().dispatchMaxFanout;

  const chain: DispatchChainEntry[] = [];
  const errors: DispatchError[] = [];
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCostUsd = 0;
  let budgetCapped = false;

  const pushEntry = (e: DispatchChainEntry) => {
    chain.push(e);
    totalTokensIn += e.tokensIn;
    totalTokensOut += e.tokensOut;
    totalCostUsd += e.costUsd;
  };
  const remainingBudget = () => Math.max(budgetUsd - totalCostUsd, 0);

  deps.auditLog({
    action: 'dispatch.routed',
    source: 'platform:auto',
    meta: { dispatchId: req.dispatchId, lang: req.language, userMessageExcerpt: req.userMessage.slice(0, 120) },
  });

  const org = await deps.loadOrg();
  if (org) {
    deps.onStep?.({ kind: 'route', dispatchId: req.dispatchId, ceo: org.ceo.id });
  }
  if (!org) {
    return {
      dispatchId: req.dispatchId,
      finalText: fallbackNoResponse(req.language),
      language: req.language,
      chain,
      totalTokens: { input: 0, output: 0 },
      totalCostUsd: 0,
      budgetCapped: false,
      errors: [{ step: 'routing', message: 'agent-org not configured' }],
      durationMs: Date.now() - startMs,
    };
  }

  // ── Step 1: CEO picks a dept ──────────────────────────────────────
  const ceoPrompt = buildCeoPrompt(org, req.language);
  const ceoInstruction = `${req.language === 'ar'
    ? 'رسالة المستخدم:\n\n'
    : 'User message:\n\n'}${req.userMessage}\n\n${req.language === 'ar'
      ? 'أجب بكائن JSON واحد بهذا الشكل: {"department": "<id>", "reason": "<سبب قصير>"}'
      : 'Respond with one JSON object: {"department": "<id>", "reason": "<short>"}'}`;

  const ceoStart = Date.now();
  let ceoOut: Awaited<ReturnType<DispatcherDeps['llm']['callSystemMessage']>>;
  try {
    ceoOut = await withTimeout(
      deps.llm.callSystemMessage(ceoPrompt.content, ceoInstruction, { maxTokens: 200 }),
      WORKER_TIMEOUT_MS,
      'ceo',
    );
  } catch (err) {
    errors.push({ step: 'routing', agentId: org.ceo.id, message: err instanceof Error ? err.message : 'ceo call failed' });
    return {
      dispatchId: req.dispatchId,
      finalText: fallbackNoResponse(req.language),
      language: req.language,
      chain,
      totalTokens: { input: 0, output: 0 },
      totalCostUsd: 0,
      budgetCapped: false,
      errors,
      durationMs: Date.now() - startMs,
    };
  }

  pushEntry({
    agentId: org.ceo.id,
    role: 'ceo',
    tokensIn: ceoOut.tokensIn,
    tokensOut: ceoOut.tokensOut,
    costUsd: ceoOut.costUsd,
    startedAtMs: ceoStart,
    endedAtMs: Date.now(),
    status: 'ok',
  });

  const ceoDecision = parseJsonish(ceoOut.text);
  const deptId = typeof ceoDecision?.department === 'string' ? ceoDecision.department : '';
  const deptReason = typeof ceoDecision?.reason === 'string' ? ceoDecision.reason : '';
  const dept = org.departments.find((d) => d.id === deptId);

  if (!dept) {
    // CEO gave an answer without picking a dept — treat the raw text as the
    // final reply (the ambiguity case per contract).
    deps.auditLog({
      action: 'dispatch.synthesized',
      source: 'platform:auto',
      meta: { dispatchId: req.dispatchId, finalLen: ceoOut.text.length, direct: true },
    });
    return {
      dispatchId: req.dispatchId,
      finalText: ceoOut.text.trim() || fallbackNoResponse(req.language),
      language: req.language,
      chain,
      totalTokens: { input: totalTokensIn, output: totalTokensOut },
      totalCostUsd,
      budgetCapped: false,
      errors,
      durationMs: Date.now() - startMs,
    };
  }

  deps.auditLog({
    action: 'dispatch.dept-selected',
    source: 'platform:auto',
    meta: { dispatchId: req.dispatchId, dept: dept.id, reason: deptReason.slice(0, 120) },
  });
  deps.onStep?.({ kind: 'dept-selected', dispatchId: req.dispatchId, dept: dept.id, reason: deptReason, ceo: org.ceo.id });

  // ── Step 2: Dept manager picks workers + synthesizes ──────────────
  if (remainingBudget() <= 0) {
    budgetCapped = true;
    return {
      dispatchId: req.dispatchId,
      finalText: budgetCappedMessage(req.language, totalCostUsd, budgetUsd),
      language: req.language,
      chain,
      totalTokens: { input: totalTokensIn, output: totalTokensOut },
      totalCostUsd,
      budgetCapped,
      errors,
      durationMs: Date.now() - startMs,
    };
  }

  const deptPrompt = buildDepartmentManagerPrompt(org, dept.id, req.language, remainingBudget(), maxFanout);
  const managerInstruction = `${req.language === 'ar' ? 'رسالة المستخدم:\n\n' : 'User message:\n\n'}${req.userMessage}\n\n${
    req.language === 'ar'
      ? 'أجب بكائن JSON: {"workers": ["<id>", ...], "direct_answer": "<اختياري>"}\nإذا كان السؤال بسيطاً، ضع direct_answer ولا تختر عمالاً.'
      : 'Reply with JSON: {"workers": ["<id>", ...], "direct_answer": "<optional>"}\nIf the question is trivial, provide direct_answer and leave workers empty.'
  }`;

  const managerStart = Date.now();
  let managerOut: Awaited<ReturnType<DispatcherDeps['llm']['callSystemMessage']>>;
  try {
    managerOut = await withTimeout(
      deps.llm.callSystemMessage(deptPrompt.content, managerInstruction, { maxTokens: 400 }),
      WORKER_TIMEOUT_MS,
      `manager:${dept.id}`,
    );
  } catch (err) {
    errors.push({ step: 'dept-selection', agentId: dept.manager.id, message: err instanceof Error ? err.message : 'manager call failed' });
    return {
      dispatchId: req.dispatchId,
      finalText: fallbackNoResponse(req.language),
      language: req.language,
      chain,
      totalTokens: { input: totalTokensIn, output: totalTokensOut },
      totalCostUsd,
      budgetCapped,
      errors,
      durationMs: Date.now() - startMs,
    };
  }

  pushEntry({
    agentId: dept.manager.id,
    role: 'manager',
    tokensIn: managerOut.tokensIn,
    tokensOut: managerOut.tokensOut,
    costUsd: managerOut.costUsd,
    startedAtMs: managerStart,
    endedAtMs: Date.now(),
    status: 'ok',
  });

  const managerDecision = parseJsonish(managerOut.text);
  const workerIds = Array.isArray(managerDecision?.workers) ? managerDecision.workers as string[] : [];
  const directAnswer = typeof managerDecision?.direct_answer === 'string' ? managerDecision.direct_answer : '';
  const validWorkerIds = workerIds
    .filter((id) => dept.workers.some((w) => w.id === id))
    .slice(0, maxFanout);

  // Direct answer path (no workers needed).
  if (directAnswer && validWorkerIds.length === 0) {
    deps.auditLog({
      action: 'dispatch.synthesized',
      source: 'platform:auto',
      meta: { dispatchId: req.dispatchId, dept: dept.id, finalLen: directAnswer.length, direct: true },
    });
    return {
      dispatchId: req.dispatchId,
      finalText: directAnswer.trim(),
      language: req.language,
      chain,
      totalTokens: { input: totalTokensIn, output: totalTokensOut },
      totalCostUsd,
      budgetCapped,
      errors,
      durationMs: Date.now() - startMs,
    };
  }

  if (validWorkerIds.length === 0) {
    deps.auditLog({
      action: 'dispatch.synthesized',
      source: 'platform:auto',
      meta: { dispatchId: req.dispatchId, dept: dept.id, finalLen: 0, direct: false },
    });
    return {
      dispatchId: req.dispatchId,
      finalText: fallbackNoResponse(req.language),
      language: req.language,
      chain,
      totalTokens: { input: totalTokensIn, output: totalTokensOut },
      totalCostUsd,
      budgetCapped,
      errors: [...errors, { step: 'worker-invocation', agentId: dept.manager.id, message: 'manager picked no valid worker' }],
      durationMs: Date.now() - startMs,
    };
  }

  deps.auditLog({
    action: 'dispatch.worker-selected',
    source: 'platform:auto',
    meta: { dispatchId: req.dispatchId, dept: dept.id, workers: validWorkerIds },
  });

  // ── Step 3: parallel worker fan-out ──────────────────────────────
  type WorkerOutcome =
    | { ok: true; workerId: string; text: string; tokensIn: number; tokensOut: number; costUsd: number; startMs: number; endMs: number }
    | { ok: false; workerId: string; error: string };

  const workerTasks = validWorkerIds.map(async (workerId): Promise<WorkerOutcome> => {
    const start = Date.now();
    const subtask = buildWorkerSubtaskEnvelope(workerId, dept.manager.id, req.userMessage, req.language);
    // Worker system prompt stays on the legacy path — the dispatcher just
    // injects a subtask envelope. The chat integration will pass the real
    // worker system prompt via the LLM wrapper.
    const systemPrompt = req.language === 'ar'
      ? `أنت ${workerId}. نفّذ المهمة المُفوَّضة بإيجاز.`
      : `You are ${workerId}. Execute the delegated subtask concisely.`;
    try {
      const out = await withTimeout(
        deps.llm.callSystemMessage(systemPrompt, subtask, { maxTokens: 500 }),
        WORKER_TIMEOUT_MS,
        `worker:${workerId}`,
      );
      const end = Date.now();
      return {
        ok: true,
        workerId,
        text: out.text,
        tokensIn: out.tokensIn,
        tokensOut: out.tokensOut,
        costUsd: out.costUsd,
        startMs: start,
        endMs: end,
      };
    } catch (err) {
      return { ok: false, workerId, error: err instanceof Error ? err.message : 'worker failed' };
    }
  });

  const outcomes = await Promise.all(workerTasks);

  for (const o of outcomes) {
    if (o.ok) {
      pushEntry({
        agentId: o.workerId,
        role: 'worker',
        tokensIn: o.tokensIn,
        tokensOut: o.tokensOut,
        costUsd: o.costUsd,
        startedAtMs: o.startMs,
        endedAtMs: o.endMs,
        status: 'ok',
      });
      deps.auditLog({
        action: 'dispatch.worker.ok',
        source: 'platform:auto',
        meta: { dispatchId: req.dispatchId, workerId: o.workerId, tokens: o.tokensIn + o.tokensOut, costUsd: o.costUsd },
      });
      deps.onStep?.({
        kind: 'worker-output',
        dispatchId: req.dispatchId,
        workerId: o.workerId,
        deptManager: dept.manager.id,
        text: o.text,
        tokensIn: o.tokensIn,
        tokensOut: o.tokensOut,
        costUsd: o.costUsd,
      });
    } else {
      chain.push({
        agentId: o.workerId,
        role: 'worker',
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        startedAtMs: Date.now(),
        endedAtMs: Date.now(),
        status: 'failed',
        error: o.error,
      });
      errors.push({ step: 'worker-invocation', agentId: o.workerId, message: o.error });
      deps.auditLog({
        action: 'dispatch.worker.fail',
        source: 'platform:auto',
        meta: { dispatchId: req.dispatchId, workerId: o.workerId, error: o.error.slice(0, 200) },
      });
      deps.onStep?.({ kind: 'worker-failed', dispatchId: req.dispatchId, workerId: o.workerId, deptManager: dept.manager.id, error: o.error });
    }
  }

  const okOutcomes = outcomes.filter((o): o is Extract<WorkerOutcome, { ok: true }> => o.ok);
  if (okOutcomes.length === 0) {
    return {
      dispatchId: req.dispatchId,
      finalText: fallbackNoResponse(req.language),
      language: req.language,
      chain,
      totalTokens: { input: totalTokensIn, output: totalTokensOut },
      totalCostUsd,
      budgetCapped,
      errors,
      durationMs: Date.now() - startMs,
    };
  }

  // ── Step 4: synthesis ─────────────────────────────────────────────
  if (remainingBudget() <= 0) {
    budgetCapped = true;
    // Synthesize naively by concatenating usable outputs, since we can't
    // afford another LLM call. This is a graceful degrade.
    const merged = okOutcomes.map((o) => o.text.trim()).join('\n\n');
    deps.auditLog({
      action: 'dispatch.budget-capped',
      source: 'platform:auto',
      meta: { dispatchId: req.dispatchId, usedUsd: totalCostUsd, capUsd: budgetUsd },
    });
    return {
      dispatchId: req.dispatchId,
      finalText: merged,
      language: req.language,
      chain,
      totalTokens: { input: totalTokensIn, output: totalTokensOut },
      totalCostUsd,
      budgetCapped,
      errors,
      durationMs: Date.now() - startMs,
    };
  }

  const synthStart = Date.now();
  const synthesisInstruction = req.language === 'ar'
    ? `ردود فريقك:\n\n${okOutcomes.map((o) => `[${o.workerId}]: ${o.text}`).join('\n\n')}\n\nاكتب رداً واحداً متماسكاً بصياغة markdown نظيفة: عناوين فرعية عند الحاجة، نقاط قصيرة، إبراز المهم. لا تنسخ نصّ العمّال حرفياً. لا إيموجي. العربية الفصحى فقط.`
    : `Team replies:\n\n${okOutcomes.map((o) => `[${o.workerId}]: ${o.text}`).join('\n\n')}\n\nWrite ONE coherent reply in clean markdown: subheadings if needed, bullets, bold for emphasis. Do not paste worker text verbatim. No emoji.`;

  let synthesized: Awaited<ReturnType<DispatcherDeps['llm']['callSystemMessage']>> | null = null;
  try {
    synthesized = await withTimeout(
      deps.llm.callSystemMessage(deptPrompt.content, synthesisInstruction, { maxTokens: 600 }),
      WORKER_TIMEOUT_MS,
      `synthesis:${dept.id}`,
    );
    pushEntry({
      agentId: dept.manager.id,
      role: 'manager',
      tokensIn: synthesized.tokensIn,
      tokensOut: synthesized.tokensOut,
      costUsd: synthesized.costUsd,
      startedAtMs: synthStart,
      endedAtMs: Date.now(),
      status: 'ok',
    });
  } catch (err) {
    errors.push({ step: 'synthesis', agentId: dept.manager.id, message: err instanceof Error ? err.message : 'synthesis failed' });
  }

  const finalText = synthesized?.text.trim()
    || okOutcomes.map((o) => o.text.trim()).join('\n\n')
    || fallbackNoResponse(req.language);

  deps.auditLog({
    action: 'dispatch.synthesized',
    source: 'platform:auto',
    meta: {
      dispatchId: req.dispatchId,
      dept: dept.id,
      finalLen: finalText.length,
      chain: chain.map((c) => ({ agentId: c.agentId, role: c.role, status: c.status, costUsd: c.costUsd })),
      totalCostUsd,
    },
  });
  deps.onStep?.({
    kind: 'synthesis',
    dispatchId: req.dispatchId,
    deptManager: dept.manager.id,
    text: finalText,
    chain: chain.map((c) => c.agentId),
    totalTokensIn,
    totalTokensOut,
    totalCostUsd,
    budgetCapped,
  });

  return {
    dispatchId: req.dispatchId,
    finalText,
    language: req.language,
    chain,
    totalTokens: { input: totalTokensIn, output: totalTokensOut },
    totalCostUsd,
    budgetCapped,
    errors,
    durationMs: Date.now() - startMs,
  };
}
