/**
 * daily-backup.ts — Automated Daily Backup for Ruhool
 *
 * This file contains the code to set up automated daily backups
 * of the data directory. It is NOT activated by default — you need
 * to import and call setupDailyBackup() from your server entry point,
 * or schedule it via your OS task scheduler.
 *
 * ─── Option 1: Using node-cron (requires `npm install node-cron`) ───
 *
 *   import { setupDailyBackup } from './daily-backup';
 *   setupDailyBackup(); // Call this after the server starts
 *
 * ─── Option 2: Using OS scheduler ───
 *
 *   Windows Task Scheduler:
 *     schtasks /create /tn "RuhoolBackup" /tr "node path/to/run-backup.js" /sc daily /st 02:00
 *
 *   Linux/macOS cron:
 *     0 2 * * * cd /path/to/platform && node apps/api/src/run-backup.js
 *
 * ─── Option 3: Using PM2 cron restart ───
 *
 *   pm2 start apps/api/src/run-backup.js --cron-restart="0 2 * * *" --no-autorestart
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { logger } from './server/logging.js';

const DATA_DIR = path.resolve(import.meta.dirname || '.', '../../../data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

/**
 * Create a timestamped backup of the data directory (excluding the backups folder itself).
 */
export function runBackup(): string {
  // Ensure backups directory exists
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const backupName = `ruhool-backup-${timestamp}`;
  const backupPath = path.join(BACKUPS_DIR, `${backupName}.tar.gz`);

  // Skip if today's backup already exists
  if (fs.existsSync(backupPath)) {
    logger.info({ path: backupPath }, '[Backup] Today\'s backup already exists');
    return backupPath;
  }

  try {
    // Use tar to create compressed archive, excluding the backups folder
    execSync(
      `tar -czf "${backupPath}" --exclude="backups" -C "${path.dirname(DATA_DIR)}" "${path.basename(DATA_DIR)}"`,
      { stdio: 'pipe' }
    );
    logger.info({ path: backupPath }, '[Backup] Created');

    // Clean up old backups — keep only the last 30 days
    cleanOldBackups(30);

    return backupPath;
  } catch (err) {
    logger.error({ err }, '[Backup] Failed to create backup');
    throw err;
  }
}

/**
 * Remove backups older than `keepDays` days.
 */
function cleanOldBackups(keepDays: number): void {
  if (!fs.existsSync(BACKUPS_DIR)) return;

  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(BACKUPS_DIR);

  for (const file of files) {
    if (!file.startsWith('ruhool-backup-') || !file.endsWith('.tar.gz')) continue;
    const filePath = path.join(BACKUPS_DIR, file);
    const stat = fs.statSync(filePath);
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(filePath);
      logger.info({ file }, '[Backup] Removed old backup');
    }
  }
}

/**
 * Set up automated daily backup using node-cron.
 * Call this once after your server starts.
 *
 * Requires: npm install node-cron
 */
export async function setupDailyBackup(): Promise<void> {
  try {
    // Dynamic import so the module doesn't fail if node-cron isn't installed
    // node-cron is an optional runtime dep; swallow missing-types at build.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - optional peer, types may be absent in dev
    const cron = await import('node-cron');

    // Run every day at 2:00 AM
    cron.schedule('0 2 * * *', () => {
      logger.info('[Backup] Running scheduled daily backup...');
      try {
        runBackup();
      } catch {
        // Error already logged in runBackup
      }
    });

    logger.info('[Backup] Daily backup scheduled for 02:00 AM');
  } catch {
    logger.warn('[Backup] node-cron not installed. Install it with `npm install node-cron` to enable automated backups, or use your OS task scheduler instead.');
  }
}
