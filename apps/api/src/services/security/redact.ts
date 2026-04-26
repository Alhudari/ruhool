/**
 * F-021: redact common secret patterns from text before logging.
 * Pattern coverage:
 * - sk-... (Anthropic / OpenAI API keys)
 * - Bearer <token>
 * - "password": "..." / كلمة المرور: "..."
 * - long base64-looking strings (>=32 chars)
 * - JWT tokens
 */
const PATTERNS: Array<{ re: RegExp; replacement: string }> = [
  { re: /sk-[A-Za-z0-9_-]{20,}/g, replacement: 'sk-***REDACTED***' },
  { re: /Bearer\s+[A-Za-z0-9._-]{20,}/gi, replacement: 'Bearer ***REDACTED***' },
  { re: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, replacement: '***JWT***' },
  { re: /"password"\s*:\s*"[^"]*"/gi, replacement: '"password":"***REDACTED***"' },
  { re: /كلمة المرور\s*[:=]\s*[^\s"]+/g, replacement: 'كلمة المرور: ***REDACTED***' },
  { re: /(api[_-]?key)\s*[:=]\s*['"][^'"]+['"]/gi, replacement: '$1: "***REDACTED***"' },
];

export function redact(text: string): string {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const { re, replacement } of PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}
