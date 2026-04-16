import fs from 'node:fs';
import path from 'node:path';
import type { StorageAdapter, ListOptions } from './types.js';

/**
 * Local filesystem storage adapter.
 * Maps buckets to subdirectories under a root data directory.
 */
export class LocalStorageAdapter implements StorageAdapter {
  readonly id = 'local';
  readonly name = { en: 'Local Filesystem', ar: 'تخزين محلي' };

  constructor(private readonly rootDir: string) {
    fs.mkdirSync(rootDir, { recursive: true });
  }

  private resolve(bucket: string, filePath: string): string {
    return path.join(this.rootDir, bucket, filePath);
  }

  private ensureDir(fullPath: string): void {
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  async write(bucket: string, filePath: string, content: Buffer | string): Promise<void> {
    const full = this.resolve(bucket, filePath);
    this.ensureDir(full);
    fs.writeFileSync(full, content);
  }

  async read(bucket: string, filePath: string): Promise<Buffer | null> {
    const full = this.resolve(bucket, filePath);
    if (!fs.existsSync(full)) return null;
    return fs.readFileSync(full);
  }

  async exists(bucket: string, filePath: string): Promise<boolean> {
    return fs.existsSync(this.resolve(bucket, filePath));
  }

  async delete(bucket: string, filePath: string): Promise<void> {
    const full = this.resolve(bucket, filePath);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }

  async list(bucket: string, options?: ListOptions): Promise<string[]> {
    const dir = path.join(this.rootDir, bucket, options?.prefix || '');
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { recursive: false }) as string[];
    const start = options?.offset || 0;
    const end = options?.limit ? start + options.limit : undefined;
    return entries.slice(start, end);
  }

  async getUrl(bucket: string, filePath: string): Promise<string> {
    // Local adapter returns a relative path; API routes serve the file
    return `/api/files/${bucket}/${filePath}`;
  }

  async healthCheck(): Promise<{ ok: boolean; error?: string }> {
    try {
      fs.accessSync(this.rootDir, fs.constants.R_OK | fs.constants.W_OK);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Direct filesystem path — only for local adapter, used during migration. */
  getLocalPath(bucket: string, filePath: string): string {
    return this.resolve(bucket, filePath);
  }
}
