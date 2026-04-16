import type { StorageAdapter, ListOptions } from './types.js';

/**
 * Supabase Storage adapter.
 * Uses Supabase's S3-compatible storage API.
 * Install @supabase/supabase-js when ready to use.
 */
export class SupabaseStorageAdapter implements StorageAdapter {
  readonly id = 'supabase';
  readonly name = { en: 'Supabase Storage', ar: 'تخزين سوبابيس' };

  private client: SupabaseStorageClient;

  constructor(supabaseUrl: string, supabaseServiceKey: string) {
    // Lazy import to avoid requiring the dependency until needed
    this.client = createSupabaseStorageClient(supabaseUrl, supabaseServiceKey);
  }

  async write(bucket: string, filePath: string, content: Buffer | string, contentType?: string): Promise<void> {
    const data = typeof content === 'string' ? Buffer.from(content) : content;
    const { error } = await this.client.from(bucket).upload(filePath, data, {
      upsert: true,
      contentType: contentType || 'application/octet-stream',
    });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
  }

  async read(bucket: string, filePath: string): Promise<Buffer | null> {
    const { data, error } = await this.client.from(bucket).download(filePath);
    if (error) {
      if (error.message?.includes('not found') || error.message?.includes('404')) return null;
      throw new Error(`Supabase download failed: ${error.message}`);
    }
    return Buffer.from(await data.arrayBuffer());
  }

  async exists(bucket: string, filePath: string): Promise<boolean> {
    const dir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
    const name = filePath.includes('/') ? filePath.substring(filePath.lastIndexOf('/') + 1) : filePath;
    const { data } = await this.client.from(bucket).list(dir, { search: name, limit: 1 });
    return (data?.length ?? 0) > 0;
  }

  async delete(bucket: string, filePath: string): Promise<void> {
    await this.client.from(bucket).remove([filePath]);
  }

  async list(bucket: string, options?: ListOptions): Promise<string[]> {
    const { data, error } = await this.client.from(bucket).list(options?.prefix || '', {
      limit: options?.limit || 1000,
      offset: options?.offset || 0,
    });
    if (error) throw new Error(`Supabase list failed: ${error.message}`);
    return (data || []).map((f) => f.name);
  }

  async getUrl(bucket: string, filePath: string, expiresIn = 3600): Promise<string> {
    const { data } = await this.client.from(bucket).createSignedUrl(filePath, expiresIn);
    if (!data?.signedUrl) {
      // Fallback to public URL
      const { data: pub } = this.client.from(bucket).getPublicUrl(filePath);
      return pub.publicUrl;
    }
    return data.signedUrl;
  }

  async healthCheck(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.listBuckets();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

// ─── Minimal Supabase storage types (avoids hard dependency) ───

interface SupabaseStorageBucket {
  from(bucket: string): SupabaseStorageBucketApi;
  listBuckets(): Promise<{ data: unknown[] | null; error: unknown | null }>;
}

interface SupabaseStorageBucketApi {
  upload(path: string, data: Buffer, opts?: { upsert?: boolean; contentType?: string }): Promise<{ data: unknown; error: { message: string } | null }>;
  download(path: string): Promise<{ data: Blob; error: { message: string } | null }>;
  list(prefix?: string, opts?: { search?: string; limit?: number; offset?: number }): Promise<{ data: { name: string }[] | null; error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ error: { message: string } | null }>;
  createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null }>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
}

type SupabaseStorageClient = SupabaseStorageBucket;

function createSupabaseStorageClient(url: string, key: string): SupabaseStorageClient {
  // Dynamic import at runtime — @supabase/supabase-js must be installed
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key);
  return supabase.storage as SupabaseStorageClient;
}
