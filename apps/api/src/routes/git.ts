import type { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import type { StoreData } from '../store/types.js';

export interface GitRepoConfig { path: string; label?: string; allowWrite?: boolean }

export interface GitRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

/**
 * Git agent routes — safe, sandboxed git exec against user-registered repos.
 */
export function registerGitRoutes(app: Hono, deps: GitRoutesDeps): void {
  const { getStore, saveStore } = deps;

  app.get('/api/git/repos', (c) => {
    const store = getStore();
    const repos = ((store as unknown as { gitRepos?: GitRepoConfig[] }).gitRepos) || [];
    return c.json({ repos });
  });

  app.post('/api/git/repos', async (c) => {
    const store = getStore();
    const body = await c.req.json<GitRepoConfig>();
    if (!body.path) return c.json({ error: 'path required' }, 400);
    if (!fs.existsSync(path.join(body.path, '.git'))) return c.json({ error: 'Not a git repo' }, 400);
    const storeAny = store as unknown as { gitRepos?: GitRepoConfig[] };
    if (!storeAny.gitRepos) storeAny.gitRepos = [];
    storeAny.gitRepos.push({ path: body.path, label: body.label || path.basename(body.path), allowWrite: !!body.allowWrite });
    saveStore();
    return c.json({ ok: true });
  });

  app.post('/api/git/exec', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ repoPath: string; command: string; write?: boolean }>();
    const repos = ((store as unknown as { gitRepos?: GitRepoConfig[] }).gitRepos) || [];
    const repo = repos.find((r) => r.path === body.repoPath);
    if (!repo) return c.json({ error: 'repo not registered' }, 403);
    const readOnly = /^(status|log|diff|branch|show|rev-parse|ls-files|remote -v)/;
    const writeOnly = /^(add|commit|checkout|branch|push|pull|merge|rebase|stash)/;
    const cmd = body.command.trim().replace(/^git\s+/, '');
    const isWrite = writeOnly.test(cmd);
    if (isWrite && (!repo.allowWrite || !body.write)) return c.json({ error: 'write disabled for this repo' }, 403);
    if (!readOnly.test(cmd) && !isWrite) return c.json({ error: 'command not allowed' }, 400);

    const { exec } = await import('node:child_process');
    const execAsync = (await import('node:util')).promisify(exec);
    try {
      const { stdout, stderr } = await execAsync(`git ${cmd}`, { cwd: repo.path, timeout: 30_000, maxBuffer: 10 * 1024 * 1024 });
      return c.json({ ok: true, stdout: stdout.slice(0, 20000), stderr: stderr.slice(0, 5000) });
    } catch (err: unknown) {
      return c.json({ error: err instanceof Error ? err.message : 'git failed' }, 500);
    }
  });
}
