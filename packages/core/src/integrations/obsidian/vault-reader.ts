// Obsidian vault reader: walks the vault on disk, parses frontmatter and tasks,
// and gives Ruhool live access to the user's PhD knowledge base.
// Source of truth is always the vault on disk — Ruhool never duplicates content.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

// New vault path — Ruhool single-source-of-truth setup.
// User's old vault was at "...\Obsidian\PhD"; the new structure lives at "...\Ruhool".
// If the new vault exists, prefer it; otherwise fall back to the old path so existing
// installations don't break.
const NEW_VAULT_PATH = 'C:\\Users\\alhud\\OneDrive - University of Birmingham\\Ruhool';
const LEGACY_VAULT_PATH = 'C:\\Users\\alhud\\OneDrive - University of Birmingham\\Obsidian\\PhD';

export function getVaultRoot(): string {
  if (process.env.OBSIDIAN_VAULT_PATH) {
    return process.env.OBSIDIAN_VAULT_PATH.replace(/[/\\]+$/, '');
  }
  // Auto-detect: prefer new vault if its `01 PhD/04 Supervision/` tree has
  // any real .md content (recursive). The earlier heuristic only scanned
  // the `Meetings/` subfolder, which caused a silent fallback to legacy
  // even when the user had migrated every other note. Now any supervision
  // markdown (MOCs, milestones, meetings) is enough signal to switch.
  try {
    const fsSync = require('node:fs') as typeof import('node:fs');
    const supervisionRoot = `${NEW_VAULT_PATH}\\01 PhD\\04 Supervision`;
    if (fsSync.existsSync(supervisionRoot) && hasAnyMarkdown(fsSync, supervisionRoot)) {
      return NEW_VAULT_PATH;
    }
  } catch { /* fall through */ }
  return LEGACY_VAULT_PATH;
}

// Walks `dir` up to 3 levels deep looking for a single `.md` file. Stops
// at the first hit — cheap enough to run on every getVaultRoot() call.
function hasAnyMarkdown(
  fsSync: typeof import('node:fs'),
  dir: string,
  depth = 0,
): boolean {
  if (depth > 3) return false;
  let entries: string[];
  try {
    entries = fsSync.readdirSync(dir);
  } catch {
    return false;
  }
  for (const name of entries) {
    if (name.endsWith('.md')) return true;
    try {
      const full = `${dir}\\${name}`;
      const st = fsSync.statSync(full);
      if (st.isDirectory() && hasAnyMarkdown(fsSync, full, depth + 1)) return true;
    } catch { /* ignore */ }
  }
  return false;
}

export interface VaultTask {
  text: string;
  done: boolean;
  line: number; // 1-indexed
  section?: string;
  notePath: string; // vault-relative
}

export interface VaultSection {
  level: number;
  heading: string;
  startLine: number;
  endLine: number;
  content: string;
}

export interface VaultNote {
  path: string; // vault-relative, forward slashes
  absPath: string;
  name: string; // file name without .md
  mtime: number;
  size: number;
  frontmatter: Record<string, unknown>;
  frontmatterKeyOrder: string[]; // preserves YAML key order for round-trip
  frontmatterRaw: string; // original YAML text
  body: string;
  sections: VaultSection[];
  tasks: VaultTask[];
  // Convenience: pulled out of frontmatter when present
  citekey?: string;
  type?: string;
  zoteroItemKey?: string;
}

// ── Frontmatter parser ────────────────────────────────────────────────
// Handles: scalar (string/number/boolean/null/date), arrays of strings,
// empty values. Preserves key order. Tuned for the user's templates.

function parseScalar(raw: string): unknown {
  const v = raw.trim();
  if (v === '' || v === '~' || v.toLowerCase() === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d+\.\d+$/.test(v)) return Number(v);
  // Strip surrounding quotes if present
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

export function parseFrontmatter(raw: string): {
  data: Record<string, unknown>;
  keyOrder: string[];
} {
  const lines = raw.split(/\r?\n/);
  const data: Record<string, unknown> = {};
  const keyOrder: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line || line.trim() === '') {
      i++;
      continue;
    }
    // Indented continuation (handled by parent)
    if (/^\s/.test(line) && !/^-\s/.test(line.trim())) {
      i++;
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_.-][A-Za-z0-9_. -]*?)\s*:\s*(.*)$/);
    if (!match) {
      i++;
      continue;
    }
    const key = match[1].trim();
    const rest = match[2];
    keyOrder.push(key);

    if (rest.trim() === '') {
      // Could be empty scalar OR start of array on next lines
      const arr: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        const itemMatch = next.match(/^\s+-\s+(.*)$/);
        if (itemMatch) {
          arr.push(parseScalar(itemMatch[1]) as string);
          j++;
          continue;
        }
        if (next.trim() === '') {
          j++;
          continue;
        }
        break;
      }
      if (arr.length > 0) {
        data[key] = arr;
        i = j;
      } else {
        data[key] = null;
        i++;
      }
    } else {
      data[key] = parseScalar(rest);
      i++;
    }
  }

  return { data, keyOrder };
}

// ── Frontmatter writer (round-trips with key order) ───────────────────

function escapeScalar(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  // Wrap in quotes if it contains characters that would break YAML
  if (/^[#&*!|>%@`]/.test(s) || /:\s/.test(s) || /[\n\r]/.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

export function writeFrontmatter(data: Record<string, unknown>, keyOrder: string[]): string {
  const out: string[] = [];
  const seen = new Set<string>();
  const emit = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    if (!(key in data)) return;
    const v = data[key];
    if (Array.isArray(v)) {
      if (v.length === 0) {
        out.push(`${key}:`);
      } else {
        out.push(`${key}:`);
        for (const item of v) out.push(`  - ${escapeScalar(item)}`);
      }
    } else {
      out.push(`${key}: ${escapeScalar(v)}`);
    }
  };
  for (const k of keyOrder) emit(k);
  for (const k of Object.keys(data)) emit(k);
  return out.join('\n');
}

// ── File-level parsing ────────────────────────────────────────────────

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function splitFrontmatter(text: string): { yaml: string; body: string } {
  const m = text.match(FRONTMATTER_RE);
  if (!m) return { yaml: '', body: text };
  return { yaml: m[1], body: text.slice(m[0].length) };
}

function extractSections(body: string): VaultSection[] {
  const lines = body.split(/\r?\n/);
  const sections: VaultSection[] = [];
  let current: VaultSection | null = null;
  let buf: string[] = [];

  const flush = (endLine: number) => {
    if (current) {
      current.content = buf.join('\n').trim();
      current.endLine = endLine;
      sections.push(current);
    }
  };

  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const h = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (h) {
      flush(n);
      current = {
        level: h[1].length,
        heading: h[2].trim(),
        startLine: n + 1,
        endLine: n + 1,
        content: '',
      };
      buf = [];
    } else {
      buf.push(line);
    }
  }
  flush(lines.length);
  return sections;
}

function extractTasks(body: string, notePath: string, sections: VaultSection[]): VaultTask[] {
  const lines = body.split(/\r?\n/);
  const tasks: VaultTask[] = [];
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const m = line.match(/^\s*-\s+\[([ xX])\]\s+(.*?)\s*$/);
    if (!m) continue;
    const sect = sections.find((s) => n + 1 >= s.startLine && n + 1 <= s.endLine);
    tasks.push({
      text: m[2].trim(),
      done: m[1].toLowerCase() === 'x',
      line: n + 1,
      section: sect?.heading,
      notePath,
    });
  }
  return tasks;
}

export async function readNote(relPath: string): Promise<VaultNote> {
  const root = getVaultRoot();
  const rel = relPath.replace(/^[/\\]+/, '').replace(/\\/g, '/');
  const absPath = path.join(root, rel);
  const text = await fs.readFile(absPath, 'utf8');
  const stat = await fs.stat(absPath);
  const { yaml, body } = splitFrontmatter(text);
  const { data, keyOrder } = yaml ? parseFrontmatter(yaml) : { data: {}, keyOrder: [] };
  const sections = extractSections(body);
  const tasks = extractTasks(body, rel, sections);

  const citekey = typeof data.Citekey === 'string' ? data.Citekey : undefined;
  const type = typeof data.type === 'string' ? data.type : undefined;
  let zoteroItemKey: string | undefined;
  const zoteroMatch = body.match(/zotero:\/\/select\/library\/items\/([A-Z0-9]{6,12})/);
  if (zoteroMatch) zoteroItemKey = zoteroMatch[1];

  return {
    path: rel,
    absPath,
    name: path.basename(rel, '.md'),
    mtime: stat.mtimeMs,
    size: stat.size,
    frontmatter: data,
    frontmatterKeyOrder: keyOrder,
    frontmatterRaw: yaml,
    body,
    sections,
    tasks,
    citekey,
    type,
    zoteroItemKey,
  };
}

// ── Listing / searching ───────────────────────────────────────────────

export interface ListOpts {
  subPath?: string; // vault-relative subdirectory to scope to
  recursive?: boolean; // default true
  includeArchive?: boolean; // default false (skips "99 Archive")
}

// Recursively move ALL .md files (and subfolders' .md files) from srcRel
// to dstRel, preserving folder structure. Skips paths matching `skipPatterns`.
// Uses per-file rename (works around Windows/OneDrive folder-lock issues
// where moving a whole folder atomically fails with EPERM).
export async function moveContentsInVault(
  srcRel: string,
  dstRel: string,
  opts: { skipPatterns?: RegExp[]; alsoMoveFolders?: boolean } = {},
): Promise<{ movedFiles: string[]; failed: Array<{ path: string; error: string }> }> {
  const root = getVaultRoot();
  const srcAbs = path.join(root, srcRel.replace(/\\/g, '/'));
  const dstAbs = path.join(root, dstRel.replace(/\\/g, '/'));
  if (!srcAbs.startsWith(root) || !dstAbs.startsWith(root)) {
    throw new Error(`Refusing to move outside vault: ${srcRel} → ${dstRel}`);
  }
  const movedFiles: string[] = [];
  const failed: Array<{ path: string; error: string }> = [];
  const skipPatterns = opts.skipPatterns ?? [];

  async function walk(srcDir: string, dstDir: string): Promise<void> {
    let entries;
    try { entries = await fs.readdir(srcDir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const srcChild = path.join(srcDir, e.name);
      const relForCheck = path.relative(root, srcChild).replace(/\\/g, '/');
      if (skipPatterns.some((p) => p.test(relForCheck))) continue;
      const dstChild = path.join(dstDir, e.name);
      if (e.isDirectory()) {
        await fs.mkdir(dstChild, { recursive: true });
        await walk(srcChild, dstChild);
        // Try removing empty source folder
        try { await fs.rmdir(srcChild); } catch { /* not empty or locked */ }
      } else if (e.isFile()) {
        try {
          await fs.mkdir(path.dirname(dstChild), { recursive: true });
          await fs.rename(srcChild, dstChild);
          movedFiles.push(relForCheck);
        } catch (err) {
          failed.push({ path: relForCheck, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }
  }

  await fs.mkdir(dstAbs, { recursive: true });
  await walk(srcAbs, dstAbs);
  // Try removing the now-empty source folder
  if (opts.alsoMoveFolders) {
    try { await fs.rmdir(srcAbs); } catch { /* ignore */ }
  }
  return { movedFiles, failed };
}

// Move a file or folder inside the vault. Used for archiving.
export async function moveInVault(srcRel: string, dstRel: string): Promise<void> {
  const root = getVaultRoot();
  const src = path.join(root, srcRel.replace(/^[\\/]+/, '').replace(/\\/g, '/'));
  const dst = path.join(root, dstRel.replace(/^[\\/]+/, '').replace(/\\/g, '/'));
  if (!src.startsWith(root) || !dst.startsWith(root)) {
    throw new Error(`Refusing to move outside vault: ${srcRel} → ${dstRel}`);
  }
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.rename(src, dst);
}

// Recursively count .md files under a vault sub-path.
export async function countNotesInFolder(subPath: string): Promise<number> {
  const root = getVaultRoot();
  const start = path.join(root, subPath.replace(/^[\\/]+/, '').replace(/\\/g, '/'));
  let count = 0;
  async function walk(dir: string): Promise<void> {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && e.name.endsWith('.md')) count++;
    }
  }
  await walk(start);
  return count;
}

// Direct filesystem write — bypasses Obsidian Local REST API plugin.
// Creates parent directories as needed. Use for write paths inside the vault root only.
export async function writeNoteRaw(relPath: string, content: string): Promise<void> {
  const root = getVaultRoot();
  const norm = relPath.replace(/^[\\/]+/, '').replace(/\\/g, '/');
  const abs = path.join(root, norm);
  // Sanity: must stay inside vault root
  if (!abs.startsWith(root)) {
    throw new Error(`Refusing to write outside vault: ${relPath}`);
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf8');
}

// Check if a vault note exists.
export async function noteExists(relPath: string): Promise<boolean> {
  const root = getVaultRoot();
  const abs = path.join(root, relPath.replace(/^[\\/]+/, '').replace(/\\/g, '/'));
  try {
    const stat = await fs.stat(abs);
    return stat.isFile();
  } catch {
    return false;
  }
}

// Get the vault name (last folder segment) — used for obsidian://open?vault=NAME&file=...
export function getVaultName(): string {
  const root = getVaultRoot();
  return path.basename(root);
}

// List top-level folders in the vault — gives Ramman a map of the user's structure.
export async function listTopLevelFolders(): Promise<string[]> {
  const root = getVaultRoot();
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export async function listNotes(opts: ListOpts = {}): Promise<string[]> {
  const root = getVaultRoot();
  const start = opts.subPath ? path.join(root, opts.subPath.replace(/\\/g, '/')) : root;
  const recursive = opts.recursive !== false;
  const includeArchive = opts.includeArchive === true;
  const out: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      if (!includeArchive && /^99\s+Archive$/i.test(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (recursive) await walk(full);
      } else if (e.isFile() && e.name.endsWith('.md')) {
        out.push(path.relative(root, full).replace(/\\/g, '/'));
      }
    }
  }
  await walk(start);
  return out.sort();
}

export async function findByCitekey(citekey: string): Promise<VaultNote | null> {
  const paths = await listNotes({ subPath: '01 PhD/02 Literature Review' });
  for (const p of paths) {
    try {
      const note = await readNote(p);
      if (note.citekey === citekey) return note;
    } catch {
      // skip unreadable
    }
  }
  return null;
}

// Light-weight search across literature & atomic notes by title/filename.
// For richer queries, callers should index into a search engine later.
export async function searchNotes(query: string, limit = 25): Promise<VaultNote[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const candidates = [
    ...(await listNotes({ subPath: '01 PhD/02 Literature Review' })),
    ...(await listNotes({ subPath: '01 PhD/03 Atomic Notes' })),
    ...(await listNotes({ subPath: '01 PhD/06 Books' })),
  ];
  const results: Array<{ note: VaultNote; score: number }> = [];
  for (const p of candidates) {
    const name = path.basename(p, '.md').toLowerCase();
    let score = 0;
    if (name === q) score = 100;
    else if (name.includes(q)) score = 60;
    else {
      const words = q.split(/\s+/).filter(Boolean);
      const hits = words.filter((w) => name.includes(w)).length;
      if (hits > 0) score = (hits / words.length) * 40;
    }
    if (score > 0) {
      try {
        const note = await readNote(p);
        results.push({ note, score });
      } catch {
        // skip
      }
    }
    if (results.length >= limit * 2) break;
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit).map((r) => r.note);
}

// Aggregate all `- [ ]` / `- [x]` items across the vault (or a subPath).
export async function listAllTasks(opts: ListOpts = {}): Promise<VaultTask[]> {
  const paths = await listNotes(opts);
  const out: VaultTask[] = [];
  for (const p of paths) {
    try {
      const note = await readNote(p);
      out.push(...note.tasks);
    } catch {
      // skip
    }
  }
  return out;
}

// Toggle a single task's checkbox on disk. Surgical line edit so the rest of
// the file (and OneDrive sync hashes) are unchanged for unrelated lines.
export async function toggleTask(relPath: string, line: number, done: boolean): Promise<void> {
  const root = getVaultRoot();
  const abs = path.join(root, relPath.replace(/\\/g, '/'));
  const text = await fs.readFile(abs, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  if (line < 1 || line > lines.length) {
    throw new Error(`toggleTask: line ${line} out of range for ${relPath}`);
  }
  const target = lines[line - 1];
  const m = target.match(/^(\s*-\s+\[)([ xX])(\]\s+.*)$/);
  if (!m) {
    throw new Error(`toggleTask: no checkbox on line ${line} of ${relPath}`);
  }
  lines[line - 1] = `${m[1]}${done ? 'x' : ' '}${m[3]}`;
  await fs.writeFile(abs, lines.join(eol), 'utf8');
}
