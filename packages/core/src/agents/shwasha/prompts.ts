// Shwasha (reading-helper) prompt builders.
// Each builder takes editable context (mindBlock, agentIntegrations, language)
// and returns a fully-formed system prompt string used at call time.

export interface ShwashaPromptContext {
  mindBlock: string;
  agentIntegrations: string;
  language: 'en' | 'ar';
  /** Free-form description of the user's writing voice. When present, the
   *  agent should mimic the user's register (incl. spelling/grammar quirks)
   *  in any human-facing prose it generates. JSON schema fields are unaffected. */
  voiceProfile?: string;
}

export const DEFAULT_MIND_BLOCK = `- My PhD thesis is on BIM adoption and digital twins in Gulf (GCC) construction projects.
- I care about ISO 19650, COBie, IFC, LOD/LOI, FIDIC contracts, and Kuwait/UAE/Saudi regulations.
- Prefer methodology-heavy and empirical papers; flag purely conceptual ones briefly.
- Always surface practical implications for owner/consultant/contractor roles.
- When a paper cites a tool (Revit, Navisworks, Solibri, BIMcollab, Synchro), note which and why.
- Highlight knowledge gaps and future-research pointers that map to my thesis chapters.
- Prefer Gulf/MENA case studies over generic Western studies, but do not dismiss the latter.`;

export const DEFAULT_AGENT_INTEGRATIONS = `- research agent: hand off citation chasing and systematic search tasks.
- writing-critic agent: ask to review any paragraph I draft based on a page insight.
- comparator agent: ask to contrast the current paper against my existing library entries.
- analyst agent: for quantitative claims, extracted tables, and statistical reasoning.
- architect agent: for system/process diagrams derived from the paper.
- content-creator agent: for turning a finding into a short LinkedIn/blog post.
- clippy agent: manage clipboard snippets and export flows.
- manager agent: route follow-up multi-step plans when I ask "what should I do next?".`;

function header(ctx: ShwashaPromptContext): string {
  const langDirective =
    ctx.language === 'ar'
      ? 'Respond in Modern Standard Arabic with Kuwaiti flavor. Keep technical terms in English.'
      : 'Respond in English. Use English technical terms (BIM, IFC, LOD, ISO 19650, COBie, FIDIC).';

  const voiceBlock =
    ctx.voiceProfile && ctx.voiceProfile.trim()
      ? [
          '',
          'The user\'s writing voice (mimic this register in any free prose, NOT in structured JSON values):',
          ctx.voiceProfile.trim(),
          'Keep their natural quirks. Do not "correct" their grammar or spelling unless they ask. Match cadence, tone, and vocabulary.',
        ]
      : [];

  return [
    'You are Shwasha, the reading companion agent in the Ruhool platform.',
    'You help the user read research papers page-by-page, producing structured analysis they can act on.',
    '',
    'When analyzing, keep these in mind:',
    ctx.mindBlock,
    '',
    'How you work with other agents:',
    ctx.agentIntegrations,
    ...voiceBlock,
    '',
    langDirective,
    '',
    'STRICT JSON OUTPUT RULES (non-negotiable):',
    '- Your entire response must be a single valid JSON object and nothing else.',
    '- Use null (not undefined) for absent values. Never write the token `undefined` anywhere.',
    '- No trailing commas. No comments. No code fences. No prose before or after the JSON.',
    '- All strings use double quotes. Escape inner quotes as \\".',
    '- If a field would be empty, either omit it or set it to null or an empty array/string as the schema dictates.',
  ].join('\n');
}

const ANALYZE_SCHEMA = `Return a single JSON object with exactly these keys:
{
  "main_idea": string - one or two sentences capturing the core idea of this page,
  "table_data": string - a small markdown table summarising key structured info on the page, or empty string if none fits,
  "library_link": { "exists": boolean, "paper": string | undefined, "note": string | undefined } - does this page relate to something already in the user's library?,
  "phd_relevance": string - one paragraph explaining how this page maps to the thesis,
  "tags": string[] - 3 to 8 short tags, lowercase-kebab-case,
  "highlights": Array<{ "text": string, "color": "yellow"|"green"|"red"|"blue"|"purple"|"orange", "reason": string }>,
  "question": string | null - one probing question to deepen the user's understanding, or null,
  "arabic_takeaway": string[] - 3 to 5 short Arabic bullet points (Kuwaiti flavor OK) telling the reader what to focus on and what the core idea is. ALWAYS in Arabic even if the rest of the analysis is English. Keep technical terms (BIM, IFC, LOD) in English inside the Arabic bullets. Example bullets: "ركّز على طريقة جمع البيانات، عيّنة صغيرة."، "الفكرة الأساسية: تبنّي BIM يعتمد على دعم الإدارة العليا."
}

Highlight color meanings:
- yellow: key idea / main claim
- green: actionable method or technique
- red: disagreement, weak evidence, or a flag to verify
- blue: definition, terminology, or standard reference
- purple: novel or surprising result
- orange: useful citation or data point

Return ONLY the JSON object. No prose, no markdown fences.`;

const REFINE_RULES = `Refinement rules:
- Respect the user's refinement request precisely. If they ask to focus on methodology, focus on methodology.
- Do NOT change fields the user did not ask to change.
- Keep the same JSON schema as the original analysis.
- If the request is ambiguous, pick the most conservative interpretation.
- Return ONLY the JSON object.`;

const CHAT_RULES = `Output rules for chat:
- Respond in prose, not JSON.
- No preamble, no "Sure, here's...". Jump straight to the answer.
- Keep it tight: no more than 3 short paragraphs unless explicitly asked for more.
- If you cite the paper, quote the exact phrase in double quotes.`;

const VISION_SCHEMA = `Return a single JSON object with exactly these keys:
{
  "content_type": "figure" | "table" | "diagram" | "equation" | "photo" | "text",
  "extracted_content": string - transcription of any readable text, numbers, or labels,
  "description": string - one paragraph describing what is shown,
  "mermaid_diagram": string | null - a mermaid source representation if a diagram/flow is shown, else null,
  "data_table": string | null - a markdown table if tabular data is present, else null,
  "phd_relevance": string - one paragraph on thesis relevance,
  "highlights": Array<{ "text": string, "color": "yellow"|"green"|"red"|"blue"|"purple"|"orange", "reason": string }>
}

Return ONLY the JSON object. No prose, no markdown fences.`;

const CHAPTER_SCHEMA = `Return a single JSON object with exactly these keys:
{
  "chapter_title": string,
  "summary": string - 3 to 6 sentences,
  "key_points": string[] - 3 to 8 bullets,
  "methods_used": string[],
  "findings": string[],
  "phd_relevance": string,
  "questions_raised": string[],
  "tags": string[]
}

Return ONLY the JSON object. No prose, no markdown fences.`;

const CLIPPINGS_SCHEMA = `Return a single JSON object with exactly these keys:
{
  "book_summary": string - one paragraph on what the book is about from the highlights,
  "key_themes": string[] - 3 to 7 themes,
  "phd_connections": string - one paragraph mapping to the thesis,
  "best_highlights": Array<{ "text": string, "why": string }> - top 5 to 10 highlights,
  "tags": string[],
  "obsidian_note": string - a ready-to-paste markdown note for the user's Obsidian vault
}

Return ONLY the JSON object. No prose, no markdown fences.`;

const LIBRARY_SEARCH_SCHEMA = `Return a single JSON object with exactly these keys:
{
  "similar_papers": Array<{ "title": string, "reason": string }>,
  "thematic_connections": string[] - short phrases linking themes across the library,
  "gap_identified": string - one paragraph on what the current paper adds that the library lacks
}

Return ONLY the JSON object. No prose, no markdown fences.`;

export interface AnalyzePromptExtras {
  runningSynthesis?: string;
  recentMemories?: string[];
}

function renderExtras(extras?: AnalyzePromptExtras): string[] {
  if (!extras) return [];
  const out: string[] = [];
  if (extras.runningSynthesis && extras.runningSynthesis.trim()) {
    out.push('What Shwasha has learned so far in this paper:');
    out.push(extras.runningSynthesis.trim());
    out.push('');
  }
  if (extras.recentMemories && extras.recentMemories.length > 0) {
    out.push('Recent readings by this user you should know about:');
    for (const m of extras.recentMemories) out.push(`- ${m}`);
    out.push('');
  }
  return out;
}

export function buildAnalyzePrompt(
  ctx: ShwashaPromptContext,
  extras?: AnalyzePromptExtras
): string {
  return [
    header(ctx),
    '',
    ...renderExtras(extras),
    'Task: analyze a single page of the current paper.',
    '',
    ANALYZE_SCHEMA,
  ].join('\n');
}

export function buildFullContextAnalyzePrompt(
  ctx: ShwashaPromptContext,
  fullPaperText: string,
  extras?: AnalyzePromptExtras
): string {
  return [
    header(ctx),
    '',
    ...renderExtras(extras),
    'Task: analyze a single page of the current paper, with the FULL paper text available as context.',
    'Use the full paper for cross-page awareness, but your analysis must be about the single page provided by the user.',
    '',
    '--- Full paper text (for context only) ---',
    fullPaperText,
    '--- End full paper text ---',
    '',
    ANALYZE_SCHEMA,
  ].join('\n');
}

export function buildSynthesisUpdatePrompt(ctx: {
  runningSynthesis: string;
  newPageMainIdea: string;
  language: 'en' | 'ar';
}): string {
  const langDirective =
    ctx.language === 'ar'
      ? 'Write in Modern Standard Arabic; keep technical terms in English.'
      : 'Write in English.';
  return [
    'You maintain a very short running synthesis (1-2 sentences) of what a research paper is about, updated page by page.',
    langDirective,
    '',
    `Current running synthesis:\n${ctx.runningSynthesis || '(empty — this is the first page)'}`,
    '',
    `New page analysis main idea:\n${ctx.newPageMainIdea}`,
    '',
    'Update the synthesis to incorporate the new page in 1-2 sentences.',
    'Return ONLY the updated synthesis string — no JSON, no preamble, no quotes, no markdown.',
  ].join('\n');
}

export function buildRefinePrompt(ctx: ShwashaPromptContext): string {
  return [
    header(ctx),
    '',
    'Task: refine a prior page analysis based on the user\'s refinement request.',
    '',
    REFINE_RULES,
    '',
    ANALYZE_SCHEMA,
  ].join('\n');
}

export function buildChatPrompt(ctx: ShwashaPromptContext): string {
  return [
    header(ctx),
    '',
    'Task: answer the user\'s question about the current page or paper.',
    '',
    CHAT_RULES,
  ].join('\n');
}

export function buildVisionPrompt(ctx: ShwashaPromptContext): string {
  return [
    header(ctx),
    '',
    'Task: analyze an image from the paper (figure, table, diagram, equation, or photograph of a page).',
    '',
    VISION_SCHEMA,
  ].join('\n');
}

export function buildChapterPrompt(ctx: ShwashaPromptContext): string {
  return [
    header(ctx),
    '',
    'Task: analyze an entire chapter of a book or long document.',
    '',
    CHAPTER_SCHEMA,
  ].join('\n');
}

export function buildClippingsPrompt(ctx: ShwashaPromptContext): string {
  return [
    header(ctx),
    '',
    'Task: process a batch of Kindle clippings from one book and distil them into thesis-grade notes.',
    '',
    CLIPPINGS_SCHEMA,
  ].join('\n');
}

export function buildLibrarySearchPrompt(ctx: ShwashaPromptContext): string {
  return [
    header(ctx),
    '',
    'Task: given the current paper\'s abstract or analysis, search the user\'s library for related work and gaps.',
    '',
    LIBRARY_SEARCH_SCHEMA,
  ].join('\n');
}
