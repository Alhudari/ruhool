import type { StoreData } from '../types.js';
import type { Migration } from './index.js';

/**
 * R14-#2: sweep data written by earlier builds for three residual gaps
 * discovered against a live store after the trait-based agent rename
 * (R12) and the workspace-id migration (003):
 *
 *   1. `graphNodes[]` with labels containing retired camel-herd agent
 *      names — replace with the canonical trait-based name so the
 *      knowledge graph stops rendering stale labels.
 *   2. Tail of rows created between migration-003 running and the
 *      CRUD routes being updated may still lack `workspaceId`.
 *      Default them to `'phd'` — the same value migration 003 used.
 *   3. Any task missing `isHabit` — default `false` (covers race
 *      window between migration 004 and a slightly-later task
 *      creation).
 *
 * Idempotent — scans and only writes when it finds a mismatch.
 */
const RENAMES: Array<[string, string]> = [
  ['رمّانة', 'المُقارِن'],
  ['رمانة', 'المُقارِن'],
  ['عبدان', 'الباحث'],
  ['شواشة', 'المُلخِّص'],
  ['الصفرا', 'الناقد'],
  ['الدبسا', 'السارد'],
  ['الكرييتف', 'المبدع'],
  ['السياق', 'الكاتب'],
  ['رمّان', 'الخوي'],
  ['رمان', 'الخوي'],
];

function applyRename(s: string | null | undefined): string | null | undefined {
  if (typeof s !== 'string') return s;
  let out = s;
  for (const [old, nu] of RENAMES) out = out.split(old).join(nu);
  return out;
}

export const migration005: Migration = {
  id: 5,
  name: 'cleanup after agent rename + backfill orphans',
  up: (store: StoreData) => {
    // 1. graphNodes labels + props.description (audit discovered
    //    old names leak through nested `props` too — R14-#2 deep scan).
    const nodes = (store as unknown as { graphNodes?: Array<Record<string, unknown>> }).graphNodes;
    if (Array.isArray(nodes)) {
      for (const n of nodes) {
        for (const field of ['label', 'name', 'title']) {
          const v = n[field];
          if (typeof v === 'string') {
            const next = applyRename(v);
            if (next !== v) n[field] = next;
          }
        }
        // Scan EVERY string-valued key in props — LLM extractions can
        // write arbitrary fields (evidence, context, reasoning, etc.)
        // and we can't enumerate them up-front.
        const props = n.props as Record<string, unknown> | undefined;
        if (props) {
          for (const field of Object.keys(props)) {
            const v = props[field];
            if (typeof v === 'string') {
              const next = applyRename(v);
              if (next !== v) props[field] = next;
            }
          }
        }
      }
    }

    // 1b. memories[].content — conversation summaries that project
    //     forward (unlike messages which are historical record).
    const memories = (store as unknown as { memories?: Array<Record<string, unknown>> }).memories;
    if (Array.isArray(memories)) {
      for (const m of memories) {
        const c = m.content;
        if (typeof c === 'string') {
          const next = applyRename(c);
          if (next !== c) m.content = next;
        }
      }
    }
    // Intentionally NOT rewriting: messages[].content, conversations[].title,
    // activityLog[].details — those are historical records of what was
    // actually said/titled at the time and rewriting them would be
    // revisionist. The UI can render them as-is; the retired names
    // are still routable via SPECIALIST_ALIAS_MAP.

    // 2. tail backfill for missing workspaceId on conversations +
    //    tasks + keepNotes. Migration 003 was idempotent but races
    //    with creation windows; catch any stragglers here.
    for (const c of store.conversations ?? []) {
      const row = c as unknown as Record<string, unknown>;
      if (!('workspaceId' in row) || !row.workspaceId) row.workspaceId = 'phd';
    }
    for (const t of store.tasks ?? []) {
      const row = t as unknown as Record<string, unknown>;
      if (!('workspaceId' in row) || !row.workspaceId) row.workspaceId = 'phd';
      if (!('isHabit' in row)) row.isHabit = false;
      if (!('isToday' in row)) row.isToday = false;
    }
    for (const k of (store.keepNotes ?? [])) {
      const row = k as unknown as Record<string, unknown>;
      if (!('workspaceId' in row) || !row.workspaceId) row.workspaceId = 'phd';
    }
  },
};
