/**
 * PhD content archive — moves vault content to `99 Archive/` so user can
 * "start from zero" without deletion. Supervision is never touched.
 *
 *   POST /api/vault/archive-phd-content/full
 *     Archives ALL PhD content except: Supervision, Templates, top-level
 *     dashboards (00 Vault Guidelines.md, MOC - PhD.md, PhD Dashboard.md).
 *     Per-file moves (works around Windows folder-lock issues).
 *
 *   POST /api/vault/archive-phd-content
 *     Legacy/granular: archives specific sections only.
 *
 *   GET /api/vault/archive-phd-content/preview
 *     Returns counts of files that would be archived per area.
 */
import type { Hono } from 'hono';
import { moveInVault, moveContentsInVault, countNotesInFolder } from '@ruhool/core';
import { isDeleteApproved, consumeOneTimeApproval } from './delete-approvals.js';
import { auditLog } from '../services/audit-log.js';
import type { StoreData } from '../store/types.js';

// Legacy granular sections (kept for back-compat)
const SECTIONS: Record<string, string> = {
  'literature':       '01 PhD/02 Literature Review/Academic Literature',
  'atomic-notes':     '01 PhD/03 Atomic Notes',
  'lit-review-other': '01 PhD/02 Literature Review',
};

// Full-reset areas: each entry is a vault sub-path whose CONTENT will be moved.
// Folders preserved by the skip pattern stay where they are.
const FULL_RESET_AREAS = [
  '01 PhD/02 Literature Review',  // includes Academic Literature, MOCs, PRISMA, Books-to-use, Theses, etc.
  '01 PhD/03 Atomic Notes',
  '01 PhD/04 Case Studies',
  '01 PhD/05 Courses',
  '01 PhD/06 Books',
  '01 PhD/07 People',
  '01 PhD/08 Conferences',
  '01 PhD/09 Organisations',
  '01 PhD/10 Non Academic',
];

// Things that must NEVER be archived — protected by these regex patterns:
const PROTECTED = [
  /^01 PhD\/01 Supervision\//,        // entire supervision folder
  /^01 PhD\/88 Templates\//,          // template files
  /^01 PhD\/00 Vault Guidelines\.md$/, // vault rules
  /^01 PhD\/MOC - PhD\.md$/,           // top-level MOC
  /^01 PhD\/PhD Dashboard\.md$/,       // top-level dashboard
];

interface ArchiveDeps {
  getStore?: () => StoreData;
  saveStore?: () => void;
}

export function registerPhdArchiveRoutes(app: Hono, deps: ArchiveDeps = {}): void {

  app.get('/api/vault/archive-phd-content/preview', async (c) => {
    const result: Record<string, number> = {};
    for (const sub of FULL_RESET_AREAS) {
      const key = sub.replace('01 PhD/', '');
      result[key] = await countNotesInFolder(sub).catch(() => 0);
    }
    return c.json({
      areas: result,
      total: Object.values(result).reduce((a, b) => a + b, 0),
      archiveRoot: '99 Archive/' + new Date().toISOString().slice(0, 10) + ' — PhD Reset',
      preserved: [
        '01 PhD/01 Supervision (الإشراف كامل)',
        '01 PhD/88 Templates (القوالب)',
        '01 PhD/00 Vault Guidelines.md',
        '01 PhD/MOC - PhD.md',
        '01 PhD/PhD Dashboard.md',
      ],
    });
  });

  // ── FULL reset: archive everything except preserved paths ──────────
  app.post('/api/vault/archive-phd-content/full', async (c) => {
    const body = await c.req.json<{ force?: boolean }>().catch(() => ({ force: false }));
    const store = deps.getStore?.();
    if (store && !body.force) {
      if (!isDeleteApproved(store)) {
        return c.json({
          requiresApproval: true,
          hint: 'Grant delete approval at POST /api/vault/delete-approval first, or pass {force: true} to override.',
        }, 403);
      }
      consumeOneTimeApproval(store);
      deps.saveStore?.();
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const archiveBase = `99 Archive/${stamp} — PhD Reset`;
    const summary: Record<string, { moved: number; failed: number; errors?: string[] }> = {};

    for (const area of FULL_RESET_AREAS) {
      const dst = `${archiveBase}/${area}`;
      const result = await moveContentsInVault(area, dst, {
        skipPatterns: PROTECTED,
        alsoMoveFolders: true,
      });
      summary[area] = {
        moved: result.movedFiles.length,
        failed: result.failed.length,
        errors: result.failed.length > 0 ? result.failed.slice(0, 5).map((f) => `${f.path}: ${f.error}`) : undefined,
      };
    }

    const totalMoved = Object.values(summary).reduce((s, x) => s + x.moved, 0);
    const totalFailed = Object.values(summary).reduce((s, x) => s + x.failed, 0);
    await auditLog({
      action: 'vault.archive.full',
      source: 'platform:user',
      meta: { archiveBase, totalMoved, totalFailed, summary },
    });
    return c.json({
      archiveBase,
      summary,
      totalMoved,
      totalFailed,
      preserved: ['01 Supervision', '88 Templates', '00 Vault Guidelines.md', 'MOC - PhD.md', 'PhD Dashboard.md'],
    });
  });

  // ── Legacy granular archive ────────────────────────────────────────
  app.post('/api/vault/archive-phd-content', async (c) => {
    const body = await c.req.json<{ sections?: string[]; force?: boolean }>().catch(() => ({ sections: undefined, force: false }));
    const wanted = body.sections ?? Object.keys(SECTIONS);

    const store = deps.getStore?.();
    if (store && !body.force) {
      if (!isDeleteApproved(store)) {
        return c.json({
          requiresApproval: true,
          hint: 'Grant delete approval at POST /api/vault/delete-approval first, or pass {force: true} to override.',
        }, 403);
      }
      consumeOneTimeApproval(store);
      deps.saveStore?.();
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const archiveBase = `99 Archive/${stamp} — PhD Reset`;

    const moved: Record<string, { from: string; to: string; ok: boolean; error?: string }> = {};

    const order = ['literature', 'atomic-notes', 'lit-review-other'];
    for (const key of order) {
      if (!wanted.includes(key)) continue;
      const src = SECTIONS[key];
      const dst = `${archiveBase}/${src}`;
      try {
        await moveInVault(src, dst);
        moved[key] = { from: src, to: dst, ok: true };
      } catch (err) {
        moved[key] = { from: src, to: dst, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }

    return c.json({ archiveBase, moved, supervisionPreserved: true });
  });
}
