/**
 * Report action parser + executor. Lets the architect/doctor/manager
 * create, edit, toggle, send, or delete scheduled reports by emitting
 * structured markers in their chat responses:
 *
 *   [REPORT:CREATE] {"name":"...", "prompt":"...", "schedule":{...}, ...}
 *   [REPORT:UPDATE:<id>] {"enabled":false}
 *   [REPORT:DELETE:<id>]
 *   [REPORT:SEND:<id>]      — sends immediately
 *   [REPORT:TOGGLE:<id>]    — flips enabled
 *
 * Parsing is deliberately permissive: malformed markers are ignored, so
 * an agent that produces bad JSON just gets zero actions instead of
 * breaking the whole response.
 */
import crypto from 'node:crypto';
import type { StoreData, ReportDefinition, ReportSchedule } from '../../store/types.js';
import { computeNextRunAt } from '../reports/schedule.js';

export type ReportAction =
  | { type: 'create'; data: Partial<ReportDefinition> }
  | { type: 'update'; id: string; data: Partial<ReportDefinition> }
  | { type: 'delete'; id: string }
  | { type: 'send'; id: string }
  | { type: 'toggle'; id: string }
  | { type: 'feedback'; id: string; text: string; addedBy?: string };

export interface ReportActionsDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  /** Side-effect trigger for SEND actions — wired to sendReport at
   *  the route level so the chat loop doesn't depend on the worker. */
  sendReport?: (reportId: string) => Promise<void>;
}

/**
 * Extracts a balanced JSON object starting at position `start` in `s`
 * (the char at `start` must be `{`). Returns `{ json, end }` where
 * `end` is the index just past the closing `}`. Naive string handling
 * so quoted braces inside strings don't break balance. Returns null
 * if no balanced object is found.
 */
function extractBalancedJson(s: string, start: number): { json: string; end: number } | null {
  if (s[start] !== '{') return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { json: s.slice(start, i + 1), end: i + 1 };
    }
  }
  return null;
}

export function parseReportActions(response: string): ReportAction[] {
  const actions: ReportAction[] = [];

  // CREATE: find every "[REPORT:CREATE]" and extract the balanced JSON
  // that follows (possibly nested).
  let idx = 0;
  while ((idx = response.indexOf('[REPORT:CREATE]', idx)) !== -1) {
    const after = idx + '[REPORT:CREATE]'.length;
    // Skip whitespace to the first `{`.
    let j = after;
    while (j < response.length && /\s/.test(response[j])) j += 1;
    const ext = extractBalancedJson(response, j);
    idx = after;
    if (!ext) continue;
    try { actions.push({ type: 'create', data: JSON.parse(ext.json) as Partial<ReportDefinition> }); idx = ext.end; } catch { /* skip */ }
  }

  // UPDATE: same pattern but captures the id.
  const updateRe = /\[REPORT:UPDATE:([^\]]+)\]/g;
  for (const m of response.matchAll(updateRe)) {
    const id = m[1];
    const after = (m.index ?? 0) + m[0].length;
    let j = after;
    while (j < response.length && /\s/.test(response[j])) j += 1;
    const ext = extractBalancedJson(response, j);
    if (!ext) continue;
    try { actions.push({ type: 'update', id, data: JSON.parse(ext.json) as Partial<ReportDefinition> }); } catch { /* skip */ }
  }

  const deleteMatches = response.matchAll(/\[REPORT:DELETE:([^\]]+)\]/g);
  for (const m of deleteMatches) actions.push({ type: 'delete', id: m[1] });

  const sendMatches = response.matchAll(/\[REPORT:SEND:([^\]]+)\]/g);
  for (const m of sendMatches) actions.push({ type: 'send', id: m[1] });

  const toggleMatches = response.matchAll(/\[REPORT:TOGGLE:([^\]]+)\]/g);
  for (const m of toggleMatches) actions.push({ type: 'toggle', id: m[1] });

  // FEEDBACK: [REPORT:FEEDBACK:<id-or-name>] {text to remember}
  // The payload is everything after the marker on the same line, or a
  // balanced JSON object with {"text":"...", "addedBy":"..."}.
  const feedbackRe = /\[REPORT:FEEDBACK:([^\]]+)\]\s*(.*)$/gm;
  for (const m of response.matchAll(feedbackRe)) {
    const id = m[1].trim();
    const rest = (m[2] ?? '').trim();
    if (!rest) continue;
    if (rest.startsWith('{')) {
      try {
        const obj = JSON.parse(rest) as { text?: string; addedBy?: string };
        if (obj.text) actions.push({ type: 'feedback', id, text: obj.text, addedBy: obj.addedBy });
      } catch { /* skip */ }
    } else {
      actions.push({ type: 'feedback', id, text: rest });
    }
  }

  return actions;
}

function resolveReportId(store: StoreData, idOrName: string): string | null {
  const reports = store.reports ?? [];
  // Exact ID match first.
  if (reports.some((r) => r.id === idOrName)) return idOrName;
  // Fall back to name match (case-insensitive, trimmed) — agents often
  // reference reports by name instead of UUID.
  const want = idOrName.trim().toLowerCase();
  const hit = reports.find((r) => r.name.trim().toLowerCase() === want);
  return hit?.id ?? null;
}

export function executeReportActions(
  actions: ReportAction[],
  deps: ReportActionsDeps,
): Array<{ action: string; id?: string; name?: string; error?: string }> {
  const log: Array<{ action: string; id?: string; name?: string; error?: string }> = [];
  if (actions.length === 0) return log;
  const store = deps.getStore();
  if (!store.reports) store.reports = [];
  let changed = false;

  for (const a of actions) {
    try {
      if (a.type === 'create') {
        const d = a.data;
        if (!d.name || !d.prompt || !d.signedBy || !d.schedule) {
          log.push({ action: 'create', error: 'missing name/prompt/signedBy/schedule' });
          continue;
        }
        const now = new Date().toISOString();
        const report: ReportDefinition = {
          id: crypto.randomUUID(),
          name: d.name,
          prompt: d.prompt,
          signedBy: d.signedBy,
          schedule: d.schedule as ReportSchedule,
          recipients: d.recipients ?? [],
          enabled: d.enabled ?? true,
          includeContext: d.includeContext,
          nextRunAt: computeNextRunAt(d.schedule as ReportSchedule, new Date()),
          createdAt: now,
          updatedAt: now,
        };
        store.reports.push(report);
        changed = true;
        log.push({ action: 'create', id: report.id, name: report.name });
        continue;
      }

      const id = resolveReportId(store, a.id);
      if (!id) { log.push({ action: a.type, error: `report not found: ${a.id}` }); continue; }
      const report = store.reports.find((r) => r.id === id);
      if (!report) { log.push({ action: a.type, error: `report vanished: ${id}` }); continue; }

      if (a.type === 'update') {
        Object.assign(report, a.data, { updatedAt: new Date().toISOString() });
        if (a.data.schedule) report.nextRunAt = computeNextRunAt(a.data.schedule as ReportSchedule, new Date());
        changed = true;
        log.push({ action: 'update', id, name: report.name });
      } else if (a.type === 'delete') {
        const idx = store.reports.findIndex((r) => r.id === id);
        if (idx >= 0) {
          store.reports.splice(idx, 1);
          changed = true;
          log.push({ action: 'delete', id, name: report.name });
        }
      } else if (a.type === 'toggle') {
        report.enabled = !report.enabled;
        report.updatedAt = new Date().toISOString();
        changed = true;
        log.push({ action: 'toggle', id, name: report.name });
      } else if (a.type === 'send') {
        if (deps.sendReport) {
          // Fire-and-forget — chat loop shouldn't block on SMTP.
          void deps.sendReport(id).catch(() => { /* send handles its own error logging */ });
        }
        log.push({ action: 'send', id, name: report.name });
      } else if (a.type === 'feedback') {
        if (!report.feedback) report.feedback = [];
        report.feedback.push({
          id: crypto.randomUUID(),
          text: a.text,
          source: 'chat',
          addedBy: a.addedBy ?? 'user',
          createdAt: new Date().toISOString(),
          active: true,
        });
        report.updatedAt = new Date().toISOString();
        changed = true;
        log.push({ action: 'feedback', id, name: report.name });
      }
    } catch (err) {
      log.push({ action: a.type, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (changed) deps.saveStore();
  return log;
}

/**
 * Decide whether to spend tokens injecting the REPORT_ACTIONS_PROMPT
 * + reports list into the system prompt. True when:
 *   - at least one report exists (user needs to manage it), OR
 *   - any recent message mentions report-adjacent keywords.
 * False otherwise — saves ~800 tokens per turn on unrelated chats.
 */
export function shouldInjectReportActions(store: StoreData): boolean {
  if ((store.reports ?? []).length > 0) return true;
  const recent = (store.messages ?? []).slice(-30);
  const kw = /تقرير|تقارير|report|email|إيميل|ايميل|بريد|مراسلة|digest|جدول.*إرسال/i;
  for (const m of recent) {
    const content = (m as { content?: string }).content;
    if (typeof content === 'string' && kw.test(content)) return true;
  }
  return false;
}

/**
 * Build a snapshot of the current reports list for injection into the
 * CEO/architect system prompts. Agents reference reports by id or
 * name; seeing the list eliminates guessing.
 */
export function buildReportsContextBlock(store: StoreData): string {
  const reports = store.reports ?? [];
  if (reports.length === 0) return '\n\n## Existing reports\n\n_(none — use [REPORT:CREATE] to add one)_';
  const lines = ['', '', '## Existing reports (current list — reference by id OR name)'];
  for (const r of reports) {
    const sched = r.schedule.type === 'manual' ? 'manual' :
                  r.schedule.type === 'once' ? `once @${(r.schedule as { at: string }).at}` :
                  r.schedule.type;
    const state = r.enabled ? 'enabled' : 'disabled';
    lines.push(`- \`${r.id}\` · **${r.name}** · ${sched} · ${state} · signed by ${r.signedBy}`);
    const activeFb = (r.feedback ?? []).filter((f) => f.active);
    if (activeFb.length > 0) {
      lines.push(`    feedback so far: ${activeFb.map((f) => `"${f.text}"`).join('; ')}`);
    }
  }
  return lines.join('\n');
}

/** System prompt snippet — inject into the architect/doctor/manager
 *  system prompt so they know how to manage reports via chat. */
export const REPORT_ACTIONS_PROMPT = `
## Scheduled reports (تقارير دورية)

You can create, edit, toggle, send, or delete scheduled reports for
the user by emitting structured markers anywhere in your reply. The
platform parses these and executes them after your message lands.

Markers (all optional — use only what fits the user's request):

  [REPORT:CREATE] { "name": "...", "prompt": "تعليمات لكاتب التقرير",
    "signedBy": "architect" | "manager" | "doctor",
    "schedule": { "type": "daily" | "weekly" | "monthly" | "manual",
                  "hour": 22, "minute": 0, "timezone": "Asia/Kuwait",
                  "dayOfWeek": 0-6,    // weekly only (0=Sun)
                  "dayOfMonth": 1-28 }, // monthly only
    "recipients": ["..."],               // optional, defaults to resend.defaultRecipient
    "enabled": true,
    "includeContext": { "tasks": true, "dispatches": true, "changelog": true, "agentQuotes": true } }

  [REPORT:UPDATE:<id-or-name>] { "enabled": false, ... any subset ... }
  [REPORT:TOGGLE:<id-or-name>]     // flip enabled
  [REPORT:SEND:<id-or-name>]       // send immediately
  [REPORT:DELETE:<id-or-name>]
  [REPORT:FEEDBACK:<id-or-name>] ملاحظة للمرات القادمة — اجعلها أقصر، لا تذكر الميزانية، أضف دائماً …
       // OR as JSON: {"text":"...","addedBy":"user"}
       // Recorded permanently and injected into future compose runs.
       // Use this WHENEVER the user says "next time…", "avoid…", "always include…",
       // "make it shorter/longer", or otherwise gives persistent feedback about
       // a recurring report. Do NOT use it for one-off requests.

You may reference reports by either their UUID or their exact name
(case-insensitive). The list of existing reports is in the context
below when relevant. When you execute any of these, also write a
short sentence of natural Arabic confirming what you did.

Do not emit markers the user didn't ask for.
`;
