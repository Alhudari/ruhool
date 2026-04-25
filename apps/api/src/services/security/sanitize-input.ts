const OVERRIDE_PATTERNS: RegExp[] = [
  /أنت الآن\s/gi,
  /you are now\s/gi,
  /ignore (previous|all) instructions?/gi,
  /تجاهل التعليمات/gi,
  /forget your (role|instructions?|identity)/gi,
  /pretend (you are|to be)/gi,
  /\bDAN\b/g,
  /jailbreak/gi,
];

export function sanitizeUserInput(text: string): string {
  let out = text;
  for (const re of OVERRIDE_PATTERNS) {
    out = out.replace(re, '[blocked]');
  }
  return out.slice(0, 10_000);
}
