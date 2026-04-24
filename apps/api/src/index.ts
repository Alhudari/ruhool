import { runAgentLoop } from './agent-runner';
import {
  createTrigger, setHierarchyNode,
  scanForAlerts, resolveAlert,
  type Phase2StoreLike,
} from './phase2';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

import { renderVideo, listRenders, archiveRender, deleteRender } from './render';
import { setupDatabase } from './db-setup';
import { Queue, Worker } from 'bullmq';
import {
  DATA_DIR, STORE_FILE, PAPERS_DIR, NOTES_DIR, BACKUPS_DIR,
  ensurePapersDir, ensureNotesDir, ensureBackupsDir,
} from './config/paths.js';
import { createApp } from './server/app.js';
import { registerAllRoutes } from './routes/index.js';
import { ensureProjectsArrayOn } from './routes/projects.js';
import { scanAndLoadModules } from './modules/loader.js';
import { logger as bootLogger } from './server/logging.js';
import {
  MANAGER_SYSTEM_PROMPT, READING_HELPER_SYSTEM_PROMPT, RESEARCH_SYSTEM_PROMPT,
  WRITING_CRITIC_SYSTEM_PROMPT, CONTENT_CREATOR_SYSTEM_PROMPT,
} from './prompts/index.js';

const REDIS_CONNECTION = { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379', 10) };

import type { ScheduleRecord, StoreData, NoteRecord } from './store/types.js';
import { getStore, saveStore as _saveStore } from './store/index.js';
import { applyStoreDefaults, EXPERIMENTS_CATEGORY_ID } from './store/defaults.js';
import { taskStore, updateTask } from './state/tasks-store.js';
import { createRenderQueueState } from './state/render-queue.js';
function saveStore(): void { void _saveStore(); }
let researchQueue: Queue | null = null;
let researchWorker: Worker | null = null;
void researchWorker;
export const serviceHealth = { redis: false, bullmq: false, postgres: false };

function initResearchQueue() {
  try {
    researchQueue = new Queue('research', { connection: REDIS_CONNECTION });
    serviceHealth.redis = true; serviceHealth.bullmq = true;
    bootLogger.info('  BullMQ research queue connected to Redis');
  } catch (err) {
    serviceHealth.redis = false; serviceHealth.bullmq = false;
    bootLogger.error({ err: err instanceof Error ? err.message : err }, '[bullmq] ERROR: queue init failed — research jobs will not be processed');
  }
}

import { createLogActivity, AGENT_DISPLAY_NAMES } from './services/activity.js';
import { broadcastNotification } from './state/notifications.js';
import { createNotificationService } from './services/notifications.js';
import { generateSummary, splitIntoSections } from './services/chat/summary.js';
import { createNotifyActions } from './services/chat/notify-actions.js';
import {
  AnthropicProvider, OpenAIProvider, GeminiProvider,
  pickProviderForModel as _pickProviderForModel, type UnifiedProvider,
} from './services/llm/index.js';
import { BUILTIN_SYSTEM_PROMPTS } from './state/builtin-prompts.js';
import { AGENT_HEADERS } from './state/agent-display.js';
import { createArchitectActions } from './services/chat/architect-actions.js';
import { parseTaskActions, createTaskActions, type TaskAction } from './services/chat/task-actions.js';
import { BUILTIN_AGENTS } from './state/builtin-agents.js';
import { BUILT_IN_PROMPT_LIBRARY } from './data/prompt-library.js';
import { BUILTIN_AGENT_PERMISSIONS } from './data/builtin-permissions.js';
import { PRICING } from './state/pricing.js';
import { estimateAudioPlanCost, createRenderAudioService } from './services/render-audio.js';
import { COST_DEMO_MAP_COST, STUDIO_DEMOS, DEMO_REQUIREMENTS, DEMO_MAP_COST } from './data/studio-demos.js';
import { CAPABILITY_CHECKERS } from './services/capability-checkers.js';
import { buildSubscriptionSnapshot as buildAnalystSnapshot } from './routes/analyst.js';
import { makeEnsureSubscriptionDefaults } from './routes/subscriptions.js';
import { createSubscriptionsEngine } from './services/subscriptions-engine.js';
import { startSubscriptionChecker, startScheduleChecker as startScheduleCheckerWorker, startWatcher as startWatcherWorker } from './workers/scheduler.js';
import { startResearchWorker as startResearchBullMQWorker } from './workers/bullmq.js';
import { createAudioService, FALLBACK_ELEVENLABS_VOICE } from './services/audio.js';
import { createChatHelpers } from './services/chat-helpers.js';
import { createResearchService } from './routes/research.js';
import { computeNextRun } from './routes/schedules.js';
import { createScheduleRunner } from './services/schedule-runner.js';
import { parseLibraryId } from './routes/library.js';
import { createAutomatedNotifications } from './services/automated-notifications.js';
import { startServer } from './server/boot.js';

void AGENT_HEADERS; void OpenAIProvider; void GeminiProvider; void BUILTIN_AGENTS; void parseTaskActions; void PRICING; void computeNextRun;

const logActivity = createLogActivity({ getStore: () => store, saveStore });

const app = createApp();
const store: StoreData = getStore();
applyStoreDefaults(store, { saveStore, builtinSystemPrompts: BUILTIN_SYSTEM_PROMPTS });

function saveNoteFile(note: NoteRecord) {
  ensureNotesDir();
  const fm = ['---', `id: ${note.id}`, `paperId: ${note.paperId}`, `section: "${note.section}"`,
    `type: ${note.type}`, `themes: [${note.themes.map(t => '"' + t + '"').join(', ')}]`,
    `createdAt: ${note.createdAt}`, '---'].join('\n');
  fs.writeFileSync(path.join(NOTES_DIR, note.id + '.md'), fm + '\n\n' + note.content + '\n', 'utf-8');
}
function deleteNoteFile(noteId: string) {
  const fp = path.join(NOTES_DIR, noteId + '.md');
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
}

let registeredProvider: AnthropicProvider | null = null;
const _anthropicCache = {
  get current() { return registeredProvider; },
  set current(v: AnthropicProvider | null) { registeredProvider = v; },
};
function pickProviderForModel(model: string): UnifiedProvider | null {
  return _pickProviderForModel(model, { store, anthropicCache: _anthropicCache });
}

const savedAnthropic = store.providers.find(p => p.type === 'anthropic' && p.enabled && p.apiKey);
if (savedAnthropic?.apiKey) {
  registeredProvider = new AnthropicProvider(savedAnthropic.apiKey, savedAnthropic.baseUrl || undefined);
  bootLogger.info('  Restored Anthropic provider from saved data');
}

const notificationService = createNotificationService({
  getStore: () => store, saveStore, broadcastNotification, logActivity: logActivity as unknown as (...args: unknown[]) => unknown,
});
const { createNotification, getAgentNotificationSettings } = notificationService;
const parseNotifyActions = createNotifyActions({ createNotification });

let _architectActions: ReturnType<typeof createArchitectActions> | null = null;
function _getArchitectActions() {
  if (!_architectActions) _architectActions = createArchitectActions({ getStore: () => store, saveStore, logActivity });
  return _architectActions;
}
function parseArchitectActions(response: string, agentId: string) { return _getArchitectActions().parse(response, agentId); }
const _taskActions = createTaskActions({ getStore: () => store, saveStore, logActivity });
function executeTaskActions(actions: TaskAction[]) { return _taskActions.execute(actions); }
function executeApproval(approval: import('./store/types.js').ApprovalRecord) { return _getArchitectActions().execute(approval); }

function getApiKey(field: string): string | undefined {
  return (((store as unknown as { apiKeys?: Record<string, string> }).apiKeys) || {})[field];
}

const STATEMENTS_DIR = path.resolve(import.meta.dirname || '.', '../../../data/statements');
const SUB_FILES_DIR = path.resolve(import.meta.dirname || '.', '../../../data/subscription-files');
const ensureSubscriptionDefaults = makeEnsureSubscriptionDefaults({ getStore: () => store, saveStore });

const { checkSubscriptionRules } = createSubscriptionsEngine({
  getStore: () => store, saveStore, capabilityCheckers: CAPABILITY_CHECKERS, createNotification,
});
startSubscriptionChecker({ checkSubscriptionRules });
setTimeout(() => { checkSubscriptionRules().catch(() => {}); }, 10_000);

const audioService = createAudioService({
  getApiKey,
  getDefaultVoiceId: () => {
    const prefs = (store as unknown as { voicePreferences?: { elevenlabsVoiceId?: string } }).voicePreferences;
    return prefs?.elevenlabsVoiceId || FALLBACK_ELEVENLABS_VOICE;
  },
});
const { elevenlabsTTS, elevenlabsSFX, stableAudioMusic } = audioService;

const DATA_ROOT = path.resolve(import.meta.dirname || '.', '../../../data');
const AUDIO_DIR = path.join(DATA_ROOT, 'audio');
const CAPTIONS_DIR = path.join(DATA_ROOT, 'captions');
const UPLOADS_DIR = path.join(DATA_ROOT, 'uploads');
const VIDEOS_DIR = path.join(DATA_ROOT, 'videos');
const IMAGES_DIR = path.join(DATA_ROOT, 'images');
const DEMOS_DIR = path.resolve(import.meta.dirname || '.', '../../studio/src/compositions/demos');
const STUDIO_ASSETS_DIR = path.join(DATA_DIR, 'studio-assets');
const RESEARCH_DIR = path.join(DATA_DIR, 'research');
const TRASH_META = path.join(DATA_ROOT, '_trash.json');
for (const d of [AUDIO_DIR, CAPTIONS_DIR, UPLOADS_DIR, VIDEOS_DIR, IMAGES_DIR]) fs.mkdirSync(d, { recursive: true });
function ensureStudioAssetsDir() { if (!fs.existsSync(STUDIO_ASSETS_DIR)) fs.mkdirSync(STUDIO_ASSETS_DIR, { recursive: true }); }

const renderAudioService = createRenderAudioService({
  audioDir: AUDIO_DIR, videosDir: VIDEOS_DIR,
  elevenlabsTTS, elevenlabsSFX, stableAudioMusic, estimateAudioPlanCost, logger: bootLogger,
});
const { attachCostToRender, muxAudioOntoVideo } = renderAudioService;
const renderQueueState = createRenderQueueState({ logger: bootLogger });

const chatHelpers = createChatHelpers({
  getStore: () => store, saveStore, anthropicCache: _anthropicCache, logger: bootLogger,
});
const { extractGraphFromMessage, autoTitleIfNeeded, autoSummarizeIfNeeded } = chatHelpers;

const researchService = createResearchService({
  getStore: () => store, taskStore, updateTask,
  getProvider: () => {
    if (!registeredProvider) {
      const row = store.providers.find((p) => p.type === 'anthropic' && p.enabled && p.apiKey);
      if (!row?.apiKey) return null;
      registeredProvider = new AnthropicProvider(row.apiKey, row.baseUrl || undefined);
    }
    return registeredProvider as unknown as import('./routes/research.js').AnthropicLike;
  },
  getResearchQueue: () => researchQueue,
  logActivity, logger: { info: (m) => bootLogger.info(m), error: (o, m) => bootLogger.error(o, m) },
  researchDir: RESEARCH_DIR,
});
const runResearch = researchService.runResearch;
researchService.register(app);

const _chatSubscriptionSnapshot = buildAnalystSnapshot({
  getStore: () => store, capabilityCheckers: CAPABILITY_CHECKERS, listRenders, statementsDir: STATEMENTS_DIR,
});

const { runSchedule } = createScheduleRunner({
  getStore: () => store, saveStore,
  getProvider: () => registeredProvider as unknown as {
    chat: (params: { model: string; systemPrompt?: string; messages: Array<{ role: string; content: string }>; maxTokens?: number }) => AsyncIterable<{ type: string; content?: string }>;
  } | null,
  systemPrompts: {
    manager: MANAGER_SYSTEM_PROMPT, research: RESEARCH_SYSTEM_PROMPT,
    readingHelper: READING_HELPER_SYSTEM_PROMPT, writingCritic: WRITING_CRITIC_SYSTEM_PROMPT,
    contentCreator: CONTENT_CREATOR_SYSTEM_PROMPT,
  },
  logActivity: logActivity as unknown as (...args: unknown[]) => unknown,
});

const ensureProjectsArray = () => ensureProjectsArrayOn(store);

const { sendAutomatedNotifications } = createAutomatedNotifications({
  getStore: () => store, saveStore, createNotification,
});

function startScheduleChecker() {
  startScheduleCheckerWorker({
    getSchedules: () => (store.schedules || []) as Array<{ enabled: boolean; nextRunAt?: string }>,
    runSchedule: (s) => runSchedule(s as ScheduleRecord),
    sendAutomatedNotifications,
    logger: bootLogger,
  });
}

// ─── Phase 2: workflow DAG orchestrator wiring ───
import { createWorkflowOrchestrator } from './services/workflow/orchestrator.js';
import { createRunChannelRegistry } from './routes/workflow-runs.js';
import { initWorkflowQueue, startWorkflowWorker } from './workers/workflow-worker.js';
import { dispatch as specialistsDispatchImpl, getSpecialistDisplayName, getSpecialistIdentity } from './services/agents/specialists.js';
import * as conversationsRepo from './store/repositories/conversations.repo.js';
import { broadcastToConversation } from './state/conversation-channels.js';
import { createImageService } from './services/generation/images.js';
import { createGenerationAudioService } from './services/generation/audio.js';
import { createVideoService } from './services/generation/video.js';

// ─── Phase 5: generation services ───
const imageService = createImageService({
  getApiKey,
  logger: { info: (o, m) => bootLogger.info(o, m), warn: (o, m) => bootLogger.warn(o, m), error: (o, m) => bootLogger.error(o, m) },
  dataDir: DATA_ROOT,
});
const audioGenerationService = createGenerationAudioService({
  audioService,
  logger: { info: (o, m) => bootLogger.info(o, m), warn: (o, m) => bootLogger.warn(o, m), error: (o, m) => bootLogger.error(o, m) },
  dataDir: DATA_ROOT,
});
const videoService = createVideoService({
  imageService,
  audioGenerationService,
  logger: { info: (o, m) => bootLogger.info(o, m), warn: (o, m) => bootLogger.warn(o, m), error: (o, m) => bootLogger.error(o, m) },
  dataDir: DATA_ROOT,
  remotionStudioUrl: process.env.REMOTION_STUDIO_URL,
});
void imageService; void audioGenerationService; void videoService;

const workflowRunChannels = createRunChannelRegistry();
let workflowQueue: ReturnType<typeof initWorkflowQueue> = null;
let workflowWorker: ReturnType<typeof startWorkflowWorker> = null;

const workflowOrchestrator = createWorkflowOrchestrator({
  getStore: () => store,
  logger: bootLogger,
  specialistsDispatch: async (params) => {
    // Build a provider at call-time using the planner model default.
    const model = 'claude-sonnet-4-5';
    const provider = pickProviderForModel(model);
    if (!provider) throw new Error('no provider available for specialist dispatch');
    return specialistsDispatchImpl({
      specialist: params.specialist,
      task: params.task,
      context: params.context,
      priorMessages: params.priorMessages,
      roundNumber: params.roundNumber,
      deps: {
        provider,
        model,
        logger: { info: (o, m) => bootLogger.info(o, m) },
        logActivity: ({ from, to, task }) => {
          logActivity('chat', `${from} → ${to}`, task.slice(0, 200), {
            agentId: to, metadata: { from, to, task: task.slice(0, 500), via: 'workflow' },
          });
        },
        from: 'workflow',
        generationTools: {
          imageService,
          audioGenerationService,
          videoService,
        },
      },
    });
  },
  plannerProvider: {
    chat: (p) => {
      const provider = pickProviderForModel(p.model);
      if (!provider) throw new Error('no provider available for planner');
      return provider.chat(p);
    },
  },
  plannerModel: 'claude-sonnet-4-5',
  getRunChannel: workflowRunChannels.getRunChannel,
  logActivity: logActivity as unknown as (type: string, action: string, details: string, opts?: { agentId?: string; metadata?: Record<string, unknown> }) => void,
  getQueue: () => workflowQueue,
  // CHAT_V2 P2 — workflow ↔ conversation bridge. Each workflow step writes a
  // live message row into the originating conversation so the user watches
  // the DAG unfold in-chat (WhatsApp-group feel).
  conversationPoster: async (msg) => {
    try {
      const conv = store.conversations.find((c) => c.id === msg.conversationId);
      if (!conv) return;
      const messageId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const artifactsMapped = msg.artifacts?.map((a) => ({ type: a.type, url: a.url, meta: a.meta }));
      await conversationsRepo.appendMessage(store as unknown as conversationsRepo.JsonConvStoreLike, {
        id: messageId,
        conversationId: msg.conversationId,
        role: 'assistant',
        content: msg.content,
        agentId: msg.agentId,
        kind: msg.kind,
        workflowStepId: msg.workflowStepId ?? null,
        artifacts: artifactsMapped,
        createdAt,
      });
      if (!conv.participants) conv.participants = ['manager'];
      if (!conv.participants.includes(msg.agentId)) conv.participants.push(msg.agentId);
      if (!conv.participantAgentIds) conv.participantAgentIds = [...conv.participants];
      if (!conv.participantAgentIds.includes(msg.agentId)) conv.participantAgentIds.push(msg.agentId);
      conv.updatedAt = createdAt;
      saveStore();

      // Broadcast the message.start + message.done pair on the per-conversation
      // SSE channel so any mounted chat view (Wave D) sees the bubble live.
      const identity = getSpecialistIdentity(msg.agentId);
      broadcastToConversation(msg.conversationId, {
        event: 'message.start',
        data: {
          messageId,
          agentId: msg.agentId,
          agentDisplay: { ar: identity.arabic, en: identity.transliteration },
          kind: msg.kind,
          createdAt,
          workflowStepId: msg.workflowStepId,
        },
      });
      broadcastToConversation(msg.conversationId, {
        event: 'message.done',
        data: {
          messageId,
          usage: null,
          artifacts: artifactsMapped ?? [],
        },
      });

      logActivity('system', 'workflow-progress', `${getSpecialistDisplayName(msg.agentId)}: ${msg.content.slice(0, 120)}`, {
        agentId: msg.agentId,
        metadata: {
          conversationId: msg.conversationId,
          workflowRunId: msg.workflowRunId,
          workflowStepId: msg.workflowStepId,
          kind: msg.kind,
        },
      });
    } catch (err) {
      bootLogger.warn({ err }, 'conversationPoster failed');
    }
  },
});

registerAllRoutes(app, {
  serviceHealth, getStore: () => store, saveStore, logger: bootLogger,
  createNotification, getAgentNotificationSettings,
  saveNoteFile, deleteNoteFile, logActivity,
  anthropicCache: _anthropicCache, builtinSystemPrompts: BUILTIN_SYSTEM_PROMPTS,
  builtInLibrary: BUILT_IN_PROMPT_LIBRARY,
  papersDir: PAPERS_DIR, ensurePapersDir, splitIntoSections,
  taskStore, runsLogger: { error: (msg: string, err?: unknown) => bootLogger.error({ err }, msg) },
  createTrigger, runAgentLoop, logError: (msg: string, err: unknown) => bootLogger.error({ err }, msg),
  setHierarchyNode, scanForAlerts, resolveAlert,
  backupsDir: BACKUPS_DIR,
  legacyRestoreDir: path.resolve(import.meta.dirname || '.', '../../../backups'),
  ensureBackupsDir, agentDisplayNames: AGENT_DISPLAY_NAMES,
  dataDir: DATA_DIR,
  notifyLogger: { info: (m: string) => bootLogger.info(m) },
  estimateAudioPlanCost, costDemoMapCost: COST_DEMO_MAP_COST,
  capabilityCheckers: CAPABILITY_CHECKERS, getApiKey,
  listRenders, statementsDir: STATEMENTS_DIR,
  subFilesDir: SUB_FILES_DIR, ensureSubscriptionDefaults,
  audioService, captionsDir: CAPTIONS_DIR, uploadsDir: UPLOADS_DIR, captionVideosDir: VIDEOS_DIR,
  imagesDir: IMAGES_DIR, videosDirLib: VIDEOS_DIR, renderQueueState,
  executeApproval,
  chatDeps: {
    getStore: () => store, saveStore, logger: bootLogger, anthropicCache: _anthropicCache,
    pickProviderForModel, builtinSystemPrompts: BUILTIN_SYSTEM_PROMPTS,
    managerSystemPrompt: MANAGER_SYSTEM_PROMPT, agentHeaders: AGENT_HEADERS,
    agentDisplayNames: AGENT_DISPLAY_NAMES, capabilityCheckers: CAPABILITY_CHECKERS,
    parseArchitectActions, parseTaskActions, executeTaskActions, parseNotifyActions,
    autoTitleIfNeeded, autoSummarizeIfNeeded, extractGraphFromMessage,
    buildSubscriptionSnapshot: _chatSubscriptionSnapshot, runResearch,
    getResearchQueue: () => researchQueue as unknown as { add: (name: string, data: unknown, opts: unknown) => unknown } | null,
    taskStore, logActivity,
    workflowOrchestrator,
    dataDir: DATA_ROOT,
  },
  runSchedule,
  builtinAgentPermissions: BUILTIN_AGENT_PERMISSIONS,
  demosDir: DEMOS_DIR, videosDirDemo: VIDEOS_DIR, studioDemos: STUDIO_DEMOS,
  demoRequirements: DEMO_REQUIREMENTS, demoMapCost: DEMO_MAP_COST,
  renderVideo, muxAudioOntoVideo, attachCostToRender,
  ensureProjectsArray, generateSummary,
  studioAssetsDir: STUDIO_ASSETS_DIR, ensureStudioAssetsDir,
  experimentsCategoryId: EXPERIMENTS_CATEGORY_ID, archiveRender, trashMetaPath: TRASH_META,
  parseLibraryId, deleteRender,
  workflowOrchestrator,
  workflowGetRunChannel: workflowRunChannels.getRunChannel,
});

// Initialize BullMQ queue + worker for workflow-step (Phase 2).
try {
  workflowQueue = initWorkflowQueue({
    connection: REDIS_CONNECTION,
    logger: {
      info: (m) => bootLogger.info(m),
      warn: (o, m) => bootLogger.warn(o, m || ''),
      error: (o, m) => bootLogger.error(o, m),
    },
  });
  if (workflowQueue) {
    workflowWorker = startWorkflowWorker({
      connection: REDIS_CONNECTION,
      executeStep: (stepId: string) => workflowOrchestrator.executeStep(stepId),
      logger: {
        info: (m) => bootLogger.info(m),
        warn: (o, m) => bootLogger.warn(o, m || ''),
        error: (o, m) => bootLogger.error(o, m),
      },
    });
  }
} catch (err) {
  bootLogger.warn({ err: err instanceof Error ? err.message : err }, 'workflow queue init failed — in-process fallback');
}
void workflowWorker;

// ─── Phase 3: Temporal DAG activities + boot-time reconciliation ───
import { createWorkflowActivities } from './workflows/activities/workflow-activities.js';
import * as workflowRunsRepoP3 from './store/repositories/workflow-runs.repo.js';
import * as workflowStepsRepoP3 from './store/repositories/workflow-steps.repo.js';

const dagActivities = createWorkflowActivities({
  getStore: () => store,
  orchestrator: workflowOrchestrator,
  getRunChannel: workflowRunChannels.getRunChannel,
  logger: bootLogger,
});

async function reconcileRunningRuns(): Promise<number> {
  const running = await workflowRunsRepoP3.listRuns(store, { status: 'running' });
  let n = 0;
  const STALE_MS = 5 * 60 * 1000;
  for (const run of running) {
    const started = run.startedAt ? new Date(run.startedAt).getTime() : 0;
    const age = Date.now() - started;
    const md = (run.metadata ?? {}) as { mode?: string; temporalWorkflowId?: string };
    if (md.mode === 'temporal' && process.env.TEMPORAL_ADDRESS) {
      // Temporal is authoritative; let it resume.
      continue;
    }
    if (age < STALE_MS) continue;
    const steps = await workflowStepsRepoP3.listStepsForRun(store, run.id);
    const lastRunning = steps.find((s) => s.status === 'running');
    // No step-level metadata yet; treat all as non-idempotent by default.
    const idempotent = false;
    if (idempotent && lastRunning) {
      await workflowStepsRepoP3.updateStep(store, lastRunning.id, { status: 'pending' });
      try {
        await workflowOrchestrator.startRun(run.id);
      } catch {
        /* ignore */
      }
    } else {
      await workflowRunsRepoP3.updateRun(store, run.id, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        error: 'server_restart_lost_state',
      });
    }
    n += 1;
  }
  return n;
}

const PORT = parseInt(process.env.APP_PORT || '3001', 10);

startServer({
  logger: bootLogger, setupDatabase, serviceHealth, scanAndLoadModules,
  initResearchQueue,
  startResearchBullMQWorker: (opts) => {
    researchWorker = startResearchBullMQWorker(opts);
    return researchWorker;
  },
  redisConnection: REDIS_CONNECTION, runResearch,
  startScheduleChecker, startWatcherWorker,
  watcherScan: () => scanForAlerts(store as unknown as Phase2StoreLike).length,
  onWatcherChange: () => saveStore(),
  storeFile: STORE_FILE, providersCount: () => store.providers.length,
  onServerStart: (port) => {
    (store as unknown as { __apiPort?: number }).__apiPort = port;
    logActivity('system', 'API server started', `Port: ${port}, Providers: ${store.providers.length}`, { metadata: { port } });
  },
  port: PORT, app,
  dagActivities,
  reconcileRunningRuns,
}).catch(err => { bootLogger.error({ err }, 'boot failed'); process.exit(1); });
