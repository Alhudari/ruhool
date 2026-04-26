/**
 * Obsidian vault task routes — read `- [ ]` / `- [x]` from the user's vault
 * and allow toggling them (writes back to the source .md file).
 * Source of truth is always the vault file; no duplication in Postgres.
 */
import type { Hono } from 'hono';
import { listAllTasks, toggleTask, listNotes, readNote, writeNoteRaw, noteExists, writeFrontmatter } from '@ruhool/core';
import { auditLog } from '../services/audit-log.js';
import { withCache, invalidateCache } from '../services/response-cache.js';

// Strip Obsidian-specific markup so notes display cleanly in the platform UI.
// Removes: [[wikilinks]] (keeps display text), %%comments%%, ![[embeds]],
// ^block-refs, and unrunnable code blocks (dataviewjs, dataview).
function cleanObsidianMarkup(text: string): string {
  return text
    // DataviewJS / Dataview code blocks — silently strip (placeholder noise was worse than nothing)
    .replace(/```dataviewjs[\s\S]*?```/g, '')
    .replace(/```dataview[\s\S]*?```/g, '')
    // Obsidian callout markers (> [!note]- Title  →  ## Title)
    .replace(/^>\s*\[!(\w+)\][-+]?\s*(.+)$/gm, '\n### $2\n')
    // Strip empty callout lines
    .replace(/^>\s*$/gm, '')
    // ![[embedded images]] or ![[note name]]
    .replace(/!\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g, '')
    // [[Note|Display]] → Display ; [[Note]] → Note
    .replace(/\[\[([^\]|]+?)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+?)\]\]/g, '$1')
    // %% inline comments %%
    .replace(/%%[\s\S]*?%%/g, '')
    // ^block-id references at end of lines
    .replace(/\s\^[a-zA-Z0-9-]+$/gm, '')
    .split('\n').map((l) => l.trimEnd()).join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

// Extract a human-friendly title for a note: prefer the first H1 in body,
// fall back to a frontmatter `title` field, then the filename.
function extractTitle(name: string, body: string, frontmatter: Record<string, unknown>): string {
  const fmTitle = frontmatter.title ?? frontmatter.Title;
  if (typeof fmTitle === 'string' && fmTitle.trim()) return fmTitle.trim();
  const h1 = body.match(/^#\s+(.+?)$/m);
  if (h1) return h1[1].replace(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g, '$1').trim();
  return name;
}

// Extract wikilink targets [[Target]] or [[Target|Display]] — used for graph edges.
function extractWikilinks(text: string): string[] {
  const out = new Set<string>();
  const re = /\[\[([^\]|#]+?)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const target = m[1].trim();
    // Skip self-explanatory MOC/Dashboard links
    if (target && !target.startsWith('!')) out.add(target);
  }
  return Array.from(out);
}

export function registerVaultTasksRoutes(app: Hono): void {

  // ── List all tasks across the vault (or filtered by subPath) ────────
  app.get('/api/vault/tasks', async (c) => {
    const subPath = c.req.query('subPath') ?? undefined;
    const doneFilter = c.req.query('done'); // 'true' | 'false' | undefined = all
    try {
      const tasks = await listAllTasks({ subPath, includeArchive: false });
      const filtered = doneFilter !== undefined
        ? tasks.filter((t) => t.done === (doneFilter === 'true'))
        : tasks;
      return c.json({ tasks: filtered, total: filtered.length });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Toggle a single task checkbox ────────────────────────────────────
  app.post('/api/vault/tasks/toggle', async (c) => {
    const body = await c.req.json<{ notePath: string; line: number; done: boolean }>();
    if (!body.notePath || typeof body.line !== 'number') {
      return c.json({ error: 'notePath and line required' }, 400);
    }
    try {
      await toggleTask(body.notePath, body.line, body.done);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── List notes in a subPath (for Library View) ────────────────────────
  app.get('/api/vault/notes', async (c) => {
    const subPath = c.req.query('subPath') ?? undefined;
    try {
      const paths = await listNotes({ subPath, includeArchive: false });
      return c.json({ paths, total: paths.length });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Read a single note (frontmatter + sections + tasks) ──────────────
  app.get('/api/vault/notes/*', async (c) => {
    const relPath = decodeURIComponent(c.req.param('*') ?? '');
    if (!relPath) return c.json({ error: 'path required' }, 400);
    try {
      const note = await readNote(relPath);
      return c.json(note);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ENOENT') || msg.includes('no such file')) return c.json({ error: 'Not found' }, 404);
      return c.json({ error: msg }, 500);
    }
  });

  // ── Atomic Notes: list from `01 PhD/03 Atomic Notes` ─────────────────
  // Atomic notes are PhD-scoped for now; may broaden to personal reading later.
  // Returns enriched data: cleaned body (no wikilink markers), extracted
  // connections to other notes, and category derived from sub-folder.
  app.get('/api/vault/atomic-notes', async (c) => {
    try {
      return c.json(await withCache('vault.atomic-notes', 60_000, async () => {
      const paths = await listNotes({ subPath: '01 PhD/03 Atomic Notes' });
      const notes = await Promise.all(
        paths.slice(0, 300).map(async (p) => {
          try {
            const note = await readNote(p);
            const bodyClean = cleanObsidianMarkup(note.body);
            const connections = extractWikilinks(note.body);
            // Category: first sub-folder under "03 Atomic Notes"
            const parts = p.split('/');
            const idx = parts.indexOf('03 Atomic Notes');
            const category = (idx >= 0 && parts.length > idx + 2) ? parts[idx + 1] : 'General';
            return {
              path: note.path,
              name: note.name,
              mtime: note.mtime,
              tags: note.frontmatter.tags as string[] | undefined,
              type: note.frontmatter.type as string | undefined,
              status: note.frontmatter.status as string | undefined,
              source: note.frontmatter.source as string | undefined,
              category,
              connections, // names of linked notes (without [[]])
              connectionCount: connections.length,
              // First meaningful paragraph as preview (cleaned)
              preview: bodyClean
                .split(/\n{2,}/)
                .map((s) => s.trim())
                .find((s) => s && !s.startsWith('#') && !s.startsWith('>'))
                ?.slice(0, 220) ?? '',
              body: bodyClean,
              wordCount: bodyClean.split(/\s+/).filter(Boolean).length,
            };
          } catch {
            return null;
          }
        })
      );
      return { notes: notes.filter(Boolean), total: paths.length };
      }));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Supervision: full PhD supervision dashboard data ────────────────
  // Reads from `01 PhD/04 Supervision/` (new vault) with fallback to `01 PhD/01 Supervision/` (legacy).
  app.get('/api/vault/supervision', async (c) => {
    // Resolve which supervision root exists
    const supRoots = ['01 PhD/04 Supervision', '01 PhD/01 Supervision'];
    let supRoot = supRoots[0];
    for (const r of supRoots) {
      const probe = await listNotes({ subPath: r, recursive: false }).catch(() => [] as string[]);
      if (probe.length > 0) { supRoot = r; break; }
    }

    try {
      // Central supervision dashboard
      let dashboard: { body: string; sections: { heading: string; level: number; content: string }[] } | null = null;
      try {
        const d = await readNote(`${supRoot}/Supervision Dashboard.md`);
        dashboard = {
          body: cleanObsidianMarkup(d.body),
          sections: d.sections.map((s) => ({
            heading: s.heading,
            level: s.level,
            content: cleanObsidianMarkup(s.content),
          })),
        };
      } catch { /* may not exist */ }

      // Meeting records — new vault: numbered files in Supervision Interaction Points/
      const meetingSubPath = `${supRoot}/Supervision Interaction Points`;
      const meetingPaths = await listNotes({ subPath: meetingSubPath, recursive: false }).catch(() => [] as string[]);
      const meetings = await Promise.all(
        meetingPaths.map(async (p) => {
          try {
            const n = await readNote(p);
            const no = n.frontmatter['No.'] ?? n.frontmatter.No ?? n.frontmatter.no ?? n.name;
            const dateStr = (() => {
              const d = n.frontmatter.date ?? n.frontmatter.Date;
              if (!d) return null;
              const s = String(d);
              const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
              return m ? `${m[1]}-${m[2]}-${m[3]}` : s;
            })();
            const smartTitle = dateStr
              ? `اجتماع #${no} — ${dateStr}`
              : extractTitle(n.name, n.body, n.frontmatter);
            return {
              path: n.path,
              name: n.name,
              title: smartTitle,
              grs2: {
                input: n.frontmatter.GRS2_Input as string | undefined,
                respond: n.frontmatter.GRS2_Respond as string | undefined,
                confirmed: !!n.frontmatter.GRS2_confirmed,
                stage: n.frontmatter.GRS2_stage as string | undefined,
              },
              date: (n.frontmatter.date ?? n.frontmatter.Date) as string | undefined,
              attendees: (n.frontmatter.attendees ?? n.frontmatter.Attendees) as string | undefined,
              location: (n.frontmatter.location ?? n.frontmatter.Location) as string | undefined,
              summary: (n.frontmatter.Summary ?? n.frontmatter.summary) as string | undefined,
              actionsSection: (() => {
                const sec = n.sections.find((s) =>
                  /action|next.*step|todo|أعمال|خطوة|بنود/i.test(s.heading));
                return sec ? cleanObsidianMarkup(sec.content).slice(0, 600) : null;
              })(),
              taskCount: n.tasks.length,
              openTaskCount: n.tasks.filter((t) => !t.done).length,
            };
          } catch { return null; }
        })
      );

      // Milestones
      const milestonePaths = await listNotes({ subPath: `${supRoot}/Milestones`, recursive: false }).catch(() => [] as string[]);
      const milestones = await Promise.all(
        milestonePaths.map(async (p) => {
          try {
            const n = await readNote(p);
            return {
              path: n.path,
              name: n.name,
              title: extractTitle(n.name, n.body, n.frontmatter),
              date: (n.frontmatter.date ?? n.frontmatter.Date) as string | undefined,
              status: (n.frontmatter.status ?? n.frontmatter.Status) as string | undefined,
              preview: cleanObsidianMarkup(n.body).split('\n').find((l) => l.trim() && !l.startsWith('#'))?.slice(0, 160) ?? '',
            };
          } catch { return null; }
        })
      );

      // Detailed Work — MD files in Detailed Work/ (excludes subdirectories and non-md)
      const detailedWorkPaths = await listNotes({ subPath: `${supRoot}/Detailed Work`, recursive: false }).catch(() => [] as string[]);
      const detailedWork = await Promise.all(
        detailedWorkPaths.filter((p) => p.endsWith('.md')).map(async (p) => {
          try {
            const n = await readNote(p);
            return {
              path: n.path,
              name: n.name,
              title: extractTitle(n.name, n.body, n.frontmatter),
              category: (n.frontmatter.category ?? n.frontmatter.type ?? '') as string,
              status: (n.frontmatter.status ?? '') as string,
              preview: cleanObsidianMarkup(n.body).split('\n').find((l) => l.trim() && !l.startsWith('#'))?.slice(0, 180) ?? '',
            };
          } catch { return null; }
        })
      );

      // Scope Points — files under Detailed Work/Scope Points/
      const scopePaths = await listNotes({ subPath: `${supRoot}/Detailed Work/Scope Points`, recursive: false }).catch(() => [] as string[]);
      const scopePoints = await Promise.all(
        scopePaths.filter((p) => p.endsWith('.md')).map(async (p) => {
          try {
            const n = await readNote(p);
            return {
              path: n.path,
              name: n.name,
              title: extractTitle(n.name, n.body, n.frontmatter),
              preview: cleanObsidianMarkup(n.body).split('\n').find((l) => l.trim() && !l.startsWith('#'))?.slice(0, 180) ?? '',
            };
          } catch { return null; }
        })
      );

      // Supervision Materials
      const materialPaths = await listNotes({ subPath: `${supRoot}/Supervision Materials`, recursive: false }).catch(() => [] as string[]);
      const materials = await Promise.all(
        materialPaths.filter((p) => p.endsWith('.md')).map(async (p) => {
          try {
            const n = await readNote(p);
            return {
              path: n.path,
              name: n.name,
              title: extractTitle(n.name, n.body, n.frontmatter),
              preview: cleanObsidianMarkup(n.body).split('\n').find((l) => l.trim() && !l.startsWith('#'))?.slice(0, 180) ?? '',
            };
          } catch { return null; }
        })
      );

      return c.json({
        dashboard,
        meetings: meetings.filter(Boolean).sort((a, b) => (b!.name).localeCompare(a!.name, undefined, { numeric: true })),
        milestones: milestones.filter(Boolean),
        detailedWork: detailedWork.filter(Boolean),
        scopePoints: scopePoints.filter(Boolean).sort((a, b) => a!.name.localeCompare(b!.name, undefined, { numeric: true })),
        materials: materials.filter(Boolean),
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Read a single supervision meeting / milestone (cleaned) ──────────
  app.get('/api/vault/supervision/file', async (c) => {
    const relPath = decodeURIComponent(c.req.query('path') ?? '');
    if (!relPath) return c.json({ error: 'path required' }, 400);
    try {
      const n = await readNote(relPath);
      return c.json({
        path: n.path,
        name: n.name,
        title: extractTitle(n.name, n.body, n.frontmatter),
        frontmatter: n.frontmatter,
        body: cleanObsidianMarkup(n.body),
        sections: n.sections.map((s) => ({
          ...s,
          content: cleanObsidianMarkup(s.content),
        })),
        tasks: n.tasks,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ENOENT')) return c.json({ error: 'Not found' }, 404);
      return c.json({ error: msg }, 500);
    }
  });

  // ── Create a new atomic note ──────────────────────────────────────────
  // Body: { title, body, category?, tags?, source? }
  app.post('/api/vault/atomic-notes', async (c) => {
    const body = await c.req.json<{
      title: string;
      body: string;
      category?: string;
      tags?: string[];
      source?: string;
    }>();
    if (!body.title?.trim() || !body.body?.trim()) {
      return c.json({ error: 'title and body required' }, 400);
    }
    // Sanitize the title for filename (Obsidian-safe)
    const safeTitle = body.title.trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 120);
    const cat = (body.category ?? 'General').trim();
    const relPath = `01 PhD/03 Atomic Notes/${cat}/${safeTitle}.md`;

    if (await noteExists(relPath)) {
      return c.json({ error: 'note already exists', path: relPath }, 409);
    }

    const fm: Record<string, unknown> = {
      created: new Date().toISOString().slice(0, 10),
      tags: body.tags ?? [],
    };
    if (body.source) fm.source = body.source;
    const keyOrder = ['created', 'tags', ...(body.source ? ['source'] : [])];

    const content = [
      '---',
      writeFrontmatter(fm, keyOrder),
      '---',
      '',
      `# ${body.title.trim()}`,
      '',
      body.body.trim(),
      '',
    ].join('\n');

    try {
      await writeNoteRaw(relPath, content);
      await auditLog({ action: 'atomic-note.create', path: relPath, source: 'platform:user', meta: { title: body.title, category: cat } });
      invalidateCache('vault.');
      return c.json({ path: relPath, ok: true }, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Update an atomic note's body ─────────────────────────────────────
  // Body: { body }  — replaces the body content (preserves frontmatter via re-render)
  app.put('/api/vault/atomic-notes/*', async (c) => {
    const relPath = decodeURIComponent(c.req.param('*') ?? '');
    if (!relPath) return c.json({ error: 'path required' }, 400);
    const { body } = await c.req.json<{ body: string }>();
    if (typeof body !== 'string') return c.json({ error: 'body required' }, 400);
    try {
      const note = await readNote(relPath);
      // Reconstruct: frontmatter + new body
      const fm = note.frontmatterRaw
        ? `---\n${note.frontmatterRaw}\n---\n\n`
        : '';
      await writeNoteRaw(relPath, fm + body);
      await auditLog({ action: 'atomic-note.update', path: relPath, source: 'platform:user' });
      invalidateCache('vault.');
      return c.json({ ok: true, path: relPath });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ENOENT')) return c.json({ error: 'Not found' }, 404);
      return c.json({ error: msg }, 500);
    }
  });

  // ── Single atomic note (full read view) ──────────────────────────────
  app.get('/api/vault/atomic-notes/*', async (c) => {
    const relPath = decodeURIComponent(c.req.param('*') ?? '');
    if (!relPath) return c.json({ error: 'path required' }, 400);
    try {
      const note = await readNote(relPath);
      const bodyClean = cleanObsidianMarkup(note.body);
      const connections = extractWikilinks(note.body);
      return c.json({
        path: note.path,
        name: note.name,
        frontmatter: note.frontmatter,
        body: bodyClean,
        bodyRaw: note.body,
        connections,
        sections: note.sections,
        tasks: note.tasks,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ENOENT')) return c.json({ error: 'Not found' }, 404);
      return c.json({ error: msg }, 500);
    }
  });

  // ── Literature library: list all Academic Literature notes ────────────
  app.get('/api/vault/literature', async (c) => {
    try {
      const paths = await listNotes({ subPath: '01 PhD/02 Literature Review/Academic Literature' });
      const notes = await Promise.all(
        paths.slice(0, 200).map(async (p) => {
          try {
            const note = await readNote(p);
            const fm = note.frontmatter;
            return {
              path: note.path,
              name: note.name,
              citekey: note.citekey,
              type: (fm.Type ?? fm.type) as string | undefined,
              year: fm.Year as number | undefined,
              authors: fm.Authors as string | undefined,
              tags: fm.tags as string[] | undefined,
              // Reading tracker fields (synced with Obsidian frontmatter)
              readingStatus: (fm.Reading_status ?? fm.reading_status ?? 'To Read') as string,
              readingPriority: (fm.reading_priority ?? fm.Reading_priority) as 'high' | 'medium' | 'low' | undefined,
              readingOrder: (fm.reading_order ?? fm.Reading_order) as number | undefined,
              notesExported: Boolean(fm.notes_exported ?? fm.Notes_exported ?? false),
              startedAt: (fm.started_at ?? fm.Started_at) as string | undefined,
              finishedAt: (fm.finished_at ?? fm.Finished_at) as string | undefined,
              myNotes: (fm.my_notes ?? fm.My_notes) as string | undefined,
              relevance: fm.relevant_to_my_study as string | undefined,
              zoteroItemKey: note.zoteroItemKey,
            };
          } catch {
            return null;
          }
        })
      );
      return c.json({ notes: notes.filter(Boolean), total: paths.length });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Sync a Zotero item into Obsidian as an Academic Literature note ──
  // Body: { itemKey, priority?, order?, status? }
  // Creates a new .md file in `01 PhD/02 Literature Review/Academic Literature/`
  // with full Zotero metadata + reading tracker fields seeded.
  app.post('/api/vault/literature/sync-from-zotero', async (c) => {
    const body = await c.req.json<{
      itemKey: string;
      priority?: 'high' | 'medium' | 'low';
      order?: number;
      status?: string;
    }>();
    if (!body.itemKey) return c.json({ error: 'itemKey required' }, 400);

    try {
      const { fetchZoteroPaper } = await import('@ruhool/core');
      const fetched = await fetchZoteroPaper(body.itemKey);
      const meta = fetched.meta;
      const safeTitle = (meta.title ?? body.itemKey)
        .replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
      const yearStr = meta.year ? `${meta.year}-` : '';
      const filename = `${yearStr}${safeTitle}.md`;
      const relPath = `01 PhD/02 Literature Review/Academic Literature/${filename}`;

      if (await noteExists(relPath)) {
        return c.json({ error: 'note already exists', path: relPath }, 409);
      }

      const today = new Date().toISOString().slice(0, 10);
      const fm: Record<string, unknown> = {
        Citekey: body.itemKey,
        Type: meta.itemType ?? 'journalArticle',
        Year: meta.year ?? null,
        Authors: meta.authors ?? null,
        Added_On: today,
        DOI: meta.doi ?? null,
        Journal: meta.journal ?? null,
        zoteroItemKey: body.itemKey,
        tags: [],
        Reading_status: body.status ?? 'To Read',
        reading_priority: body.priority ?? 'medium',
        reading_order: body.order ?? null,
        notes_exported: false,
      };
      const keyOrder = Object.keys(fm);
      const yamlBlock = writeFrontmatter(fm, keyOrder);
      const content = [
        '---',
        yamlBlock,
        '---',
        '',
        `# ${meta.title ?? body.itemKey}`,
        '',
        meta.abstractNote ? `> [!abstract]- Abstract\n> ${meta.abstractNote.replace(/\n/g, '\n> ')}\n` : '',
        '## 📝 ملاحظاتي',
        '',
        '## 🔆 Highlights',
        '',
        '## 🔗 Related',
        '',
      ].join('\n');

      await writeNoteRaw(relPath, content);
      await auditLog({
        action: 'literature.sync-from-zotero',
        path: relPath,
        source: 'platform:user',
        meta: { itemKey: body.itemKey, title: meta.title, year: meta.year, authors: meta.authors },
      });
      return c.json({ ok: true, path: relPath, citekey: body.itemKey });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Update a paper's reading tracker fields ───────────────────────────
  // Body: { readingStatus?, readingPriority?, readingOrder?, notesExported?, myNotes? }
  // Writes back to the Obsidian note's frontmatter, preserving everything else.
  app.patch('/api/vault/literature/*', async (c) => {
    const relPath = decodeURIComponent(c.req.param('*') ?? '');
    if (!relPath) return c.json({ error: 'path required' }, 400);
    const body = await c.req.json<{
      readingStatus?: string;
      readingPriority?: 'high' | 'medium' | 'low' | null;
      readingOrder?: number | null;
      notesExported?: boolean;
      myNotes?: string;
      startedAt?: string | null;
      finishedAt?: string | null;
    }>();
    try {
      const note = await readNote(relPath);
      // Preserve frontmatter key order; update target keys in place.
      const fm = { ...note.frontmatter };
      const today = new Date().toISOString().slice(0, 10);

      if (body.readingStatus !== undefined) {
        fm.Reading_status = body.readingStatus;
        // Auto-stamp dates on transitions
        if (body.readingStatus === 'Reading' && !fm.started_at) fm.started_at = today;
        if (body.readingStatus === 'Read' && !fm.finished_at) fm.finished_at = today;
      }
      if (body.readingPriority !== undefined) fm.reading_priority = body.readingPriority;
      if (body.readingOrder !== undefined) fm.reading_order = body.readingOrder;
      if (body.notesExported !== undefined) fm.notes_exported = body.notesExported;
      if (body.myNotes !== undefined) fm.my_notes = body.myNotes;
      if (body.startedAt !== undefined) fm.started_at = body.startedAt;
      if (body.finishedAt !== undefined) fm.finished_at = body.finishedAt;

      // Build key order: original order + any new keys appended
      const existingKeys = note.frontmatterKeyOrder.filter((k) => k in fm);
      const newKeys = Object.keys(fm).filter((k) => !existingKeys.includes(k));
      const keyOrder = [...existingKeys, ...newKeys];

      const yamlBlock = writeFrontmatter(fm, keyOrder);
      const fullContent = `---\n${yamlBlock}\n---\n\n${note.body}`;
      await writeNoteRaw(relPath, fullContent);
      await auditLog({
        action: 'literature.update-tracker',
        path: relPath,
        source: 'platform:user',
        meta: { fields: Object.keys(body) },
      });
      return c.json({ ok: true, frontmatter: fm });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ENOENT')) return c.json({ error: 'Not found' }, 404);
      return c.json({ error: msg }, 500);
    }
  });
}
