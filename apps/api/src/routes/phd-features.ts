/**
 * PhD productivity features:
 *   GET  /api/phd/word-count          — total words in writing folder + per file + 7-day trend (best-effort)
 *   GET  /api/mudawwin/daily-briefing — Mudawwin-style structured morning brief
 *   POST /api/vault/supervision/milestone   — create new milestone
 *   POST /api/vault/supervision/meeting     — create blank meeting (+ frontmatter only) for manual editing
 */
import type { Hono } from 'hono';
import { listNotes, readNote, writeNoteRaw, noteExists, writeFrontmatter } from '@ruhool/core';
import { auditLog } from '../services/audit-log.js';

export function registerPhdFeaturesRoutes(app: Hono): void {

  // ── Word count tracker ────────────────────────────────────────────
  app.get('/api/phd/word-count', async (c) => {
    try {
      // Writing folder (new vault structure)
      let paths = await listNotes({ subPath: '01 PhD/03 Writing' }).catch(() => [] as string[]);
      // Fallback to legacy
      if (paths.length === 0) {
        paths = await listNotes({ subPath: '01 PhD' }).catch(() => [] as string[]);
        paths = paths.filter((p) => /\/(Writing|03 Writing|chapters)\//i.test(p));
      }

      const today = new Date().toISOString().slice(0, 10);
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
      let totalWords = 0;
      let totalThisWeek = 0;
      const perFile: Array<{ path: string; words: number; mtime: number }> = [];

      for (const p of paths) {
        try {
          const n = await readNote(p);
          // Strip frontmatter + headings from word count
          const text = n.body.replace(/^#+\s+.*$/gm, '').replace(/^[*-]\s+/gm, '');
          const words = text.split(/\s+/).filter(Boolean).length;
          totalWords += words;
          perFile.push({ path: p, words, mtime: n.mtime });
          if (n.mtime > Date.parse(sevenDaysAgo)) totalThisWeek += words;
        } catch { /* skip */ }
      }

      perFile.sort((a, b) => b.mtime - a.mtime);

      return c.json({
        totalWords,
        totalThisWeek,
        averagePerDay: Math.round(totalThisWeek / 7),
        fileCount: perFile.length,
        topFiles: perFile.slice(0, 10),
        target: { dailyGoal: 500, weeklyGoal: 3500 },
        progressToWeeklyGoal: Math.min(100, Math.round((totalThisWeek / 3500) * 100)),
        date: today,
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Daily briefing ────────────────────────────────────────────────
  // Returns a structured morning brief; UI renders it. (Doesn't call LLM —
  // the briefing IS the structured data; if user wants LLM elaboration,
  // they go to /mudawwin and ask "ابن لي بريفينج اليوم")
  app.get('/api/mudawwin/daily-briefing', async (c) => {
    try {
      const supPaths = await listNotes({ subPath: '01 PhD/01 Supervision/Supervision Interaction Points', recursive: false })
        .catch(async () => listNotes({ subPath: '01 PhD/04 Supervision/Meetings', recursive: false }).catch(() => []));
      const meetings = await Promise.all(
        supPaths.map(async (p) => {
          try {
            const n = await readNote(p);
            return {
              path: p,
              date: n.frontmatter.date as string | undefined,
              next: n.frontmatter.Next_Meeting as string | undefined,
              actions: n.sections.find((s) => /action|next|أعمال|بنود/i.test(s.heading))?.content,
            };
          } catch { return null; }
        })
      );
      const valid = meetings.filter(Boolean) as Array<{ path: string; date?: string; next?: string; actions?: string }>;
      const sorted = valid.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
      const last = sorted[0];

      // Audit since last meeting
      const sinceIso = last?.date ? String(last.date) : undefined;
      const { readAuditLog } = await import('../services/audit-log.js');
      const audit = await readAuditLog({ limit: 50, sinceIso }).catch(() => []);

      // Group activity counts by action
      const counts: Record<string, number> = {};
      for (const a of audit) counts[a.action] = (counts[a.action] ?? 0) + 1;

      const today = new Date();
      const day = today.toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      // Days until next meeting
      let daysUntilNext: number | null = null;
      if (last?.next) {
        try {
          const nextDate = new Date(String(last.next));
          daysUntilNext = Math.ceil((nextDate.getTime() - today.getTime()) / 86400_000);
        } catch { /* not parseable */ }
      }

      return c.json({
        today: today.toISOString().slice(0, 10),
        dayLabel: day,
        lastMeeting: last
          ? { path: last.path, date: last.date, daysAgo: last.date ? Math.floor((today.getTime() - new Date(String(last.date)).getTime()) / 86400_000) : null }
          : null,
        nextMeeting: last?.next ? { date: last.next, daysUntil: daysUntilNext } : null,
        activitySinceLastMeeting: {
          totalEvents: audit.length,
          byAction: counts,
        },
        openActionsHint: last?.actions ? last.actions.slice(0, 500) : null,
        suggestion: !last
          ? 'لم تُسجَّل اجتماعات بعد. ابدأ بإضافة اجتماع تأسيسي.'
          : daysUntilNext != null && daysUntilNext <= 3
            ? `الاجتماع القادم بعد ${daysUntilNext} يوم — جهّز ملخصك.`
            : audit.length === 0
              ? 'لا نشاط منذ آخر اجتماع — اقرأ ورقة جديدة أو دوّن فكرة.'
              : `أنجزت ${audit.length} عملية منذ آخر اجتماع. استمر.`,
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Create new milestone ─────────────────────────────────────────
  app.post('/api/vault/supervision/milestone', async (c) => {
    const body = await c.req.json<{ title: string; date?: string; status?: string; body?: string }>();
    if (!body.title?.trim()) return c.json({ error: 'title required' }, 400);
    // Try new vault location first; fall back to legacy
    const candidates = [
      `01 PhD/04 Supervision/Milestones`,
      `01 PhD/01 Supervision/Milestones`,
    ];
    const safeTitle = body.title.trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 100);
    for (const folder of candidates) {
      const relPath = `${folder}/${safeTitle}.md`;
      try {
        if (await noteExists(relPath)) continue;
        const fm: Record<string, unknown> = {
          type: 'milestone',
          date: body.date ?? new Date().toISOString().slice(0, 10),
          status: body.status ?? 'planned',
        };
        const yaml = writeFrontmatter(fm, Object.keys(fm));
        const content = ['---', yaml, '---', '', `# ${body.title.trim()}`, '', body.body ?? ''].join('\n');
        await writeNoteRaw(relPath, content);
        await auditLog({ action: 'milestone.create', path: relPath, source: 'platform:user', meta: { title: body.title } });
        return c.json({ ok: true, path: relPath });
      } catch (e) {
        // try next candidate
        if (!String(e).includes('ENOENT')) {
          return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
        }
      }
    }
    return c.json({ error: 'Failed to create — vault folders not found' }, 500);
  });

  // ── Create blank meeting (manual mode) ───────────────────────────
  // Body: { date?, location?, attendees?, summary?, no? }
  app.post('/api/vault/supervision/meeting', async (c) => {
    const body = await c.req.json<{ date?: string; location?: string; attendees?: string[]; summary?: string; no?: string | number }>();
    const candidates = [
      '01 PhD/04 Supervision/Meetings',
      '01 PhD/01 Supervision/Supervision Interaction Points',
    ];
    // Auto-pick next number
    let nextNum = 1;
    for (const folder of candidates) {
      try {
        const existing = await listNotes({ subPath: folder, recursive: false });
        const nums = existing.map((p) => Number(p.split('/').pop()?.replace(/\.md$/, ''))).filter((n) => Number.isFinite(n));
        if (nums.length > 0) { nextNum = Math.max(...nums) + 1; break; }
      } catch { /* try next */ }
    }
    const no = body.no ? String(body.no) : String(nextNum);

    for (const folder of candidates) {
      const relPath = `${folder}/${no}.md`;
      try {
        if (await noteExists(relPath)) continue;
        const fm: Record<string, unknown> = {
          type: 'supervision-meeting',
          'No.': no,
          date: body.date ?? new Date().toISOString(),
          Location: body.location ?? '',
          Attendees: body.attendees ?? [],
          Summary: body.summary ?? '',
          Next_Meeting: '',
          Next_Location: '',
        };
        const yaml = writeFrontmatter(fm, Object.keys(fm));
        const content = ['---', yaml, '---', '', `# اجتماع #${no}`, '', body.summary ?? ''].join('\n');
        await writeNoteRaw(relPath, content);
        await auditLog({ action: 'meeting.create', path: relPath, source: 'platform:user', meta: { no } });
        return c.json({ ok: true, path: relPath, no });
      } catch (e) {
        if (!String(e).includes('ENOENT')) return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    }
    return c.json({ error: 'No supervision folder found in vault' }, 500);
  });
}
