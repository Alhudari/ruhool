/**
 * Central export for all agent system prompts.
 *
 * Each persona (الراعي, المصمم, عبدان, شواشة, الصفرا, رمّانة, الدبسا, مهام, ...)
 * lives in its own file to keep any single file small and editable.
 *
 * `NOTIFY_PROMPT_ADDENDUM` is appended to every built-in prompt at composition time.
 */
export { MANAGER_SYSTEM_PROMPT } from './manager.js';
export { ARCHITECT_SYSTEM_PROMPT } from './architect.js';
export { NOTIFY_PROMPT_ADDENDUM } from './notify-addendum.js';

export { RESEARCH_SYSTEM_PROMPT } from './specialists/abdan.js';
export { READING_HELPER_SYSTEM_PROMPT } from './specialists/shwasha.js';
export { COMPARATOR_SYSTEM_PROMPT } from './specialists/rammana.js';
export { WRITING_CRITIC_SYSTEM_PROMPT } from './specialists/alsafra.js';
export { CREATIVE_SYSTEM_PROMPT } from './specialists/creative.js';
export { CONTENT_CREATOR_SYSTEM_PROMPT } from './specialists/aldabsa.js';
export { TASKS_AGENT_SYSTEM_PROMPT } from './specialists/tasks-agent.js';
export { MUSHAKHKHIS_SYSTEM_PROMPT } from './specialists/mushakhkhis.js';
export { MUNAZZIM_SYSTEM_PROMPT } from './specialists/munazzim.js';
export { ANALYST_SYSTEM_PROMPT } from './specialists/analyst.js';
