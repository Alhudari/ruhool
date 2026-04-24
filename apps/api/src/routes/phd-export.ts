/**
 * Full PhD export — bundles vault content + platform data into a single zip
 * for backup or migration. Pairs with a future import endpoint.
 *
 *   GET /api/vault/export
 *     Streams a zip containing:
 *       - vault/  — full Obsidian PhD vault as files
 *       - ruhool/ — companion-memory.json, schedule.json, voice-profile.json,
 *                   tour-feedback.json, conversations.json, atomic-notes-meta.json
 *       - manifest.json — versions, timestamps
 */
import type { Hono } from 'hono';
import * as fs from 'node:fs';
import archiver from 'archiver';
import { stream } from 'hono/streaming';
import type { StoreData } from '../store/types.js';
import { getVaultRoot } from '@ruhool/core';

interface Deps {
  getStore: () => StoreData;
}

export function registerPhdExportRoutes(app: Hono, { getStore }: Deps): void {

  app.get('/api/vault/export', async (c) => {
    const store = getStore();
    const vaultRoot = getVaultRoot();
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `ruhool-phd-export-${stamp}.zip`;

    c.header('Content-Type', 'application/zip');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);

    return stream(c, async (writer) => {
      const archive = archiver('zip', { zlib: { level: 6 } });

      // Pipe archive output to the HTTP stream
      archive.on('data', (chunk) => { void writer.write(chunk); });
      archive.on('warning', (err) => { console.warn('export warning', err); });
      archive.on('error', (err) => { throw err; });

      // 1. Add vault directory
      try {
        if (fs.existsSync(vaultRoot)) {
          archive.directory(vaultRoot, 'vault');
        }
      } catch (e) { console.warn('vault not accessible', e); }

      // 2. Add platform data as separate JSON files
      const ruhoolData: Record<string, unknown> = {
        companionMemory: (store as unknown as { companionMemory?: unknown }).companionMemory ?? [],
        phdSchedule: (store as unknown as { phdSchedule?: unknown }).phdSchedule ?? null,
        userVoiceProfile: store.userVoiceProfile ?? null,
        clippyTourFeedback: (store as unknown as { clippyTourFeedback?: unknown }).clippyTourFeedback ?? [],
        responseLength: (store as unknown as { responseLength?: unknown }).responseLength ?? 'medium',
        readingSessions: store.readingSessions ?? [],
        meetingSessions: (store as unknown as { meetingSessions?: unknown }).meetingSessions ?? [],
      };
      for (const [key, value] of Object.entries(ruhoolData)) {
        archive.append(JSON.stringify(value, null, 2), { name: `ruhool/${key}.json` });
      }

      // 3. Conversations + messages (filtered to research-related agents)
      const researchAgents = new Set(['research-companion', 'manager', 'research', 'reading-helper', 'comparator', 'writing-critic', 'clippy']);
      const convs = (store.conversations ?? []).filter((c) => !c.agentId || researchAgents.has(c.agentId));
      const convIds = new Set(convs.map((c) => c.id));
      const msgs = (store.messages ?? []).filter((m) => convIds.has(m.conversationId));
      archive.append(JSON.stringify(convs, null, 2), { name: 'ruhool/conversations.json' });
      archive.append(JSON.stringify(msgs, null, 2), { name: 'ruhool/messages.json' });

      // 4. Manifest
      const manifest = {
        version: 1,
        exportedAt: new Date().toISOString(),
        platform: 'ruhool',
        vaultRoot,
        counts: {
          conversations: convs.length,
          messages: msgs.length,
          companionMemory: Array.isArray(ruhoolData.companionMemory) ? ruhoolData.companionMemory.length : 0,
          readingSessions: store.readingSessions?.length ?? 0,
        },
        notes: 'Restore via POST /api/vault/import (zip body). Vault folder is restored to OBSIDIAN_VAULT_PATH or platform default.',
      };
      archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

      await archive.finalize();
    });
  });

  // Lightweight preview (counts only) — useful for UI confirmation before downloading
  app.get('/api/vault/export/preview', (c) => {
    const store = getStore();
    return c.json({
      vaultRoot: getVaultRoot(),
      conversations: (store.conversations ?? []).length,
      messages: (store.messages ?? []).length,
      readingSessions: (store.readingSessions ?? []).length,
      companionMemory: ((store as unknown as { companionMemory?: unknown[] }).companionMemory ?? []).length,
      meetingSessions: ((store as unknown as { meetingSessions?: unknown[] }).meetingSessions ?? []).length,
    });
  });

  // Import is intentionally NOT implemented as a one-click action — too risky.
  // Return 501 with documentation pointing to a manual restore process.
  app.post('/api/vault/import', (c) => {
    return c.json({
      error: 'Not implemented yet. Manual restore: 1) unzip the archive, 2) move vault/ contents back to your Obsidian vault folder, 3) merge ruhool/*.json into data/store.json.',
      manualSteps: [
        'unzip ruhool-phd-export-*.zip',
        'cp -r vault/* "C:\\Users\\alhud\\OneDrive - University of Birmingham\\Obsidian\\PhD\\"',
        'Stop the Ruhool API, edit data/store.json to merge ruhool/*.json fields, restart',
      ],
    }, 501);
  });
}
