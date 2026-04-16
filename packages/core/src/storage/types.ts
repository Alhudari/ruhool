/**
 * Ruhool Storage Abstraction
 *
 * Swap between Local FS, Supabase Storage, S3, or any provider
 * by changing STORAGE_PROVIDER env var. All file operations go
 * through this interface.
 */

export interface StorageFile {
  path: string;
  content: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface ListOptions {
  prefix?: string;
  limit?: number;
  offset?: number;
}

export interface StorageAdapter {
  readonly id: string;
  readonly name: { en: string; ar: string };

  /** Write a file. Creates parent dirs/buckets as needed. */
  write(bucket: string, filePath: string, content: Buffer | string, contentType?: string): Promise<void>;

  /** Read a file. Returns null if not found. */
  read(bucket: string, filePath: string): Promise<Buffer | null>;

  /** Check if a file exists. */
  exists(bucket: string, filePath: string): Promise<boolean>;

  /** Delete a file. No-op if not found. */
  delete(bucket: string, filePath: string): Promise<void>;

  /** List files in a bucket/prefix. */
  list(bucket: string, options?: ListOptions): Promise<string[]>;

  /** Get a public or signed URL for a file (for serving to clients). */
  getUrl(bucket: string, filePath: string, expiresIn?: number): Promise<string>;

  /** Test the connection / verify config. */
  healthCheck(): Promise<{ ok: boolean; error?: string }>;
}

/** Well-known bucket names used across Ruhool. */
export const BUCKETS = {
  PAPERS: 'papers',
  NOTES: 'notes',
  BACKUPS: 'backups',
  AUDIO: 'audio',
  CAPTIONS: 'captions',
  UPLOADS: 'uploads',
  VIDEOS: 'videos',
  IMAGES: 'images',
  STUDIO_ASSETS: 'studio-assets',
  RESEARCH: 'research',
  STATEMENTS: 'statements',
  VOICE_SAMPLES: 'voice-samples',
} as const;

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];
