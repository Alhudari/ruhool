/**
 * Vault adapter — abstract interface so the same code can run with:
 *   - LocalFsAdapter   (today: reads/writes Obsidian vault on disk)
 *   - GitVaultAdapter  (future: clones a Git repo into a tmp dir, commits writes)
 *   - DropboxAdapter   (future: uses Dropbox API)
 *
 * The current code calls vault-reader functions directly; this file defines
 * the interface for the migration. Switch by setting RUHOOL_VAULT_ADAPTER env.
 *
 * NOT WIRED IN YET — landing this file as a contract so the implementation
 * can land incrementally without breaking local-first usage.
 */

export interface VaultStat {
  isFile: boolean;
  isDirectory: boolean;
  mtime: number;
  size: number;
}

export interface VaultAdapter {
  /** Reads the file at relPath (UTF-8). Throws if not found. */
  readFile(relPath: string): Promise<string>;
  /** Writes content to relPath. Creates parent dirs as needed. */
  writeFile(relPath: string, content: string): Promise<void>;
  /** Lists relative file paths under subPath. */
  listFiles(subPath: string, opts?: { recursive?: boolean; extension?: string }): Promise<string[]>;
  /** Lists immediate folders under subPath. */
  listFolders(subPath: string): Promise<string[]>;
  /** Moves/renames a file or folder atomically. */
  move(srcRel: string, dstRel: string): Promise<void>;
  /** Removes a file (does NOT remove folders). */
  remove(relPath: string): Promise<void>;
  /** Stats a path. Returns null if it doesn't exist. */
  stat(relPath: string): Promise<VaultStat | null>;
  /** Returns the human-readable name of the vault (used in obsidian:// URLs). */
  name(): string;
}

/**
 * Choose the right adapter based on environment.
 *   RUHOOL_VAULT_ADAPTER=local   (default)
 *   RUHOOL_VAULT_ADAPTER=git     (future)
 *   RUHOOL_VAULT_ADAPTER=dropbox (future)
 */
export type VaultAdapterKind = 'local' | 'git' | 'dropbox';

export function pickAdapterKind(): VaultAdapterKind {
  const env = (typeof process !== 'undefined' ? process.env.RUHOOL_VAULT_ADAPTER : '') as VaultAdapterKind | undefined;
  if (env === 'git' || env === 'dropbox') return env;
  return 'local';
}

/**
 * Future Git adapter sketch — not implemented. The shape:
 *
 *   class GitVaultAdapter implements VaultAdapter {
 *     constructor(private repoUrl: string, private localCache: string) {}
 *     async ensureCloned() { if (!exists(this.localCache)) await git.clone(this.repoUrl, this.localCache); else await git.pull(this.localCache); }
 *     async readFile(p) { await this.ensureCloned(); return fs.readFile(join(this.localCache, p), 'utf8'); }
 *     async writeFile(p, c) { await this.ensureCloned(); await fs.writeFile(join(this.localCache, p), c); await git.commit(this.localCache, `update ${p}`); await git.push(this.localCache); }
 *     ...
 *   }
 *
 * For Vercel: the localCache lives in /tmp. Cold starts re-clone or pull.
 * Use a webhook to invalidate cache on git pushes from outside.
 */
