import fs from 'node:fs';
import path from 'node:path';

/**
 * Central path configuration for the API.
 * All data directories are anchored to the monorepo `data/` folder.
 */
export const DATA_DIR = path.resolve(import.meta.dirname || '.', '../../../../data');
export const STORE_FILE = path.join(DATA_DIR, '.store.json');
export const PAPERS_DIR = path.join(DATA_DIR, 'papers');
export const NOTES_DIR = path.join(DATA_DIR, 'notes');
export const BACKUPS_DIR = path.resolve(import.meta.dirname || '.', '../../../../backups');

export function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
export function ensurePapersDir() {
  if (!fs.existsSync(PAPERS_DIR)) fs.mkdirSync(PAPERS_DIR, { recursive: true });
}
export function ensureNotesDir() {
  if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true });
}
export function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}
