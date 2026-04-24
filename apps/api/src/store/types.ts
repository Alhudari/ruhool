/**
 * Store data types — extracted from the god-file (index.ts) as part of REL-01 stage 2b.
 * All record interfaces + the canonical `StoreData` shape live here.
 *
 * Note: `UsageRecord` here is the in-memory/JSON-store shape kept for historical
 * compatibility. The repository layer (`store/repositories/usage.repo.ts`) has its
 * own richer `UsageRecord` with agent/workflow/conversation IDs — consumers should
 * prefer writing through the repository for new code paths.
 */
import type {
  Artifact,
  WorkflowTrigger,
  HierarchyNode,
  WatcherAlert,
  MessageRating,
  PromptVersion,
} from '../phase2.js';

export interface ProviderRecord {
  id: string; type: string; displayName: string; apiKey: string | null;
  baseUrl: string | null; defaultModel: string | null; enabled: boolean;
  status: string; lastTestAt: string | null; createdAt: string; updatedAt: string;
}

export interface StudioProjectData {
  storyboard?: Array<{ id: string; number: number; startTime: number; endTime: number; description: string; textOnScreen: string; transition: string; colors: string; notes: string }>;
  code?: string;
  format?: string;
  duration?: number;
  archived?: boolean;
}

export interface ConvRecord {
  id: string; title: string; language: string; archived: boolean;
  agentId?: string;
  participants?: string[];
  /** CHAT_V2 P1: mirror of `participants` using the canonical `participantAgentIds` name
   *  from the redesign spec. Kept as a parallel optional field for back-compat during
   *  the rollout — the two are expected to hold the same set. */
  participantAgentIds?: string[];
  studioProject?: StudioProjectData;
  createdAt: string; updatedAt: string;
}

/** CHAT_V2 P1: bubble kind.
 *  - 'text'     — normal agent response (default, back-compat).
 *  - 'progress' — live workflow/background status post ("بديت البحث…").
 *  - 'handoff'  — manager's short "أحلتها ل..." acknowledgement, rendered subtler.
 *  - 'artifact' — bubble whose primary content is an attachment preview.
 */
export type MessageKind = 'text' | 'progress' | 'handoff' | 'artifact';

export interface MessageArtifact {
  kind: 'image' | 'video' | 'audio' | 'file';
  url: string;
  meta?: Record<string, unknown>;
}

export interface MsgRecord {
  id: string; conversationId: string; role: string; content: string; createdAt: string;
  agentId?: string;
  replyToMessageId?: string;
  /** CHAT_V2 P1: see {@link MessageKind}. Absent === 'text'. */
  kind?: MessageKind;
  /** CHAT_V2 P2: orchestrator ↔ conversation bridge — link a progress bubble
   *  back to the workflow step that produced it. */
  workflowStepId?: string;
  /** CHAT_V2 P1: agent-to-agent reply threading. */
  replyToAgentId?: string;
  /** CHAT_V2 P1: attachments produced by this message. */
  artifacts?: MessageArtifact[];
  /** Hierarchical dispatch — which step produced this message. */
  dispatchStep?: 'dept-selected' | 'worker' | 'synthesis' | 'final';
  dispatchId?: string;
  dispatchChain?: unknown[];
  workspaceId?: string;
  agentDisplay?: { ar: string; en: string };
}

export interface UsageRecord {
  id: string; timestamp: string; provider: string; model: string;
  inputTokens: number; outputTokens: number; totalCostUsd: number;
  durationMs: number; success: boolean;
}

export interface AgentPermissions {
  canReadFiles: boolean;
  canWriteFiles: boolean;
  canSearch: boolean;
  canAccessInternet: boolean;
  canModifyAgents: boolean;
  canAccessPrivate: boolean;
}

export interface CustomAgentRecord {
  id: string;
  name: { en: string; ar: string };
  systemPrompt: string;
  icon: string;
  color: string;
  skills: string[];
  tools: string[];
  model: string;
  featured?: boolean;
  archived?: boolean;
  permissions?: AgentPermissions;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryRecord {
  id: string;
  agentId: string;
  tier: 'working' | 'short-term' | 'long-term';
  content: string;
  createdAt: string;
  updatedAt: string;
  metadata?: { conversationId?: string; [k: string]: unknown };
}

export interface PaperRecord {
  id: string;
  filename: string;
  title: string;
  authors: string;
  pages: number;
  textLength: number;
  sections: { title: string; content: string }[];
  archived?: boolean;
  createdAt: string;
}

export interface NoteRecord {
  id: string;
  paperId: string;
  section: string;
  type: 'claim' | 'evidence' | 'method' | 'critique' | 'question' | 'connection';
  content: string;
  themes: string[];
  archived?: boolean;
  createdAt: string;
}

export interface WorkflowRecord {
  id: string; name: { en: string; ar: string }; description: string;
  steps: Array<{ agentId: string; prompt: string }>; trigger: { type: string; cron?: string };
  enabled: boolean; archived?: boolean; lastRunAt: string | null; createdAt: string;
}

// ─── Phase 2: Workflow DAG ───
export type WorkflowRunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'canceled';
export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface WorkflowRunRecord {
  id: string;
  title: string;
  createdByConversationId?: string | null;
  status: WorkflowRunStatus;
  currentStepIndex: number;
  startedAt?: string | null;
  completedAt?: string | null;
  error?: string | null;
  totalCostUsd: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStepArtifact {
  type: 'image' | 'video' | 'audio' | 'file';
  url: string;
  meta?: Record<string, unknown>;
}

export interface WorkflowStepRecord {
  id: string;
  runId: string;
  stepIndex: number;
  specialist: string;
  task: string;
  expectedOutput?: string | null;
  status: WorkflowStepStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  input?: Record<string, unknown> | null;
  output?: string | null;
  artifacts?: WorkflowStepArtifact[] | null;
  usage?: { inputTokens: number; outputTokens: number; costUsd: number; model: string } | null;
  durationMs?: number | null;
  /** G7: per-step timeout in ms (default 3_600_000 = 1h). */
  timeoutMs?: number | null;
  /** G8: number of execution attempts so far. */
  attemptCount?: number | null;
  /** G8: max attempts before giving up. */
  maxAttempts?: number | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRecord {
  id: string;
  type: 'create_agent' | 'update_agent' | 'delete_agent' | 'update_memory' | 'delete_file' | 'create_task_category' | 'rename_task_category' | 'delete_task_category' | 'archive_conversation' | 'delete_conversation' | 'deep_delete_conversation' | 'create_project' | 'update_project' | 'delete_project' | 'update_agent_model' | 'other';
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  title: { en: string; ar: string };
  description: string;
  payload: Record<string, unknown>;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  rejectReason?: string;
  metadata?: { conversationId?: string; [k: string]: unknown };
}

export interface ActivityRecord {
  id: string;
  timestamp: string;
  type: 'chat' | 'api_call' | 'task' | 'approval' | 'memory' | 'agent_created' | 'agent_deleted' | 'file_upload' | 'backup' | 'error' | 'system';
  agentId?: string;
  agentName?: string;
  action: string;
  details: string;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
}

export interface ScheduleRecord {
  id: string;
  name: { en: string; ar: string };
  agentId: string;
  prompt: string;
  cron: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastResult: string | null;
  archived?: boolean;
  createdAt: string;
}

export interface ChecklistItemApi {
  id: string;
  text: string;
  done: boolean;
  children?: ChecklistItemApi[];
}

export interface TaskItem {
  id: string;
  title: string;
  notes: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low' | 'none';
  dueDate: string | null;
  dueTime: string | null;
  list: string;
  tags: string[];
  color: string;
  pinned: boolean;
  checklist: ChecklistItemApi[];
  reminder: string | null;
  order?: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  dependsOn?: string[];
  assignedAgent?: string;
  graphStatus?: 'ready' | 'blocked' | 'running' | 'done' | 'failed';
  origin?: 'user' | 'agent' | 'fatin-extraction' | 'watcher';
  conversationId?: string;
  lastAttemptAt?: string;
  output?: string;
  metadata?: { conversationId?: string; [k: string]: unknown };
}

export interface ConversationMemoryEntry {
  key: string;
  value: string;
  agentId?: string;
  updatedAt: string;
}

export interface GraphNode {
  id: string;
  type: 'person' | 'project' | 'organization' | 'agreement' | 'appointment' | 'topic' | 'other';
  label: string;
  props?: Record<string, string | number | boolean>;
  sourceConversationId?: string;
  sourceMessageId?: string;
  createdAt: string;
  updatedAt: string;
  confidence?: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  relation: string;
  props?: Record<string, string | number | boolean>;
  sourceConversationId?: string;
  sourceMessageId?: string;
  createdAt: string;
  confidence?: number;
}

export interface AgentRunRecord {
  id: string;
  conversationId: string;
  rootTaskId?: string;
  agentId: string;
  status: 'running' | 'waiting_user' | 'done' | 'failed' | 'aborted' | 'budget_exceeded';
  stepCount: number;
  maxSteps: number;
  tokensUsed: number;
  maxTokens: number;
  startedAt: string;
  endedAt?: string;
  lastStepAt?: string;
  trace?: Array<{ stepNumber: number; agentId: string; summary: string; tokensUsed: number; at: string }>;
}

export interface KeepNote {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'checklist' | 'mixed';
  items?: ChecklistItemApi[];
  color: string;
  pinned: boolean;
  archived: boolean;
  labels: string[];
  reminders?: string[];
  images?: string[];
  order?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryCategory {
  id: string;
  name: { ar: string; en: string };
  parentId?: string | null;
  color?: string;
  builtin?: boolean;
}

export interface LibraryTag {
  id: string;
  name: { ar: string; en: string };
  color?: string;
  builtin?: boolean;
}

export interface NotificationRecord {
  id: string;
  agentId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'reminder';
  link?: string;
  linkLabel?: string;
  read: boolean;
  priority: 'low' | 'normal' | 'high';
  createdAt: string;
  readAt?: string;
  relatedId?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentNotificationSettings {
  agentId: string;
  enabled: boolean;
  instructions: string;
  schedule?: string;
  triggers: {
    onTaskComplete?: boolean;
    onTaskOverdue?: boolean;
    onAgentFinish?: boolean;
    onError?: boolean;
    custom?: string[];
  };
  dailyDigestTime?: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  lastDigestAt?: string;
}

export interface TaskRecord {
  id: string;
  type: 'research';
  status: 'queued' | 'searching' | 'analyzing' | 'writing' | 'complete' | 'failed';
  query: string;
  depth: 'quick' | 'deep';
  language: 'en' | 'ar';
  progress: number;
  result?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreData {
  providers: ProviderRecord[];
  conversations: ConvRecord[];
  messages: MsgRecord[];
  usage: UsageRecord[];
  customAgents: CustomAgentRecord[];
  memories: MemoryRecord[];
  papers: PaperRecord[];
  notes: NoteRecord[];
  workflows: WorkflowRecord[];
  workflowRuns?: WorkflowRunRecord[];
  workflowSteps?: WorkflowStepRecord[];
  tools: Array<{ id: string; name: { en: string; ar: string }; icon: string; category: string; installed: boolean; description: { en: string; ar: string } }>;
  approvals: ApprovalRecord[];
  activityLog: ActivityRecord[];
  schedules: ScheduleRecord[];
  tasks: TaskItem[];
  taskLists: string[];
  keepNotes?: KeepNote[];
  taskPrefs?: {
    defaultView?: 'list' | 'grid';
    defaultColor?: string;
    showCompleted?: boolean;
    autoArchiveDays?: number;
    dateFormat?: 'short' | 'long' | 'iso';
  };
  approvalLevel?: 'strict' | 'normal' | 'relaxed';
  privacyMode?: 'strict' | 'balanced' | 'open';
  budget?: { monthlyBudget: number; budgetAlertPercent: number };
  notifications?: { smtpHost?: string; smtpPort?: number; smtpUser?: string; smtpPass?: string; smtpFrom?: string; slackWebhookUrl?: string; desktopEnabled?: string };
  notificationRecords?: NotificationRecord[];
  agentNotificationSettings?: AgentNotificationSettings[];
  libraryCategories?: LibraryCategory[];
  libraryTags?: LibraryTag[];
  libraryItemMeta?: Record<string, { categoryId?: string; tags?: string[] }>;
  conversationMemory?: Record<string, ConversationMemoryEntry[]>;
  graphNodes?: GraphNode[];
  graphEdges?: GraphEdge[];
  agentRuns?: AgentRunRecord[];
  artifacts?: Artifact[];
  messageRatings?: MessageRating[];
  promptVersions?: PromptVersion[];
  workflowTriggers?: WorkflowTrigger[];
  hierarchy?: HierarchyNode[];
  watcherAlerts?: WatcherAlert[];
  // ---- Additional optional fields used by routes/services (progressively typed) ----
  projects?: Array<{ id: string; name: string; description?: string; instructions?: string; color?: string; pinned?: boolean; archived?: boolean; createdAt: string; updatedAt: string }>;
  pinnedConversations?: string[];
  promptOverrides?: Record<string, string>;
  permissionOverrides?: Record<string, AgentPermissions>;
  builtinAgentModels?: Record<string, string>;
  taskCategories?: string[];
  apiKeys?: Record<string, string>;
  costTier?: 'zero-cost' | 'saving' | 'medium' | 'max' | string;
  voicePreferences?: { elevenlabsVoiceId?: string; [k: string]: unknown };
  __apiPort?: number;
  // ---- Dispatch + workspace ----
  limits?: { hierarchicalDispatchUsd?: number; dispatchMaxFanout?: number };
  activeWorkspaceId?: string;
  // ---- Subscriptions + overrides ----
  subscriptions?: Array<{ id: string; name: string; linkedApiField?: string; cost?: number; [k: string]: unknown }>;
  agentNameOverrides?: Record<string, { en: string; ar: string } | string>;
  // ---- Time + timezone ----
  timezones?: { primary: string; secondary?: string };
  phdSchedule?: { semester?: string; supervisorMeetings?: Array<{ date: string; notes?: string }>; deadlines?: Array<{ date: string; label: string }> };
  companionMemory?: CompanionMemoryEntry[];
}

export interface CompanionMemoryEntry {
  id: string;
  content: string;
  tags?: string[];
  createdAt: string;
  agentId?: string;
  importance?: number;
}
