const DEFAULT_MAX_CHARS = 6_000;

// FIX-22: escape attribute value to prevent broken XML
function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  ).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
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
  return [
    `<tool_result tool="${escapeAttr(toolName)}" trust="low">`,
    truncated,
    `</tool_result>`,
  ].join('\n');
}
