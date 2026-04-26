# MASTER_PROMPT_C_SERIES — رحول: مستوى المنصات العالمية
# النسخة: 1.0 | التاريخ: 2026-04-25
# المرجع: Claude Managed Agents + LangGraph + OpenAI Assistants + CrewAI
# الهدف: صفر فجوات مع المنصات العالمية — للاستخدام الشخصي والتوسع للعملاء
# القاعدة: لا حدود، فكر كشركة كبرى، مراجعان مزدوجان، لا توقف

---

## التشخيص المُثبَت (من audit حقيقي)

| الفجوة | السبب | المنصة المرجعية |
|--------|-------|----------------|
| لا events[] — trace[] فقط | AgentRunRecord ناقص | كل المنصات |
| لا /transcript endpoint | runs.ts ناقص | Managed Agents |
| specialist لا يبث tokens | dispatch() يُخزَّن | Managed Agents + LangGraph |
| لا step-level checkpoint | crash recovery فقط | LangGraph |
| context window بالعدد لا بالتوكن | CHAT_HISTORY_LIMIT=30 msg | OpenAI Assistants |
| لا budget enforcement أثناء التنفيذ | يُسجَّل بعد الانتهاء | كل المنصات |
| prompt version لا يُربط بالـ run | PromptVersion موجود لكن غير مرتبط | Managed Agents |
| ذاكرة مسطحة — لا entities | MemoryRecord.tier فقط | CrewAI + LangGraph |
| observability ضعيف | ActivityRecord بدون latency/tree | كل المنصات |

---

## المبادئ (تُضاف لـ B-series، لا تُلغيها)

**C-P1 — كل نشاط = event في stream**
كل model call، tool call، delegation، pipeline step، chat message يُنتج AgentEvent مُسلسَل في events[]. هذا هو مصدر الحقيقة.

**C-P2 — tokens هو المقياس، لا عدد الرسائل**
كل حد للسياق يُحسب بالتوكن. رسالة واحدة قد تعادل 50 رسالة.

**C-P3 — streaming لا buffering**
أي specialist يُولّد tokens، تصل للـ UI فوراً. لا انتظار.

**C-P4 — الـ checkpoint بعد كل خطوة، لا فقط عند الانتهاء**
كل pipeline step تُحفظ نتيجتها checkpoint قابل للاستئناف.

**C-P5 — الميزانية تحكم التنفيذ**
كل run له budget. عند 80% تنزّل الموديل. عند 100% تتوقف. لا runs بلا حدود.

**C-P6 — الكيانات (entities) هي الذاكرة الحقيقية**
الأسماء، الأوراق، القرارات، المشاريع تُستخرج تلقائياً وتُحقن في السياق.

---

## الجداول (C-1 → C-10)

---

### C-1: Unified Run Events Bus
**أهمية**: الأساس — بدونه C-2 إلى C-10 مستحيلة
**مرجع**: Claude Managed Agents (run_steps[]) + OpenAI Assistants (events[])
**جهد**: يومان

**المطلوب في store/types.ts**:
```typescript
export type AgentEventType =
  | 'run.started' | 'run.completed' | 'run.failed' | 'run.cancelled'
  | 'step.started' | 'step.completed' | 'step.failed'
  | 'model.call.started' | 'model.call.completed'
  | 'tool.call.started' | 'tool.call.completed' | 'tool.call.failed'
  | 'token.delta'        // C-2: streaming
  | 'delegation.started' | 'delegation.completed'
  | 'budget.warning'    // C-4: 80%
  | 'budget.exceeded'   // C-4: 100%
  | 'checkpoint.saved'  // C-3
  | 'context.trimmed'   // C-5
  | 'entity.extracted'  // C-6
  | 'memory.saved';

export interface AgentEvent {
  id: string;
  runId: string;
  type: AgentEventType;
  at: number;           // Unix ms
  agentId?: string;
  stepId?: string;
  durationMs?: number;
  tokens?: { in?: number; out?: number; costUsd?: number };
  payload?: Record<string, unknown>;
}
```

**أضف لـ AgentRunRecord**:
```typescript
events?: AgentEvent[];
promptVersionHash?: string;  // C-6
budgetUsd?: number;          // C-5
budgetSpentUsd?: number;
```

**ملف جديد: `services/events/event-bus.ts`**:
```typescript
export function emitRunEvent(
  store: StoreData,
  event: Omit<AgentEvent, 'id' | 'at'>
): void {
  const run = store.agentRuns?.find(r => r.id === event.runId);
  if (!run) return;
  if (!run.events) run.events = [];
  run.events.push({ id: crypto.randomUUID(), at: Date.now(), ...event });
}
```

**Endpoint جديد: GET /api/runs/:id/transcript**:
```typescript
// يُرجع events مرتبة كـ transcript قابل للقراءة
GET /api/runs/:id/transcript
→ { events: AgentEvent[], summary: string, totalCost: number }
```

**فحص VA**:
- [ ] `AgentEvent` + `AgentEventType` في types.ts
- [ ] `events?` + `budgetUsd?` في AgentRunRecord
- [ ] `emitRunEvent()` في services/events/event-bus.ts
- [ ] GET /api/runs/:id/transcript يعمل

---

### C-2: Nested Streaming — Specialist Tokens to UI
**أهمية**: أعلى تأثير على UX — المستخدم يرى tokens تظهر في الوقت الحقيقي
**مرجع**: Claude Managed Agents (text_delta) + LangGraph (streaming_events)
**جهد**: يومان

**المشكلة الجذرية**: `dispatch()` في specialists.ts يُخزِّن الاستجابة كاملة ثم يُرجعها. لا streaming.

**الحل**: أضف `onToken` callback لـ DispatchDeps:
```typescript
// services/agents/specialists.ts
export interface DispatchDeps {
  // ... الموجود ...
  onToken?: (token: string, agentId: string) => void; // C-2: streaming callback
}

// في dispatch() — داخل for await loop:
for await (const chunk of deps.provider.chat(...)) {
  if (chunk.type === 'text') {
    roundText += chunk.text;
    output += chunk.text;
    // C-2: emit token immediately
    deps.onToken?.(chunk.text, specialist);
  }
  // ... rest
}
```

**في chat.ts — عند manager tool_use dispatch**:
```typescript
const result = await specialistsDispatch({
  specialist: inp.specialist,
  task: inp.task,
  // C-2: pipe tokens to SSE stream
  deps: {
    ...existingDeps,
    onToken: (token, agentId) => {
      if (CHAT_V2 && specialistMessageId) {
        void stream.writeSSE({
          event: 'message.delta',
          data: JSON.stringify({ messageId: specialistMessageId, text: token }),
        });
      }
    },
  },
});
```

**فحص VA**:
- [ ] `onToken?` في DispatchDeps
- [ ] `deps.onToken?.(chunk.text, specialist)` في dispatch loop
- [ ] chat.ts يمرر onToken → SSE stream
- [ ] اختبار: يُرسل message.delta أثناء التشغيل لا بعده

---

### C-3: Step Checkpoint + Resume
**أهمية**: طويلة الأمد — pipelines تستأنف من نقطة التوقف
**مرجع**: LangGraph (checkpointer) + OpenAI Assistants (run_steps resumable)
**جهد**: يوم واحد

**أضف لـ AgentPipelineRecord**:
```typescript
checkpoints?: Array<{
  stepIndex: number;
  output: string;
  savedAt: string;
}>;
resumeFromStep?: number; // بعد crash — ابدأ من هنا
```

**في runPipeline()**:
```typescript
// بعد نجاح كل step:
if (!pipeline.checkpoints) pipeline.checkpoints = [];
pipeline.checkpoints.push({
  stepIndex: step.stepIndex,
  output: result,
  savedAt: new Date().toISOString(),
});
saveStore(); // ← checkpoint محفوظ

// عند بدء pipeline:
const startFrom = pipeline.resumeFromStep ?? 0;
for (const step of steps.filter(s => s.stepIndex >= startFrom)) {
  // استخدم checkpoint إذا موجود
  const saved = pipeline.checkpoints?.find(c => c.stepIndex === step.stepIndex);
  if (saved) {
    pipeline.stepOutputs[step.stepIndex] = saved.output;
    step.status = 'done';
    continue; // تخطَّ
  }
  // نفّذ الخطوة...
}
```

**Endpoint: POST /api/agent-pipelines/:id/resume**:
```typescript
// يُعيد تشغيل pipeline من آخر checkpoint
POST /api/agent-pipelines/:id/resume
→ { ok: true, resumeFromStep: number }
```

**فحص VA**:
- [ ] `checkpoints[]` + `resumeFromStep` في AgentPipelineRecord
- [ ] checkpoint يُحفظ بعد كل step ناجح
- [ ] resume يتخطى الـ steps المكتملة
- [ ] /resume endpoint

---

### C-4: Token Budget Enforcement per Run
**أهمية**: تحكم حقيقي في التكاليف
**مرجع**: Managed Agents (max_tokens per run) + CrewAI (max_execution_time)
**جهد**: يوم واحد

**Budget context في AgentTaskRecord + AgentPipelineRecord**:
```typescript
// في AgentPipelineRecord:
budget?: {
  maxUsd: number;
  spentUsd: number;
  warningThreshold: number; // 0.8 = 80%
  downgradeModel?: string;  // "claude-haiku-4-5" عند 80%
};
```

**في agent-task-worker.ts — قبل كل runTask()**:
```typescript
function checkBudget(pipeline: AgentPipelineRecord, store: StoreData): 'ok' | 'warn' | 'stop' {
  if (!pipeline.budget) return 'ok';
  const ratio = pipeline.budget.spentUsd / pipeline.budget.maxUsd;
  if (ratio >= 1.0) return 'stop';
  if (ratio >= (pipeline.budget.warningThreshold ?? 0.8)) return 'warn';
  return 'ok';
}

// بعد كل step:
const costUsd = estimateCost(result); // من usage
if (pipeline.budget) {
  pipeline.budget.spentUsd += costUsd;
  emitRunEvent(store, { runId, type: costUsd > 0.8 * pipeline.budget.maxUsd ? 'budget.warning' : 'step.completed' });
}
```

**فحص VA**:
- [ ] `budget` field في AgentPipelineRecord
- [ ] budget check قبل كل step
- [ ] 'budget.exceeded' يوقف pipeline
- [ ] 'budget.warning' يُرسل event

---

### C-5: Token-Based Context Window
**أهمية**: صحة — الرسائل الطويلة تستهلك window بشكل مختلف
**مرجع**: OpenAI Assistants (token_count per message) + Managed Agents (auto-trim)
**جهد**: يوم واحد

**helper: `services/context/window.ts`**:
```typescript
// تقدير التوكن: ~4 chars per token لـ Arabic/English
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function trimToTokenBudget(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  reserveTokens = 2000  // للـ system prompt + response
): Array<{ role: string; content: string }> {
  const budget = maxTokens - reserveTokens;
  let used = 0;
  const result: typeof messages = [];

  // من الأحدث للأقدم
  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(messages[i].content as string);
    if (used + tokens > budget) break;
    result.unshift(messages[i]);
    used += tokens;
  }

  // تأكد أن أول رسالة = user
  while (result.length > 0 && result[0].role !== 'user') result.shift();
  return result;
}
```

**في chat.ts — بدل slice(-CHAT_HISTORY_LIMIT)**:
```typescript
// C-5: token-based context window (بدل message-count)
const MODEL_CONTEXT = 180_000; // claude-sonnet context window
const trimmedMsgs = trimToTokenBudget(chatMsgs, MODEL_CONTEXT, 4000);
```

**فحص VA**:
- [ ] `estimateTokens` + `trimToTokenBudget` في services/context/window.ts
- [ ] chat.ts يستخدم token-based trimming
- [ ] اختبار: 200 رسالة قصيرة تمر كلها، 3 رسائل طويلة تُقلَّص

---

### C-6: Agent Version Pinning per Conversation
**أهمية**: stability — تغيير prompt لا يكسر المحادثات الجارية
**مرجع**: Managed Agents (agent versions pinned at run start)
**جهد**: نصف يوم

**أضف لـ ConvRecord**:
```typescript
promptVersionHash?: string;  // sha256(8) للـ system prompt عند أول رسالة
pinnedAt?: string;           // متى تم التثبيت
```

**في chat.ts — عند إنشاء محادثة جديدة (أو أول رسالة)**:
```typescript
// C-6: pin prompt version at conversation start
if (!convRecord.promptVersionHash && activeSystemPrompt) {
  convRecord.promptVersionHash = crypto
    .createHash('sha256')
    .update(activeSystemPrompt)
    .digest('hex')
    .slice(0, 8);
  convRecord.pinnedAt = new Date().toISOString();
  saveStore();
  bootLogger.info({ hash: convRecord.promptVersionHash, agentId: detectedAgent }, 'prompt-version-pinned');
}
```

**فحص VA**:
- [ ] `promptVersionHash?` + `pinnedAt?` في ConvRecord
- [ ] يُحسب ويُحفظ عند أول رسالة
- [ ] logging

---

### C-7: Entity Memory — استخراج تلقائي
**أهمية**: ذاكرة ذكية — المنصة تتذكر الأسماء والأوراق والقرارات
**مرجع**: CrewAI (entity memory) + Managed Agents (memory blocks)
**جهد**: يومان

**نوع جديد في store/types.ts**:
```typescript
export type EntityType =
  | 'person' | 'paper' | 'project' | 'decision'
  | 'concept' | 'place' | 'organization' | 'date';

export interface EntityMemoryRecord {
  id: string;
  entityType: EntityType;
  name: string;           // الاسم الأساسي
  aliases?: string[];     // أسماء مختلفة لنفس الكيان
  context: string;        // كيف ظهر في المحادثة
  conversationId?: string;
  agentId?: string;
  importance: number;     // 0-1
  lastSeenAt: string;
  createdAt: string;
}
```

**أضف لـ StoreData**:
```typescript
entityMemory?: EntityMemoryRecord[];
```

**service: `services/memory/entity-extractor.ts`**:
```typescript
// استخراج بسيط بناءً على patterns — لا LLM call إضافي
// يشتغل على مخرجات الوكيل بعد الإجابة
export function extractEntities(text: string): Array<{ type: EntityType; name: string }> {
  const entities: Array<{ type: EntityType; name: string }> = [];

  // أوراق: نمط "عام YYYY" أو DOI أو عنوان طويل بين ""
  const papers = text.match(/"([^"]{20,100})"/g);
  papers?.forEach(p => entities.push({ type: 'paper', name: p.replace(/"/g, '') }));

  // أشخاص: الأسماء بعد كلمات مثل "أستاذ"، "دكتور"، "الباحث"
  const people = text.match(/(?:الأستاذ|الدكتور|الباحث|المهندس)\s+([؀-ۿ\s]{3,30})/g);
  people?.forEach(p => entities.push({ type: 'person', name: p }));

  // قرارات: جمل تبدأ بـ "قررنا"، "تم الاتفاق"
  const decisions = text.match(/(?:قررنا|تم الاتفاق|تقرر)[^.،]{10,100}/g);
  decisions?.forEach(d => entities.push({ type: 'decision', name: d }));

  return entities.slice(0, 10); // max 10 per message
}
```

**Hook في chat.ts — بعد حفظ assistant message**:
```typescript
// C-7: extract entities from assistant response
if (fullResponse && store.entityMemory !== undefined) {
  const entities = extractEntities(fullResponse);
  for (const e of entities) {
    const existing = store.entityMemory.find(em =>
      em.name.toLowerCase() === e.name.toLowerCase()
    );
    if (existing) {
      existing.lastSeenAt = new Date().toISOString();
      existing.importance = Math.min(1, existing.importance + 0.1);
    } else {
      store.entityMemory.push({
        id: crypto.randomUUID(),
        entityType: e.type,
        name: e.name,
        context: fullResponse.slice(0, 200),
        conversationId: convId ?? undefined,
        agentId: detectedAgent,
        importance: 0.5,
        lastSeenAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    }
  }
  if (!store.entityMemory) store.entityMemory = [];
  saveStore();
}
```

**Endpoint: GET /api/memory/entities**:
```typescript
GET /api/memory/entities?type=paper&limit=20
→ { entities: EntityMemoryRecord[] }
```

**فحص VA**:
- [ ] `EntityMemoryRecord` + `EntityType` في types.ts
- [ ] `entityMemory?` في StoreData
- [ ] `extractEntities()` في services/memory/
- [ ] hook في chat.ts بعد assistant message
- [ ] GET /api/memory/entities

---

### C-8: Observability Dashboard
**أهمية**: عمليات — رؤية حقيقية لما يحدث
**مرجع**: كل المنصات — operations visibility
**جهد**: يوم واحد

**Endpoint: GET /api/observability/stats**:
```typescript
{
  runs: { total, running, succeeded, failed, last24h },
  agents: { [agentId]: { calls, avgLatencyMs, totalCostUsd, errors } },
  tasks: { queued, running, done, failed, avgRetryCount },
  pipelines: { active, completed, partialFailure },
  budget: { monthlyLimit, spentUsd, percentUsed },
  topErrors: Array<{ code, count, lastSeen }>,
}
```

**Web Component: `components/control/ObservabilityPanel.tsx`**:
- بطاقات: Runs التشغيلية، التكلفة اليوم، الأخطاء
- قائمة الـ runs الجارية مع progress
- Polling كل 10s

**فحص VA**:
- [ ] GET /api/observability/stats
- [ ] يجمع من agentRuns + agentTasks + activityLog
- [ ] ObservabilityPanel.tsx في web

---

### C-9: Rolling Context Summary
**أهمية**: efficiency — المحادثات الطويلة تحتاج ملخص لا حذف
**مرجع**: Managed Agents (automatic summarization) + CrewAI (context compression)
**جهد**: يوم واحد

**أضف لـ ConvRecord**:
```typescript
rollingContext?: string;     // ملخص تلقائي عند تجاوز context budget
rollingContextAt?: string;   // متى آخر تلخيص
```

**في chat.ts — عند trim الـ messages**:
```typescript
// C-9: إذا اضطررنا للـ trim، ولّد ملخص للـ messages المحذوفة
if (originalLen > trimmedMsgs.length) {
  const droppedMsgs = chatMsgs.slice(0, originalLen - trimmedMsgs.length);
  const summaryPrompt = `لخّص هذه المحادثة في 3 جمل:\n${droppedMsgs.map(m => m.content).join('\n')}`;
  // استخدم Haiku لأنه رخيص وسريع
  const haikuProvider = pickProviderForModel('claude-haiku-4-5-20251001');
  if (haikuProvider) {
    const summaryRes = await haikuProvider.chat({
      model: 'claude-haiku-4-5-20251001',
      systemPrompt: 'أنت مُلخِّص محادثات. اعط ملخصاً موجزاً.',
      messages: [{ role: 'user', content: summaryPrompt }],
    });
    // collect summary text
    let summary = '';
    for await (const chunk of summaryRes) {
      if (chunk.type === 'text') summary += chunk.text;
    }
    if (summary) {
      // أضف الملخص كأول رسالة في trimmedMsgs
      trimmedMsgs.unshift({ role: 'user', content: `[ملخص المحادثة السابقة: ${summary}]` });
      // حفظ في ConvRecord
      const conv = store.conversations.find(c => c.id === convId);
      if (conv) { conv.rollingContext = summary; conv.rollingContextAt = new Date().toISOString(); }
    }
  }
}
```

**فحص VA**:
- [ ] `rollingContext?` في ConvRecord
- [ ] trigger عند trim
- [ ] يستخدم Haiku (P-7 من B-series)

---

### C-10: Final Verification + ruhool-v6
**المطلوب**:
```bash
cd apps/api && npx tsc --noEmit  # 0 errors
cd apps/web && npx tsc --noEmit  # 0 errors
pnpm vitest run --exclude "**/e2e/**"  # 254+ pass

# gate checks:
grep -r "AgentEvent" apps/api/src/services/events/  # موجود
grep -r "onToken" apps/api/src/services/agents/specialists.ts  # موجود
grep -r "checkpoints" apps/api/src/routes/agent-pipelines.ts  # موجود
grep -r "EntityMemoryRecord" apps/api/src/store/types.ts  # موجود
grep -r "trimToTokenBudget" apps/api/src/routes/chat.ts  # موجود

git tag ruhool-v6
```

---

## قواعد التنفيذ (C-series)

```
✅ ترتيب التنفيذ: C-1 → C-2 → C-3 → C-4 → C-5 → C-6 → C-7 → C-8 → C-9 → C-10
✅ مراجعان مزدوجان بعد كل جدول:
   VA  = يقرأ الملفات المعدَّلة ويتحقق من كل بند
   MVA = يُشغّل tsc + vitest + grep verification مستقلاً
✅ صفر أخطاء TypeScript قبل كل commit
✅ 254+ اختبار بعد كل جدول
✅ لا توقف بين الجداول
✅ الأنواع الجديدة: optional (?) في types.ts — backward compatible دائماً
✅ كل feature خلف flag (C-series flags في services/flags.ts)
```

---

## صيغة الاستدعاء

```
اعمل C-series     → تنفيذ كامل C-1→C-10
اعمل C-N          → جدول محدد
```
