/**
 * Chat-handler display data for agents. Extracted from index.ts (REL-01 stage 2d).
 *
 * AGENT_HEADERS are the Arabic-branded prefix lines injected before assistant
 * replies. AGENT_DISPLAY_NAMES lives in `services/activity.ts`; re-exported here.
 */
export const AGENT_HEADERS: Record<string, string> = {
  manager: '**[الراعي — القائد]**',
  doctor: '**[الدكتور — مدير غرفة الحياة]**',
  research: '**[الباحث — البحث العلمي العميق]**',
  'reading-helper': '**[المُلخِّص — مساعد القراءة]**',
  'writing-critic': '**[الناقد — نقد الكتابة]**',
  comparator: '**[المُقارِن — مقارنة الأوراق]**',
  architect: '**[المصمم — مصمم الوكلاء]**',
  'content-creator': '**[السارد — صناعة المحتوى]**',
  creative: '**[المبدع — صناعة الفيديو]**',
  'tasks-agent': '**[مهام — إدارة المهام]**',
  analyst: '**[المحلل — تحليل الاشتراكات]**',
  munazzim: '**[المنظّم — إدارة المحادثات]**',
  mushakhkhis: '**[المشخّص — فحص النظام]**',
  'research-companion': '**[الخوي — رفيق الدكتوراه]**',
  fatin: '**[الفطين — وكيل الرؤية]**',
  playmaker: '**[المُمرر — الذكاء التوجيهي]**',
  mudawwin: '**[المُدوّن — متابع الاجتماعات]**',
  sayyaq: '**[الكاتب — مساعد الصياغة]**',
};

export { AGENT_DISPLAY_NAMES } from '../services/activity.js';
