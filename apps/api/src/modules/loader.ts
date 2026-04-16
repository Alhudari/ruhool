import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../server/logging.js';

/**
 * ARC-04: module loader.
 *
 * At boot, scan `modules/<type>/<name>/manifest.json`. For each manifest:
 * - Record it in the registry.
 * - If `entry` exists, dynamically import() it (best-effort).
 *
 * This is a minimal first cut; permission enforcement is wired downstream
 * in the agent delegation tool (see services/agents/manager.ts — only
 * specialists declared in loaded manifests are exposed as delegation targets).
 */

export interface ModuleManifest {
  id: string;
  version?: string;
  type: 'agent' | 'theme' | 'llm-provider' | 'skill' | 'tool' | 'widget' | 'workflow' | 'integration' | string;
  name?: { en?: string; ar?: string } | string;
  description?: { en?: string; ar?: string } | string;
  author?: string;
  entry?: string;
  permissions?: string[];
  tools?: string[];
  requires?: Record<string, unknown>;
  /** Filled in by the loader. */
  _dir?: string;
}

export interface LoadedModule {
  manifest: ModuleManifest;
  dir: string;
  instance?: unknown;
  loadError?: string;
}

export class ModuleRegistry {
  private modules: LoadedModule[] = [];

  all(): LoadedModule[] {
    return this.modules.slice();
  }

  byType(type: string): LoadedModule[] {
    return this.modules.filter((m) => m.manifest.type === type);
  }

  byId(id: string): LoadedModule | undefined {
    return this.modules.find((m) => m.manifest.id === id);
  }

  /** Redact permissions + entry path from output suitable for /api/modules. */
  redactedManifests(): ModuleManifest[] {
    return this.modules.map((m) => {
      const { entry: _entry, ...rest } = m.manifest;
      void _entry;
      return rest;
    });
  }

  add(m: LoadedModule): void {
    this.modules.push(m);
  }
}

export const moduleRegistry = new ModuleRegistry();

function safeIsDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export async function scanAndLoadModules(modulesRoot: string): Promise<LoadedModule[]> {
  if (!safeIsDir(modulesRoot)) {
    logger.warn({ modulesRoot }, 'modules root missing; skipping module scan');
    return [];
  }
  const loaded: LoadedModule[] = [];
  for (const type of fs.readdirSync(modulesRoot)) {
    const typeDir = path.join(modulesRoot, type);
    if (!safeIsDir(typeDir)) continue;
    for (const modName of fs.readdirSync(typeDir)) {
      const modDir = path.join(typeDir, modName);
      if (!safeIsDir(modDir)) continue;
      const manifestPath = path.join(modDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;
      let manifest: ModuleManifest;
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as ModuleManifest;
      } catch (err) {
        logger.warn({ manifestPath, err: (err as Error).message }, 'invalid manifest.json');
        continue;
      }
      manifest._dir = modDir;
      const entry: LoadedModule = { manifest, dir: modDir };
      if (manifest.entry) {
        const entryPath = path.join(modDir, manifest.entry);
        if (fs.existsSync(entryPath)) {
          try {
            entry.instance = await import(/* @vite-ignore */ entryPath);
          } catch (err) {
            entry.loadError = (err as Error).message;
            logger.warn({ modId: manifest.id, err: entry.loadError }, 'module entry import failed');
          }
        }
      }
      moduleRegistry.add(entry);
      loaded.push(entry);
    }
  }
  logger.info(
    { count: loaded.length, types: Array.from(new Set(loaded.map((m) => m.manifest.type))) },
    'modules loaded'
  );
  return loaded;
}
