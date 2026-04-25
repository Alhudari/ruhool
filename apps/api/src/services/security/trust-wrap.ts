const DEFAULT_MAX_CHARS = 6_000;

// FIX-22: escape attribute value to prevent broken XML
function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  ).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
}

// F-004: prevent breakout via </tool_result> in untrusted content.
// We can't HTML-escape because LLMs don't unescape entities, so instead we
// neutralize any </tool_result> sequence by inserting a zero-width space.
function neutralizeBreakout(s: string): string {
  // Match </tool_result> with any whitespace/case variant
  return s.replace(/<\s*\/\s*tool_result\s*>/gi, '<​/tool_result>');
}

export function wrapToolResult(
  toolName: string,
  result: string,
  opts?: { maxChars?: number }
): string {
  const MAX = opts?.maxChars ?? DEFAULT_MAX_CHARS;
  const truncated = result.length > MAX
    ? result.slice(0, MAX) + `\n\n[مقتطع — ${result.length - MAX} حرف إضافي / truncated]`
    : result;
  // F-004: neutralize any </tool_result> sequence so external content can't
  // break out of the wrapper and inject pseudo-system text.
  const safeBody = neutralizeBreakout(truncated);
  return [
    `<tool_result tool="${escapeAttr(toolName)}" trust="low">`,
    safeBody,
    `</tool_result>`,
  ].join('\n');
}
