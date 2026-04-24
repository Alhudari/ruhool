# MASTER_PROMPT_AGENTS_V1
# رحول — منظومة الوكلاء الفعلية: مهام متتالية، جدولة، وعمليات الليل
# تاريخ الإنشاء: 2026-04-24
# يُطبَّق على: C:\Users\alhud\platform  (monorepo: apps/api Hono + apps/web Next.js)

---

## السياق والرؤية

المستخدم يريد وكلاء **يعملون فعلاً**: يُكلَّف الوكيل بمهمة، يبدأها الآن أو لاحقاً، ينجزها، ويُرجع نتيجة. الحالات الأساسية:

1. **تكليف فوري**: "يا باحث، حلل هذا المستند" → يبدأ الآن.
2. **تكليف مؤجل**: "بعد ساعتين ابحث عن X" → يُجدَوَل.
3. **تذكير**: "بعد ساعة ذكرني بكذا" → رسالة تأتي في الوقت المطلوب.
4. **وظيفة الليل**: "حلل مستند مستند مع الوكلاء ليلاً وجهّز تقريراً الصبح" → pipeline متتالي يبدأ في وقت محدد وينتهي بتقرير في صندوق التقارير.
5. **سلسلة وكلاء**: الباحث → الناقد → كاتب التقارير → تقرير في الصندوق.

---

## ما يوجد بالفعل (لا تعيد بناءه)

| موجود | الملف | ملاحظة |
|-------|-------|--------|
| `ScheduleRecord` (cron متكرر) | store/types.ts:382 | يحتاج إضافة `runOnce` |
| `WorkflowRunRecord` + `WorkflowStepRecord` | store/types.ts:308 | workflow كامل لكن ثقيل |
| `AgentRunRecord` | store/types.ts:519 | تتبع تشغيل وكيل |
| POST /api/runs/start | routes/runs.ts:47 | يبدأ agent loop لكن بدون جدولة |
| POST /api/schedules | routes/schedules.ts | cron فقط، لا one-shot |
| POST /api/chat | routes/chat.ts:246 | SSE، يعمل لكن يحتاج تحسينات |
| POST /api/dispatch | routes/dispatch.ts | hierarchical dispatch |

---

## قواعد التنفيذ (إلزامية لكل جدول)

```
✅ بعد كل جدول: وكيل تحقق (VA) + وكيل مراجعة (MVA)
✅ TypeScript نظيف (npx tsc --noEmit في كلا المجلدين)
✅ الاختبارات: pnpm vitest run --exclude "**/e2e/**" → 206+ اجتياز
✅ لا tailwindcss-animate → استخدم globals.css @keyframes أو animate-pulse
✅ لا تعيد بناء ما يوجد — أكمله أو وسّعه
✅ soft delete دائماً (deletedAt) لا حذف صلب إلا بـ ?permanent=true
✅ كل route جديدة: Cache-Control مناسبة على GET
✅ git commit بعد كل جدول ناجح
✅ الوسم النهائي: git tag ruhool-v4
```

---

## الجداول (A-1 → A-9)

---

### A-1: تحسين نظام المحادثة (Chat Improvements)

**الهدف**: إصلاح المشاكل الشائعة في chat.ts وتحسين تجربة المستخدم.

**ملفات المستهدفة**:
- `apps/api/src/routes/chat.ts`
- `apps/web/src/components/chat/` (أي ملف يعرض المحادثة)

**المطلوب**:

1. **Retry للرسائل الفاشلة**:
   - في chat.ts: عند فشل stream، أعد الرسالة بـ `{ event: 'error', data: { message, retryable: true } }`
   - في UI: زر "أعد المحاولة" يظهر على الرسائل الفاشلة

2. **حالة التحميل أوضح**:
   - UI: skeleton أو dots animation أثناء الانتظار
   - إظهار اسم الوكيل الذي يعمل: "الباحث يعمل..."

3. **تجديد الاتصال تلقائياً**:
   - إذا انقطع SSE stream، يُعيد الاتصال بعد 3 ثوان (exponential backoff: 3s → 6s → 12s max 30s)
   - حد أقصى 3 محاولات ثم يظهر خطأ واضح

4. **مؤشر الكتابة**:
   - SSE event: `{ event: 'thinking', data: { agentId } }` يُرسَل قبل النص
   - UI: "الوكيل يفكر..." مع نبض خفيف

5. **التاريخ المحدود**: 
   - chat.ts يُرسل آخر 30 رسالة فقط للموديل (ليس الكل) لتجنب تجاوز السياق
   - إضافة تعليق يوضح الحد: `// J-5 context window guard: last 30 messages`

**الكود المطلوب في chat.ts** (بالقرب من line 468):
```typescript
// Context window guard: last 30 messages to avoid token overflow
const CHAT_HISTORY_LIMIT = 30;
const trimmedMsgs = chatMsgs.slice(-CHAT_HISTORY_LIMIT);
```

**فحص VA**:
- [ ] زر retry موجود في UI على رسائل status='error'
- [ ] `{ event: 'thinking' }` يُرسَل في chat.ts
- [ ] CHAT_HISTORY_LIMIT = 30 مطبق
- [ ] reconnect logic في chat client (maxRetries = 3)

---

### A-2: نظام مهام الوكلاء (Agent Task Queue)

**الهدف**: نوع جديد `AgentTaskRecord` يتيح تكليف أي وكيل بمهمة (فورية أو مجدولة) مع تتبع الحالة.

**store/types.ts** — أضف:
```typescript
export type AgentTaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface AgentTaskRecord {
  id: string;
  agentId: string;
  prompt: string;
  status: AgentTaskStatus;
  scheduledFor: string | null;    // ISO — null = run immediately
  startedAt: string | null;
  completedAt: string | null;
  result: string | null;          // مخرجات الوكيل (نص أو JSON)
  conversationId: string | null;  // المحادثة التي نشأ منها أو أُنشئت له
  pipelineId: string | null;      // ربط بـ pipeline إذا كانت ضمن سلسلة
  pipelineStepIndex: number | null;
  createdBy: 'user' | 'pipeline' | 'schedule';
  label: string | null;           // اسم وصفي اختياري: "تحليل مستند X"
  reportOnComplete: boolean;      // true = أرسل نتيجة لصندوق التقارير
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

**في StoreData** أضف:
```typescript
agentTasks?: AgentTaskRecord[];
```

**apps/api/src/routes/agent-tasks.ts** (ملف جديد):

```
GET  /api/agent-tasks                  → قائمة (فلتر: status, agentId, limit, offset)
POST /api/agent-tasks                  → إنشاء مهمة
GET  /api/agent-tasks/:id              → تفاصيل
PATCH /api/agent-tasks/:id             → تحديث (status, result, label)
DELETE /api/agent-tasks/:id            → soft delete (deletedAt)
POST /api/agent-tasks/:id/cancel       → إلغاء (status → cancelled)
POST /api/agent-tasks/:id/retry        → إعادة المحاولة (status failed → queued)
```

Cache-Control: GET `/api/agent-tasks` → `private, max-age=10` (يتغير بسرعة)

**سجّل في apps/api/src/routes/index.ts**.

**فحص VA**:
- [ ] `AgentTaskRecord` في types.ts
- [ ] `agentTasks?: AgentTaskRecord[]` في StoreData
- [ ] كل endpoints موجودة في agent-tasks.ts
- [ ] soft delete مطبق
- [ ] مسجّل في index.ts

---

### A-3: معالج الخلفية (Background Task Worker)

**الهدف**: خدمة تعمل في الخلفية تفحص المهام كل 30 ثانية وتنفذ المستحقة.

**apps/api/src/services/agent-task-worker.ts** (ملف جديد):

```typescript
import crypto from 'node:crypto';
import type { StoreData, AgentTaskRecord } from '../store/types.js';

export interface WorkerDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  runTask: (task: AgentTaskRecord) => Promise<string>; // يُرجع نتيجة نصية
}

const POLL_INTERVAL_MS = 30_000;

export function startAgentTaskWorker(deps: WorkerDeps): () => void {
  const { getStore, saveStore, runTask } = deps;
  
  const tick = async () => {
    const store = getStore();
    if (!store.agentTasks) return;
    const now = new Date();
    const due = store.agentTasks.filter(t =>
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
        // إرسال للصندوق إذا مطلوب
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
            preview: result.slice(0, 180),
            bodyMarkdown: result,
            html: `<pre style="white-space:pre-wrap;font-family:inherit">${result}</pre>`,
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
  void tick(); // تشغيل فوري عند البداية
  return () => clearInterval(interval);
}
```

**في apps/api/src/index.ts** (أو entry point):
- استدعِ `startAgentTaskWorker(...)` بعد تهيئة الـ store
- مرر `runTask` كـ function تستخدم `/api/runs/start` داخلياً أو تستدعي agent runner مباشرة

**لا تُنشئ HTTP client داخل Worker** — استدعِ agent runner مباشرة.

**فحص VA**:
- [ ] `startAgentTaskWorker` موجود وتُعيد cleanup function
- [ ] يُعدّل status إلى 'running' قبل التنفيذ
- [ ] يُعدّل status إلى 'done'/'failed' بعد التنفيذ
- [ ] reportOnComplete يضيف لـ store.reportInbox
- [ ] مستدعى من index.ts

---

### A-4: الجدولة بلغة طبيعية (Natural Language Scheduling)

**الهدف**: تحويل تعبيرات مثل "بعد ساعة"، "الصبح"، "في 3 ساعات" إلى ISO timestamp.

**apps/api/src/services/natural-time.ts** (ملف جديد):

```typescript
/**
 * Parses Arabic and English natural language time expressions
 * relative to `now` (defaults to new Date()).
 * Returns ISO string or null if unparseable.
 */
export function parseNaturalTime(input: string, now = new Date()): string | null {
  const s = input.trim().toLowerCase();
  
  // Arabic patterns
  const arHour = s.match(/بعد\s+(\d+)\s+ساعة/);
  if (arHour) return addHours(now, parseInt(arHour[1])).toISOString();
  
  const arHours = s.match(/بعد\s+ساعتين/);
  if (arHours) return addHours(now, 2).toISOString();
  
  const arHalf = s.match(/بعد\s+نصف\s+ساعة/);
  if (arHalf) return addMinutes(now, 30).toISOString();
  
  const arMin = s.match(/بعد\s+(\d+)\s+دقيقة/);
  if (arMin) return addMinutes(now, parseInt(arMin[1])).toISOString();
  
  const arDay = s.match(/بعد\s+يوم|غداً|غدا/);
  if (arDay) return addHours(now, 24).toISOString();
  
  const arMorning = s.match(/الصبح|الصباح/);
  if (arMorning) return nextOccurrence(now, 8, 0).toISOString(); // 8 AM
  
  const arNight = s.match(/الليل|منتصف الليل/);
  if (arNight) return nextOccurrence(now, 23, 0).toISOString(); // 11 PM
  
  // English patterns
  const enHour = s.match(/in\s+(\d+)\s+hours?/);
  if (enHour) return addHours(now, parseInt(enHour[1])).toISOString();
  
  const enMin = s.match(/in\s+(\d+)\s+min/);
  if (enMin) return addMinutes(now, parseInt(enMin[1])).toISOString();
  
  const enTomorrow = s.match(/tomorrow/);
  if (enTomorrow) return addHours(now, 24).toISOString();
  
  // ISO passthrough
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s).toISOString();
  
  return null;
}

function addHours(d: Date, h: number): Date { return new Date(d.getTime() + h * 3_600_000); }
function addMinutes(d: Date, m: number): Date { return new Date(d.getTime() + m * 60_000); }
function nextOccurrence(now: Date, hour: number, minute: number): Date {
  const t = new Date(now);
  t.setHours(hour, minute, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 1);
  return t;
}
```

**استخدام في agent-tasks.ts**:
```typescript
import { parseNaturalTime } from '../services/natural-time.js';
// في POST /api/agent-tasks:
const scheduledFor = body.scheduleText
  ? parseNaturalTime(body.scheduleText)
  : (body.scheduledFor ?? null);
```

**فحص VA**:
- [ ] `parseNaturalTime` موجود في services/natural-time.ts
- [ ] يُعيد ISO string أو null
- [ ] يُستخدم في agent-tasks.ts
- [ ] يغطي على الأقل: "بعد X ساعة"، "الصبح"، "بعد يوم"، "in X hours"

---

### A-5: وظائف الليل — Overnight Pipeline

**الهدف**: آلية بسيطة تُمكّن المستخدم من إنشاء pipeline متتالية تعمل ليلاً وتنتهي بتقرير.

**store/types.ts** — أضف:
```typescript
export interface AgentPipelineStep {
  stepIndex: number;
  agentId: string;
  promptTemplate: string; // يدعم {{input}} و{{step_N_output}} و{{documents}}
  label: string | null;
}

export interface AgentPipelineRecord {
  id: string;
  name: { en: string; ar: string };
  steps: AgentPipelineStep[];
  status: 'draft' | 'scheduled' | 'running' | 'done' | 'failed';
  scheduledFor: string | null;
  startedAt: string | null;
  completedAt: string | null;
  currentStepIndex: number;
  stepOutputs: Record<number, string>;  // stepIndex → نتيجة
  documents: string[];                  // قائمة مستندات (IDs أو نصوص)
  reportOnComplete: boolean;
  reportSubject: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
```

**في StoreData** أضف:
```typescript
agentPipelines?: AgentPipelineRecord[];
```

**apps/api/src/routes/agent-pipelines.ts** (ملف جديد):
```
GET  /api/agent-pipelines               → قائمة
POST /api/agent-pipelines               → إنشاء pipeline
GET  /api/agent-pipelines/:id           → تفاصيل
PATCH /api/agent-pipelines/:id          → تحديث
DELETE /api/agent-pipelines/:id         → soft delete
POST /api/agent-pipelines/:id/run       → تشغيل فوري
POST /api/agent-pipelines/:id/schedule  → جدولة { scheduleText? | scheduledFor? }
```

**تشغيل الـ Pipeline** (في worker أو عند استدعاء /run):
```
لكل step بالترتيب:
  1. حضّر prompt: استبدل {{step_N_output}} بنتيجة step N السابقة
  2. أنشئ AgentTaskRecord لهذا الـ step
  3. شغّله (عبر runTask)
  4. احفظ نتيجته في stepOutputs[stepIndex]
  5. إذا كان آخر step وreportOnComplete = true:
     - أضف إلى store.reportInbox
```

**تكامل مع Worker (A-3)**:
في tick() أضف فحص للـ pipelines المجدولة:
```typescript
// فحص pipelines المجدولة
const duePipelines = (store.agentPipelines ?? []).filter(p =>
  p.status === 'scheduled' && !p.deletedAt &&
  p.scheduledFor && new Date(p.scheduledFor) <= now
);
for (const p of duePipelines) {
  void runPipeline(p, deps);
}
```

**فحص VA**:
- [ ] `AgentPipelineRecord` في types.ts مع جميع الحقول
- [ ] `agentPipelines?` في StoreData
- [ ] كل endpoints في agent-pipelines.ts
- [ ] `/api/agent-pipelines/:id/schedule` يستخدم parseNaturalTime
- [ ] تشغيل pipeline يمر عبر الـ steps بالترتيب
- [ ] نتيجة pipeline تُضاف لصندوق التقارير إذا reportOnComplete = true

---

### A-6: واجهة تكليف الوكلاء (Agent Assignment UI)

**الهدف**: من أي صفحة في المنصة، يستطيع المستخدم تكليف وكيل مباشرة.

**apps/web/src/components/agents/AgentTaskDialog.tsx** (ملف جديد):

مكوّن dialog (modal) يحتوي:
```
[ اختر الوكيل ▾ ]  [المهمة / الطلب...........................]
[ الجدولة: فوري | بعد ساعة | الصبح | وقت محدد... ]
[ أرسل النتيجة للصندوق ☑ ]
[ كلّف الوكيل ]
```

- عند الضغط على "كلّف": `POST /api/agent-tasks { agentId, prompt, scheduleText, reportOnComplete }`
- Toast: "تم تكليف {اسم الوكيل}" مع رابط لصفحة المهام

**إضافة زر تكليف عالمي**:
في الـ header أو sidebar الرئيسي:
- زر `+ مهمة` يفتح AgentTaskDialog
- مختصر لوحة مفاتيح: `Alt+T`

**فحص VA**:
- [ ] AgentTaskDialog موجود مع كل الحقول
- [ ] يستدعي POST /api/agent-tasks عند الإرسال
- [ ] زر `+ مهمة` موجود في layout رئيسي
- [ ] Toast تأكيد يظهر بعد النجاح
- [ ] bilingual (ar/en)

---

### A-7: لوحة المهام الجارية (Task Monitor)

**الهدف**: صفحة لرؤية كل المهام: الجارية، المجدولة، المنتهية.

**apps/web/src/components/agents/AgentTasksPage.tsx** (ملف جديد):

Layout:
```
[الجارية (N)] [المجدولة (N)] [المنتهية] [الفاشلة]
─────────────────────────────────────────
[بطاقة مهمة] — اسم الوكيل | العنوان | الحالة | الوقت
              زر: إلغاء (جارية) | إعادة (فاشلة) | عرض النتيجة (منتهية)
```

- Polling كل 15 ثانية: `GET /api/agent-tasks?status=running,queued`
- بطاقة المهمة الجارية: progress animation (pulse)
- النتيجة تُعرض في collapsed panel
- رابط للمحادثة إذا `conversationId` متوفر

**Route في Next.js**:
- `apps/web/src/app/agent-tasks/page.tsx` → يعرض `<AgentTasksPage />`
- أضف رابطاً في sidebar: "المهام" مع badge للمهام الجارية

**فحص VA**:
- [ ] AgentTasksPage موجود مع tabs: جارية/مجدولة/منتهية/فاشلة
- [ ] Polling كل 15s
- [ ] أزرار إلغاء/إعادة/عرض تعمل
- [ ] صفحة `/agent-tasks` مسجلة في routing
- [ ] رابط sidebar مع badge

---

### A-8: التذكيرات الذكية (Smart Reminders)

**الهدف**: "ذكرني بكذا بعد ساعة" ينشئ تذكيراً يظهر كإشعار + رسالة في الصندوق.

**آلية التنفيذ**:
1. في chat.ts: اكتشاف pattern التذكير:
   ```typescript
   const reminderMatch = message.match(/ذكرني\s+(.+?)\s+(بعد|في|الصبح|غد[اً]?)/);
   ```
   أو عبر agent: إذا أجاب الوكيل بـ JSON `{ type: 'reminder', text, scheduledFor }`

2. إنشاء `AgentTaskRecord` تلقائياً:
   ```typescript
   {
     agentId: 'system',
     prompt: `reminder: ${reminderText}`,
     scheduledFor: parsedTime,
     reportOnComplete: true,
     label: `تذكير: ${reminderText}`,
     createdBy: 'user'
   }
   ```

3. Worker ينفّذ "المهمة" بإضافة رسالة للصندوق مباشرة (بدون استدعاء موديل — التذكيرات لا تحتاج AI).

**في apps/api/src/services/agent-task-worker.ts**:
أضف حالة خاصة:
```typescript
if (task.prompt.startsWith('reminder:')) {
  result = task.prompt.replace('reminder:', '').trim();
  // لا استدعاء للموديل
}
```

**في chat.ts** — detection (بالقرب من line 280):
```typescript
const reminderRe = /^ذكرني\b|^remind me\b/i;
if (reminderRe.test(body.message)) {
  // extract time and text, create AgentTaskRecord
}
```

**فحص VA**:
- [ ] chat.ts يكتشف pattern التذكير
- [ ] ينشئ AgentTaskRecord بـ prompt 'reminder:...'
- [ ] Worker يتعامل مع التذكيرات بدون AI call
- [ ] نتيجة التذكير تصل لصندوق التقارير في الوقت المحدد

---

### A-9: الفحص الشامل النهائي + git tag ruhool-v4

**الهدف**: التحقق من اكتمال كل جداول A-1 → A-8 ثم توسيم الإصدار.

**قائمة الفحص الشاملة**:

**A-1 Chat**:
- [ ] CHAT_HISTORY_LIMIT = 30 في chat.ts
- [ ] `{ event: 'thinking' }` SSE event
- [ ] UI retry button للرسائل الفاشلة

**A-2 Agent Tasks**:
- [ ] `AgentTaskRecord` في store/types.ts
- [ ] CRUD كامل في /api/agent-tasks

**A-3 Worker**:
- [ ] startAgentTaskWorker يعمل
- [ ] مستدعى من index.ts

**A-4 Natural Time**:
- [ ] parseNaturalTime يغطي 8 تعبيرات على الأقل

**A-5 Pipeline**:
- [ ] `AgentPipelineRecord` في store/types.ts
- [ ] CRUD + /run + /schedule
- [ ] تكامل مع Worker

**A-6 UI Assignment**:
- [ ] AgentTaskDialog موجود
- [ ] زر `+ مهمة` في layout

**A-7 Monitor**:
- [ ] AgentTasksPage مع tabs
- [ ] Polling + actions

**A-8 Reminders**:
- [ ] Pattern detection في chat.ts
- [ ] Worker handles 'reminder:' بدون AI

**TypeScript + Tests**:
```bash
cd apps/web && npx tsc --noEmit        # zero errors
cd apps/api && npx tsc --noEmit        # zero errors
pnpm vitest run --exclude "**/e2e/**"  # 206+ pass
```

**الوسم**:
```bash
git add -A && git commit -m "A-9: final verification"
git tag ruhool-v4
```

---

## تعليمات التنفيذ لـ Claude

1. ابدأ بـ A-1 واقرأ chat.ts كاملاً قبل أي تعديل.
2. بعد كل جدول: VA (وكيل قراءة فقط) → MVA (يتحقق من VA) → commit.
3. إذا واجهت خطأ TypeScript: أصلحه قبل الانتقال للجدول التالي.
4. الـ Worker (A-3) يحتاج integration test — تحقق من startAgentTaskWorker في index.ts فعلاً.
5. لا تنشئ HTTP client داخل Worker — استدعِ functions مباشرة.
6. الـ Pipeline (A-5) مبني فوق Worker (A-3) — لا تكرر منطق التنفيذ.
7. عند كل "اعمل A-N": نفّذ الجدول N فقط بدون تجاوز.

---

## صيغة استدعاء الجدول

```
اعمل A-1    → ينفذ Chat Improvements فقط
اعمل A-2    → ينفذ Agent Task Queue فقط
اعمل A-3    → ينفذ Background Worker فقط
اعمل A-4    → ينفذ Natural Language Scheduling فقط
اعمل A-5    → ينفذ Overnight Pipeline فقط
اعمل A-6    → ينفذ Agent Assignment UI فقط
اعمل A-7    → ينفذ Task Monitor UI فقط
اعمل A-8    → ينفذ Smart Reminders فقط
اعمل A-9    → الفحص الشامل + git tag ruhool-v4
```
