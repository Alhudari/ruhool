/**
 * PlayMaker routing helper.
 *
 * Extracted from index.ts (REL-01 stage 2d). A tiny Haiku call that returns a
 * JSON routing hint based on the user's latest message + recent conversation
 * context. Low temperature, tiny token budget. Failures return null so the
 * caller falls back to the existing router.
 *
 * Deps are injected (provider + logger + system prompt) so the module stays
 * pure and test-friendly.
 */

export interface PlayMakerProvider {
  chat: (input: {
    model: string;
    systemPrompt?: string;
    messages: Array<{ role: string; content: string }>;
    maxTokens?: number;
    temperature?: number;
  }) => AsyncIterable<{ type: string; content?: string }>;
}

export interface PlayMakerLogger {
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface AskPlayMakerDeps {
  provider: PlayMakerProvider | null;
  systemPrompt: string;
  logger: PlayMakerLogger;
}

export interface AskPlayMakerInput {
  message: string;
  recentHistory: Array<{ role: string; content: string; agentId?: string; id?: string }>;
  activeParticipants: string[];
  hasImages: boolean;
}

export interface PlayMakerHint {
  targetAgents?: string[];
  continuation?: boolean;
  topic?: string;
  replyToMessageId?: string | null;
  confidence?: number;
}

export async function askPlayMaker(
  opts: AskPlayMakerInput,
  deps: AskPlayMakerDeps
): Promise<PlayMakerHint | null> {
  try {
    const { provider, systemPrompt } = deps;
    if (!provider) return null;

    const recent = opts.recentHistory.slice(-6).map((m) =>
      `{id:${m.id?.slice(0, 8) || '-'}, role:${m.role}, agent:${m.agentId || '-'}, text:"${(m.content || '').slice(0, 240)}"}`
    ).join('\n');
    const sys = (systemPrompt || '').trim();
    const nowKw = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kuwait', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'long',
    }).format(new Date());
    const userBlock = `الوقت الآن (الكويت): ${nowKw}

الرسالة الجديدة: "${opts.message.slice(0, 600)}"
المشاركون النشطون: [${opts.activeParticipants.join(', ')}]
صور مرفقة: ${opts.hasImages ? 'نعم' : 'لا'}
آخر رسائل:
${recent || '(لا يوجد سابق)'}

الوكلاء المتاحون: manager, research, reading-helper, comparator, writing-critic, architect, content-creator, creative, tasks-agent, analyst, munazzim, mushakhkhis, fatin

أصدِر JSON فقط.`;
    let out = '';
    for await (const chunk of provider.chat({
      model: 'claude-haiku-4-5-20251001',
      systemPrompt: sys,
      messages: [{ role: 'user', content: userBlock }],
      maxTokens: 220,
      temperature: 0.1,
    })) {
      if (chunk.type === 'text') out += chunk.content ?? '';
      if (chunk.type === 'done' || chunk.type === 'error') break;
    }
    const match = out.match(/```json\s*([\s\S]*?)\s*```/) || out.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const jsonStr = match[1] || match[0];
    const parsed = JSON.parse(jsonStr);
    return parsed;
  } catch (err) {
    deps.logger.warn({ err }, '[playmaker] failed');
    return null;
  }
}
