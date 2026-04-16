import fs from 'node:fs';
import path from 'node:path';
import { ModuleManifest } from '@ruhool/shared';

interface LoadedModule {
  manifest: ModuleManifest;
  path: string;
}

class PluginRegistry {
  private modules = new Map<string, LoadedModule>();
  private modulesDir: string;

  constructor(modulesDir: string) {
    this.modulesDir = modulesDir;
  }

  async scan() {
    this.modules.clear();
    const typesDirs = fs.readdirSync(this.modulesDir, { withFileTypes: true });

    for (const typeDir of typesDirs) {
      if (!typeDir.isDirectory()) continue;
      const typePath = path.join(this.modulesDir, typeDir.name);
      const moduleDirs = fs.readdirSync(typePath, { withFileTypes: true });

      for (const moduleDir of moduleDirs) {
        if (!moduleDir.isDirectory()) continue;
        const modulePath = path.join(typePath, moduleDir.name);
        const manifestPath = path.join(modulePath, 'manifest.json');

        if (!fs.existsSync(manifestPath)) continue;

        try {
          const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          const manifest = ModuleManifest.parse(raw);
          this.modules.set(manifest.id, { manifest, path: modulePath });
        } catch (err) {
          console.warn(
            `[Registry] Failed to load module at ${modulePath}:`,
            err instanceof Error ? err.message : err
          );
        }
      }
    }

    return this.modules.size;
  }

  get(id: string): LoadedModule | undefined {
    return this.modules.get(id);
  }

  getByType(type: string): LoadedModule[] {
    return [...this.modules.values()].filter((m) => m.manifest.type === type);
  }

  getAll(): LoadedModule[] {
    return [...this.modules.values()];
  }

  has(id: string): boolean {
    return this.modules.has(id);
  }

  checkDependencies(moduleId: string): { ok: boolean; missing: string[] } {
    const mod = this.modules.get(moduleId);
    if (!mod) return { ok: false, missing: [`Module "${moduleId}" not found`] };

    const missing: string[] = [];
    const requires = mod.manifest.requires;
    if (!requires) return { ok: true, missing: [] };

    if (requires.skills) {
      for (const skill of requires.skills) {
        if (!this.has(skill)) missing.push(`skill:${skill}`);
      }
    }
    if (requires.tools) {
      for (const tool of requires.tools) {
        if (!this.has(tool)) missing.push(`tool:${tool}`);
      }
    }

    return { ok: missing.length === 0, missing };
  }
}

export function createRegistry(modulesDir: string) {
  return new PluginRegistry(modulesDir);
}

export type { PluginRegistry, LoadedModule };
