/**
 * Wikilinks parser utilities.
 * Handles [[Target Name]] and [[Target Name|Display Text]] syntax
 * for the platform knowledge graph system.
 */

/** Extract all [[Target Name]] links from a block of text */
export function extractWikilinks(text: string): string[] {
  const matches = text.matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g);
  return [...matches].map(m => m[1].trim());
}

/** Replace [[Name]] with [[Name|displayText]] for aliasing */
export function resolveWikilinkAlias(text: string): Array<{ raw: string; target: string; alias?: string }> {
  const matches = [...text.matchAll(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g)];
  return matches.map(m => ({ raw: m[0], target: m[1].trim(), alias: m[2]?.trim() }));
}
