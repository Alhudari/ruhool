/**
 * Chat-handler display data for agents. Extracted from index.ts (REL-01 stage 2d).
 *
 * AGENT_HEADERS are the Arabic-branded prefix lines injected before assistant
 * replies (e.g. "**[عبدان — البحث العميق]**"). AGENT_DISPLAY_NAMES lives in
 * `services/activity.ts` to avoid duplication; re-exported here for ergonomics.
 */
export const AGENT_HEADERS: Record<string, string> = {
  research: '**[عبدان — البحث العميق]**',
  'reading-helper': '**[شواشة — مساعد القراءة]**',
  'writing-critic': '**[الصفرا — نقد الكتابة]**',
  comparator: '**[رمّانة — المقارنة]**',
  manager: '**[الراعي — القائد]**',
  architect: '**[المصمم — مصمم الوكلاء]**',
  'content-creator': '**[الدبسا — صناعة المحتوى]**',
  creative: '**[\u0627\u0644\u0643\u0631\u064a\u064a\u062a\u0641 \u2014 \u0635\u0646\u0627\u0639\u0629 \u0627\u0644\u0641\u064a\u062f\u064a\u0648]**',
  'tasks-agent': '**[\u0645\u0647\u0627\u0645 \u2014 \u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0645\u0647\u0627\u0645]**',
};

export { AGENT_DISPLAY_NAMES } from '../services/activity.js';
