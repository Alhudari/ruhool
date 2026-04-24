import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Ruhool Safety Module
 *
 * Non-negotiable constraints enforced platform-wide.
 * These exist because a previous incident killed Node processes
 * across unrelated projects. Never again.
 */

// ESM-safe equivalent of CommonJS __dirname.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The root of all platform operations
export const PLATFORM_ROOT = path.resolve(__dirname, '../../..');

// Paths
export const DATA_DIR = path.join(PLATFORM_ROOT, 'data');
export const PRIVATE_DIR = path.join(PLATFORM_ROOT, 'data', 'private');
export const BACKUPS_DIR = path.join(PLATFORM_ROOT, 'backups');

// Commands that must NEVER be executed by any agent or tool
export const FORBIDDEN_COMMANDS = [
  'taskkill',
  'killall',
  'pkill',
  'kill -9',
  'rm -rf /',
  'rm -rf ~',
  'format',
  'del /f /s /q',
] as const;

// File patterns that must never be sent to cloud LLM providers
export const PRIVATE_PATH_PATTERNS = [
  '**/data/private/**',
  '**/.env',
  '**/.env.*',
  '**/credentials*',
  '**/*secret*',
  '**/*token*',
] as const;

// Files that must never be committed to git
export const GIT_EXCLUDED_PATTERNS = [
  '.env',
  '.env.local',
  '.env.production',
  'data/',
  'backups/',
  'data/private/',
] as const;

/**
 * Validates that a file path is within the platform directory.
 * Prevents any write operation outside ./platform/
 */
export function assertPathWithinPlatform(targetPath: string): void {
  const resolved = path.resolve(targetPath);
  if (!resolved.startsWith(PLATFORM_ROOT)) {
    throw new Error(
      `SAFETY VIOLATION: Path "${resolved}" is outside platform root "${PLATFORM_ROOT}". ` +
        `All writes must stay within ./platform/.`
    );
  }
}

/**
 * Checks if a path points to the private data folder.
 * Content from private paths must NEVER be sent to cloud APIs.
 */
export function isPrivatePath(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  return resolved.startsWith(PRIVATE_DIR);
}

/**
 * Validates that a shell command does not contain forbidden operations.
 */
export function assertCommandSafe(command: string): void {
  const lower = command.toLowerCase().trim();
  for (const forbidden of FORBIDDEN_COMMANDS) {
    if (lower.includes(forbidden.toLowerCase())) {
      throw new Error(
        `SAFETY VIOLATION: Command contains forbidden operation "${forbidden}". ` +
          `Broad process-kill and destructive commands are banned. ` +
          `Target specific PIDs or container names only.`
      );
    }
  }
}

/**
 * Generates a backup path with ISO timestamp for a destructive operation.
 * All destructive data operations must call this BEFORE modifying data.
 */
export function getBackupPath(operation: string, extension: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(BACKUPS_DIR, `${timestamp}-${operation}.${extension}`);
}

/**
 * Checks if content contains potential secrets that should not be logged or sent to APIs.
 */
export function containsSecrets(content: string): boolean {
  const patterns = [
    /sk-ant-api03-[a-zA-Z0-9_-]{20,}/, // Anthropic Claude API keys (explicit)
    /sk-proj-[a-zA-Z0-9_-]{20,}/,    // OpenAI project keys (explicit)
    /sk-[a-zA-Z0-9]{20,}/,           // Anthropic/OpenAI keys (generic)
    /AIza[a-zA-Z0-9_-]{35}/,         // Google API keys
    /ghp_[a-zA-Z0-9]{36}/,           // GitHub tokens
    /-----BEGIN.*PRIVATE KEY-----/,  // Private keys
    /password\s*[:=]\s*\S+/i,        // Password assignments
  ];
  return patterns.some((p) => p.test(content));
}
