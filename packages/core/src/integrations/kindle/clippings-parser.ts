// Pure parser for the Kindle "My Clippings.txt" format.
// Each entry is 4 lines separated by a line of exactly 10 '=' characters.
// Handles both English and Arabic books, note/highlight/bookmark types.

export type ClippingType = 'highlight' | 'note' | 'bookmark';

export interface Clipping {
  book: string;
  author?: string;
  type: ClippingType;
  text: string;
  page?: number;
  location?: string;
  date?: string;
}

const ENTRY_SEPARATOR = /\r?\n={10}\r?\n/;

function parseBookAndAuthor(line: string): { book: string; author?: string } {
  // Kindle wraps the author in the LAST parenthesised chunk.
  const match = line.match(/^(.*)\s+\(([^()]+)\)\s*$/);
  if (match) {
    return { book: match[1].trim(), author: match[2].trim() };
  }
  return { book: line.trim() };
}

function parseType(metaLine: string): ClippingType {
  const lower = metaLine.toLowerCase();
  // English markers.
  if (lower.includes('your note') || lower.includes('- note ')) return 'note';
  if (lower.includes('your bookmark') || lower.includes('- bookmark')) return 'bookmark';
  if (lower.includes('your highlight') || lower.includes('- highlight') || lower.includes('- your highlight'))
    return 'highlight';
  // Arabic markers.
  if (metaLine.includes('ملاحظتك') || metaLine.includes('ملاحظة')) return 'note';
  if (metaLine.includes('إشارة مرجعية') || metaLine.includes('علامة مرجعية')) return 'bookmark';
  if (metaLine.includes('تظليلك') || metaLine.includes('تمييزك') || metaLine.includes('اقتباسك'))
    return 'highlight';
  return 'highlight';
}

function parseMetaLine(metaLine: string): {
  type: ClippingType;
  page?: number;
  location?: string;
  date?: string;
} {
  const type = parseType(metaLine);

  let page: number | undefined;
  const pageMatchEn = metaLine.match(/page\s+(\d+)/i);
  if (pageMatchEn) page = Number(pageMatchEn[1]);
  const pageMatchAr = metaLine.match(/صفحة\s+(\d+)/);
  if (!page && pageMatchAr) page = Number(pageMatchAr[1]);

  let location: string | undefined;
  const locMatchEn = metaLine.match(/loc(?:ation)?\.?\s+([\d\-]+)/i);
  if (locMatchEn) location = locMatchEn[1];
  const locMatchAr = metaLine.match(/موقع\s+([\d\-]+)/);
  if (!location && locMatchAr) location = locMatchAr[1];

  let date: string | undefined;
  // The date typically follows "Added on" or "أضيفت في".
  const dateMatch =
    metaLine.match(/Added on\s+(.+?)\s*$/i) || metaLine.match(/أضيف[تة]?\s+(?:في|بتاريخ)\s+(.+?)\s*$/);
  if (dateMatch) date = dateMatch[1].trim();

  return { type, page, location, date };
}

export function parseClippings(text: string): Clipping[] {
  if (!text || !text.trim()) return [];
  // Strip a leading BOM if present.
  const normalized = text.replace(/^\uFEFF/, '');
  const chunks = normalized.split(ENTRY_SEPARATOR);
  const out: Clipping[] = [];

  for (const chunk of chunks) {
    const rawLines = chunk.split(/\r?\n/);
    const nonEmpty = rawLines.filter((l) => l.trim().length > 0);
    if (nonEmpty.length < 2) continue;

    const bookLine = nonEmpty[0];
    const metaLine = nonEmpty[1];

    const { book, author } = parseBookAndAuthor(bookLine);
    const { type, page, location, date } = parseMetaLine(metaLine);

    // The body is everything after the meta line, rejoined with preserved newlines.
    const metaIdx = rawLines.indexOf(metaLine);
    const body = rawLines.slice(metaIdx + 1).join('\n').trim();

    if (!book) continue;
    if (type !== 'bookmark' && !body) continue;

    out.push({
      book,
      author,
      type,
      text: body,
      page,
      location,
      date,
    });
  }

  return out;
}
