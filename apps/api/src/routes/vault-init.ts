/**
 * New Vault Initialization — for the platform-first architecture where the
 * user works exclusively through Ruhool and treats Obsidian as backup only.
 *
 * Vault structure (designed to be platform-first, NOT manually navigated):
 *
 *   00 Inbox/                        ← quick-capture lands here
 *     fleeting/                      ← unstructured thoughts
 *     images/                        ← screenshots & photos waiting for OCR
 *
 *   01 PhD/                          ← all PhD work
 *     01 Sources/                    ← every input (papers, books, courses, etc.)
 *       Papers/                      ← academic literature (from Zotero)
 *       Books/                       ← books — Kindle, paper, audio
 *       Courses/                     ← online + offline learning
 *       Reports/                     ← industry reports, gov docs
 *       Theses/                      ← dissertations
 *       Standards/                   ← codes & standards
 *     02 Atomic Notes/               ← Zettelkasten — one idea per note
 *     03 Writing/                    ← thesis chapters & drafts
 *     04 Supervision/                ← meetings, milestones, action plans
 *     05 People/                     ← supervisors, contacts, academics
 *     06 Organisations/              ← databases, journals, institutions
 *     07 Conferences/                ← attended + planned
 *     08 Case Studies/               ← projects analysed for the research
 *     09 Canvas/                     ← spatial boards
 *     ⚙ Templates/                   ← note templates
 *     📋 PhD Dashboard.md            ← main dashboard
 *     📌 Vault Guide.md              ← user-facing vault rules
 *
 *   02 Personal/                     ← future: life, health, finance
 *   03 Work (KSE)/                   ← future: KSE-related work
 *   99 Archive/                      ← old vault contents migrated here
 *
 * Endpoints:
 *   GET  /api/vault/init/preview     — show what would be created
 *   POST /api/vault/init             — create the structure (idempotent)
 *   GET  /api/vault/active           — return current vault root
 *   POST /api/vault/active           — switch active vault root (requires restart hint)
 */
import type { Hono } from 'hono';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { writeFrontmatter } from '@ruhool/core';
import { auditLog } from '../services/audit-log.js';

// New vault root — also reflected in OBSIDIAN_VAULT_PATH env at runtime.
const NEW_VAULT_PATH = 'C:\\Users\\alhud\\OneDrive - University of Birmingham\\Ruhool';

// The skeleton: a list of folders to create (empty) + a list of seed files.
const FOLDERS = [
  '00 Inbox/fleeting',
  '00 Inbox/images',
  '01 PhD/01 Sources/Papers',
  '01 PhD/01 Sources/Books',
  '01 PhD/01 Sources/Courses',
  '01 PhD/01 Sources/Reports',
  '01 PhD/01 Sources/Theses',
  '01 PhD/01 Sources/Standards',
  '01 PhD/02 Atomic Notes',
  '01 PhD/03 Writing',
  '01 PhD/04 Supervision/Meetings',
  '01 PhD/04 Supervision/Milestones',
  '01 PhD/05 People',
  '01 PhD/06 Organisations',
  '01 PhD/07 Conferences',
  '01 PhD/08 Case Studies',
  '01 PhD/09 Canvas',
  '01 PhD/⚙ Templates',
  '99 Archive',
];

const SEED_FILES: Array<{ relPath: string; build: () => string }> = [
  {
    relPath: '01 PhD/📋 PhD Dashboard.md',
    build: () => {
      const fm = { type: 'dashboard', updated: new Date().toISOString().slice(0, 10) };
      return [
        '---',
        writeFrontmatter(fm, ['type', 'updated']),
        '---',
        '',
        '# 🎓 PhD Dashboard',
        '',
        '> هذه اللوحة موجودة كنسخة احتياطية. كل العمل الفعلي يحدث في منصة رحول.',
        '> Open Ruhool: http://localhost:3000/phd',
        '',
        '## 🔗 Live Sections',
        '- 📚 [Sources](Ruhool://sources) — Papers, books, courses, more',
        '- 🧠 [Atomic Notes](Ruhool://notes) — One idea per note',
        '- ✍️ [Writing](Ruhool://writing) — Thesis chapters & drafts',
        '- 👥 [Supervision](Ruhool://supervision) — Meetings & milestones',
        '- 🎨 [Canvas](Ruhool://canvas) — Visual boards',
        '',
        '## 📌 Why this file is mostly empty',
        'The platform reads & writes here. To see live data, use Ruhool.',
      ].join('\n') + '\n';
    },
  },
  {
    relPath: '01 PhD/📌 Vault Guide.md',
    build: () => [
      '---',
      writeFrontmatter({ type: 'guide', updated: new Date().toISOString().slice(0, 10) }, ['type', 'updated']),
      '---',
      '',
      '# 📌 Vault Guide',
      '',
      '## Philosophy',
      'This vault is **platform-first**. Ruhool is the editor; Obsidian is the safety net.',
      '',
      '## What lives where',
      '- `00 Inbox/` — fleeting captures from the platform. Rumman organizes.',
      '- `01 PhD/01 Sources/` — every input: papers, books, courses, reports.',
      '- `01 PhD/02 Atomic Notes/` — Zettelkasten ideas. Connected via wikilinks.',
      '- `01 PhD/03 Writing/` — thesis chapters as Markdown. Export to Word from platform.',
      '- `01 PhD/04 Supervision/` — meeting records (Mudawwin) + milestones.',
      '- `01 PhD/09 Canvas/` — visual JSON canvases compatible with Obsidian Canvas.',
      '',
      '## Rules',
      '1. Don\'t move files manually here. Use the platform — every move is logged.',
      '2. Frontmatter is sacred. The platform parses it. Edit via platform UI.',
      '3. To add a note, image, or idea fast → quick-capture in platform (anywhere).',
    ].join('\n') + '\n',
  },
  {
    relPath: '00 Inbox/README.md',
    build: () => '# 📥 Inbox\n\nFleeting captures land here. Open Ruhool → Quick Capture or `/inbox` to triage.\n',
  },
  {
    relPath: '01 PhD/⚙ Templates/atomic-note.md',
    build: () => [
      '---',
      'type: atomic',
      'created: ',
      'tags: []',
      'source: ',
      '---',
      '',
      '# {{title}}',
      '',
      '> One idea, expressed clearly.',
      '',
      '## Why this matters',
      '',
      '## Connections',
      '- ',
    ].join('\n') + '\n',
  },
  {
    relPath: '01 PhD/⚙ Templates/source-paper.md',
    build: () => [
      '---',
      'Citekey: ',
      'Type: journalArticle',
      'Year: ',
      'Authors: ',
      'DOI: ',
      'Reading_status: To Read',
      'reading_priority: medium',
      'reading_order: ',
      'notes_exported: false',
      'tags: []',
      '---',
      '',
      '# {{title}}',
      '',
      '## 📝 My Notes',
      '',
      '## 🔆 Highlights',
      '',
      '## 🔗 Related',
    ].join('\n') + '\n',
  },
];

async function ensureFolder(absPath: string): Promise<'created' | 'exists'> {
  try { await fs.stat(absPath); return 'exists'; }
  catch { await fs.mkdir(absPath, { recursive: true }); return 'created'; }
}

async function ensureFile(absPath: string, content: string): Promise<'created' | 'exists'> {
  try { await fs.stat(absPath); return 'exists'; }
  catch {
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, 'utf8');
    return 'created';
  }
}

export interface VaultInitDeps {
  getStore?: () => { obsidianVaultPath?: string };
  saveStore?: () => void;
}

export function registerVaultInitRoutes(app: Hono, deps?: VaultInitDeps): void {

  // Restore saved vault path on startup (runs once when route is registered)
  if (deps) {
    try {
      const saved = deps.getStore?.()?.obsidianVaultPath;
      if (saved && !process.env.OBSIDIAN_VAULT_PATH) {
        process.env.OBSIDIAN_VAULT_PATH = saved;
      }
    } catch { /* ignore */ }
  }


  app.get('/api/vault/active', async (c) => {
    // Show the actual active root (after auto-detection), not just the env var.
    // Auto-detection prefers new vault if it has supervision content, else legacy.
    const { getVaultRoot } = await import('@ruhool/core');
    const actualRoot = getVaultRoot();
    return c.json({
      currentRoot: actualRoot,
      currentSource: process.env.OBSIDIAN_VAULT_PATH ? 'env' : 'auto-detect',
      newProposedRoot: NEW_VAULT_PATH,
      vaultName: path.basename(actualRoot),
      isUsingNewVault: actualRoot === NEW_VAULT_PATH,
    });
  });

  // Set the active vault path at runtime (no .env edit needed). Persists across
  // restarts because we set process.env which getVaultRoot() reads first.
  app.post('/api/vault/active', async (c) => {
    const body = await c.req.json<{ path: string }>();
    if (!body.path?.trim()) return c.json({ error: 'path required' }, 400);
    const newPath = body.path.trim().replace(/[/\\]+$/, '');
    // Verify the path exists and looks like a vault (has at least one folder)
    try {
      const entries = await fs.readdir(newPath);
      if (entries.length === 0) {
        return c.json({ error: 'Path exists but is empty — not a valid vault' }, 400);
      }
    } catch {
      return c.json({ error: `Path not accessible: ${newPath}` }, 400);
    }
    process.env.OBSIDIAN_VAULT_PATH = newPath;
    // Persist in store.json so it survives restarts
    if (deps?.getStore) {
      const store = deps.getStore() as { obsidianVaultPath?: string };
      store.obsidianVaultPath = newPath;
      deps.saveStore?.();
    }
    await auditLog({
      action: 'vault.path-changed',
      source: 'platform:user',
      meta: { newPath },
    });
    return c.json({ ok: true, activePath: newPath, persisted: !!deps?.getStore });
  });

  app.get('/api/vault/init/preview', async (c) => {
    const root = NEW_VAULT_PATH;
    const folderStatuses: Array<{ folder: string; status: string }> = [];
    for (const f of FOLDERS) {
      try { await fs.stat(path.join(root, f)); folderStatuses.push({ folder: f, status: 'exists' }); }
      catch { folderStatuses.push({ folder: f, status: 'will-create' }); }
    }
    const fileStatuses: Array<{ file: string; status: string }> = [];
    for (const sf of SEED_FILES) {
      try { await fs.stat(path.join(root, sf.relPath)); fileStatuses.push({ file: sf.relPath, status: 'exists' }); }
      catch { fileStatuses.push({ file: sf.relPath, status: 'will-create' }); }
    }
    return c.json({ root, folders: folderStatuses, files: fileStatuses });
  });

  app.post('/api/vault/init', async (c) => {
    const root = NEW_VAULT_PATH;
    // Create the root itself if missing
    await fs.mkdir(root, { recursive: true });

    const created: string[] = [];
    const skipped: string[] = [];

    for (const f of FOLDERS) {
      const r = await ensureFolder(path.join(root, f));
      (r === 'created' ? created : skipped).push(`folder:${f}`);
    }
    for (const sf of SEED_FILES) {
      const r = await ensureFile(path.join(root, sf.relPath), sf.build());
      (r === 'created' ? created : skipped).push(`file:${sf.relPath}`);
    }

    await auditLog({
      action: 'vault.init',
      source: 'platform:user',
      meta: { root, createdCount: created.length, skippedCount: skipped.length },
    });

    return c.json({
      root,
      created,
      skipped,
      hint: `Set OBSIDIAN_VAULT_PATH="${root}" in your .env and restart the API to switch active vault.`,
    });
  });
}
