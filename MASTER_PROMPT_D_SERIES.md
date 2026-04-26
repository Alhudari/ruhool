# MASTER_PROMPT_D_SERIES — رحول: الإكمال التدريجي
# النسخة: 1.0 | التاريخ: 2026-04-25
# الهدف: إكمال C-series + UI + Deploy
# القاعدة: VA+MVA بعد كل جدول، لا توقف، كل شيء يُحفظ في الذاكرة

---

## الحالة قبل D-series
- ruhool-v6 | 270 اختبار | 0 أخطاء TypeScript
- C-7: entity extractor يعمل لكن لا injection
- C-8: observability endpoint لكن لا UI
- C-1: transcript endpoint لكن لا UI
- B-6: ask_user policy لكن لا UI للرد
- C-9: ConvRecord.rollingContext موجود لكن لا summarization

---

### D-1: Entity Memory Injection
**المشكلة**: entity extractor يستخرج ويحفظ، لكن لا شيء يُحقن في المحادثات.
**الحل**: في chat.ts — قبل LLM call، أضف top entities للـ system prompt.

```typescript
// في chat.ts — بعد بناء activeSystemPrompt وقبل thinking event
if (flag('ENTITY_MEMORY') && store.entityMemory && store.entityMemory.length > 0) {
  const topEntities = store.entityMemory
    .filter(e => e.conversationId === convId || e.importance > 0.7)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 8);

  if (topEntities.length > 0) {
    const block = topEntities
      .map(e => `- [${e.entityType}] ${e.name}: ${e.context.slice(0, 80)}`)
      .join('\n');
    activeSystemPrompt += `\n\n## كيانات من المحادثات السابقة (تذكيرات ذكية)\n${block}\n`;
  }
}
```

**فحص VA**:
- [ ] entity injection في chat.ts قبل LLM call
- [ ] مرتّبة بـ importance DESC
- [ ] حد 8 كيانات
- [ ] مقيّدة بـ flag('ENTITY_MEMORY')

---

### D-2: Human-in-the-Loop UI
**المشكلة**: pipeline تصل لـ status='awaiting_user' لكن لا UI للمستخدم يرى ويرد.
**الحل**: في AgentTasksPage — تشخيص pipelines 'awaiting_user' + dialog للرد.

**Backend: POST /api/agent-pipelines/:id/respond**
```typescript
// يستقبل { stepIndex, response } ويُكمل الـ pipeline
app.post('/api/agent-pipelines/:id/respond', async (c) => {
  const { stepIndex, response } = await c.req.json();
  const pipeline = findPipeline(id);
  const step = pipeline.steps.find(s => s.stepIndex === stepIndex);
  step.status = 'done';
  step.result = response;
  pipeline.stepOutputs[stepIndex] = response;
  pipeline.status = 'running'; // resume
  // fire runPipeline from next step
  pipeline.resumeFromStep = stepIndex + 1;
  void runPipeline(pipeline, deps);
  return c.json({ ok: true });
});
```

**Frontend: AwaitingUserDialog.tsx**
- Badge في sidebar على pipelines الـ awaiting_user
- Dialog يعرض: اسم الـ pipeline، السؤال، textarea للرد
- زر "أرسل الرد"

**فحص VA**:
- [ ] POST /api/agent-pipelines/:id/respond يعمل
- [ ] AwaitingUserDialog.tsx موجود
- [ ] badge في sidebar/أو تنبيه واضح

---

### D-3: Rolling Context Summary
**المشكلة**: عند trim السياق نحذف رسائل بدون تلخيص.
**الحل**: في chat.ts — عند droppedCount > 0، استخدم Haiku لتلخيص المحذوفات.

```typescript
// بعد trimToTokenBudget في chat.ts
if (droppedCount > 0) {
  // حاول تلخيص المحذوفات بـ Haiku
  const dropped = chatMsgs.slice(0, originalLen - trimmed.length);
  if (dropped.length >= 3) {
    try {
      const haikuProvider = pickProviderForModel('claude-haiku-4-5-20251001');
      if (haikuProvider) {
        const summaryText = dropped.map(m => `${m.role}: ${(m.content as string).slice(0, 200)}`).join('\n');
        // non-blocking — fire and forget
        void (async () => {
          let summary = '';
          for await (const chunk of haikuProvider.chat({
            model: 'claude-haiku-4-5-20251001',
            systemPrompt: 'Summarize this conversation exchange in 2-3 sentences. Be concise.',
            messages: [{ role: 'user', content: summaryText }],
          })) {
            if (chunk.type === 'text') summary += chunk.content;
          }
          if (summary && convId) {
            const conv = store.conversations.find(c => c.id === convId);
            if (conv) {
              conv.rollingContext = summary;
              conv.rollingContextAt = new Date().toISOString();
              saveStore();
            }
          }
        })();
        // إضافة ملخص السابق (إذا موجود) في بداية المحادثة الحالية
        const existingConv = store.conversations.find(c => c.id === convId);
        if (existingConv?.rollingContext) {
          trimmed.unshift({
            role: 'user',
            content: `[ملخص ما سبق: ${existingConv.rollingContext}]`,
          });
        }
      }
    } catch { /* non-critical */ }
  }
}
```

**فحص VA**:
- [ ] rolling summary يُولَّد بـ Haiku (لا Sonnet)
- [ ] يُضاف في بداية trimmed messages
- [ ] يُحفظ في ConvRecord.rollingContext
- [ ] non-blocking (fire and forget)

---

### D-4: Observability Dashboard UI
**المشكلة**: /api/observability/stats جاهز لكن لا صفحة تعرضه.
**الحل**: صفحة /control تعرض الإحصاءات.

**apps/web/src/components/control/ObservabilityDashboard.tsx**:
```
[Runs Today: 12]  [Tasks Running: 3]  [Pipelines: 1]  [Cost Today: $0.04]
──────────────────────────────────────────────────────
[Top Agents by calls] [Recent Errors] [Entity Memory: 24 entities]
[Active Runs] [Budget: 12% used]
```
- Polling كل 30s
- Route: /observability أو tab في /control

**فحص VA**:
- [ ] ObservabilityDashboard.tsx موجود
- [ ] يستدعي GET /api/observability/stats
- [ ] يعرض: runs، tasks، pipelines، cost، entities
- [ ] Polling 30s

---

### D-5: Transcript Viewer UI
**المشكلة**: /api/runs/:id/transcript جاهز لكن لا UI.
**الحل**: في صفحة /runs — عند النقر على run، يظهر drawer مع الـ transcript.

**apps/web/src/components/runs/TranscriptDrawer.tsx**:
```
[اسم الـ Run] | [status] | [تكلفة إجمالية]
──────────────────────────────────────────
Timeline of events:
12:01:30 [manager] run.started
12:01:31 [manager] delegation.started
12:01:33 [research] model.call.started
12:01:45 [research] step.completed 12s ($0.002)
...
──────────────────────────────────────────
[Messages from conversation]
```

**فحص VA**:
- [ ] TranscriptDrawer.tsx موجود
- [ ] يستدعي GET /api/runs/:id/transcript
- [ ] يعرض events كـ timeline
- [ ] يعرض messages بالترتيب
- [ ] يفتح بالنقر على run

---

### D-6: Context Enrichment for Reports
**المشكلة**: التقارير اليومية لا ترى Zotero deltas، vault activity، meetings الأخيرة.
**الحل**: في services/reports/compose.ts — أضف context sources.

**الجوانب المطلوبة**:
1. **Zotero deltas**: أوراق أُضيفت آخر 7 أيام
2. **Vault activity**: ملاحظات أُنشئت/عُدِّلت آخر 7 أيام (من audit log)
3. **Meetings**: آخر اجتماع + القادم

```typescript
// في buildContext() في compose.ts
async function buildEnrichedContext(store: StoreData): Promise<string> {
  const sections: string[] = [];

  // Zotero recent
  const recentZotero = (store.sources ?? [])
    .filter(s => s.kind === 'zotero')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);
  if (recentZotero.length > 0) {
    sections.push(`## أوراق Zotero الأخيرة\n${recentZotero.map(s => `- ${s.title}`).join('\n')}`);
  }

  // Meetings
  const meetings = (store.meetingSessions ?? [])
    .sort((a, b) => b.date.localeCompare(a.date));
  if (meetings.length > 0) {
    const last = meetings[0];
    sections.push(`## آخر اجتماع: ${last.title} — ${last.date}`);
  }

  // Entity memory summary
  const topEntities = (store.entityMemory ?? [])
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 5);
  if (topEntities.length > 0) {
    sections.push(`## أبرز الكيانات\n${topEntities.map(e => `- ${e.entityType}: ${e.name}`).join('\n')}`);
  }

  return sections.join('\n\n');
}
```

**فحص VA**:
- [ ] buildEnrichedContext في compose.ts
- [ ] تُضاف Zotero + meetings + entities
- [ ] non-breaking (كل section في try/catch)

---

### D-7: Cloud Deploy — Vercel + Neon Phase 1
**ملاحظة**: يحتاج تقرير مستقل — يُنفَّذ بعد D-1→D-6.
**الخطوات الرئيسية**:
1. `vercel env pull` لسحب env vars
2. Neon database setup + schema migration
3. Store adapter: JSON → Neon للجداول الرئيسية
4. Deploy API على Vercel Functions (Fluid Compute)
5. Deploy Web على Vercel
6. Domain + env configuration

---

## قواعد التنفيذ
```
✅ ترتيب: D-1 → D-2 → D-3 → D-4 → D-5 → D-6 → D-7
✅ VA+MVA بعد كل جدول
✅ 270+ اختبار بعد كل جدول
✅ 0 أخطاء TypeScript
✅ git commit بعد كل جدول
✅ git tag ruhool-v7 بعد D-6
✅ D-7 في جلسة منفصلة (يحتاج تجهيز Vercel/Neon)
```
