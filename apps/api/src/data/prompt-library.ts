// Built-in prompt library metadata — surfaces every built-in agent so the UI
// can list and edit prompts. The IDs here MUST match the IDs in
// `state/builtin-agents.ts` and `state/builtin-prompts.ts`.

import {
  MANAGER_SYSTEM_PROMPT,
  RESEARCH_SYSTEM_PROMPT,
  READING_HELPER_SYSTEM_PROMPT,
  COMPARATOR_SYSTEM_PROMPT,
  WRITING_CRITIC_SYSTEM_PROMPT,
  ARCHITECT_SYSTEM_PROMPT,
  CREATIVE_SYSTEM_PROMPT,
  CONTENT_CREATOR_SYSTEM_PROMPT,
  TASKS_AGENT_SYSTEM_PROMPT,
  ANALYST_SYSTEM_PROMPT,
  MUNAZZIM_SYSTEM_PROMPT,
  MUSHAKHKHIS_SYSTEM_PROMPT,
  RESEARCH_COMPANION_SYSTEM_PROMPT,
} from '../prompts/index.js';

export const BUILT_IN_PROMPT_LIBRARY = [
  { id: 'manager',           name: { en: "Al-Ra'i (Manager)",        ar: 'الراعي' },          type: 'built-in' as const, prompt: MANAGER_SYSTEM_PROMPT },
  { id: 'research',          name: { en: 'Abdan (Research)',         ar: 'الباحث' },            type: 'built-in' as const, prompt: RESEARCH_SYSTEM_PROMPT },
  { id: 'research-companion', name: { en: 'Rumman (Companion)',       ar: 'الخوي' },           type: 'built-in' as const, prompt: RESEARCH_COMPANION_SYSTEM_PROMPT },
  { id: 'reading-helper',    name: { en: 'Shwasha (Reading)',        ar: 'المُلخِّص' },           type: 'built-in' as const, prompt: READING_HELPER_SYSTEM_PROMPT },
  { id: 'comparator',        name: { en: 'Rammana (Compare)',        ar: 'المُقارِن' },          type: 'built-in' as const, prompt: COMPARATOR_SYSTEM_PROMPT },
  { id: 'writing-critic',    name: { en: 'Al-Safra (Writing)',       ar: 'الناقد' },          type: 'built-in' as const, prompt: WRITING_CRITIC_SYSTEM_PROMPT },
  { id: 'architect',         name: { en: 'Al-Musammim (Architect)',  ar: 'المصمم' },          type: 'built-in' as const, prompt: ARCHITECT_SYSTEM_PROMPT },
  { id: 'content-creator',   name: { en: 'Al-Dabsa (Content)',       ar: 'السارد' },          type: 'built-in' as const, prompt: CONTENT_CREATOR_SYSTEM_PROMPT },
  { id: 'creative',          name: { en: 'The Creative (Video)',     ar: 'المبدع' },        type: 'built-in' as const, prompt: CREATIVE_SYSTEM_PROMPT },
  { id: 'tasks-agent',       name: { en: 'Maham (Tasks)',            ar: 'مهام' },             type: 'built-in' as const, prompt: TASKS_AGENT_SYSTEM_PROMPT },
  { id: 'analyst',           name: { en: 'Al-Muhallil (Analyst)',    ar: 'المحلل' },          type: 'built-in' as const, prompt: ANALYST_SYSTEM_PROMPT },
  { id: 'munazzim',          name: { en: 'Al-Munazzim (Organizer)',  ar: 'المنظّم' },         type: 'built-in' as const, prompt: MUNAZZIM_SYSTEM_PROMPT },
  { id: 'mushakhkhis',       name: { en: 'Al-Mushakhkhis (Diagnose)', ar: 'المشخّص' },        type: 'built-in' as const, prompt: MUSHAKHKHIS_SYSTEM_PROMPT },
  // clippy is intentionally NOT in this list — its prompt lives inline in
  // builtin-prompts.ts and is editable via /api/agents/clippy/prompt directly.
];
