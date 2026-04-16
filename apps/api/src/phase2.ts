// Phase 2 — Proactive + Canvas + Evaluator + Triggers + Hierarchy + Notifications
//
// All pieces share a single store object. Most components are pure helpers; the
// Watcher is a cron-like timer started at boot.

// ─── Types ─────────────────────────────────────────────────────────────
export interface ArtifactVersion {
  version: number;
  content: string;
  editedBy: 'user' | string; // 'user' or agentId
  editedAt: string;
  comment?: string;
}

export interface Artifact {
  id: string;
  conversationId?: string;
  title: string;
  kind: 'markdown' | 'code' | 'html' | 'text';
  language?: string; // for code artifacts
  content: string;
  versions: ArtifactVersion[];
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
}

export interface MessageRating {
  id: string;
  messageId: string;
  agentId: string;
  rating: 'good' | 'bad';
  comment?: string;
  model?: string;
  promptVersion?: string;
  messageLength?: number;
  userFollowUp?: 'accepted' | 'rephrased' | 'abandoned';
  createdAt: string;
}

export interface PromptVersion {
  id: string;
  agentId: string;
  version: number;
  prompt: string;
  isActive: boolean;
  isCandidate?: boolean;
  createdBy: 'manual' | 'evaluator';
  reason?: string;
  stats?: { goodCount: number; badCount: number; rephrased: number };
  createdAt: string;
}

export interface WorkflowTrigger {
  id: string;
  name: string;
  kind: 'webhook' | 'email' | 'schedule';
  enabled: boolean;
  /** For webhook: endpoint path; for email: address; for schedule: cron expr */
  endpoint?: string;
  /** Agent that handles incoming events */
  targetAgent: string;
  /** Optional guidance prompt prepended when invoking the agent */
  instructions?: string;
  createdAt: string;
  lastFiredAt?: string;
  fireCount?: number;
}

export interface HierarchyNode {
  agentId: string;
  parentAgentId?: string;
  role: string;
  tokenBudget?: number;
  tokensUsed?: number;
  children?: string[];
}

export interface WatcherAlert {
  id: string;
  kind: 'stuck_chain' | 'overdue_task' | 'subscription_limit' | 'missed_schedule' | 'idle_conversation';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  conversationId?: string;
  taskId?: string;
  subscriptionId?: string;
  createdAt: string;
  resolvedAt?: string;
  autoResolved?: boolean;
}

// Interface the store must expose for phase2 helpers
export interface Phase2StoreLike {
  artifacts?: Artifact[];
  messageRatings?: MessageRating[];
  promptVersions?: PromptVersion[];
  workflowTriggers?: WorkflowTrigger[];
  hierarchy?: HierarchyNode[];
  watcherAlerts?: WatcherAlert[];
  messages: Array<{ id: string; conversationId: string; role: string; content: string; createdAt: string; agentId?: string }>;
  tasks: Array<{ id: string; title: string; completed: boolean; dueDate: string | null; createdAt: string; graphStatus?: string; assignedAgent?: string; conversationId?: string }>;
  conversations: Array<{ id: string; title: string; archived: boolean; updatedAt: string }>;
  subscriptions?: Array<{ id: string; name: string; monthlyLimit?: number; linkedApiField?: string; amount?: number }>;
  agentRuns?: Array<{ id: string; status: string; conversationId: string; stepCount: number; lastStepAt?: string; startedAt: string }>;
}

// ─── Artifact helpers ───────────────────────────────────────────────────
export function createArtifact(
  store: Phase2StoreLike,
  input: { title: string; kind?: Artifact['kind']; language?: string; content?: string; conversationId?: string; editedBy?: string }
): Artifact {
  if (!store.artifacts) store.artifacts = [];
  const now = new Date().toISOString();
  const art: Artifact = {
    id: crypto.randomUUID(),
    conversationId: input.conversationId,
    title: input.title,
    kind: input.kind || 'markdown',
    language: input.language,
    content: input.content || '',
    versions: input.content ? [{
      version: 1, content: input.content,
      editedBy: input.editedBy === 'user' ? 'user' : (input.editedBy || 'user'),
      editedAt: now,
    }] : [],
    createdAt: now,
    updatedAt: now,
  };
  store.artifacts.unshift(art);
  return art;
}

export function updateArtifact(
  store: Phase2StoreLike,
  id: string,
  patch: { content: string; editedBy: 'user' | string; comment?: string }
): Artifact | null {
  const art = store.artifacts?.find((a) => a.id === id);
  if (!art) return null;
  const nextVersion = (art.versions[art.versions.length - 1]?.version || 0) + 1;
  art.versions.push({
    version: nextVersion, content: patch.content,
    editedBy: patch.editedBy, editedAt: new Date().toISOString(),
    comment: patch.comment,
  });
  art.content = patch.content;
  art.updatedAt = new Date().toISOString();
  // Trim history to last 30 versions
  if (art.versions.length > 30) art.versions.splice(0, art.versions.length - 30);
  return art;
}

export function artifactByConversation(store: Phase2StoreLike, convId: string): Artifact[] {
  return (store.artifacts || []).filter((a) => a.conversationId === convId && !a.archived);
}

// ─── Rating / Evaluator ─────────────────────────────────────────────────
export function addRating(store: Phase2StoreLike, r: Omit<MessageRating, 'id' | 'createdAt'>): MessageRating {
  if (!store.messageRatings) store.messageRatings = [];
  const rec: MessageRating = { ...r, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  store.messageRatings.push(rec);
  return rec;
}

export function agentStats(store: Phase2StoreLike, agentId: string, windowSize = 50): {
  total: number; good: number; bad: number; rephrased: number; abandoned: number; avgLength: number;
} {
  const ratings = (store.messageRatings || []).filter((r) => r.agentId === agentId).slice(-windowSize);
  const good = ratings.filter((r) => r.rating === 'good').length;
  const bad = ratings.filter((r) => r.rating === 'bad').length;
  const rephrased = ratings.filter((r) => r.userFollowUp === 'rephrased').length;
  const abandoned = ratings.filter((r) => r.userFollowUp === 'abandoned').length;
  const avgLength = ratings.length > 0 ? ratings.reduce((s, r) => s + (r.messageLength || 0), 0) / ratings.length : 0;
  return { total: ratings.length, good, bad, rephrased, abandoned, avgLength };
}

// Infer implicit rating from user's follow-up: if they resend a rephrased version
// of the same question within 60s, that's 'rephrased' (negative). If they reply
// normally, 'accepted'. If conversation goes quiet for 24h, 'abandoned'.
export function inferImplicitRating(
  prevUserMsg: string,
  nextUserMsg: string,
  secondsBetween: number
): MessageRating['userFollowUp'] {
  if (secondsBetween > 24 * 3600) return 'abandoned';
  const similarity = jaccardSim(normalizeForSim(prevUserMsg), normalizeForSim(nextUserMsg));
  if (similarity > 0.5 && secondsBetween < 120) return 'rephrased';
  return 'accepted';
}

function normalizeForSim(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2));
}
function jaccardSim(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// ─── Workflow triggers ──────────────────────────────────────────────────
export function createTrigger(store: Phase2StoreLike, t: Omit<WorkflowTrigger, 'id' | 'createdAt' | 'enabled'> & { enabled?: boolean }): WorkflowTrigger {
  if (!store.workflowTriggers) store.workflowTriggers = [];
  const rec: WorkflowTrigger = {
    ...t, id: crypto.randomUUID(), enabled: t.enabled ?? true,
    createdAt: new Date().toISOString(), fireCount: 0,
  };
  store.workflowTriggers.push(rec);
  return rec;
}

// ─── Hierarchy ──────────────────────────────────────────────────────────
export function setHierarchyNode(store: Phase2StoreLike, node: HierarchyNode): void {
  if (!store.hierarchy) store.hierarchy = [];
  const idx = store.hierarchy.findIndex((h) => h.agentId === node.agentId);
  if (idx >= 0) store.hierarchy[idx] = { ...store.hierarchy[idx], ...node };
  else store.hierarchy.push(node);
  // Maintain children arrays
  if (node.parentAgentId) {
    const parent = store.hierarchy.find((h) => h.agentId === node.parentAgentId);
    if (parent) {
      if (!parent.children) parent.children = [];
      if (!parent.children.includes(node.agentId)) parent.children.push(node.agentId);
    }
  }
}

export function checkBudget(store: Phase2StoreLike, agentId: string, tokensToAdd: number): { ok: boolean; remaining?: number } {
  const node = store.hierarchy?.find((h) => h.agentId === agentId);
  if (!node?.tokenBudget) return { ok: true };
  const used = (node.tokensUsed || 0) + tokensToAdd;
  if (used > node.tokenBudget) return { ok: false, remaining: node.tokenBudget - (node.tokensUsed || 0) };
  return { ok: true, remaining: node.tokenBudget - used };
}

// ─── Watcher ───────────────────────────────────────────────────────────
export function scanForAlerts(store: Phase2StoreLike): WatcherAlert[] {
  const now = Date.now();
  const alerts: WatcherAlert[] = [];
  const existing = store.watcherAlerts || [];

  // Stuck runs: running status but no step in last 3 min
  for (const run of store.agentRuns || []) {
    if (run.status !== 'running') continue;
    const lastActive = new Date(run.lastStepAt || run.startedAt).getTime();
    if (now - lastActive > 3 * 60 * 1000) {
      const dupe = existing.find((a) => a.kind === 'stuck_chain' && !a.resolvedAt && a.conversationId === run.conversationId);
      if (dupe) continue;
      alerts.push({
        id: crypto.randomUUID(), kind: 'stuck_chain', severity: 'warning',
        title: 'سلسلة وكلاء متوقفة',
        description: `التشغيل ${run.id.slice(0, 8)} لم يتقدّم منذ 3 دقائق (${run.stepCount} خطوة منجزة).`,
        conversationId: run.conversationId,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // Overdue tasks (dueDate < today, not completed)
  const today = new Date().toISOString().slice(0, 10);
  for (const t of store.tasks) {
    if (t.completed) continue;
    if (!t.dueDate) continue;
    if (t.dueDate < today) {
      const dupe = existing.find((a) => a.kind === 'overdue_task' && !a.resolvedAt && a.taskId === t.id);
      if (dupe) continue;
      alerts.push({
        id: crypto.randomUUID(), kind: 'overdue_task', severity: 'warning',
        title: 'مهمة متأخرة',
        description: `"${t.title}" كانت مستحقة ${t.dueDate}.`,
        taskId: t.id,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // Idle conversations: updatedAt > 7 days, not archived, has pending tasks
  for (const c of store.conversations) {
    if (c.archived) continue;
    const age = now - new Date(c.updatedAt).getTime();
    if (age > 7 * 24 * 60 * 60 * 1000) {
      const pendingInConv = store.tasks.filter((t) => !t.completed && t.conversationId === c.id);
      if (pendingInConv.length === 0) continue;
      const dupe = existing.find((a) => a.kind === 'idle_conversation' && !a.resolvedAt && a.conversationId === c.id);
      if (dupe) continue;
      alerts.push({
        id: crypto.randomUUID(), kind: 'idle_conversation', severity: 'info',
        title: 'محادثة خاملة',
        description: `"${c.title}" لم تُحدَّث منذ أكثر من أسبوع وفيها ${pendingInConv.length} مهمة معلقة.`,
        conversationId: c.id,
        createdAt: new Date().toISOString(),
      });
    }
  }

  if (!store.watcherAlerts) store.watcherAlerts = [];
  store.watcherAlerts.push(...alerts);
  return alerts;
}

export function resolveAlert(store: Phase2StoreLike, id: string, auto = false): boolean {
  const a = store.watcherAlerts?.find((x) => x.id === id);
  if (!a) return false;
  a.resolvedAt = new Date().toISOString();
  a.autoResolved = auto;
  return true;
}

// System-prompt hint telling agents about artifacts + hierarchy
export const PHASE2_PROMPT_ADDENDUM = `

## Artifacts
لو طُلب منك كتابة/تعديل **مستند أو كود طويل**، استخدم وسم Artifact:
\`[ARTIFACT:NEW:title=عنوان|kind=markdown]\` ثم النص داخل \`\`\`artifact ... \`\`\`
\`[ARTIFACT:UPDATE:id=xxx|comment=سبب التعديل]\` للتحديث.
المستند سيُعرض في لوحة جنبية قابلة للتعديل معك.
`;
