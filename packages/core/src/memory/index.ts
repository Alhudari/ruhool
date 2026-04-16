import { eq, and, desc } from 'drizzle-orm';
import type { Database } from '@ruhool/db';
import { memories, auditLog } from '@ruhool/db';
import type { MemoryTier } from '@ruhool/shared';
import { eventBus } from '../events/index.js';

export class MemoryStore {
  constructor(private db: Database) {}

  async create(params: {
    agentId: string;
    tier: MemoryTier;
    content: string;
    sourceConversationId?: string;
    confidence?: number;
  }) {
    const [memory] = await this.db
      .insert(memories)
      .values({
        agentId: params.agentId,
        tier: params.tier,
        content: params.content,
        sourceConversationId: params.sourceConversationId,
        confidence: params.confidence ?? 1.0,
      })
      .returning();

    await this.db.insert(auditLog).values({
      action: 'memory:create',
      actor: params.agentId,
      target: memory.id,
      detailsJson: { tier: params.tier, contentPreview: params.content.slice(0, 100) },
    });

    eventBus.emit({ type: 'memory:created', agentId: params.agentId, memoryId: memory.id });
    return memory;
  }

  async getByAgent(agentId: string, tier?: MemoryTier) {
    const conditions = tier
      ? and(eq(memories.agentId, agentId), eq(memories.tier, tier))
      : eq(memories.agentId, agentId);

    return this.db
      .select()
      .from(memories)
      .where(conditions)
      .orderBy(desc(memories.lastAccessedAt));
  }

  async getById(id: string) {
    const [memory] = await this.db
      .select()
      .from(memories)
      .where(eq(memories.id, id));
    return memory || null;
  }

  async update(id: string, content: string, actor = 'user') {
    const [updated] = await this.db
      .update(memories)
      .set({ content, lastAccessedAt: new Date() })
      .where(eq(memories.id, id))
      .returning();

    if (updated) {
      await this.db.insert(auditLog).values({
        action: 'memory:update',
        actor,
        target: id,
        detailsJson: { contentPreview: content.slice(0, 100) },
      });
    }

    return updated || null;
  }

  async delete(id: string, actor = 'user') {
    const memory = await this.getById(id);
    if (!memory) return false;

    await this.db.delete(memories).where(eq(memories.id, id));

    await this.db.insert(auditLog).values({
      action: 'memory:delete',
      actor,
      target: id,
      detailsJson: {
        agentId: memory.agentId,
        tier: memory.tier,
        contentPreview: memory.content.slice(0, 100),
      },
    });

    eventBus.emit({ type: 'memory:deleted', agentId: memory.agentId, memoryId: id });
    return true;
  }

  async resetTier(agentId: string, tier: MemoryTier, actor = 'user') {
    const existing = await this.getByAgent(agentId, tier);

    await this.db
      .delete(memories)
      .where(and(eq(memories.agentId, agentId), eq(memories.tier, tier)));

    await this.db.insert(auditLog).values({
      action: 'memory:reset-tier',
      actor,
      target: agentId,
      detailsJson: { tier, deletedCount: existing.length },
    });

    return existing.length;
  }

  async exportAgent(agentId: string) {
    const all = await this.getByAgent(agentId);
    return all.map((m) => ({
      tier: m.tier,
      content: m.content,
      confidence: m.confidence,
      createdAt: m.createdAt,
    }));
  }

  async importAgent(
    agentId: string,
    data: Array<{ tier: string; content: string; confidence?: number }>
  ) {
    let imported = 0;
    for (const item of data) {
      await this.create({
        agentId,
        tier: item.tier as MemoryTier,
        content: item.content,
        confidence: item.confidence,
      });
      imported++;
    }
    return imported;
  }
}
