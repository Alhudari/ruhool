const DEFAULT_MAX_CHARS = 6_000;

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
    `<tool_result tool="${toolName}" trust="low">`,
    truncated,
    `</tool_result>`,
  ].join('\n');
}
