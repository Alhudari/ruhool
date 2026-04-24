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
  /** Round 5: hierarchical dispatch fields. A group of messages with the
   *  same `dispatchId` represents one dispatcher run. `dispatchStep`
   *  tells the UI how to render each one (route caption, collapsible
   *  worker draft, or bold synthesis). */
  dispatchId?: string;
  dispatchStep?: 'route' | 'dept-selected' | 'worker' | 'synthesis' | 'final';
  dispatchChain?: string[];
  costUsd?: number;
  tokensIn?: number;
  tokensOut?: number;
  /** Round 4: workspace scoping. Legacy rows backfilled to 'phd' via
   *  migration 003. New rows should set it explicitly. */
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

/**
 * R18 — Unified Sources model. Every item in the Sources hub
 * (Zotero/document/book/writing) is a SourceRecord. Papers (older
 * model) stays for backward compat but new reading goes here.
 */
export type SourceKind = 'zotero' | 'document' | 'book' | 'writing';

export interface SourceRecord {
  id: string;
  kind: SourceKind;
  title: string;
  authors?: string;
  year?: number;
  /** For books: ISBN. For Zotero: cached DOI/URL. */
  identifier?: string;
  /** Free-form notes by the user. */
  notes?: string;
  tags?: string[];
  /** Zotero-synced: stable item key so we can refresh from the library
   *  and avoid duplicates when the user imports the same item twice. */
  zoteroKey?: string;
  /** For `document` / `book` with uploaded PDF — relative path under
   *  `data/sources/` the platform can stream back to the reader. */
  filePath?: string;
  /** Original filename for display + downloads. */
  fileName?: string;
  /** `application/pdf`, etc. — lets the UI decide how to render. */
  mimeType?: string;
  /** Size in bytes — for file-management UI. */
  sizeBytes?: number;
  /** Page count (books + docs). */
  pages?: number;
  /** Is this source in the reading queue? */
  inReadingQueue?: boolean;
  readingStatus?: 'to-read' | 'reading' | 'read' | 'skimmed';
  archived?: boolean;
  workspaceId?: string;
  createdAt: string;
  updatedAt: string;
}

/** How the location was specified */
export type LocationKind =
  | 'page'           // p.45 or pp.45-52
  | 'kindle'         // Kindle Loc. 1250 or Loc. 1200-1350
  | 'chapter'        // Ch. 3 or Chapter 3
  | 'paragraph'      // ¶12 or para.12
  | 'custom';        // any free-text (e.g. "timestamp 00:23:15")

export interface LocationRef {
  kind: LocationKind;
  /** raw input as typed by user, always preserved */
  raw: string;
  /** normalized display string for citations, e.g. "p. 45" or "loc. 1250" */
  display: string;
  /** start number if parseable (page start, Kindle loc start) */
  start?: number;
  /** end number if range, e.g. pp.45-52 → end=52 */
  end?: number;
  /** For Kindle: the stable location number (zoom-invariant). Always prefer this over page number for Kindle books. */
  kindleLoc?: number;
  /** For Kindle: the page number shown at this location (may change with zoom — store but don't rely on for citations). */
  kindlePage?: number;
  /** Source platform that generated this location */
  platform?: 'kindle' | 'google-books' | 'pdf' | 'epub' | 'physical' | 'web';
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
  // ── Reading session safety fields ──────────────────────────────────
  /** 'manual' = user typed it, never auto-overwrite.
   *  'ai-draft' = AI generated, can be re-generated if user asks.
   *  'ai-adopted' = user approved, protected from auto-overwrite. */
  source?: 'manual' | 'ai-draft' | 'ai-adopted';
  /** e.g. "45-52" — which pages this note covers */
  pageRange?: string;
  /** link back to the ReadingSession that produced this note */
  sessionId?: string;
  /** free-text book/source title when not linked to a /papers record */
  bookTitle?: string;
  /** Zotero item key if imported from Zotero */
  zoteroKey?: string;
  updatedAt?: string;
  /** Location reference — flexible format supporting pages, Kindle locations, chapters.
   *  Use LocationRef type for structured access; raw string also accepted. */
  location?: LocationRef;
}

export interface ReadingSessionPage {
  /** e.g. "1-5", "10", "45-52" */
  pageRange: string;
  /** how the content was captured */
  inputMethod: 'copy-paste' | 'image' | 'manual';
  /** ids of NoteRecord produced for these pages */
  noteIds: string[];
  processedAt: string;
  /** User's personal per-page note in their own words (Arabic, informal) */
  impression?: string;
  /** English impression for language practice */
  impressionEn?: string;
}

export interface ReadingSession {
  id: string;
  title: string;
  /** link to /papers record — optional */
  paperId?: string;
  /** Zotero item key — optional */
  zoteroKey?: string;
  /** link to project — optional */
  projectId?: string;
  pages: ReadingSessionPage[];
  /** total pages in source — used to show progress */
  totalPages?: number;
  /** Source metadata for citation generation */
  citationMeta?: {
    authors?: string;      // "Smith, J. and Jones, K."
    year?: number;
    publisher?: string;
    edition?: string;
    city?: string;
    doi?: string;
    journal?: string;
    volume?: string;
    issue?: string;
    isKindleEdition?: boolean;
    /** Kindle ASIN — stable identifier for the specific Kindle edition */
    kindleAsin?: string;
    /** Google Books volume ID */
    googleBooksId?: string;
    /** Print ISBN — if citing Kindle/digital edition that matches print */
    printIsbn?: string;
  };
  /** User's overall impression of the entire source (Arabic, informal) */
  impression?: string;
  /** English impression for language practice */
  impressionEn?: string;
  /** Phase 4+5: link to a Library entity */
  libraryEntityId?: string;
  /** Phase 5: reading status for this session */
  readingStatus?: ReadingStatus;
  /** Phase 5: reading depth */
  readingDepth?: ReadingDepth;
  /** Phase 5: pause note (why paused) */
  pauseNote?: string;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
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
  /** R19: optional time window — both null means "no time", use dueTime instead.
   *  When allDay is true the window is ignored (full-day event). */
  startTime?: string | null;
  endTime?: string | null;
  allDay?: boolean;
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
  /** Subtask hierarchy — null/undefined for root tasks. Multi-level allowed. */
  parentId?: string | null;
  /** Round 4: workspace scope (phd | life | …). */
  workspaceId?: string;
  /** Round 6: is this a habit template (repeats on a schedule)?
   *  Habits are not completed directly; completing them creates a
   *  dated instance and rolls the next-due forward. */
  isHabit?: boolean;
  /** Round 6: habit spawn schedule.
   *  - 'daily': every day
   *  - 'skip-weekends': Sun–Thu (Kuwaiti weekend) — configurable via user prefs
   *  - 'weekly': one specific day in `habitDays`
   *  - 'custom': specific days in `habitDays` */
  habitFrequency?: 'daily' | 'skip-weekends' | 'weekly' | 'custom';
  /** Round 6: for 'weekly' or 'custom' — days-of-week (0=Sun..6=Sat). */
  habitDays?: number[];
  /** Round 6: for habit instances, points back to the template task. */
  habitTemplateId?: string;
  /** Round 6: target duration per instance in minutes (optional).
   *  Used for "read 30 min", "exercise 45 min" style habits. */
  durationMinutes?: number;
  /** Round 6: optional habit lifespan. Spawner stops after endDate. */
  habitStartDate?: string | null;
  habitEndDate?: string | null;
  /** Round 6: scheduled date (ISO yyyy-mm-dd). Different from dueDate:
   *  `scheduledFor` is "I plan to do it on this day"; `dueDate` is "it
   *  must be done by this day". Tasks with scheduledFor=today appear
   *  in the Today view. */
  scheduledFor?: string | null;
  /** Round 6: explicit "today" pin that ignores workspace scoping.
   *  Useful for ad-hoc items the user wants in the Today view without
   *  touching dates. */
  isToday?: boolean;
  /** Round 6: if true, this task appears in every workspace's view
   *  regardless of the workspace filter. For platform-wide commitments
   *  like "work on Ruhool". */
  crossWorkspace?: boolean;
  /** Round 7: external system mapping (Google Tasks, Outlook, ...). */
  externalId?: string;
  externalProvider?: 'google-tasks' | 'outlook' | 'todoist';
  externalUpdatedAt?: string;
  /** Phase J-6: Quick Note — displayed as yellow sticky card in /tasks Notes view */
  isQuickNote?: boolean;
  noteColor?: string;         // default '#fef08a'
  /** Phase J-6: bilingual category names */
  categoryEn?: string;
  categoryAr?: string;
  /** Phase J-6: link back to a meeting (sourceRef) */
  meetingSourceId?: string;
  meetingSourceNo?: number;
  /** Phase J-7: soft delete */
  deletedAt?: string;
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

export interface NotificationRule {
  id: string;
  titleEn: string;
  titleAr: string;
  trigger: {
    type: 'time-before' | 'daily-morning' | 'daily-evening' | 'cron' | 'task-overdue';
    offsetHours?: number;
    cronExpression?: string;
    timeOfDay?: string;
  };
  condition?: {
    type: 'grs2-not-submitted' | 'task-overdue' | 'meeting-upcoming' | 'custom';
    customCheck?: string;
  };
  messageTemplate: { en: string; ar: string };
  linkTo?: string;
  agentId?: string;
  enabled: boolean;
  isBuiltIn: boolean;
  snoozedUntil?: string;
  lastFiredAt?: string;
  createdAt: string;
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

export type ReadingSessionStatus = 'active' | 'paused' | 'completed' | 'archived';
export type ReadingSessionSource =
  | 'upload'
  | 'zotero'
  | 'obsidian'
  | 'paste'
  | 'link'
  | 'kindle-clippings'
  | 'kindle-book'
  | 'camera'
  | 'drive'
  | 'screen-capture'
  | 'standalone'; // free notes session — no source file

export type ReadingMode = 'page' | 'rolling' | 'full' | 'tac';

export interface ReadingSessionRecord {
  id: string;
  paperId: string;
  paperTitle: string;
  paperMeta?: {
    authors?: string;
    year?: number | null;
    journal?: string;
    doi?: string;
    abstractNote?: string;
    [k: string]: unknown;
  };
  source: ReadingSessionSource;
  sourceRef?: string | null;
  totalPages: number;
  currentPage: number;
  language: 'en' | 'ar';
  status: ReadingSessionStatus;
  mindOverride?: string | null;
  totalCost?: number;
  /** Default 'rolling' at creation. Controls how /analyze is run. */
  readingMode?: ReadingMode;
  /** Updated on each page in rolling mode; injected into subsequent analyses. */
  runningSynthesis?: string;
  /** User-authored markdown notes, keyed by page number (as string). */
  userNotes?: Record<string, string>;
  /** Auto-save draft notes — free-form text before Obsidian commit. */
  draftNotes?: string;
  /** Timestamp of last auto-save. */
  draftSavedAt?: string;
  /** Undo stack: list of { field, previousValue } snapshots, newest last. */
  undoStack?: Array<{ id: string; ts: string; field: string; previousValue: unknown }>;
  /** Zotero item key linked to this session (if any). */
  linkedZoteroKey?: string | null;
  /**
   * Raw page text captured at session-create time.
   * Indexed from 0; page N in the UI maps to `pages[N-1]`.
   * For upload sources, populated from the PDF parse (one entry per section).
   * For Zotero/link/Kindle/Drive sources this is currently empty — those
   * pipelines aren't wired yet.
   */
  pages?: string[];
  /**
   * Inline page images, keyed by page number (as string).
   * Populated by screenshot/camera sources and used by PaperView to render
   * image-only pages (and by `/api/shwasha/vision` for vision analysis).
   */
  pageImages?: Record<string, { base64: string; mimeType: string }>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface PageAnalysisRecord {
  id: string;
  sessionId: string;
  pageNumber: number;
  version: number;
  parentVersionId?: string | null;
  analysis: Record<string, unknown>;
  refinementRequest?: string | null;
  modelUsed: string;
  providerUsed: string;
  tokenCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  rawText?: string | null;
  createdAt: string;
  /** Set when the user edits the record directly via PATCH /analyses/:id. */
  humanEdited?: boolean;
  /** Last mutation time — only present when the record has been updated. */
  updatedAt?: string;
}

export interface ShwashaSettings {
  mindBlock: string;
  agentIntegrations: string;
  defaultLanguage: 'en' | 'ar';
  ollamaEnabled?: boolean;
  ollamaBaseUrl?: string;
}

// Working schedule for the PhD — shared across all research agents.
// Manager updates this via [PHD_SCHEDULE] action tags; everyone else reads it.
export interface PhDSchedule {
  workStart: string;          // e.g. '09:00'
  workEnd: string;            // e.g. '17:00'
  breakStart: string;         // e.g. '13:00'
  breakDurationMinutes: number; // e.g. 60
  timezone: string;           // IANA tz, e.g. 'Europe/London'
  workingDays: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>;
  /** Free-form override that takes precedence today only — e.g. "Today: in Kuwait, working 14:00-22:00 Asia/Kuwait" */
  todayOverride?: string | null;
  /** Date the override was set (YYYY-MM-DD) — auto-cleared when day changes */
  todayOverrideDate?: string | null;
  updatedAt: string;
}

export type CompanionMemoryCategory = 'insight' | 'idea' | 'decision' | 'concern' | 'goal' | 'progress' | 'note';

export interface CompanionMemoryEntry {
  id: string;
  category: CompanionMemoryCategory;
  content: string;
  date: string; // ISO date string
  conversationId?: string;
  tags?: string[];
  createdAt: string;
  agentId?: string;
  importance?: number;
}

export interface MeetingSessionRecord {
  id: string;
  title: string;
  draft?: string;
  language?: string;
  record?: Record<string, unknown> | null;
  savedToObsidian?: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Grs2Record {
  id: string;
  month: string;           // 'YYYY-MM' format e.g. '2026-04'
  status: 'not_started' | 'submitted' | 'supervisor_approved' | 'student_confirmed' | 'university_approved';
  progress: number;        // 0 | 25 | 75 | 100
  content?: string;        // what the user wrote in the GRS2
  supervisorResponse?: string;  // Dr Richard's comments
  submittedAt?: string;
  supervisorApprovedAt?: string;
  studentConfirmedAt?: string;
  universityApprovedAt?: string;
  reminderSent?: boolean;
}

// ─── Phase 7 — Inbox QuickItem ───────────────────────────────────────────────

export type InboxCategory = 'phd' | 'life' | 'general';
export type InboxProcessingStatus = 'pending' | 'processing' | 'done' | 'error';

export interface InboxItemRecord {
  id: string;
  kind: 'note' | 'image' | 'link' | 'voice-memo';
  type: 'note' | 'inbox';
  title?: string;
  content?: string;
  imagePath?: string;
  url?: string;
  tags?: string[];
  color: string;               // default '#fef08a' yellow
  category?: InboxCategory;
  linkedTaskId?: string;
  linkedEntityId?: string;
  processedByAgent?: string;
  aiSummary?: string;
  isProcessed: boolean;
  processingStatus: InboxProcessingStatus;
  capturedAt: string;
  capturedFrom?: string;
  promoted?: boolean;
  promotedTo?: string;
  archivedAt?: string;
  deletedAt?: string;
}

// ─── Unified Library (Phase 4) ───────────────────────────────────────────────

export type EntityType =
  | 'paper' | 'book' | 'report' | 'standard' | 'my-writing' | 'thesis-chapter'
  | 'person' | 'organization' | 'conference' | 'project'
  | 'atomic-note' | 'reading-session' | 'research-cluster'
  | 'file' | 'webpage' | 'video' | 'code-repo';

export type ReadingStatus = 'to-read' | 'skimming' | 'reading' | 'paused' | 'done';
export type ReadingDepth = 'title-abstract-conclusion' | 'scan-only' | 'selective' | 'full';

export interface SubNote {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface EntityLink {
  targetId: string;
  relation?: string;
  createdAt: string;
}

export interface LibraryEntity {
  id: string;
  type: EntityType;
  title: string;
  coverImage?: string;
  notes: string;
  subNotes: SubNote[];
  links: EntityLink[];
  tags: string[];
  zoteroKey?: string;
  readingStatus?: ReadingStatus;
  readingDepth?: ReadingDepth;
  authors?: string;
  year?: number;
  url?: string;
  doi?: string;
  isbn?: string;
  publisher?: string;
  journal?: string;
  abstract?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  deletedAt?: string;
}

export interface MilestoneRecord {
  id: string;
  title: string;
  titleAr: string;
  date: string;
  status: 'upcoming' | 'in-progress' | 'completed' | 'delayed';
  description?: string;
  links: string[];
  tags: string[];
  meetingId?: string;
  grs2Month?: string;
  attachments?: string[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  deletedAt?: string;
}

export interface TagRecord {
  id: string;
  path: string;      // e.g. "BIM/Standards" — no # in storage
  label?: string;
  color?: string;
  description?: string;
  createdAt: string;
}

export interface TagAssignment {
  nodeType: string;
  nodeId: string;
  tagPaths: string[];
  updatedAt: string;
}

// ─── Research Clusters + File Provenance ──────────────────────────────────────

export type FileCategory =
  | 'technical-doc'   // BIM templates, CAD standards
  | 'regulation'      // laws, government orders
  | 'standard'        // ISO, BSI, FIDIC
  | 'data'            // Excel, CSV, statistics
  | 'presentation'    // PPT, slides
  | 'template'        // document templates
  | 'image'           // photos, scans
  | 'correspondence'  // emails, letters from supervisors/colleagues
  | 'report'          // industry reports, white papers
  | 'thesis'          // dissertations
  | 'other';

export type SourceType =
  | 'url'             // downloaded from a website
  | 'person'          // sent by a person (supervisor, colleague)
  | 'meeting'         // received in a meeting
  | 'zotero'          // imported from Zotero
  | 'email'           // received by email
  | 'purchase'        // bought/licensed
  | 'direct-download'; // direct download, no specific source

export interface FileProvenance {
  path: string;
  name: string;
  // Source tracking (academic chain-of-custody)
  sourceType?: SourceType;
  sourceUrl?: string;          // URL if downloaded from web
  sourcePerson?: string;       // "Dr Richard Davies" or "Colleague Iis"
  sourceMeetingId?: string;    // meeting session id (e.g. "sip-4")
  sourceDate?: string;         // ISO date when obtained
  sourceNotes?: string;        // any additional context
  // Zotero linkage
  zoteroKey?: string;          // linked Zotero item key
  zoteroSnapshotKey?: string;  // Zotero webpage snapshot key
  // Classification
  tags?: string[];             // e.g. ["BIM/Standards", "GCC/Qatar"]
  fileCategory?: FileCategory;
  jurisdictionCode?: string;   // ISO 3166-1 alpha-3 e.g. "QAT", "ARE"
  notes?: string;              // user notes on this specific file
  addedAt?: string;
  analyzedAt?: string;
}

export type ClusterDimension =
  | 'bim-mandate' | 'contracts' | 'laws' | 'market' | 'standards'
  | 'methodology' | 'writing' | 'training' | 'life' | 'other';

export interface ResearchCluster {
  id: string;
  name: string;
  description?: string;
  // File paths (folders or specific files)
  paths: string[];             // absolute folder/file paths
  // Classification
  tags?: string[];
  jurisdiction?: {
    type: 'country' | 'region' | 'international' | 'life';
    code?: string;             // ISO 3166-1 alpha-3
    name: string;
  };
  dimension?: ClusterDimension;
  // File provenance metadata (path -> FileProvenance)
  fileMetadata?: Record<string, FileProvenance>;
  // Zotero
  zoteroKeys?: string[];       // related Zotero item keys
  zoteroCollectionKey?: string; // dedicated Zotero collection
  // Content
  notes?: string;              // general cluster notes
  report?: string;             // synthesis report (markdown)
  reportUpdatedAt?: string;
  // External sync
  externalSync?: {
    projectId: string;
    lastSyncAt?: string;
    syncDirection: 'push' | 'pull' | 'both';
  };
  // Metadata
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchScopePoint {
  id: string;
  number: number;        // S1, S2, S3...
  title: string;
  description?: string;
  phase?: string;        // 'literature' | 'survey' | 'analysis' | 'writing' | custom
  status?: 'active' | 'completed' | 'paused' | 'dropped';
  links?: string[];      // [[wikilinks]] to related content
  notes?: string;
  tags?: string[];
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
  /** R18 — unified sources hub. Reading material from any origin
   *  (Zotero sync, uploaded PDF/doc, book metadata, user's writing). */
  sources?: SourceRecord[];
  notes: NoteRecord[];
  workflows: WorkflowRecord[];
  workflowRuns?: WorkflowRunRecord[];
  workflowSteps?: WorkflowStepRecord[];
  tools: Array<{ id: string; name: { en: string; ar: string }; icon: string; category: string; installed: boolean; description: { en: string; ar: string } }>;
  approvals: ApprovalRecord[];
  activityLog: ActivityRecord[];
  schedules: ScheduleRecord[];
  tasks: TaskItem[];
  /** Legacy flat categories (pre-R17). Kept for migration compat;
   *  new code should read/write `taskListsByWorkspace` instead. */
  taskLists: string[];
  /** R17 — per-workspace task categories. Keys are workspace ids
   *  (`'phd'`, `'life'`, or custom). Each workspace sees only its
   *  own lists in the tasks UI. */
  taskListsByWorkspace?: Record<string, string[]>;
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
  notificationRules?: NotificationRule[];
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
  projects?: ProjectRecord[];
  /** R9-R18 Shwasha paper-analysis sessions (ReadingSessionRecord). */
  readingSessions?: ReadingSessionRecord[];
  /** Reading note-taking sessions (simpler model for any source). */
  readingNoteSessions?: ReadingSession[];
  pinnedConversations?: string[];
  promptOverrides?: Record<string, string>;
  permissionOverrides?: Record<string, AgentPermissions>;
  builtinAgentModels?: Record<string, string>;
  taskCategories?: { id: string; en: string; ar: string }[];
  apiKeys?: Record<string, string>;
  costTier?: 'zero-cost' | 'saving' | 'medium' | 'max' | string;
  voicePreferences?: { elevenlabsVoiceId?: string; [k: string]: unknown };
  pageAnalyses?: PageAnalysisRecord[];
  agentNameOverrides?: Record<string, { en: string; ar: string } | string>;
  shwashaSettings?: ShwashaSettings;
  // Free-form, long-form description of the user's writing voice — style,
  // tone, common phrases, even spelling/grammar quirks. Injected into all
  // writing agents so generated text mimics the user's actual register.
  userVoiceProfile?: { content: string; updatedAt: string };
  responseLength?: 'short' | 'medium' | 'long';
  phdSchedule?: PhDSchedule;
  companionMemory?: CompanionMemoryEntry[];
  meetingSessions?: MeetingSessionRecord[];
  grs2Records?: Grs2Record[];
  milestones?: MilestoneRecord[];
  libraryEntities?: LibraryEntity[];
  inboxItems?: InboxItemRecord[];
  tags?: TagRecord[];
  tagAssignments?: TagAssignment[];
  researchClusters?: ResearchCluster[];
  scopePoints?: ResearchScopePoint[];
  // R8 — Scheduled reports (daily digests, weekly PhD summaries, ad-hoc).
  reports?: ReportDefinition[];
  reportRuns?: ReportRunRecord[];
  /** R16 — in-platform inbox for reports + onboarding messages.
   *  Always written on successful compose (even when Resend isn't
   *  configured, so Abdullah still has a way to read the output).
   *  Abdullah's request: "اجعل صفحة للايميلات كأنني مستلمها بالمنصة". */
  reportInbox?: ReportInboxItem[];
  resend?: {
    apiKey?: string;
    fromEmail?: string;      // e.g. "Ruhool <reports@mydomain.com>"
    defaultRecipient?: string;
    /** R14 — optional override for send retry backoff (milliseconds
     *  per attempt). Default: [30000, 60000, 120000] = 3.5min ceiling.
     *  Set to small values in CI, longer for aggressive recovery. */
    retryDelays?: number[];
    /** R14-#6 — same idea but for the LLM compose path. Default
     *  [5000, 10000] = ~15s ceiling; CI overrides to `[10, 10]`. */
    composeRetryDelays?: number[];
  };
  __apiPort?: number;
  // ---- Dispatch + workspace ----
  limits?: { hierarchicalDispatchUsd?: number; dispatchMaxFanout?: number };
  activeWorkspaceId?: string;
  // ---- Subscriptions + overrides ----
  subscriptions?: unknown[];
  // ---- Time + timezone ----
  timezones?: { primary: string; secondary?: string };
}

export interface ProjectFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  color?: string;
  icon?: string;
  pinned?: boolean;
  archived?: boolean;
  defaultAgentId?: string;
  files?: ProjectFile[];
  agentInstructions?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

// ─── R8: Reports ──────────────────────────────────────────────────
export type ReportSchedule =
  | { type: 'daily';   hour: number; minute: number; timezone: string }
  | { type: 'weekly';  dayOfWeek: number; hour: number; minute: number; timezone: string }  // 0=Sun..6=Sat
  | { type: 'monthly'; dayOfMonth: number; hour: number; minute: number; timezone: string }
  | { type: 'once';    at: string }  // ISO datetime, fires once
  | { type: 'manual' };              // no auto-fire, user sends on demand

export interface ReportDefinition {
  id: string;
  name: string;
  prompt: string;            // Instructions the signing agent uses to write the report
  signedBy: string;          // agentId (e.g. 'architect', 'doctor', 'manager')
  schedule: ReportSchedule;
  recipients: string[];      // email addresses
  /** R15-#16 — output language. Default Arabic; set to 'en' for
   *  supervisor/partner reports. Also controls the HTML shell `dir`
   *  attribute and greeting. */
  language?: 'ar' | 'en';
  /** R15-#18 — access control. `owner` (default) = only the account
   *  owner can see/edit. `shared` = listed emails in `sharedWith`
   *  can read (and only read; edit stays with owner). Ruhool is
   *  local-first and has no login layer yet, so this is structurally
   *  in place for when auth gets wired — today it's advisory. */
  visibility?: 'owner' | 'shared';
  sharedWith?: string[];
  /** R15-#25 — display order in the settings list. Lower = higher
   *  up. When missing, we sort by createdAt so legacy reports still
   *  have a deterministic position. */
  order?: number;
  enabled: boolean;
  lastSentAt?: string | null;
  lastError?: string | null;
  lastRunId?: string | null;
  nextRunAt?: string | null; // ISO — computed by scheduler, read-only for clients
  includeContext?: {
    tasks?: boolean;         // completed/open task stats
    dispatches?: boolean;    // recent dispatch activity
    changelog?: boolean;     // recent CHANGELOG diff
    agentQuotes?: boolean;   // quotes from agents today
    zotero?: boolean;        // R12b: new papers this week
    vault?: boolean;         // R12b: Obsidian notes activity
    meetings?: boolean;      // R12b: meetings + phdSchedule
    budget?: boolean;        // R12b: LLM spend vs monthly cap
  };
  /**
   * Optional multi-agent composition. When present, each section is
   * written by its own signer — the top-level `signedBy` then acts as
   * the EDITOR: they receive the raw sections and produce a final
   * bundled report. When absent, `signedBy` + `prompt` produce the
   * whole report directly (the original single-agent flow).
   */
  sections?: Array<{
    signedBy: string;
    title: string;            // e.g. "ملاحظات الراعي"
    prompt: string;
  }>;
  /**
   * User feedback accumulated over time — what to avoid, what to add,
   * tone preferences, etc. Injected into the compose context every
   * time the report runs so the agent applies corrections.
   */
  feedback?: Array<ReportFeedbackEntry>;
  createdAt: string;
  updatedAt: string;
}

export interface ReportFeedbackEntry {
  id: string;
  text: string;
  source: 'chat' | 'settings' | 'auto';  // where it was recorded
  addedBy?: string;                       // 'user' or agentId
  createdAt: string;
  active: boolean;                        // soft-disable instead of delete
}

/** R16 — in-platform inbox entry. Mirror of a sent (or would-be-sent)
 *  report, stored so it's readable inside Ruhool without needing a real
 *  email provider. */
export interface ReportInboxItem {
  id: string;
  /** Source report, or null for ad-hoc messages (onboarding welcome, etc.) */
  reportId: string | null;
  /** Associated run record (when the item came from a scheduled send). */
  runId?: string | null;
  subject: string;
  html: string;
  bodyMarkdown?: string;
  /** agentId of the sender (e.g. 'manager', 'architect') or 'system'. */
  from: string;
  sentAt: string;
  read: boolean;
  starred?: boolean;
  /** Optional free-form tags for filtering ('onboarding', 'daily', ...). */
  tags?: string[];
  /** J-15: soft delete / archive */
  archivedAt?: string;
  deletedAt?: string;
}

export interface ReportRunRecord {
  id: string;
  reportId: string;
  triggeredBy: 'schedule' | 'manual' | 'chat';
  status: 'pending' | 'composing' | 'sending' | 'sent' | 'failed';
  error?: string | null;
  subject?: string;
  /** First ~800 chars of the rendered markdown body. Used by
   *  compose memory (avoid repetition) + preview. */
  bodySnippet?: string;
  /** R15-#17 — full HTML body of the sent email, retained so a
   *  run can be re-mailed without re-running the LLM. Present
   *  only for `status === 'sent'` runs. */
  html?: string;
  htmlBytes?: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  startedAt: string;
  finishedAt?: string | null;
  recipients: string[];
}
