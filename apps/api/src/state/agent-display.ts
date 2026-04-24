/**
 * Chat-handler display data for agents. Extracted from index.ts (REL-01 stage 2d).
 *
 * AGENT_HEADERS are the Arabic-branded prefix lines injected before assistant
 * replies (e.g. "**[الباحث — البحث العميق]**"). AGENT_DISPLAY_NAMES lives in
 * `services/activity.ts` to avoid duplication; re-exported here for ergonomics.
 */
export const AGENT_HEADERS: Record<string, string> = {
  manager: '**[الراعي — القائد]**',
  doctor: '**[الدكتور — راعي الحياة]**',
  research: '**[الباحث — البحث العميق]**',
  'reading-helper': '**[المُلخِّص — قراءة وتلخيص]**',
  'writing-critic': '**[الناقد — نقد الكتابة]**',
  comparator: '**[المُقارِن — المقارنات]**',
  architect: '**[المصمم — مصمم الوكلاء]**',
  'content-creator': '**[السارد — صناعة المحتوى]**',
  creative: '**[المبدع — صناعة الفيديو]**',
  'tasks-agent': '**[مهام — إدارة المهام]**',
  analyst: '**[المحلل — الاشتراكات والتكاليف]**',
  munazzim: '**[المنظّم — المحادثات والمشاريع]**',
  mushakhkhis: '**[المشخّص — فحص النظام]**',
  fatin: '**[الفطين — المنطق والذكاء]**',
  playmaker: '**[المُمرر — تمرير المهام]**',
  clippy: '**[Clippy — المساعد العائم]**',
  'research-companion': '**[الخوي — الرفيق البحثي]**',
  mudawwin: '**[المُدوِّن — التدوين]**',
  sayyaq: '**[الكاتب — الكتابة الكاتبية]**',
};

export { AGENT_DISPLAY_NAMES } from '../services/activity.js';
