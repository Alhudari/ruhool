// Heuristic chapter splitter for book-length text dumps.
// Detects chapter headings in English and Arabic; falls back to word-count windows.

export interface Chapter {
  title: string;
  content: string;
  index: number;
}

const WORDS_PER_FALLBACK_CHAPTER = 5000;

// English: "Chapter 1", "Chapter I", "CHAPTER 12", optionally followed by a title.
// Arabic: "الفصل 1", "الفصل الأول", "الباب الأول".
const CHAPTER_HEADING = new RegExp(
  [
    '^\\s*(?:Chapter|CHAPTER|Ch\\.)\\s+([IVXLCDM]+|\\d+)(?:[:.\\s\\-]+([^\\n]+))?\\s*$',
    '^\\s*(?:الفصل|الباب)\\s+([^\\n]{1,80})\\s*$',
  ].join('|'),
  'm'
);

function splitByHeadings(text: string): Chapter[] {
  const lines = text.split(/\r?\n/);
  const chapters: Chapter[] = [];
  let currentTitle = 'Preface';
  let currentBody: string[] = [];
  let index = 0;

  for (const line of lines) {
    if (CHAPTER_HEADING.test(line)) {
      if (currentBody.length > 0 || chapters.length === 0) {
        chapters.push({
          title: currentTitle,
          content: currentBody.join('\n').trim(),
          index: index++,
        });
      }
      currentTitle = line.trim();
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  if (currentBody.length > 0) {
    chapters.push({
      title: currentTitle,
      content: currentBody.join('\n').trim(),
      index: index++,
    });
  }

  // Drop any empty-content chapters that may arise from the initial placeholder.
  return chapters.filter((c) => c.content.length > 0);
}

function splitByWordCount(text: string): Chapter[] {
  const words = text.split(/\s+/);
  const chapters: Chapter[] = [];
  let index = 0;
  for (let i = 0; i < words.length; i += WORDS_PER_FALLBACK_CHAPTER) {
    const slice = words.slice(i, i + WORDS_PER_FALLBACK_CHAPTER).join(' ').trim();
    if (!slice) continue;
    chapters.push({
      title: `Part ${index + 1}`,
      content: slice,
      index: index++,
    });
  }
  return chapters;
}

export function splitIntoChapters(text: string): Chapter[] {
  if (!text || !text.trim()) return [];
  const heading = splitByHeadings(text);
  if (heading.length >= 2) return heading;
  return splitByWordCount(text);
}
