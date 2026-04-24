import type { LocationRef } from '../../store/types.js';

export type CitationStyle = 'harvard' | 'birmingham' | 'apa';

export interface CitationMeta {
  authors?: string;
  year?: number;
  title?: string;
  publisher?: string;
  edition?: string;
  city?: string;
  doi?: string;
  journal?: string;
  volume?: string;
  issue?: string;
  isKindleEdition?: boolean;
  /** Kindle ASIN — stable identifier for the specific Kindle edition */
  kindleAsin?: string;
  /** Google Books volume ID */
  googleBooksId?: string;
  itemType?: 'book' | 'journalArticle' | 'bookSection' | 'report' | 'thesis' | 'webpage';
}

/**
 * Format an in-text citation (parenthetical).
 * e.g. (Smith, 2022, p. 45) or (Smith & Jones, 2022, loc. 1250)
 */
export function formatInText(meta: CitationMeta, location?: LocationRef, style: CitationStyle = 'harvard'): string {
  const authorPart = formatAuthorsInText(meta.authors ?? 'Unknown', style);
  const yearPart = meta.year ? String(meta.year) : 'n.d.';
  const locPart = location ? formatLocationInText(location, meta) : '';

  if (style === 'apa') {
    return `(${authorPart}, ${yearPart}${locPart ? ', ' + locPart : ''})`;
  }
  // Harvard and Birmingham share in-text format
  return `(${authorPart}, ${yearPart}${locPart ? ', ' + locPart : ''})`;
}

/**
 * Format a full reference list entry.
 */
export function formatReference(meta: CitationMeta, style: CitationStyle = 'harvard'): string {
  const type = meta.itemType ?? 'book';

  if (type === 'journalArticle') return formatJournalRef(meta, style);
  if (type === 'bookSection') return formatChapterRef(meta, style);
  return formatBookRef(meta, style);
}

// ── Location formatting ────────────────────────────────────────────────────

function formatLocationInText(loc: LocationRef, meta: CitationMeta): string {
  if (loc.platform === 'kindle' || loc.kind === 'kindle' || meta.isKindleEdition || meta.kindleAsin) {
    // Harvard/Birmingham: prefer page number if available (stable Print Replica pages)
    if (loc.kindlePage) return `p. ${loc.kindlePage}`;
    if (loc.start) return `Kindle, loc. ${loc.start}${loc.end ? '–' + loc.end : ''}`;
    return `Kindle, ${loc.display}`;
  }
  if (loc.platform === 'google-books') {
    // Google Books: page number matches print edition — cite as normal page
    return loc.display;
  }
  return loc.display;
}

// ── Authors formatting ─────────────────────────────────────────────────────

function formatAuthorsInText(authors: string, style: CitationStyle): string {
  // Split on " and " or ", " to count authors
  const parts = authors.split(/\s+and\s+|,\s+(?=[A-Z])/i).filter(Boolean);
  if (parts.length === 0) return 'Unknown';
  if (parts.length === 1) return getLastName(parts[0]);
  if (parts.length === 2) {
    const sep = style === 'apa' ? ' & ' : ' and ';
    return `${getLastName(parts[0])}${sep}${getLastName(parts[1])}`;
  }
  return `${getLastName(parts[0])} et al.`;
}

function formatAuthorsRef(authors: string, style: CitationStyle): string {
  const parts = authors.split(/\s+and\s+/i).map(a => a.trim()).filter(Boolean);
  if (parts.length === 0) return 'Unknown';

  const formatted = parts.map((a, i) => {
    // First author: Lastname, F. — subsequent: F. Lastname (Harvard/Birmingham)
    if (style === 'apa') return formatAuthorAPA(a, i === 0);
    return formatAuthorHarvard(a, i === 0);
  });

  if (formatted.length <= 3) {
    const sep = style === 'apa' ? ', & ' : ' and ';
    return formatted.slice(0, -1).join(', ') + (formatted.length > 1 ? sep : '') + formatted[formatted.length - 1];
  }
  return formatted[0] + ' et al.';
}

function formatAuthorHarvard(author: string, isFirst: boolean): string {
  // Input: "John Smith" or "Smith, John" → output: "Smith, J."
  const parts = author.includes(',')
    ? [author.split(',')[0].trim(), author.split(',')[1].trim()]
    : author.trim().split(/\s+/);
  const last = parts[0];
  const first = parts.length > 1 ? parts[parts.length - 1] : '';
  const initial = first ? first[0].toUpperCase() + '.' : '';
  return isFirst ? `${last}, ${initial}` : `${initial} ${last}`.trim();
}

function formatAuthorAPA(author: string, _isFirst: boolean): string {
  const parts = author.includes(',')
    ? [author.split(',')[0].trim(), author.split(',').slice(1).join(',').trim()]
    : author.trim().split(/\s+/);
  const last = parts[0];
  const first = parts.length > 1 ? parts.slice(1).join(' ') : '';
  const initials = first ? first.split(/\s+/).map(n => n[0].toUpperCase() + '.').join(' ') : '';
  return `${last}, ${initials}`.trim().replace(/,\s*$/, '');
}

function getLastName(author: string): string {
  if (author.includes(',')) return author.split(',')[0].trim();
  const parts = author.trim().split(/\s+/);
  return parts[parts.length - 1];
}

// ── Reference builders ─────────────────────────────────────────────────────

function formatBookRef(meta: CitationMeta, style: CitationStyle): string {
  const authors = formatAuthorsRef(meta.authors ?? 'Unknown', style);
  const year = meta.year ? `(${meta.year})` : '(n.d.)';
  const title = meta.title ? `*${meta.title}*` : '*Untitled*';
  const edition = meta.edition ? ` ${meta.edition} edn.` : '';
  // [Kindle edition] when flagged via isKindleEdition OR when a Kindle ASIN is present
  const kindleTag = meta.isKindleEdition || meta.kindleAsin ? ' [Kindle edition]' : '';
  // [Google Books] annotation for transparency when a Google Books ID is present
  const googleTag = !kindleTag && meta.googleBooksId ? ' [Google Books]' : '';
  const platformTag = kindleTag || googleTag;
  const place = meta.city ?? 'n.p.';
  const pub = meta.publisher ?? 'n.p.';

  if (style === 'apa') {
    return `${authors} ${year}. ${title}${edition}${platformTag}. ${pub}.`;
  }
  // Harvard / Birmingham
  return `${authors} ${year} ${title}.${edition}${platformTag} ${place}: ${pub}.`;
}

function formatJournalRef(meta: CitationMeta, style: CitationStyle): string {
  const authors = formatAuthorsRef(meta.authors ?? 'Unknown', style);
  const year = meta.year ? `(${meta.year})` : '(n.d.)';
  const title = meta.title ?? 'Untitled';
  const journal = meta.journal ? `*${meta.journal}*` : '*Unknown Journal*';
  const vol = meta.volume ?? '';
  const issue = meta.issue ? `(${meta.issue})` : '';
  const doi = meta.doi ? ` https://doi.org/${meta.doi}` : '';

  if (style === 'apa') {
    return `${authors} ${year}. ${title}. ${journal}, ${vol}${issue}.${doi}`;
  }
  return `${authors} ${year} '${title}', ${journal}, ${vol}${issue}.${doi}`;
}

function formatChapterRef(meta: CitationMeta, style: CitationStyle): string {
  const authors = formatAuthorsRef(meta.authors ?? 'Unknown', style);
  const year = meta.year ? `(${meta.year})` : '(n.d.)';
  const chTitle = meta.title ?? 'Untitled chapter';
  const bookTitle = meta.publisher ?? 'Unknown book'; // reuse publisher for book title in chapter
  const place = meta.city ?? 'n.p.';

  if (style === 'apa') {
    return `${authors} ${year}. ${chTitle}. In *${bookTitle}*. ${place}.`;
  }
  return `${authors} ${year} '${chTitle}', in *${bookTitle}*. ${place}.`;
}

// ── Platform citation guidance ─────────────────────────────────────────────

/** Guidance shown to user when they add a Kindle location */
export const KINDLE_CITATION_GUIDANCE = {
  ar: 'استخدم رقم الـ Location (Loc.) وليس رقم الصفحة المتغير. لو الكتاب فيه صفحات مطابقة للطبعة الورقية (Print Replica) استخدم رقم الصفحة مباشرة.',
  en: 'Use the stable Kindle Location number (Loc. XXXX), not the page number which changes with font size. For Print Replica books that show fixed page numbers, use the page number directly.',
};

export const GOOGLE_BOOKS_GUIDANCE = {
  ar: 'أرقام صفحات Google Books مطابقة للطبعة الورقية — استخدمها مباشرة في الاستشهاد.',
  en: 'Google Books page numbers match the print edition — use them directly for citations.',
};
