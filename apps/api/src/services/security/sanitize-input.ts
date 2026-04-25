const OVERRIDE_PATTERNS: RegExp[] = [
  /أنت\s+الآن/giu,
  /أنت\s+الأن/giu,
  /you\s+are\s+now/giu,
  /ignore\s+(previous|all|prior)\s+(instructions?|prompts?)/giu,
  /تجاهل\s+(التعليمات|الأوامر|كل ما سبق)/giu,
  /forget\s+your\s+(role|instructions?|identity|prompt)/giu,
  /pretend\s+(you\s+are|to\s+be)/giu,
  /act\s+as\s+(if|though)/giu,
  /\bDAN\b/gu,
  /jailbreak/giu,
  /system\s*:\s*you\s+are/giu,
  /new\s+instructions?\s*:/giu,
];

export function sanitizeUserInput(text: string): string {
  // FIX-10: Unicode normalize to canonical form before pattern matching.
  // Defeats homoglyph attacks (e.g., math sans-serif Latin → ASCII).
  let out = text.normalize('NFKC');

  // FIX-10b: strip ASCII control characters (keep \t \n \r)
  // eslint-disable-next-line no-control-regex
  out = out.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  for (const re of OVERRIDE_PATTERNS) {
    out = out.replace(re, '[blocked]');
  }
  return out.slice(0, 10_000);
}
