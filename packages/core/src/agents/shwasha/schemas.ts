import { z } from 'zod';

export const HighlightColorSchema = z.enum([
  'yellow',
  'green',
  'red',
  'blue',
  'purple',
  'orange',
]);

export const HighlightSchema = z.object({
  text: z.string(),
  color: HighlightColorSchema,
  reason: z.string(),
});

export const LibraryLinkSchema = z.object({
  exists: z.boolean(),
  paper: z.string().nullish(),
  note: z.string().nullish(),
});

export const AnalyzeResultSchema = z.object({
  main_idea: z.string(),
  // Nullable because the prompt says "empty string if none fits" but Claude
  // sometimes emits null instead. Normalize both to empty string downstream.
  table_data: z.string().nullish().transform((v) => v ?? ''),
  library_link: LibraryLinkSchema,
  phd_relevance: z.string(),
  tags: z.array(z.string()),
  highlights: z.array(HighlightSchema),
  question: z.string().nullable(),
  // Always-Arabic short bullet takeaway, regardless of the main analysis
  // language. Tells the reader what to focus on in their own tongue.
  arabic_takeaway: z.array(z.string()).default([]),
});

export const VisionResultSchema = z.object({
  content_type: z.enum(['figure', 'table', 'diagram', 'equation', 'photo', 'text']),
  extracted_content: z.string(),
  description: z.string(),
  mermaid_diagram: z.string().nullable(),
  data_table: z.string().nullable(),
  phd_relevance: z.string(),
  highlights: z.array(HighlightSchema),
});

export const ChapterResultSchema = z.object({
  chapter_title: z.string(),
  summary: z.string(),
  key_points: z.array(z.string()),
  methods_used: z.array(z.string()),
  findings: z.array(z.string()),
  phd_relevance: z.string(),
  questions_raised: z.array(z.string()),
  tags: z.array(z.string()),
});

export const ClippingsBestHighlightSchema = z.object({
  text: z.string(),
  why: z.string(),
});

export const ClippingsResultSchema = z.object({
  book_summary: z.string(),
  key_themes: z.array(z.string()),
  phd_connections: z.string(),
  best_highlights: z.array(ClippingsBestHighlightSchema),
  tags: z.array(z.string()),
  obsidian_note: z.string(),
});

export const LibrarySearchSimilarPaperSchema = z.object({
  title: z.string(),
  reason: z.string(),
});

export const LibrarySearchResultSchema = z.object({
  similar_papers: z.array(LibrarySearchSimilarPaperSchema),
  thematic_connections: z.array(z.string()),
  gap_identified: z.string(),
});

export type HighlightColor = z.infer<typeof HighlightColorSchema>;
export type Highlight = z.infer<typeof HighlightSchema>;
export type LibraryLinkResult = z.infer<typeof LibraryLinkSchema>;
export type AnalyzeResult = z.infer<typeof AnalyzeResultSchema>;
export type VisionResult = z.infer<typeof VisionResultSchema>;
export type ChapterResult = z.infer<typeof ChapterResultSchema>;
export type ClippingsResult = z.infer<typeof ClippingsResultSchema>;
export type LibrarySearchResult = z.infer<typeof LibrarySearchResultSchema>;
