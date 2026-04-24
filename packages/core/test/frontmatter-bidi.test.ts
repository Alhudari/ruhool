import { describe, it, expect } from 'vitest';
import { parseFrontmatter, writeFrontmatter, splitFrontmatter } from '../src/integrations/obsidian/vault-reader.js';

/**
 * Bidi robustness for the vault write path. When tags or abstract text
 * contain Arabic + embedded LTR (DOIs, URLs, Latin names), round-
 * tripping through parse → write must not insert or strip directional
 * marks, and must keep the original YAML valid.
 */

describe('frontmatter bidi round-trip', () => {
  it('preserves an Arabic tag list with embedded LTR DOI', () => {
    const original =
      '---\n' +
      'tags:\n' +
      '  - "تبني BIM"\n' +
      '  - "الكويت"\n' +
      'zoteroItemKey: ABC1234\n' +
      'doi: 10.1016/j.autcon.2024.105678\n' +
      '---\n' +
      'content body\n';

    const split = splitFrontmatter(original);
    expect(split.body.trim()).toBe('content body');

    const { data, keyOrder } = parseFrontmatter(split.yaml);
    expect(data.zoteroItemKey).toBe('ABC1234');
    expect(Array.isArray(data.tags)).toBe(true);

    const rewritten = writeFrontmatter(data, keyOrder);
    // No U+200E / U+200F injected by our writer.
    expect(rewritten).not.toMatch(/[‎‏]/);
    // No BOM.
    expect(rewritten.charCodeAt(0)).not.toBe(0xFEFF);
    // All original keys still present.
    expect(rewritten).toMatch(/zoteroItemKey:/);
    expect(rewritten).toMatch(/doi:/);
  });

  it('strips quotes consistently on Arabic tag values', () => {
    const { data } = parseFrontmatter('tags:\n  - "نهج مختلط"\n  - منهجية\n');
    expect(data.tags).toEqual(['نهج مختلط', 'منهجية']);
  });

  it('preserves original directional marks if the source already has them', () => {
    const withMark = '---\nnote: "ضع ‎here‎ إذا لزم"\n---\nbody\n';
    const { yaml } = splitFrontmatter(withMark);
    const { data, keyOrder } = parseFrontmatter(yaml);
    const out = writeFrontmatter(data, keyOrder);
    // Our writer preserves the marks inside the value (source stays).
    expect(out).toContain('‎');
  });
});
