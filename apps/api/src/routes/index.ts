// Routes barrel — registers every `register*Routes` call against a superset deps bag.
// Each registrar destructures what it needs; TypeScript structural typing allows the superset.
// Created in REL-01 stage 2d final trim to pull the ~50-line route block out of index.ts.

import type { Hono } from 'hono';

import { registerHealthRoutes } from './health.js';
import { registerModulesRoutes } from './modules.js';
import { registerWorkflowsRoutes } from './workflows.js';
import { registerActivityRoutes } from './activity.js';
import { registerNotesRoutes } from './notes.js';
import { registerTasksRoutes } from './tasks.js';
import { registerKeepNotesRoutes } from './keep-notes.js';
import { registerUsageRoutes } from './usage.js';
import { registerNotificationRoutes } from './notifications.js';
import { registerProviderRoutes } from './providers.js';
import { registerPromptRoutes } from './prompts.js';
import { registerConversationRoutes } from './conversations.js';
import { registerAgentRoutes } from './agents.js';
import { registerAgentOSRoutes } from './agent-os.js';
import { registerArtifactRoutes } from './artifacts.js';
import { registerPapersRoutes } from './papers.js';
import { registerTriggersRoutes } from './triggers.js';
import { registerHierarchyRoutes } from './hierarchy.js';
import { registerGitRoutes } from './git.js';
import { registerClippyRoutes } from './clippy.js';
import { registerAwardsRoutes } from './awards.js';
import { registerTimeRoutes } from './time.js';
import { registerPrivacyRoutes } from './privacy.js';
import { registerMemoriesRoutes } from './memories.js';
import { registerToolsRoutes } from './tools.js';
import { registerMatrixRoutes } from './matrix.js';
import { registerBackupsRoutes } from './backups.js';
import { registerWatcherRoutes } from './watcher.js';
import { registerApprovalsRoutes } from './approvals.js';
import { registerSchedulesRoutes } from './schedules.js';
import { registerPermissionsRoutes } from './permissions.js';
import { registerProjectsRoutes } from './projects.js';
import { registerSettingsRoutes, registerApiKeysSettingsRoutes, registerNotificationsSettingsRoutes } from './settings.js';
import { registerLibraryRoutes, registerLibraryListRoutes } from './library.js';
import { registerStudioRoutes } from './studio.js';
import { registerImagesRoutes } from './images.js';
import { registerChatRoutes } from './chat.js';
import { registerMapsRoutes } from './maps.js';
import { registerRunsRoutes } from './runs.js';
import { registerNotifyRoutes } from './notify.js';
import { registerCostRoutes } from './cost.js';
import { registerAnalystRoutes } from './analyst.js';
import { registerSubscriptionsRoutes } from './subscriptions.js';
import { registerVoiceRoutes } from './voice.js';
import { registerCaptionsRoutes } from './captions.js';
import { registerLibraryRerenderRoutes } from './library-rerender.js';
import { registerStudioDemosRoutes } from './studio-demos.js';
import { registerConversationsExtendedRoutes } from './conversations-extended.js';
import { registerExportRoutes } from './export.js';
import { registerRenderRoutes } from './render.js';
import { registerTrashRoutes } from './trash.js';
import { registerWorkflowRunsRoutes, type WorkflowRunsRoutesDeps } from './workflow-runs.js';
import { registerGeneratedFilesRoutes } from './generated-files.js';
import { registerDispatchRoutes } from './dispatch.js';
import { registerAgentCardsRoutes } from './agent-cards.js';
import { registerZoteroRoutes } from './zotero.js';
import { registerReadingRoutes } from './reading.js';
import { registerShwashaRoutes } from './shwasha.js';
import { registerMeetingsRoutes } from './meetings.js';
import { registerVaultTasksRoutes } from './vault-tasks.js';
import { registerCompanionRoutes } from './companion.js';
import { registerPhdScheduleRoutes } from './phd-schedule.js';
import { registerPhdArchiveRoutes } from './phd-archive.js';
import { registerDeleteApprovalRoutes } from './delete-approvals.js';
import { registerPhdExportRoutes } from './phd-export.js';
import { registerPhdOfficeRoutes } from './phd-office.js';
import { registerSourcesRoutes } from './sources.js';
import { registerVaultInitRoutes } from './vault-init.js';
import { registerInboxRoutes } from './inbox.js';
import { registerSearchRoutes } from './search.js';
import { registerCanvasRoutes } from './canvas.js';
import { registerSystemResetRoutes } from './system-reset.js';
import { registerAuditLogRoutes } from './audit-log.js';
import { registerGoogleTasksRoutes } from './google-tasks.js';
import { registerReportsRoutes } from './reports.js';
import { registerReportsInboxRoutes } from './reports-inbox.js';
import { registerFreshStartRoutes } from './fresh-start.js';
import { registerAutoBackupRoutes } from './backup-scheduler.js';
import { registerVaultTrashRoutes } from './vault-trash.js';
import { registerPhdFeaturesRoutes } from './phd-features.js';
import { registerGrs2Routes } from './grs2.js';
import { registerLinksRoutes } from './links.js';
import { registerTagsRoutes } from './tags.js';
import { registerResearchFilesRoutes } from './research-files.js';
import { registerResearchClustersRoutes } from './research-clusters.js';
import { registerGraphRoutes } from './graph.js';
import { registerScopePointsRoutes } from './scope-points.js';
import { registerMilestonesRoutes } from './milestones.js';
import { registerNotificationRulesRoutes, seedBuiltInRules } from './notification-rules.js';
import { registerLibraryEntitiesRoutes } from './library-entities.js';
import { registerPlatformTrashRoutes } from './platform-trash.js';
import { registerAgentTasksRoutes } from './agent-tasks.js';
import { registerAgentPipelinesRoutes } from './agent-pipelines.js';
import { registerObservabilityRoutes } from './observability.js';
import { registerLibraryMatrixRoutes } from './library-matrix.js';
import { registerLibraryCollectionsRoutes } from './library-collections.js';
import { registerLibraryAgentChatRoutes } from './library-agent-chat.js';

// Accept a wide superset deps bag; each registrar picks what it needs.
// Using `unknown` + cast inside to avoid re-declaring every registrar's typed Deps here.
export function registerAllRoutes(app: Hono, deps: Record<string, unknown>): void {
  const d = deps as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  // D-7 / Wave 2: graceful degrade for local-only routes when running on
  // Vercel. The vault path and Zotero local API are filesystem/localhost
  // dependencies — on serverless they'd throw ENOENT/ECONNREFUSED. This
  // middleware catches them up-front with a clean 503 + descriptive payload
  // so the UI can show "feature unavailable in cloud" instead of crashing.
  // Lifted off when Wave 1.5 ships Git-backed vault + Zotero Web API.
  if (process.env.VERCEL) {
    // Single regex covers both the trailing-slash and bare-path forms (e.g.
    // `/api/vault` vs `/api/vault/literature`) so the middleware can't be
    // bypassed by a missing slash.
    const LOCAL_ONLY_RE = /^\/api\/(vault|vault-init|research-files|zotero\/local|phd-export)(\/|$)/;
    app.use('*', async (c, next) => {
      const path = new URL(c.req.url).pathname;
      if (LOCAL_ONLY_RE.test(path)) {
        return c.json({
          error: 'This feature requires the local desktop runtime (Obsidian vault / Zotero local API). Cloud deploy supports chat, library matrix, and the agent — vault sync ships in Phase 1.5.',
          path,
          unavailableInCloud: true,
        }, 503);
      }
      await next();
    });
  }

  // Phase F — surface `/api/al-mulakhkhis/*` as the canonical reading-helper
  // namespace. Hono routes the path ONCE before middleware fires, so simply
  // mutating `c.req.raw` in a middleware doesn't re-route. Instead we register
  // a catch-all under the new prefix that explicitly re-dispatches the rewritten
  // request through `app.fetch()` — this hits the legacy `/api/shwasha/*`
  // handlers via a fresh routing pass.
  app.all('/api/al-mulakhkhis/*', async (c) => {
    const url = new URL(c.req.url);
    url.pathname = url.pathname.replace(/^\/api\/al-mulakhkhis(\/|$)/, '/api/shwasha$1');
    const rewritten = new Request(url.toString(), c.req.raw);
    return app.fetch(rewritten, c.env);
  });

  registerHealthRoutes(app, { serviceHealth: d.serviceHealth });
  registerModulesRoutes(app);
  registerWorkflowsRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerActivityRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerUsageRoutes(app, { getStore: d.getStore });
  registerNotificationRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, createNotification: d.createNotification, getAgentNotificationSettings: d.getAgentNotificationSettings });
  registerNotesRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, saveNoteFile: d.saveNoteFile, deleteNoteFile: d.deleteNoteFile });
  registerTasksRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, logActivity: d.logActivity });
  registerKeepNotesRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerProviderRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, anthropicCache: d.anthropicCache });
  registerPromptRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, builtinSystemPrompts: d.builtinSystemPrompts, builtInLibrary: d.builtInLibrary });
  registerConversationRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerAgentRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, logActivity: d.logActivity, builtinSystemPrompts: d.builtinSystemPrompts, dataRoot: d.dataRoot ?? d.dataDir });
  registerAgentOSRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerArtifactRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerPapersRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, papersDir: d.papersDir, ensurePapersDir: d.ensurePapersDir, splitIntoSections: d.splitIntoSections, deleteNoteFile: d.deleteNoteFile, logActivity: d.logActivity });
  registerMapsRoutes(app, { getStore: d.getStore });
  registerRunsRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, taskStore: d.taskStore, logger: d.runsLogger });
  registerTriggersRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, createTrigger: d.createTrigger, runAgentLoop: d.runAgentLoop, logError: d.logError });
  registerHierarchyRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, setHierarchyNode: d.setHierarchyNode });
  registerGitRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerClippyRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, builtinSystemPrompts: d.builtinSystemPrompts, anthropicCache: d.anthropicCache });
  registerAwardsRoutes(app, { getStore: d.getStore });
  registerWatcherRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, scanForAlerts: d.scanForAlerts, resolveAlert: d.resolveAlert });
  registerTimeRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerPrivacyRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerBackupsRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, backupsDir: d.backupsDir, legacyRestoreDir: d.legacyRestoreDir, ensureBackupsDir: d.ensureBackupsDir, logActivity: d.logActivity });
  registerMemoriesRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, logActivity: d.logActivity, agentDisplayNames: d.agentDisplayNames });
  registerToolsRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerSettingsRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerMatrixRoutes(app, { dataDir: d.dataDir });
  registerNotifyRoutes(app, { getStore: d.getStore, logger: d.notifyLogger });
  registerCostRoutes(app, { estimateAudioPlanCost: d.estimateAudioPlanCost, demoMapCost: d.costDemoMapCost });
  registerApiKeysSettingsRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, capabilityCheckers: d.capabilityCheckers, getApiKey: d.getApiKey });
  registerNotificationsSettingsRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerAnalystRoutes(app, { getStore: d.getStore, capabilityCheckers: d.capabilityCheckers, listRenders: d.listRenders, statementsDir: d.statementsDir });
  registerSubscriptionsRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, capabilityCheckers: d.capabilityCheckers, subFilesDir: d.subFilesDir }, d.ensureSubscriptionDefaults);
  registerVoiceRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, getApiKey: d.getApiKey, audio: d.audioService });
  registerCaptionsRoutes(app, { getStore: d.getStore, getApiKey: d.getApiKey, captionsDir: d.captionsDir, uploadsDir: d.uploadsDir, videosDir: d.captionVideosDir });
  registerImagesRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, imagesDir: d.imagesDir });
  registerLibraryRerenderRoutes(app, { videosDir: d.videosDirLib, renderQueueState: d.renderQueueState, logger: d.logger });
  registerApprovalsRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, logActivity: d.logActivity, executeApproval: d.executeApproval });
  registerChatRoutes(app, d.chatDeps);
  registerSchedulesRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, logActivity: d.logActivity, runSchedule: d.runSchedule });
  registerStudioRoutes(app, { dataDir: d.dataDir });
  registerPermissionsRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, logActivity: d.logActivity, builtinAgentPermissions: d.builtinAgentPermissions });
  registerStudioDemosRoutes(app, { demosDir: d.demosDir, videosDir: d.videosDirDemo, studioDemos: d.studioDemos, demoRequirements: d.demoRequirements, demoMapCost: d.demoMapCost, getApiKey: d.getApiKey, capabilityCheckers: d.capabilityCheckers, renderVideo: d.renderVideo, listRenders: d.listRenders, muxAudioOntoVideo: d.muxAudioOntoVideo, attachCostToRender: d.attachCostToRender, renderQueueState: d.renderQueueState, logActivity: d.logActivity });
  registerProjectsRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, dataDir: d.dataDir });
  registerConversationsExtendedRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, logActivity: d.logActivity, ensureProjectsArray: d.ensureProjectsArray, generateSummary: d.generateSummary });
  registerExportRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, dataDir: d.dataDir });
  registerRenderRoutes(app, { renderQueueState: d.renderQueueState, muxAudioOntoVideo: d.muxAudioOntoVideo, logActivity: d.logActivity, logger: d.logger });
  registerLibraryRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerLibraryListRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, studioAssetsDir: d.studioAssetsDir, ensureStudioAssetsDir: d.ensureStudioAssetsDir, experimentsCategoryId: d.experimentsCategoryId, listRenders: d.listRenders, archiveRender: d.archiveRender, trashMetaPath: d.trashMetaPath });
  registerTrashRoutes(app, { trashMetaPath: d.trashMetaPath, studioAssetsDir: d.studioAssetsDir, parseLibraryId: d.parseLibraryId, archiveRender: d.archiveRender, deleteRender: d.deleteRender });
  if (d.dataDir) registerGeneratedFilesRoutes(app, { dataDir: d.dataDir });
  registerReadingRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerMeetingsRoutes(app, {
    getStore: d.getStore,
    saveStore: d.saveStore,
    logger: d.logger,
    pickProviderForModel: d.pickProviderForModel,
  });
  registerVaultTasksRoutes(app);
  registerCompanionRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, anthropicCache: d.anthropicCache });
  registerPhdScheduleRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerPhdArchiveRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerDeleteApprovalRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerPhdExportRoutes(app, { getStore: d.getStore });
  registerPhdOfficeRoutes(app);
  registerSourcesRoutes(app);
  registerVaultInitRoutes(app, { getStore: d.getStore as () => { obsidianVaultPath?: string }, saveStore: d.saveStore });
  registerInboxRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerSearchRoutes(app, { getStore: d.getStore });
  registerCanvasRoutes(app);
  registerSystemResetRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerZoteroRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, anthropicCache: d.anthropicCache, logger: d.logger });
  registerAuditLogRoutes(app);
  registerDispatchRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, dataRoot: d.dataRoot ?? d.dataDir, logger: d.logger, getLLM: d.getDispatcherLLM ?? d.getLLM ?? (() => null) });
  registerGoogleTasksRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, logger: d.logger });
  registerReportsRoutes(app, {
    getStore: d.getStore,
    saveStore: d.saveStore,
    logger: d.logger,
    callProvider: d.reportsCallProvider,
    auditLog: d.auditLog,
    onFailure: d.onReportFailure,
  });
  registerAgentCardsRoutes(app, { dataRoot: d.dataRoot ?? d.dataDir, logger: d.logger });
  registerReportsInboxRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerFreshStartRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, logger: d.logger });
  registerAutoBackupRoutes(app, { getStore: d.getStore, backupsDir: d.backupsDir });
  registerVaultTrashRoutes(app);
  registerPhdFeaturesRoutes(app);
  registerGrs2Routes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerLinksRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerTagsRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerResearchFilesRoutes(app);
  registerResearchClustersRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerScopePointsRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerMilestonesRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerLibraryEntitiesRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerPlatformTrashRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerNotificationRulesRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerAgentTasksRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerAgentPipelinesRoutes(app, { getStore: d.getStore, saveStore: d.saveStore, runTask: d.agentTaskRunTask });
  registerObservabilityRoutes(app, { getStore: d.getStore });
  registerLibraryMatrixRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerLibraryCollectionsRoutes(app, { getStore: d.getStore, saveStore: d.saveStore });
  registerLibraryAgentChatRoutes(app, {
    getStore: d.getStore,
    saveStore: d.saveStore,
    pickProviderForModel: d.pickProviderForModel,
  });

  // Seed built-in notification rules on first run (idempotent)
  const _initStore = d.getStore();
  if (seedBuiltInRules(_initStore)) d.saveStore();

  registerShwashaRoutes(app, {
    getStore: d.getStore,
    saveStore: d.saveStore,
    logger: d.logger,
    logActivity: d.logActivity,
    pickProviderForModel: d.pickProviderForModel,
    builtinSystemPrompts: d.builtinSystemPrompts,
    getApiKey: d.getApiKey,
    splitIntoSections: d.splitIntoSections,
    ensurePapersDir: d.ensurePapersDir,
    papersDir: d.papersDir,
  });
  registerGraphRoutes(app, { getStore: d.getStore });
  if (d.workflowOrchestrator && d.workflowGetRunChannel) {
    registerWorkflowRunsRoutes(app, {
      getStore: d.getStore,
      orchestrator: d.workflowOrchestrator,
      getRunChannel: d.workflowGetRunChannel,
    } as WorkflowRunsRoutesDeps);
  }
}
