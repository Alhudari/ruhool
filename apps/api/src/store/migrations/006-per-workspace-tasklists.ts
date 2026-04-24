import type { StoreData } from '../types.js';
import type { Migration } from './index.js';

/**
 * R17 — Split the flat `taskLists: string[]` into per-workspace
 * categories. Legacy shape is kept for backward compat (existing
 * consumers read it until they migrate), but new code writes to
 * `taskListsByWorkspace`.
 *
 * Heuristic: existing legacy list items look PhD-flavored
 * (الدكتوراه, الأوراق, جمعية المهندسين, المحتوى, ...) — they all go
 * under the 'phd' workspace. 'life' gets a fresh default set. Any
 * customs the user already added stay in phd.
 */
export const migration006: Migration = {
  id: 6,
  name: 'per-workspace task categories',
  up: (store: StoreData) => {
    const s = store as unknown as {
      taskLists?: string[];
      taskListsByWorkspace?: Record<string, string[]>;
    };

    if (s.taskListsByWorkspace && Object.keys(s.taskListsByWorkspace).length > 0) {
      return;  // already migrated
    }

    const legacy = Array.isArray(s.taskLists) ? s.taskLists.slice() : [];
    const phdDefaults = ['عام', 'الدكتوراه', 'جمعية المهندسين', 'المحتوى', 'المشاريع'];
    const lifeDefaults = ['عام', 'البيت', 'الصحة', 'المالية', 'الروتين'];

    const phd = legacy.length > 0 ? legacy : phdDefaults;
    s.taskListsByWorkspace = {
      phd,
      life: lifeDefaults,
    };
  },
};
