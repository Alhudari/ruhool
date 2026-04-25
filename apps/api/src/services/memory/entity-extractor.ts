import type { MemoryEntityKind } from '../../store/types.js';

export interface ExtractedEntity {
  type: MemoryEntityKind;
  name: string;
}

// C-7: Pattern-based entity extraction — no additional LLM call
export function extractEntities(text: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  const add = (type: MemoryEntityKind, name: string) => {
    const key = `${type}:${name.trim().toLowerCase()}`;
    if (!seen.has(key) && name.trim().length >= 3) {
      seen.add(key);
      entities.push({ type, name: name.trim() });
    }
  };

  // Papers: quoted titles (20-120 chars)
  const papers = text.match(/"([^"]{20,120})"/g) ?? [];
  for (const p of papers) add('paper', p.replace(/"/g, ''));

  // Papers: DOI pattern
  const dois = text.match(/doi\.org\/[^\s)>]+/g) ?? [];
  for (const d of dois) add('paper', d);

  // Persons: after title words
  const persons = text.match(
    /(?:الأستاذ|الدكتور|الباحث|المهندس|Dr\.|Prof\.|Mr\.|Ms\.)\s+([A-Za-zا-ي][A-Za-zا-ي\s]{2,30})/g
  ) ?? [];
  for (const p of persons) add('person', p);

  // Decisions: Arabic decision markers
  const decisions = text.match(/(?:قررنا|تم الاتفاق|تقرر|تقرّر|القرار)[^.،\n]{10,100}/g) ?? [];
  for (const d of decisions) add('decision', d);

  // Projects
  const projects = text.match(/مشروع\s+["«]?([^"«»،.\n]{3,40})["»]?/g) ?? [];
  for (const p of projects) add('project', p.replace(/مشروع\s*/, '').replace(/[«»"]/g, ''));

  // Concepts: terms in English parentheses (technical terms)
  const concepts = text.match(/\(([A-Za-z][A-Za-z\s-]{3,30})\)/g) ?? [];
  for (const c of concepts) add('concept', c.replace(/[()]/g, ''));

  return entities.slice(0, 12);
}
