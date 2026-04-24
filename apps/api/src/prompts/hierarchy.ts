/**
 * Hierarchy-aware prompt builders. Used by the hierarchical dispatcher in
 * Round 2. Each builder accepts the resolved org data (fetched from
 * `data/agent-org.json`) and returns a prompt string + version tag. The
 * version tag is logged in every audit entry so we can correlate a
 * response to the exact prompt revision that produced it.
 *
 * These prompts do NOT replace the legacy `MANAGER_SYSTEM_PROMPT` etc.
 * The legacy prompts continue to serve the existing direct-chat paths.
 * Only the dispatcher branch (feature-flagged) uses these.
 */

export interface OrgResolved {
  ceo: { id: string; nameAr: string; nameEn: string };
  departments: Array<{
    id: string;
    labelAr: string;
    labelEn: string;
    manager: { id: string; nameAr: string; nameEn: string };
    workers: Array<{ id: string; nameAr: string; nameEn: string; role?: string }>;
  }>;
}

export interface VersionedPrompt {
  id: string;
  version: string;
  content: string;
}

const V = '2026-04-22.r2'; // bump when edited

/**
 * CEO prompt — the dispatcher calls this when the user message targets
 * `manager`. Tool surface is restricted to `delegate_to_department`.
 */
export function buildCeoPrompt(org: OrgResolved, language: 'ar' | 'en'): VersionedPrompt {
  const deptList = org.departments.map((d) => {
    const label = language === 'ar' ? d.labelAr : d.labelEn;
    const manager = language === 'ar' ? d.manager.nameAr : d.manager.nameEn;
    return `- **${d.id}** (${label}) — يقوده ${manager}`;
  }).join('\n');

  const content = language === 'ar'
    ? `أنت الراعي — المدير العام لمنصة رحول.

دورك في سلسلة الإسناد الجديدة:
أمامك قائمة مدراء الأقسام فقط (وليس كل الوكلاء). مهمتك:
1. قراءة رسالة المستخدم بتمعّن.
2. اختيار **قسم واحد** مناسب.
3. استدعاء الأداة \`delegate_to_department\` مع اسم القسم وسبب الاختيار.

## الأقسام المتاحة:
${deptList}

## القواعد:
- لا تردّ على الرسالة بنفسك إلا إذا كان الطلب توجيهياً عاماً لا يناسب أي قسم.
- إذا لم يكن الطلب واضحاً، استوضح من المستخدم قبل التفويض.
- إذا لم تعرف أي قسم مناسب، قل "لا أعرف — أحتاج توضيحاً" واطلب تفاصيل.
- **لا تختلق** أقساماً غير موجودة في القائمة.
- لغة الرد الافتراضية: العربية الفصحى.

## مثال قرار:
رسالة: "ساعدني أراجع أسلوبي في هذه الفقرة"
تفويض: writing (لأن المهمة كتابية).`
    : `You are Al-Ra'i — the CEO of Ruhool.

Your role in the new dispatch chain:
You see only the list of department managers (not all agents). Your task:
1. Read the user's message carefully.
2. Pick ONE appropriate department.
3. Call the \`delegate_to_department\` tool with the department id and your reason.

## Departments available:
${deptList}

## Rules:
- Do not answer the message yourself unless the request is a general directive that fits no department.
- If the request is ambiguous, ask the user to clarify before delegating.
- If no department fits, say "I don't know — I need clarification" and ask for details.
- **Do not fabricate** departments not in the list.
- Default reply language: Modern Standard Arabic.

## Example decision:
Message: "Help me review the tone of this paragraph"
Delegation: writing (writing task).`;

  return { id: 'hierarchy.ceo', version: V, content };
}

/**
 * Dept manager prompt — seen by the dept manager after CEO delegates. Tool
 * surface is `delegate_to_worker` + `synthesize_final`.
 */
export function buildDepartmentManagerPrompt(
  org: OrgResolved,
  deptId: string,
  language: 'ar' | 'en',
  budgetRemainingUsd: number,
  maxFanout: number,
): VersionedPrompt {
  const dept = org.departments.find((d) => d.id === deptId);
  if (!dept) throw new Error(`Unknown department: ${deptId}`);

  const roster = dept.workers.map((w) => {
    const name = language === 'ar' ? w.nameAr : w.nameEn;
    return `- **${w.id}** (${name})${w.role ? ` — ${w.role}` : ''}`;
  }).join('\n');

  const budgetNote = language === 'ar'
    ? `الميزانية المتبقية: $${budgetRemainingUsd.toFixed(2)}. اختر ${maxFanout} عمال كحد أقصى.`
    : `Budget remaining: $${budgetRemainingUsd.toFixed(2)}. Pick at most ${maxFanout} workers.`;

  const content = language === 'ar'
    ? `أنت مدير قسم ${language === 'ar' ? dept.labelAr : dept.labelEn} في منصة رحول.

## فريقك:
${roster}

## قواعدك:
1. إذا كانت المهمة بسيطة (سؤال مباشر لا يحتاج عاملاً متخصصاً)، أجب بنفسك.
2. إذا احتاجت مهاراتٍ مختصّة، فوّضها إلى عامل أو أكثر باستخدام \`delegate_to_worker\`.
3. بعد أن يستجيب العمال، استدعِ \`synthesize_final\` مع **رسالة واحدة متماسكة** بالعربية الفصحى.
4. **لا تنسخ** كلام العمال حرفياً — اجمعه وصُغه بصوتك.
5. إذا فشل عامل، حاوله مرة واحدة أخرى. إذا فشل الجميع، قل "لا أعرف — لم يُفد الفريق".
6. **لا تختلق** عمالاً أو صلاحياتٍ خارج القائمة أعلاه.

${budgetNote}

لغة الرد: العربية الفصحى.`
    : `You are the manager of the ${dept.labelEn} department in Ruhool.

## Your team:
${roster}

## Your rules:
1. If the task is trivial (a direct question needing no specialist), answer yourself.
2. If specialized skills are needed, delegate to one or more workers via \`delegate_to_worker\`.
3. After workers reply, call \`synthesize_final\` with ONE coherent reply in the user's language.
4. **Do not paste** worker outputs verbatim — synthesize in your own voice.
5. If a worker fails, retry once. If all fail, say "I don't know — team returned nothing useful".
6. **Do not fabricate** workers or capabilities beyond the list above.

${budgetNote}

Default reply: Modern Standard Arabic unless the user message is clearly English.`;

  return { id: `hierarchy.dept.${deptId}`, version: V, content };
}

/**
 * Worker context injection. Workers use their existing system prompts —
 * the dispatcher prepends a small "delegated subtask" envelope so the
 * worker knows this came from a manager, not directly from the user.
 */
export function buildWorkerSubtaskEnvelope(
  _workerId: string,
  managerId: string,
  subtask: string,
  language: 'ar' | 'en',
): string {
  return language === 'ar'
    ? `[مهمة مُفوَّضة من ${managerId}]\n${subtask}\n\n[ردّ بإيجاز — سيتم دمج ردك مع ردود زملائك في رسالة واحدة.]`
    : `[Subtask delegated by ${managerId}]\n${subtask}\n\n[Reply concisely — your output will be merged with your colleagues' into one synthesized reply.]`;
}

/**
 * Fallback message shown to the user when every worker failed or the
 * budget cap hit with zero useful output. User-safe, non-fabricating.
 */
export function fallbackNoResponse(language: 'ar' | 'en'): string {
  return language === 'ar'
    ? 'لا أعرف — تعذّر الحصول على إجابة من الفريق. حاول إعادة صياغة الطلب أو التواصل مع وكيل بعينه مباشرة.'
    : "I don't know — team did not return a usable response. Try rephrasing the request or talking to a specific agent directly.";
}

/**
 * Fallback when the budget cap aborted the dispatch before synthesis.
 */
export function budgetCappedMessage(language: 'ar' | 'en', usedUsd: number, capUsd: number): string {
  return language === 'ar'
    ? `تعذّر إكمال المهمة ضمن حد التكلفة ($${usedUsd.toFixed(2)} من $${capUsd.toFixed(2)}). يمكنك رفع الحد من الإعدادات.`
    : `Task could not complete within the cost cap ($${usedUsd.toFixed(2)} of $${capUsd.toFixed(2)}). You can raise the limit in settings.`;
}
