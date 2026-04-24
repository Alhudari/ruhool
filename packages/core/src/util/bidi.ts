/**
 * Bidi utilities. Small, dependency-free, side-effect-free.
 *
 * The vault write path round-trips arbitrary user text (Arabic, English,
 * mixed). Two things we care about:
 *   1. No BOM injection.
 *   2. No stray U+200E / U+200F inserted by our writer. If the source
 *      already had them, they stay; we only avoid adding new ones.
 */

const LRM = '‎';  // Left-to-right mark
const RLM = '‏';  // Right-to-left mark
const BOM = '﻿';  // Byte-order mark

/**
 * Returns true if the text contains any directional mark. Useful for
 * tests asserting we didn't inject any.
 */
export function hasDirectionalMarks(text: string): boolean {
  return text.includes(LRM) || text.includes(RLM);
}

/** Strip a leading BOM if present. */
export function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(1) : text;
}

/**
 * Conservative strip: removes stray directional marks ONLY at the very
 * start or end of the string. Marks inside — the user may have placed
 * them intentionally between LTR and RTL runs — are preserved.
 */
export function stripSurroundingDirectionalMarks(text: string): string {
  let out = text;
  while (out.startsWith(LRM) || out.startsWith(RLM)) out = out.slice(1);
  while (out.endsWith(LRM) || out.endsWith(RLM)) out = out.slice(0, -1);
  return out;
}

/**
 * Count directional marks. Useful for metrics / fuzzy testing.
 */
export function countDirectionalMarks(text: string): { lrm: number; rlm: number } {
  const lrm = (text.match(/‎/g) ?? []).length;
  const rlm = (text.match(/‏/g) ?? []).length;
  return { lrm, rlm };
}
