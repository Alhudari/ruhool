/**
 * Graph extractor — extracted from the god-file (index.ts) as part of
 * REL-01 stage 2d.
 *
 * Background Haiku call that extracts entities + relations from the last
 * user/assistant exchange and upserts into the knowledge graph.
 *
 * Factory pattern with all deps injected — no module-level singletons.
 */
import { graphUpsertNode, graphUpsertEdge, type StoreLike as AgentOSStore } from '../../agent-os.js';
import type { StoreData } from '../../store/types.js';

export interface GraphExtractorLogger {
  warn: (obj: unknown, msg?: string) => void;
}

export interface GraphExtractorProvider {
  chat: (params: {
    model: string;
    systemPrompt?: string;
    messages: Array<{ role: string; content: string }>;
    maxTokens?: number;
    temperature?: number;
  }) => AsyncIterable<{ type: string; content?: string }>;
}

export interface GraphExtractorDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  getProvider: () => GraphExtractorProvider | null;
  extractedMessages: Set<string>;
  logger: GraphExtractorLogger;
}

export function createGraphExtractor(deps: GraphExtractorDeps) {
  const { getStore, saveStore, getProvider, extractedMessages, logger } = deps;

  async function extractGraphFromMessage(
    convId: string,
    userMsgId: string,
    assistantMsgId: string,
  ): Promise<void> {
    const key = userMsgId + ':' + assistantMsgId;
    if (extractedMessages.has(key)) return;
    extractedMessages.add(key);
    try {
      const provider = getProvider();
      if (!provider) return;
      const store = getStore();

      const userMsg = store.messages.find((m) => m.id === userMsgId);
      const asstMsg = store.messages.find((m) => m.id === assistantMsgId);
      if (!userMsg || !asstMsg) return;
      const nowIso = new Date().toISOString();
      const combined = `[الوقت الآن: ${nowIso}]\nUSER: ${userMsg.content}\nASSISTANT (${asstMsg.agentId || 'agent'}): ${asstMsg.content}`.slice(0, 4000);

      const sys = `أنت مستخرج كيانات/علاقات صامت. ادرس المقطع التالي وأصدر JSON فقط:
{
  "nodes": [ { "type": "person|project|organization|agreement|appointment|topic", "label": "الاسم", "props": {} } ],
  "edges": [ { "from": "labelA", "to": "labelB", "relation": "works-at|owns|responsible-for|scheduled-on|related-to|..." } ]
}
- لا تخترع. استخرج فقط ما هو مذكور صراحة.
- أسماء الأعلام فقط. لا تستخرج ضمائر ولا عموميات.
- JSON في بلوك \`\`\`json ... \`\`\`. لا نص آخر.`;

      let out = '';
      for await (const chunk of provider.chat({
        model: 'claude-haiku-4-5-20251001',
        systemPrompt: sys,
        messages: [{ role: 'user', content: combined }],
        maxTokens: 400,
        temperature: 0.1,
      })) {
        if (chunk.type === 'text' && chunk.content) out += chunk.content;
        if (chunk.type === 'done' || chunk.type === 'error') break;
      }
      const match = out.match(/```json\s*([\s\S]*?)\s*```/) || out.match(/\{[\s\S]*\}/);
      if (!match) return;
      const parsed = JSON.parse(match[1] || match[0]) as {
        nodes?: Array<{ type: string; label: string; props?: Record<string, string | number | boolean> }>;
        edges?: Array<{ from: string; to: string; relation: string }>;
      };
      const agentOsStore = store as unknown as AgentOSStore;
      let changed = false;
      for (const n of parsed.nodes || []) {
        if (!n.label || !n.type) continue;
        graphUpsertNode(agentOsStore, {
          type: n.type as 'person' | 'project' | 'organization' | 'agreement' | 'appointment' | 'topic' | 'other',
          label: n.label, props: n.props,
          sourceConversationId: convId, sourceMessageId: assistantMsgId,
          confidence: 0.6,
        });
        changed = true;
      }
      for (const e of parsed.edges || []) {
        if (!e.from || !e.to || !e.relation) continue;
        const findOrCreate = (label: string) => {
          const existing = (agentOsStore.graphNodes || []).find((n) => n.label.toLowerCase() === label.toLowerCase());
          if (existing) return existing;
          return graphUpsertNode(agentOsStore, { type: 'other', label, confidence: 0.4, sourceConversationId: convId });
        };
        const from = findOrCreate(e.from);
        const to = findOrCreate(e.to);
        graphUpsertEdge(agentOsStore, {
          from: from.id, to: to.id, relation: e.relation,
          sourceConversationId: convId, sourceMessageId: assistantMsgId,
          confidence: 0.6,
        });
        changed = true;
      }
      if (changed) saveStore();
    } catch (err) {
      logger.warn({ err }, '[graph-extractor] failed');
    }
  }

  return { extractGraphFromMessage };
}
