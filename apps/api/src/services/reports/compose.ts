/**
 * Report content composer. Gathers daily activity context, then invokes
 * an LLM provider directly with the signing agent's voice + the user's
 * prompt. Returns the finished HTML email body plus metadata.
 *
 * We bypass the full dispatch chain (which is meant for user-driven
 * chat) and call the provider directly — reports are a single-shot
 * generation with a fixed system prompt, no tools.
 */
import type {
  ReportDefinition,
  StoreData,
  TaskItem,
  ActivityRecord,
  MsgRecord,
} from '../../store/types.js';
import { BUILTIN_SYSTEM_PROMPTS } from '../../state/builtin-prompts.js';
import { buildReportCharts } from './charts.js';

export interface ReportComposerDeps {
  getStore: () => StoreData;
  callProvider: (input: {
    agentId: string;
    system: string;
    user: string;
  }) => Promise<{ text: string; tokensIn?: number; tokensOut?: number; costUsd?: number }>;
  logger: { info: (m: string) => void; warn: (obj: { err: unknown }, m: string) => void };
}

/**
 * R14-#6 — wrap the LLM call in 2-attempt retry with 5s → 10s backoff.
 * Fast-fails on permanent codes (400/401/402/403/404/409/422) so
 * auth/quota errors surface immediately. Transient 5xx / rate-limit /
 * network blips get a second chance. Kept as a tiny local helper so
 * the main compose branches stay readable.
 *
 * Delays can be overridden per install via `store.resend.composeRetryDelays`
 * — useful for CI (`[10, 10]`) or aggressive recovery.
 */
async function callProviderWithRetry(
  deps: ReportComposerDeps,
  input: { agentId: string; system: string; user: string },
): Promise<Awaited<ReturnType<ReportComposerDeps['callProvider']>>> {
  const store = deps.getStore();
  const configured = store.resend?.composeRetryDelays;
  const delays = Array.isArray(configured) && configured.every((v) => typeof v === 'number' && v >= 0)
    ? configured
    : [5_000, 10_000];
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await deps.callProvider(input);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const msg = lastErr.message;
      // Same fast-fail pattern as mailer: permanent 4xx bubbles up.
      if (/\b4(0[01234]|09|22)\b/.test(msg)) break;
      if (attempt === delays.length) break;
      deps.logger.warn({ err }, `[reports/compose] LLM attempt ${attempt + 1} failed; retrying in ${delays[attempt] / 1000}s`);
      await new Promise<void>((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
  throw lastErr ?? new Error('callProvider failed with no error');
}

export interface ComposedReport {
  subject: string;
  html: string;
  bodyMarkdown: string;  // raw markdown — send.ts stores a snippet for memory
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}

/**
 * Build a "memory" block for the agent: recent sent subjects + body
 * snippets (so repetition can be avoided) and accumulated feedback
 * (so corrections stick).
 */
function buildMemoryBlock(store: StoreData, report: ReportDefinition): string {
  const lines: string[] = [];

  const activeFeedback = (report.feedback ?? []).filter((f) => f.active);
  if (activeFeedback.length > 0) {
    lines.push('=== FEEDBACK / INSTRUCTIONS FROM USER (HONOR THESE) ===');
    for (const f of activeFeedback) {
      const src = f.addedBy ? ` [${f.addedBy}]` : '';
      lines.push(`  - ${f.text}${src}`);
    }
  }

  const runs = (store.reportRuns ?? [])
    .filter((r) => r.reportId === report.id && r.status === 'sent' && r.bodySnippet)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 3);
  if (runs.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('=== YOUR LAST SENT REPORTS (avoid verbatim repetition; data-driven changes are fine) ===');
    for (const r of runs) {
      const when = r.startedAt.slice(0, 10);
      lines.push(`  — ${when}: "${r.subject ?? '(no subject)'}"`);
      const snippet = (r.bodySnippet ?? '').slice(0, 400).replace(/\n+/g, ' ');
      if (snippet) lines.push(`    snippet: ${snippet}${(r.bodySnippet ?? '').length > 400 ? '…' : ''}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') + '\n\n' : '';
}

/** Build the day's stats snapshot that gets passed to the agent. */
function buildContext(store: StoreData, report: ReportDefinition): string {
  const lines: string[] = [];
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  lines.push(`Date: ${today}`);
  lines.push(`Current UTC time: ${now.toISOString()}`);
  lines.push(`User: عبدالله (address directly as عبدالله)`);

  if (report.includeContext?.tasks !== false) {
    const tasks = (store.tasks ?? []) as TaskItem[];
    const completedToday = tasks.filter((t) => t.completed && t.completedAt && t.completedAt.startsWith(today));
    const openNotHabit = tasks.filter((t) => !t.isHabit && !t.completed);
    const overdue = openNotHabit.filter((t) => t.dueDate && t.dueDate < today);
    const dueToday = openNotHabit.filter((t) => t.dueDate === today || t.scheduledFor === today || t.isToday);
    lines.push('');
    lines.push('=== TASKS ===');
    lines.push(`Completed today: ${completedToday.length}`);
    for (const t of completedToday.slice(0, 12)) lines.push(`  ✓ ${t.title}${t.list ? ` [${t.list}]` : ''}`);
    lines.push(`Open (not habits): ${openNotHabit.length}`);
    lines.push(`Due today: ${dueToday.length}`);
    for (const t of dueToday.slice(0, 8)) lines.push(`  • ${t.title}${t.priority && t.priority !== 'none' ? ` (${t.priority})` : ''}`);
    lines.push(`Overdue: ${overdue.length}`);
    for (const t of overdue.slice(0, 8)) lines.push(`  ⚠ ${t.title} — was due ${t.dueDate}`);
  }

  if (report.includeContext?.dispatches !== false) {
    const msgs = (store.messages ?? []) as MsgRecord[];
    const recent = msgs.filter((m) => m.createdAt >= since);
    const dispatchMsgs = recent.filter((m) => m.dispatchId);
    const distinctDispatches = new Set(dispatchMsgs.map((m) => m.dispatchId)).size;
    lines.push('');
    lines.push('=== AGENT DISPATCH ACTIVITY (24h) ===');
    lines.push(`Total dispatch chains: ${distinctDispatches}`);
    lines.push(`Total agent messages: ${recent.length}`);
    const totalCost = recent.reduce((s, m) => s + (m.costUsd ?? 0), 0);
    if (totalCost > 0) lines.push(`Total cost: $${totalCost.toFixed(4)}`);
  }

  if (report.includeContext?.changelog) {
    lines.push('');
    lines.push('=== CHANGELOG (mention only if recent) ===');
    lines.push('(You can reference recent platform improvements from memory — fixed Google Tasks OAuth, added habit editor, added reports system.)');
  }

  // R12b — enriched context sources. Each is off by default and
  // opt-in via `includeContext` to keep prompt size bounded and let
  // life-vs-PhD reports stay focused.
  if ((report.includeContext as { zotero?: boolean } | undefined)?.zotero) {
    const s = store as unknown as { zoteroLastRefreshAt?: string; papers?: Array<{ title?: string; addedAt?: string; authors?: unknown; year?: number }> };
    const papers = (s.papers ?? []).filter((p) => p.addedAt && p.addedAt >= since);
    if (papers.length > 0 || s.zoteroLastRefreshAt) {
      lines.push('');
      lines.push('=== ZOTERO / LIBRARY (24h) ===');
      if (s.zoteroLastRefreshAt) lines.push(`Last sync: ${s.zoteroLastRefreshAt}`);
      lines.push(`New papers since yesterday: ${papers.length}`);
      for (const p of papers.slice(0, 8)) {
        const y = p.year ? ` (${p.year})` : '';
        lines.push(`  • ${p.title ?? '(untitled)'}${y}`);
      }
    }
  }

  if ((report.includeContext as { vault?: boolean } | undefined)?.vault) {
    const s = store as unknown as { notes?: Array<{ title?: string; updatedAt?: string; createdAt?: string }> };
    const recent = (s.notes ?? []).filter((n) => (n.updatedAt ?? n.createdAt ?? '') >= since);
    if (recent.length > 0) {
      lines.push('');
      lines.push('=== OBSIDIAN VAULT / NOTES (24h) ===');
      lines.push(`Edited or created: ${recent.length}`);
      for (const n of recent.slice(0, 8)) lines.push(`  • ${n.title ?? '(untitled)'}`);
    }
  }

  if ((report.includeContext as { meetings?: boolean } | undefined)?.meetings) {
    const s = store as unknown as { meetingSessions?: Array<{ title?: string; startsAt?: string; endsAt?: string; summary?: string; scheduledFor?: string }>; phdSchedule?: { items?: Array<{ title?: string; at?: string }> } };
    const upcoming = (s.meetingSessions ?? []).filter((m) => {
      const when = m.startsAt ?? m.scheduledFor;
      if (!when) return false;
      return when >= since;
    });
    if (upcoming.length > 0) {
      lines.push('');
      lines.push('=== MEETINGS (last 24h + upcoming) ===');
      for (const m of upcoming.slice(0, 8)) {
        const when = m.startsAt ?? m.scheduledFor ?? '';
        lines.push(`  • ${when.slice(0, 16)} — ${m.title ?? '(untitled)'}`);
        if (m.summary) lines.push(`    summary: ${m.summary.slice(0, 200)}`);
      }
    }
    const phdItems = s.phdSchedule?.items ?? [];
    if (phdItems.length > 0) {
      lines.push('');
      lines.push('=== PhD SCHEDULE (upcoming) ===');
      for (const it of phdItems.slice(0, 6)) lines.push(`  • ${it.at ?? ''} — ${it.title ?? ''}`);
    }
  }

  if ((report.includeContext as { budget?: boolean } | undefined)?.budget) {
    const s = store as unknown as { budget?: { monthlyBudget?: number }; usage?: Array<{ costUsd?: number; createdAt?: string }> };
    const cap = s.budget?.monthlyBudget;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const monthIso = monthStart.toISOString();
    const spent = (s.usage ?? [])
      .filter((u) => (u.createdAt ?? '') >= monthIso)
      .reduce((sum, u) => sum + (u.costUsd ?? 0), 0);
    const today24 = (s.usage ?? [])
      .filter((u) => (u.createdAt ?? '') >= since)
      .reduce((sum, u) => sum + (u.costUsd ?? 0), 0);
    lines.push('');
    lines.push('=== BUDGET / COST ===');
    lines.push(`Last 24h LLM spend: $${today24.toFixed(4)}`);
    if (cap && cap > 0) {
      const pct = Math.round((spent / cap) * 100);
      lines.push(`Month-to-date: $${spent.toFixed(2)} / $${cap.toFixed(2)} (${pct}%)`);
    } else {
      lines.push(`Month-to-date: $${spent.toFixed(2)} (no budget cap set)`);
    }
  }

  if (report.includeContext?.agentQuotes) {
    const activities = (store.activityLog ?? []) as ActivityRecord[];
    const recentActivity = activities.filter((a) => a.timestamp >= since).slice(-10);
    if (recentActivity.length > 0) {
      lines.push('');
      lines.push('=== RECENT AGENT ACTIVITY ===');
      for (const a of recentActivity) {
        lines.push(`  [${a.type}] ${a.agentId ?? '?'}: ${a.action}`);
      }
    }
  }

  // ── Always-on enrichment sources (R14 context expansion) ─────────

  // Source 1: Zotero library status
  const zoteroConfig = (store as unknown as { zoteroConfig?: { webUserId?: string; webApiKey?: string; mode?: string }; zoteroLastRefreshAt?: string }).zoteroConfig;
  void zoteroConfig; // used only to detect presence; no API calls in compose
  const zoteroLastRefresh = (store as unknown as { zoteroLastRefreshAt?: string }).zoteroLastRefreshAt;
  if (zoteroLastRefresh) {
    lines.push('');
    lines.push('## Zotero Library');
    lines.push(`Last synced: ${zoteroLastRefresh.slice(0, 10)}. Library connected.`);
  }

  // Source 2: Recent supervision meetings
  const recentMeetings = ((store as unknown as { meetingSessions?: Array<{id:string;title:string;record?:{date?:string;Summary?:string;No?:number};updatedAt:string}> }).meetingSessions ?? [])
    .filter(s => s.record?.date)
    .sort((a, b) => (b.record?.date ?? '').localeCompare(a.record?.date ?? ''))
    .slice(0, 3);
  if (recentMeetings.length > 0) {
    lines.push('');
    lines.push('## Recent Supervision Meetings');
    for (const m of recentMeetings) {
      lines.push(`- Meeting #${m.record?.No ?? '?'} (${(m.record?.date ?? '').slice(0, 10)}): ${m.record?.Summary ?? m.title}`);
    }
  }

  // Source 3: GRS2 status
  const grs2Records = ((store as unknown as { grs2Records?: Array<{month:string;status:string;progress:number}> }).grs2Records ?? [])
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 2);
  if (grs2Records.length > 0) {
    lines.push('');
    lines.push('## GRS2 Status');
    for (const g of grs2Records) {
      lines.push(`- ${g.month}: ${g.status} (${g.progress}%)`);
    }
  }

  // Source 4: LLM budget snapshot (this month)
  const usageRecords = store.usage ?? [];
  const nowBudget = new Date();
  const monthStart = new Date(nowBudget.getFullYear(), nowBudget.getMonth(), 1).toISOString();
  const thisMonthUsage = usageRecords.filter(u => u.timestamp >= monthStart);
  const totalCostThisMonth = thisMonthUsage.reduce((sum, u) => sum + (u.totalCostUsd ?? 0), 0);
  const budget = (store as unknown as { budget?: { monthlyBudget?: number } }).budget?.monthlyBudget;
  if (budget || totalCostThisMonth > 0) {
    lines.push('');
    lines.push('## LLM Budget (this month)');
    let budgetLine = `- Spent: $${totalCostThisMonth.toFixed(3)}`;
    if (budget) budgetLine += ` of $${budget} budget (${Math.round(totalCostThisMonth / budget * 100)}%)`;
    lines.push(budgetLine);
  }

  // D-6: Source 5 — Entity memory (top entities from recent conversations)
  const topEntities = (store.entityMemory ?? [])
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 6);
  if (topEntities.length > 0) {
    lines.push('');
    lines.push('## أبرز الكيانات من المحادثات الأخيرة / Key Entities from Recent Conversations');
    for (const e of topEntities) {
      lines.push(`- [${e.entityType}] ${e.name}`);
    }
  }

  // D-6: Source 6 — Recent agent tasks summary
  const recentDoneTasks = (store.agentTasks ?? [])
    .filter(t => t.status === 'done' && t.completedAt)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    .slice(0, 5);
  if (recentDoneTasks.length > 0) {
    lines.push('');
    lines.push('## مهام الوكلاء المكتملة مؤخراً / Recently Completed Agent Tasks');
    for (const t of recentDoneTasks) {
      lines.push(`- ${t.label ?? t.prompt.slice(0, 60)} (${t.agentId})`);
    }
  }

  return lines.join('\n');
}

const HTML_SHELL = (body: string, subject: string, charts: string = '', language: 'ar' | 'en' = 'ar') => {
  const dir = language === 'en' ? 'ltr' : 'rtl';
  const footer = language === 'en'
    ? 'Report from the Ruhool platform · to disable or edit, open Settings → Reports.'
    : 'تقرير من منصة رُحول · للتعطيل أو التعديل، افتح الإعدادات ← التقارير.';
  return `<!doctype html>
<html dir="${dir}" lang="${language}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:-apple-system,'Segoe UI',Tahoma,Arial,sans-serif;color:#2a2a2a;">
<div style="max-width:640px;margin:0 auto;padding:32px 20px;">
<div style="background:#fff;border-radius:14px;padding:36px 32px;box-shadow:0 2px 18px rgba(0,0,0,.06);">
${body}
${charts}
<hr style="border:0;border-top:1px solid #eee;margin:28px 0 16px;">
<p style="font-size:12px;color:#999;margin:0;line-height:1.6;">
${footer}
</p>
</div>
</div>
</body></html>`;
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Resolve {{variables}} in a report's name/subject template:
 *   {{date}}         → 2026-04-23 (Asia/Kuwait)
 *   {{weekday}}      → الأربعاء
 *   {{taskCount}}    → open non-habit task count
 *   {{completedToday}} → tasks completed today
 *   {{week}}         → ISO week number
 * Unknown variables are left intact so the agent sees the raw token.
 */
function resolveSubjectTemplate(template: string, store: StoreData): string {
  const tz = 'Asia/Kuwait';
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value; return acc;
  }, {});
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const weekdayAr = new Intl.DateTimeFormat('ar', { timeZone: tz, weekday: 'long' }).format(now);
  const tasks = (store.tasks ?? []) as TaskItem[];
  const today = date;
  const taskCount = tasks.filter((t) => !t.isHabit && !t.completed).length;
  const completedToday = tasks.filter((t) => t.completed && t.completedAt && t.completedAt.startsWith(today)).length;
  // ISO week number.
  const d = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  const vars: Record<string, string> = {
    date, weekday: weekdayAr,
    taskCount: String(taskCount),
    completedToday: String(completedToday),
    week: String(weekNo),
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => vars[key] ?? match);
}

function markdownToHtml(md: string): string {
  // Very small markdown → HTML for agent output. Good enough for
  // headings, bold, italic, lists, line breaks. Agents are instructed
  // to produce clean markdown.
  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;
  const flushList = () => { if (inList) { out.push('</ul>'); inList = false; } };
  for (const raw of lines) {
    let line = raw;
    if (/^\s*$/.test(line)) { flushList(); out.push(''); continue; }
    if (/^### /.test(line)) { flushList(); out.push(`<h3 style="margin:24px 0 8px;color:#1a1a1a;">${escapeHtml(line.replace(/^### /, ''))}</h3>`); continue; }
    if (/^## /.test(line))  { flushList(); out.push(`<h2 style="margin:28px 0 10px;color:#1a1a1a;font-size:20px;">${escapeHtml(line.replace(/^## /, ''))}</h2>`); continue; }
    if (/^# /.test(line))   { flushList(); out.push(`<h1 style="margin:0 0 16px;color:#1a1a1a;font-size:24px;">${escapeHtml(line.replace(/^# /, ''))}</h1>`); continue; }
    if (/^[-*•] /.test(line)) {
      if (!inList) { out.push('<ul style="padding-inline-start:22px;line-height:1.9;">'); inList = true; }
      const text = line.replace(/^[-*•] /, '');
      out.push(`<li>${inlineMd(text)}</li>`);
      continue;
    }
    flushList();
    out.push(`<p style="line-height:1.8;margin:10px 0;">${inlineMd(line)}</p>`);
  }
  flushList();
  return out.join('\n');
}

function inlineMd(s: string): string {
  let t = escapeHtml(s);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|\s)_([^_]+)_(\s|$)/g, '$1<em>$2</em>$3');
  t = t.replace(/`([^`]+)`/g, '<code style="background:#f3f0e9;padding:2px 6px;border-radius:4px;">$1</code>');
  return t;
}

const BASE_INSTRUCTIONS_AR = `
You are composing a daily/periodic report email for عبدالله الحضيفي,
the platform owner and PhD candidate. Address him directly as عبدالله.

Write the report in Arabic (فصحى مبسطة, warm professional tone). Use
markdown structure:

  # Title (one line)
  Opening greeting to عبدالله (one short paragraph).
  ## Section name
  - bullet
  - bullet
  ## Another section
  ...
  Closing line, signed by your display name.

Hard rules:
- Do NOT invent tasks, numbers, or events. If the context below has no
  data for a section, say so briefly ("لا نشاط ملحوظ في هذا القسم اليوم").
- Keep it tight — one screen. Maximum ~400 Arabic words.
- Never mention أبو عبدالله, نيابة عنه, or any kunya. Only عبدالله.
- End with one actionable suggestion for tomorrow.
`;

const BASE_INSTRUCTIONS_EN = `
You are composing a daily/periodic report email for Abdullah Al-Hudaifi,
the platform owner and PhD candidate. Address him directly as Abdullah.

Write the report in English (warm professional tone — think "chief of
staff briefing," not "formal memo"). Use markdown structure:

  # Title (one line)
  Opening greeting to Abdullah (one short paragraph).
  ## Section name
  - bullet
  - bullet
  ## Another section
  ...
  Closing line, signed by your display name.

Hard rules:
- Do NOT invent tasks, numbers, or events. If the context has no data
  for a section, say so briefly ("No notable activity in this area today").
- Keep it tight — one screen. Maximum ~400 words.
- End with one actionable suggestion for tomorrow.
`;

function pickInstructions(report: ReportDefinition): string {
  return (report as { language?: 'ar' | 'en' }).language === 'en'
    ? BASE_INSTRUCTIONS_EN
    : BASE_INSTRUCTIONS_AR;
}

export async function composeReport(
  deps: ReportComposerDeps,
  report: ReportDefinition,
): Promise<ComposedReport> {
  const store = deps.getStore();
  const memory = buildMemoryBlock(store, report);
  const context = memory + buildContext(store, report);

  // Multi-agent flow: each section is composed independently, then the
  // top-level `signedBy` edits them into a final bundled report. The
  // editor sees each section labeled with its author and title so they
  // can preserve the voice when bundling.
  if (report.sections && report.sections.length > 0) {
    let tokensIn = 0;
    let tokensOut = 0;
    let costUsd = 0;

    const sectionDrafts: Array<{ title: string; signedBy: string; markdown: string }> = [];
    for (const section of report.sections) {
      const sysAgent = (BUILTIN_SYSTEM_PROMPTS as Record<string, string>)[section.signedBy] ?? '';
      const sys = `${sysAgent}\n\n---\n${pickInstructions(report)}\n\nYou are writing ONE SECTION of a larger report, not the whole email. Do NOT add greetings, titles, or sign-offs — the editor will bundle you. Produce only the body of your section, in markdown.\n\nSection brief:\n${section.prompt}`;
      const u = `Today's platform context:\n\n${context}\n\nYour section title is "${section.title}". Compose your section now.`;
      const r = await callProviderWithRetry(deps, { agentId: section.signedBy, system: sys, user: u });
      sectionDrafts.push({ title: section.title, signedBy: section.signedBy, markdown: r.text.trim() });
      tokensIn += r.tokensIn ?? 0;
      tokensOut += r.tokensOut ?? 0;
      costUsd += r.costUsd ?? 0;
    }

    const greeting = (report as { language?: 'ar' | 'en' }).language === 'en' ? 'Abdullah' : 'عبدالله';
    const editorSys = `${(BUILTIN_SYSTEM_PROMPTS as Record<string, string>)[report.signedBy] ?? ''}\n\n---\n${pickInstructions(report)}\n\nYou are the EDITOR. Multiple agents wrote section drafts. Your job: produce the final single email. Open with a short greeting to ${greeting}. Include every section — title + content — in a sensible order. Preserve each author's voice. Close with one line signed by you.\n\nEditor's own framing/directions for this report:\n${report.prompt}`;
    const sectionsText = sectionDrafts.map((s) => `### [${s.title}] (by ${s.signedBy})\n\n${s.markdown}`).join('\n\n---\n\n');
    const editorUser = `Today's context:\n\n${context}\n\n---\n\nSection drafts to bundle:\n\n${sectionsText}`;
    const editor = await callProviderWithRetry(deps, { agentId: report.signedBy, system: editorSys, user: editorUser });
    tokensIn += editor.tokensIn ?? 0;
    tokensOut += editor.tokensOut ?? 0;
    costUsd += editor.costUsd ?? 0;

    let md = editor.text.trim();
    let subject = resolveSubjectTemplate(report.name, store);
    const firstLine = md.split('\n', 1)[0];
    if (firstLine && firstLine.startsWith('# ')) {
      subject = resolveSubjectTemplate(firstLine.replace(/^# /, '').trim(), store);
      md = md.slice(firstLine.length).trim();
    }
    const charts = report.includeContext?.tasks !== false
      ? buildReportCharts({ tasks: (store.tasks ?? []) })
      : '';
    return { subject, html: HTML_SHELL(markdownToHtml(md), subject, charts, (report as { language?: 'ar' | 'en' }).language ?? 'ar'), bodyMarkdown: md, tokensIn, tokensOut, costUsd };
  }

  // Single-agent flow (original).
  const systemPrompt = (BUILTIN_SYSTEM_PROMPTS as Record<string, string>)[report.signedBy] ?? '';
  const system = `${systemPrompt}\n\n---\n${pickInstructions(report)}\n\nYour custom prompt for this report:\n${report.prompt}`;
  const user = `Here is today's platform context. Compose the report now.\n\n${context}`;

  const r = await callProviderWithRetry(deps, { agentId: report.signedBy, system, user });

  let md = r.text.trim();
  let subject = report.name;
  const firstLine = md.split('\n', 1)[0];
  if (firstLine && firstLine.startsWith('# ')) {
    subject = firstLine.replace(/^# /, '').trim();
    md = md.slice(firstLine.length).trim();
  }

  const charts = report.includeContext?.tasks !== false
    ? buildReportCharts({ tasks: (store.tasks ?? []) })
    : '';
  return { subject, html: HTML_SHELL(markdownToHtml(md), subject, charts, (report as { language?: 'ar' | 'en' }).language ?? 'ar'), bodyMarkdown: md, tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd };
}
