/**
 * @mention + vocative + summon detection.
 *
 * Extracted from index.ts (REL-01 stage 2d). The original functions read
 * `store.customAgents` directly; these versions accept the array as a
 * parameter so the module stays pure. Behavior is preserved exactly.
 */
import { MENTION_MAP } from '../../state/mentions.js';

export interface CustomAgentLike {
  id: string;
  name: { en: string; ar: string };
}

const SUMMON_PATTERNS = [
  /استدع[ي]?\s+/u,
  /أضف\s+/u,
  /نادِ?\s+/u,
  /call\s+/i,
  /add\s+/i,
  /summon\s+/i,
  /invite\s+/i,
];

/** Returns ALL @mentioned agent IDs in order. Used by sequencing. */
export function detectAllMentions(message: string, customAgents: CustomAgentLike[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const re = /@([\u0600-\u06FF\w'-]+)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) {
    const name = m[1].toLowerCase();
    const agentId = MENTION_MAP[name] || MENTION_MAP[m[1]];
    if (agentId && !seen.has(agentId)) { seen.add(agentId); ids.push(agentId); continue; }
    const ca = customAgents.find((a) => a.name.en.toLowerCase() === name || a.name.ar === m![1]);
    if (ca && !seen.has('custom-' + ca.id)) { seen.add('custom-' + ca.id); ids.push('custom-' + ca.id); }
  }
  return ids;
}

/**
 * Returns directive @mentions only — where the agent is being explicitly handed off to,
 * not merely referenced in passing. Used to decide whether to auto-trigger a chained reply.
 * Directive = @mention at line start, OR preceded by a handoff verb/pronoun within ~20 chars.
 */
export function detectDirectiveMentions(message: string, customAgents: CustomAgentLike[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const cleaned = message
    .replace(/\*\*(@[\u0600-\u06FF\w'-]+)\*\*/gu, '$1')
    .replace(/\*(@[\u0600-\u06FF\w'-]+)\*/gu, '$1')
    .replace(/_(@[\u0600-\u06FF\w'-]+)_/gu, '$1')
    .replace(/`(@[\u0600-\u06FF\w'-]+)`/gu, '$1')
    .replace(/"(@[\u0600-\u06FF\w'-]+)"/gu, '$1');

  const directivePrefix = /(^|[\n\r]|(?:\b(?:اسأل|اسال|اسالي|اسألي|اسألوا|عليك|عليكم|تفضل|تفضلي|دورك|يا|رد|ردي|ردوا|اشرح|اشرحي|ابحث|لخّص|لخص|قارن|راجع|ask|please|your turn|over to|go ahead|answer|reply|explain|research|summarize|compare|review)\b[^@\n]{0,25}))\s*@/iu;
  const re = /@([\u0600-\u06FF\w'-]+)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const start = m.index;
    const windowBefore = cleaned.slice(Math.max(0, start - 50), start + 1);
    if (!directivePrefix.test(windowBefore)) continue;
    const name = m[1].toLowerCase();
    const agentId = MENTION_MAP[name] || MENTION_MAP[m[1]];
    if (agentId && !seen.has(agentId)) { seen.add(agentId); ids.push(agentId); continue; }
    const ca = customAgents.find((a) => a.name.en.toLowerCase() === name || a.name.ar === m![1]);
    if (ca && !seen.has('custom-' + ca.id)) { seen.add('custom-' + ca.id); ids.push('custom-' + ca.id); }
  }
  return ids;
}

export function detectMention(
  message: string,
  customAgents: CustomAgentLike[]
): { agentId: string | null; cleanMessage: string; isSummon: boolean } {
  // Check @mentions first: @عبدان, @Abdan, etc.
  const mentionRegex = /@([\u0600-\u06FF\w'-]+)/gu;
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(message)) !== null) {
    const name = match[1].toLowerCase();
    const agentId = MENTION_MAP[name] || MENTION_MAP[match[1]];
    if (agentId) {
      const cleanMessage = message.replace(match[0], '').trim();
      return { agentId, cleanMessage, isSummon: false };
    }
    const customAgent = customAgents.find(
      (a) => a.name.en.toLowerCase() === name || a.name.ar === match![1]
    );
    if (customAgent) {
      const cleanMessage = message.replace(match[0], '').trim();
      return { agentId: 'custom-' + customAgent.id, cleanMessage, isSummon: false };
    }
  }

  // Vocative addressing
  const vocativePattern = /(?:^|\s)(?:يا|hey|hi|o)\s+(@?[\u0600-\u06FF\w'-]+)/iu;
  const vocMatch = message.match(vocativePattern);
  if (vocMatch) {
    const raw = vocMatch[1].replace(/^@/, '');
    const lower = raw.toLowerCase();
    const agentId = MENTION_MAP[lower] || MENTION_MAP[raw];
    if (agentId) return { agentId, cleanMessage: message, isSummon: false };
  }

  // Summon patterns
  for (const pattern of SUMMON_PATTERNS) {
    const summonMatch = message.match(pattern);
    if (summonMatch) {
      const afterKeyword = message.slice(summonMatch.index! + summonMatch[0].length).trim();
      const nameWord = afterKeyword.split(/\s/)[0];
      const agentId = MENTION_MAP[nameWord.toLowerCase()] || MENTION_MAP[nameWord];
      if (agentId) {
        return { agentId, cleanMessage: message, isSummon: true };
      }
      const customAgent = customAgents.find(
        (a) => a.name.en.toLowerCase() === nameWord.toLowerCase() || a.name.ar === nameWord
      );
      if (customAgent) {
        return { agentId: 'custom-' + customAgent.id, cleanMessage: message, isSummon: true };
      }
    }
  }

  // "اضفهم كلهم" / "add all" — summon ALL agents
  const addAllPatterns = /اضفهم كلهم|استدع الكل|اضف الكل|add all|call everyone|ناديهم كلهم/i;
  if (addAllPatterns.test(message)) {
    return { agentId: 'all', cleanMessage: message, isSummon: true };
  }

  return { agentId: null, cleanMessage: message, isSummon: false };
}
