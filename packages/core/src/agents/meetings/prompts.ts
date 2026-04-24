// Meetings agent (عبدان / Abdan) prompt builders.
// Generates structured meeting records that match the user's Obsidian
// Supervision Interaction Points template exactly.

export interface MeetingsPromptContext {
  voiceProfile?: string;
  language: 'en' | 'ar';
  vaultContext?: string; // recent supervision notes for continuity
}

function header(ctx: MeetingsPromptContext): string {
  const lang = ctx.language === 'ar'
    ? 'Respond in Arabic (Kuwaiti flavor is fine). Keep technical terms (BIM, PhD, GRS2) in English.'
    : 'Respond in English.';

  const voiceBlock = ctx.voiceProfile?.trim()
    ? `\nThe user's writing voice (mimic in prose, not in JSON values):\n${ctx.voiceProfile.trim()}\n`
    : '';

  const vaultCtx = ctx.vaultContext?.trim()
    ? `\nContext from previous supervision meetings:\n${ctx.vaultContext.trim()}\n`
    : '';

  return [
    'You are the Meetings agent in the Ruhool platform.',
    'You help the user record, summarise, and plan around PhD supervision meetings.',
    lang,
    voiceBlock,
    vaultCtx,
    'STRICT JSON OUTPUT RULES (non-negotiable):',
    '- Your entire response must be a single valid JSON object and nothing else.',
    '- Use null for absent values. Never write undefined.',
    '- No trailing commas. No code fences. No prose before or after the JSON.',
  ].join('\n');
}

const KNOWLEDGE_LINKS_BLOCK = `## Knowledge Links
You can reference any platform node using [[Node Name]] syntax:
- Meetings: [[Meeting 4]], [[SIP-6]]
- Notes: [[note title]]
- Papers/Sources: [[paper title]]
- Tasks: [[task name]]
- Concepts: [[BIM/Standards]], [[Kuwait/Contracts]]

When you mention something the user has in their platform, use [[...]] to create a link. The platform will auto-resolve and make it clickable.`;

const MEETING_SCHEMA = `Return a single JSON object with exactly these keys:
{
  "No": number | null,
  "date": string (YYYY-MM-DD) | null,
  "Location": string | null,
  "Summary": string - one sentence capturing the meeting's main outcome,
  "Attendees": string[] - full names,
  "GRS2_Input": string | null,
  "GRS2_Respond": string | null,
  "GRS2_confirmed": boolean,
  "Next_Meeting": string (YYYY-MM-DD) | null,
  "Next_Location": string | null,
  "action_plan_previous": string[] - bullets from last meeting (or empty),
  "agenda": string[] - topics discussed,
  "discussion": string - 2-4 sentences on key discussion and feedback,
  "action_plan_next": string[] - tasks to do before next meeting,
  "arabic_summary": string[] - 3-5 short Arabic bullets summarising the meeting,
  "tags": string[]
}

Return ONLY the JSON object. No prose, no markdown fences.`;

export function buildMeetingExtractPrompt(ctx: MeetingsPromptContext): string {
  return [
    header(ctx),
    '',
    'Task: extract a structured meeting record from the user\'s free-form notes or transcript.',
    'If a field is not mentioned, set it to null or empty array as appropriate.',
    '',
    MEETING_SCHEMA,
    '',
    KNOWLEDGE_LINKS_BLOCK,
  ].join('\n');
}

export function buildMeetingSummaryPrompt(ctx: MeetingsPromptContext): string {
  return [
    header(ctx),
    '',
    'Task: given an existing meeting record, produce a concise narrative summary the user can share.',
    'Output format: a JSON object with a single key "summary" (string, 1-3 paragraphs in the user\'s language).',
    'Return ONLY the JSON. No prose.',
  ].join('\n');
}

export function buildMeetingChatPrompt(ctx: MeetingsPromptContext): string {
  return [
    header(ctx),
    '',
    'Task: answer the user\'s question about meeting notes, action items, or supervision progress.',
    'Output rules:',
    '- Respond in prose, not JSON.',
    '- Jump straight to the answer — no preamble.',
    '- Keep it tight: ≤3 paragraphs unless more is requested.',
    '',
    '── Intake flow ─────────────────────────────────────────────────────',
    'When the user is confirming meeting details (date, location, attendees):',
    '- Parse their response and extract: date corrections, location corrections, attendees list',
    '- Output %%UPDATE_FIELD%% blocks for each corrected field:',
    '  - date: ISO 8601 format (e.g. "2026-04-20T13:00:00")',
    '  - Location: plain string',
    '  - Attendees: JSON array of strings (e.g. ["Dr Davies", "Prof Ian"])',
    '- After extracting corrections, confirm: "Got it. Meeting updated. Ready for your notes."',
    '',
    '── Editing the draft or record fields ──────────────────────────────',
    'You can update the meeting draft or a specific record field by including a',
    'special block ANYWHERE in your reply (before or after prose).',
    '',
    'To replace the entire draft:',
    '%%UPDATE_DRAFT%%',
    '<full new draft content here>',
    '%%END_DRAFT%%',
    '',
    'To update a single record field (e.g. Summary, Location, Next_Meeting):',
    '%%UPDATE_FIELD%%',
    '{"field": "Summary", "value": "New summary text"}',
    '%%END_FIELD%%',
    '',
    'Rules for edit blocks:',
    '- Only include an edit block when the user explicitly asks you to change something.',
    '- The block markers must be on their own lines.',
    '- For %%UPDATE_FIELD%% the value must be valid JSON (string, number, boolean, array, or null).',
    '- You may include both a draft update and a field update in the same reply.',
    '- Always also write a normal prose acknowledgement so the user knows what changed.',
    '',
    KNOWLEDGE_LINKS_BLOCK,
  ].join('\n');
}
