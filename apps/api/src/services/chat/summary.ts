// Chat summary + section splitter — extracted from index.ts (REL-01 stage 2d final trim).

import type { MsgRecord } from '../../store/types.js';

export function generateSummary(messages: MsgRecord[]): string | null {
  if (messages.length < 2) return null;
  const userMsgs = messages.filter((m) => m.role === 'user');
  if (userMsgs.length === 0) return null;

  const topics = userMsgs.map((m) => m.content.slice(0, 60)).join(' | ');
  const lastAgent = [...messages].reverse().find((m) => m.agentId)?.agentId || 'manager';
  const agentName = lastAgent === 'research' ? '\u0639\u0628\u062f\u0627\u0646'
    : lastAgent === 'reading-helper' ? '\u0634\u0648\u0627\u0634\u0629'
    : lastAgent === 'comparator' ? '\u0631\u0645\u0651\u0627\u0646\u0629'
    : lastAgent === 'writing-critic' ? '\u0627\u0644\u0635\u0641\u0631\u0627'
    : '\u0627\u0644\u0631\u0627\u0639\u064a';

  return `[${agentName}] ${userMsgs.length} messages \u2014 ${topics}`;
}

export function splitIntoSections(text: string): { title: string; content: string }[] {
  const lines = text.split('\n');
  const sections: { title: string; content: string }[] = [];
  let currentTitle = 'Introduction';
  let currentContent: string[] = [];
  const headingPattern = /^(?:\d+\.?\s+)?(?:abstract|introduction|background|literature\s+review|methodology|method|methods|results|discussion|conclusion|conclusions|references|acknowledgments|appendix|findings|analysis|theoretical\s+framework|research\s+design|data\s+collection|limitations)/i;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && headingPattern.test(trimmed) && trimmed.length < 100) {
      if (currentContent.length > 0) {
        sections.push({ title: currentTitle, content: currentContent.join('\n').trim() });
      }
      currentTitle = trimmed.replace(/^\d+\.?\s*/, '');
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  if (currentContent.length > 0) {
    sections.push({ title: currentTitle, content: currentContent.join('\n').trim() });
  }
  return sections.length > 0 ? sections : [{ title: 'Full Text', content: text }];
}
