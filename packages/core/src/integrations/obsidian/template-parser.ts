// Reads an Obsidian template file from 88 Templates/ and extracts:
//   1. The YAML frontmatter schema (key + default value)
//   2. Section headings with their expected content type
//   3. Checkbox slots (tasks)
// Output is a TemplateSchema JSON that note-renderer uses to produce matching notes.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { getVaultRoot, parseFrontmatter, splitFrontmatter } from './vault-reader.js';

export interface TemplateField {
  key: string;
  defaultValue: unknown;
  kind: 'scalar' | 'array';
}

export interface TemplateSection {
  level: number;
  heading: string;
  hasCheckboxes: boolean;
  placeholder?: string;
}

export interface TemplateSchema {
  name: string;           // e.g. "Supervision Interaction Points"
  templatePath: string;   // vault-relative
  fields: TemplateField[];
  fieldOrder: string[];
  sections: TemplateSection[];
  breadcrumb?: string;    // the [[link]] breadcrumb line if present
  rawBody: string;        // body after frontmatter (DataviewJS stripped)
}

const TEMPLATES_DIR = '88 Templates';

// DataviewJS blocks are runtime Obsidian code — strip them from the rendered output.
function stripDataviewBlocks(body: string): string {
  return body
    .replace(/```dataviewjs[\s\S]*?```/g, '')
    .replace(/```dataview[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractBreadcrumb(body: string): string | undefined {
  const m = body.match(/^>\s+(\[\[.*?\]\].*?)\s*$/m);
  return m ? m[1] : undefined;
}

export async function parseTemplate(templateName: string): Promise<TemplateSchema> {
  const root = getVaultRoot();
  const relPath = `${TEMPLATES_DIR}/${templateName}.md`;
  const absPath = path.join(root, relPath);
  const text = await fs.readFile(absPath, 'utf8');

  const { yaml, body: rawBodyFull } = splitFrontmatter(text);
  const { data, keyOrder } = yaml ? parseFrontmatter(yaml) : { data: {}, keyOrder: [] };

  const fields: TemplateField[] = keyOrder.map((key) => ({
    key,
    defaultValue: data[key] ?? null,
    kind: Array.isArray(data[key]) ? 'array' : 'scalar',
  }));

  const body = stripDataviewBlocks(rawBodyFull);
  const breadcrumb = extractBreadcrumb(body);

  const lines = body.split(/\r?\n/);
  const sections: TemplateSection[] = [];
  let currentSection: TemplateSection | null = null;
  let sectionLines: string[] = [];

  const flushSection = () => {
    if (!currentSection) return;
    const hasCheckboxes = sectionLines.some((l) => /^\s*-\s+\[[ x]\]/.test(l));
    const placeholder = sectionLines
      .find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('%%') && !l.startsWith('>'))
      ?.trim();
    sections.push({
      ...currentSection,
      hasCheckboxes,
      placeholder: placeholder === 'N/A' ? undefined : placeholder,
    });
    sectionLines = [];
  };

  for (const line of lines) {
    const h = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (h) {
      flushSection();
      currentSection = { level: h[1].length, heading: h[2].trim(), hasCheckboxes: false };
    } else {
      sectionLines.push(line);
    }
  }
  flushSection();

  return {
    name: templateName,
    templatePath: relPath,
    fields,
    fieldOrder: keyOrder,
    sections,
    breadcrumb,
    rawBody: body,
  };
}

// List all available template names (filenames without .md in 88 Templates/).
export async function listTemplates(): Promise<string[]> {
  const root = getVaultRoot();
  const dir = path.join(root, TEMPLATES_DIR);
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name.replace(/\.md$/, ''))
    .sort();
}
