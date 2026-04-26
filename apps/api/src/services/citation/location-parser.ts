import type { LocationRef } from '../../store/types.js';

/** Parse a free-text location string into a structured LocationRef. */
export function parseLocation(raw: string): LocationRef {
  const s = raw.trim();

  // Kindle combined: "Loc. 1250, p. 45" or "loc. 1250, page 45"
  const kindleCombinedMatch = s.match(
    /^(?:loc\.?\s*|location\s*)(\d+)(?:\s*[-–]\s*(\d+))?[,\s]+(?:pp?\.?\s*|pages?\s*)(\d+)/i,
  );
  if (kindleCombinedMatch) {
    const start = Number(kindleCombinedMatch[1]);
    const end = kindleCombinedMatch[2] ? Number(kindleCombinedMatch[2]) : undefined;
    const kindlePage = Number(kindleCombinedMatch[3]);
    const display = end ? `loc. ${start}–${end}` : `loc. ${start}`;
    return {
      kind: 'kindle',
      raw: s,
      display,
      start,
      end,
      kindleLoc: start,
      kindlePage,
      platform: 'kindle',
    };
  }

  // Kindle location only: "Loc. 1250", "loc 1250-1400", "Location 1250", "Loc.1250"
  const kindleMatch = s.match(/^(?:loc\.?\s*|location\s*)(\d+)(?:\s*[-–]\s*(\d+))?/i);
  if (kindleMatch) {
    const start = Number(kindleMatch[1]);
    const end = kindleMatch[2] ? Number(kindleMatch[2]) : undefined;
    const display = end ? `loc. ${start}–${end}` : `loc. ${start}`;
    return { kind: 'kindle', raw: s, display, start, end, kindleLoc: start, platform: 'kindle' };
  }

  // Pure large numbers (> 200) without page prefix → treat as Kindle location range
  const pureNumberMatch = s.match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
  if (pureNumberMatch) {
    const start = Number(pureNumberMatch[1]);
    const end = pureNumberMatch[2] ? Number(pureNumberMatch[2]) : undefined;
    // Heuristic: numbers > 200 are more likely Kindle locations than page numbers
    if (start > 200) {
      const display = end ? `loc. ${start}–${end}` : `loc. ${start}`;
      return { kind: 'kindle', raw: s, display, start, end, kindleLoc: start, platform: 'kindle' };
    }
    // Small numbers remain page references
    const display = end ? `pp. ${start}–${end}` : `p. ${start}`;
    return { kind: 'page', raw: s, display, start, end };
  }

  // Page: "p.45", "pp.45-52", "p 45", "page 45"
  const pageMatch = s.match(/^(?:pp?\.?\s*|pages?\s*)(\d+)(?:\s*[-–]\s*(\d+))?$/i);
  if (pageMatch) {
    const start = Number(pageMatch[1]);
    const end = pageMatch[2] ? Number(pageMatch[2]) : undefined;
    const display = end ? `pp. ${start}–${end}` : `p. ${start}`;
    return { kind: 'page', raw: s, display, start, end };
  }

  // Chapter: "Ch. 3", "Chapter 3", "ch3"
  const chapterMatch = s.match(/^(?:ch(?:apter)?\.?\s*)(\d+)/i);
  if (chapterMatch) {
    const start = Number(chapterMatch[1]);
    return { kind: 'chapter', raw: s, display: `ch. ${start}`, start };
  }

  // Paragraph: "¶12", "para. 12", "para 12"
  const paraMatch = s.match(/^(?:¶|para\.?\s*)(\d+)/i);
  if (paraMatch) {
    const start = Number(paraMatch[1]);
    return { kind: 'paragraph', raw: s, display: `para. ${start}`, start };
  }

  // Custom / unrecognized
  return { kind: 'custom', raw: s, display: s };
}
