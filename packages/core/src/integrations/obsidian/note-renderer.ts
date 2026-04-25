// Renders a data payload into a Markdown note that matches an Obsidian template
// byte-for-byte (same YAML key order, same section headings, same checkbox style).
// This ensures every file Ruhool writes is indistinguishable from one the user
// wrote manually — Dataview queries keep working, graph links stay intact.

import { writeFrontmatter } from './vault-reader.js';
import type { TemplateSchema, TemplateSection } from './template-parser.js';

export interface RenderPayload {
  // YAML field overrides — keys must match the template's field names.
  fields: Record<string, unknown>;
  // Section content — keyed by heading text. Values can be:
  //   string  → plain paragraph
  //   string[] → bullet list (- item)
  //   Array<{text,done}> → checkbox list
  sections: Record<string, string | string[] | Array<{ text: string; done?: boolean }>>;
  // Optional extra sections not in the template (appended at end).
  extraSections?: Array<{ heading: string; level?: number; content: string }>;
  // Obsidian breadcrumb links to prepend (e.g. "[[🏠 Home]] → 🎓 [[PhD Dashboard]]")
  breadcrumb?: string;
}

function renderSectionContent(
  value: string | string[] | Array<{ text: string; done?: boolean }>,
  _schema?: TemplateSection
): string {
  if (typeof value === 'string') return value.trim();

  if (!Array.isArray(value)) return '';

  // Detect checkbox vs. plain bullet
  const isCheckbox = value.length > 0 && typeof value[0] === 'object' && 'text' in (value[0] as object);
  if (isCheckbox) {
    return (value as Array<{ text: string; done?: boolean }>)
      .map((t) => `- [${t.done ? 'x' : ' '}] ${t.text}`)
      .join('\n');
  }
  // Plain bullets
  return (value as string[]).map((s) => `- ${s}`).join('\n');
}

export function renderNote(schema: TemplateSchema, payload: RenderPayload): string {
  const lines: string[] = [];

  // ── Frontmatter ─────────────────────────────────────────────────────
  const mergedFields: Record<string, unknown> = {};
  for (const f of schema.fields) {
    mergedFields[f.key] = f.defaultValue;
  }
  for (const [k, v] of Object.entries(payload.fields)) {
    mergedFields[k] = v;
  }
  // Build key order: template order first, then any extras from payload.
  const extraKeys = Object.keys(payload.fields).filter((k) => !schema.fieldOrder.includes(k));
  const keyOrder = [...schema.fieldOrder, ...extraKeys];

  lines.push('---');
  lines.push(writeFrontmatter(mergedFields, keyOrder));
  lines.push('---');
  lines.push('');

  // ── Breadcrumb ───────────────────────────────────────────────────────
  const crumb = payload.breadcrumb ?? schema.breadcrumb;
  if (crumb) {
    lines.push(`> ${crumb}`);
    lines.push('');
  }

  // ── Sections from template ───────────────────────────────────────────
  for (const section of schema.sections) {
    lines.push(`${'#'.repeat(section.level)} ${section.heading}`);
    lines.push('');
    const content = payload.sections[section.heading];
    if (content !== undefined) {
      lines.push(renderSectionContent(content, section as TemplateSection));
    } else if (section.hasCheckboxes) {
      lines.push('- [ ] ');
    } else if (section.placeholder) {
      lines.push(section.placeholder);
    }
    lines.push('');
  }

  // ── Extra sections not in template ───────────────────────────────────
  if (payload.extraSections) {
    for (const extra of payload.extraSections) {
      const lvl = extra.level ?? 2;
      lines.push(`${'#'.repeat(lvl)} ${extra.heading}`);
      lines.push('');
      lines.push(extra.content.trim());
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

// ── Convenience: render a Literature Review note from Shwasha's analysis ──
// Matches the user's existing Academic Literature template format.

export interface LitNotePayload {
  citekey: string;
  type?: string;
  year?: number;
  authors?: string;
  addedOn?: string;
  url?: string;
  doi?: string;
  tags?: string[];
  keyThemes?: string[];
  aims?: string;
  methodology?: string;
  sampleTypeAndSize?: string;
  keyFindings?: string[];
  strengths?: string[];
  limitations?: string[];
  relevantToMyStudy?: string;
  whyRelevant?: string;
  keepOrDiscard?: string;
  myNotes?: string;
  abstract?: string;
  zoteroItemKey?: string;
  zoteroAttachmentKey?: string;
  // Shwasha analysis extras
  phdRelevance?: string;
  highlights?: Array<{ text: string; color: string; reason: string }>;
  arabicTakeaway?: string[];
}

export function renderLitNote(p: LitNotePayload): string {
  const fields: Record<string, unknown> = {
    Citekey: p.citekey,
    Type: p.type ?? 'journalArticle',
    Year: p.year ?? null,
    Authors: p.authors ?? null,
    Added_On: p.addedOn ?? new Date().toISOString().slice(0, 10),
    URL: p.url ?? null,
    DOI: p.doi ?? null,
    tags: p.tags ?? [],
    key_themes: p.keyThemes ?? [],
    aims: p.aims ?? null,
    research_questions: [],
    methodology: p.methodology ?? null,
    sample_type_and_size: p.sampleTypeAndSize ?? null,
    key_findings: p.keyFindings ?? [],
    strengths: p.strengths ?? [],
    limitations: p.limitations ?? [],
    relevant_to_my_study: p.relevantToMyStudy ?? null,
    why_relevant: p.whyRelevant ?? null,
    keep_or_discard: p.keepOrDiscard ?? 'Keep',
    my_notes: p.myNotes ?? null,
    PRISMA_1: null,
    PRISMA_1_stage: null,
    PRISMA_2: null,
    PRISMA_2_stage: null,
  };

  const keyOrder = [
    'Citekey', 'Type', 'Year', 'Authors', 'Added_On', 'URL', 'DOI',
    'tags', 'key_themes', 'aims', 'research_questions', 'methodology',
    'sample_type_and_size', 'key_findings', 'strengths', 'limitations',
    'relevant_to_my_study', 'why_relevant', 'keep_or_discard', 'my_notes',
    'PRISMA_1', 'PRISMA_1_stage', 'PRISMA_2', 'PRISMA_2_stage',
  ];

  const lines: string[] = [];
  lines.push('---');
  lines.push(writeFrontmatter(fields, keyOrder));
  lines.push('---');
  lines.push('');
  lines.push('> [[🏠 Home]] → 🎓 [[PhD Dashboard]] → 📚 [[Literature Review Dashboard]]');
  lines.push(`# Title: *${p.citekey}*`);
  lines.push('');

  if (p.zoteroItemKey) {
    lines.push('> [!info] Files');
    lines.push(`> - **Source:** [Zotero Link](zotero://select/library/items/${p.zoteroItemKey})`);
    if (p.zoteroAttachmentKey) {
      lines.push(`> - **PDF:** [Open PDF](zotero://select/library/items/${p.zoteroAttachmentKey})`);
    }
    lines.push('');
  }

  if (p.abstract) {
    lines.push('> [!abstract]- Abstract');
    lines.push(`> ${p.abstract.replace(/\n/g, '\n> ')}`);
    lines.push('');
  }

  if (p.phdRelevance) {
    lines.push('## 🎓 PhD Relevance');
    lines.push('');
    lines.push(p.phdRelevance);
    lines.push('');
  }

  if (p.highlights && p.highlights.length > 0) {
    lines.push('## 🔆 Highlights');
    lines.push('');
    for (const h of p.highlights) {
      lines.push(`- **[${h.color}]** ${h.text} *(${h.reason})*`);
    }
    lines.push('');
  }

  if (p.arabicTakeaway && p.arabicTakeaway.length > 0) {
    lines.push('## 📌 النقاط الرئيسية');
    lines.push('');
    for (const b of p.arabicTakeaway) {
      lines.push(`- ${b}`);
    }
    lines.push('');
  }

  if (p.myNotes) {
    lines.push('## 📝 ملاحظاتي');
    lines.push('');
    lines.push(p.myNotes);
    lines.push('');
  }

  lines.push('## 🔗 Related');
  lines.push('');
  lines.push('%%');
  lines.push('[[MOC - Academic Literature]]');
  lines.push('%%');

  return lines.join('\n').trimEnd() + '\n';
}
