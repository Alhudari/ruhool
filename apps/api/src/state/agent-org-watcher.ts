import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Debounced file-watcher for `data/agent-org.json`. When the file changes,
 * any subscribers are notified so they can invalidate caches. Uses the
 * low-level `fs.watch` (not chokidar) to avoid an extra dependency — the
 * file is tiny and editor save patterns (atomic rename included) are
 * covered by the 400ms debounce.
 */
type Listener = () => void;

const listeners = new Set<Listener>();
let watcherStarted = false;
let debounceTimer: NodeJS.Timeout | null = null;

function fire(): void {
  for (const l of listeners) {
    try { l(); } catch { /* ignore */ }
  }
}

export function onAgentOrgChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function startAgentOrgWatcher(opts: {
  dataRoot: string;
  logger?: { info: (m: string) => void; warn: (obj: { err: unknown }, m: string) => void };
}): { stop: () => void } {
  if (watcherStarted) return { stop: () => {} };
  watcherStarted = true;
  const filePath = path.join(opts.dataRoot, 'agent-org.json');
  try {
    const watcher = fs.watch(filePath, { persistent: false }, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        opts.logger?.info('[agent-org] file changed — invalidating cache');
        fire();
      }, 400);
    });
    return {
      stop: () => {
        try { watcher.close(); } catch { /* ignore */ }
      },
    };
  } catch (err) {
    opts.logger?.warn({ err }, '[agent-org] watcher failed to start (file may not exist yet)');
    return { stop: () => {} };
  }
}
