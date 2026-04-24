export { eventBus } from './events/index.js';
export { llmRouter } from './llm/router.js';
export { createRegistry } from './registry/index.js';
export { MemoryStore } from './memory/index.js';
export { getStorage, setStorage, createStorage, BUCKETS } from './storage/index.js';
export { LocalStorageAdapter } from './storage/local-adapter.js';
export type { EventBus } from './events/index.js';
export type { LLMRouter } from './llm/router.js';
export type { PluginRegistry, LoadedModule } from './registry/index.js';
export type { StorageAdapter, BucketName } from './storage/types.js';

export {
  DEFAULT_MIND_BLOCK,
  DEFAULT_AGENT_INTEGRATIONS,
  buildAnalyzePrompt,
  buildFullContextAnalyzePrompt,
  buildSynthesisUpdatePrompt,
  buildRefinePrompt,
  buildChatPrompt,
  buildVisionPrompt,
  buildChapterPrompt,
  buildClippingsPrompt,
  buildLibrarySearchPrompt,
} from './agents/shwasha/index.js';
export type { ShwashaPromptContext, AnalyzePromptExtras } from './agents/shwasha/index.js';
export {
  HighlightColorSchema,
  HighlightSchema,
  LibraryLinkSchema,
  AnalyzeResultSchema,
  VisionResultSchema,
  ChapterResultSchema,
  ClippingsBestHighlightSchema,
  ClippingsResultSchema,
  LibrarySearchSimilarPaperSchema,
  LibrarySearchResultSchema,
} from './agents/shwasha/index.js';
export type {
  HighlightColor,
  Highlight,
  LibraryLinkResult,
  AnalyzeResult,
  VisionResult,
  ChapterResult,
  ClippingsResult,
  LibrarySearchResult,
} from './agents/shwasha/index.js';
export { selectShwashaModel } from './agents/shwasha/index.js';
export type { ShwashaTask, ModelChoice, ModelSelectOpts } from './agents/shwasha/index.js';

export {
  fetchZoteroPaper,
  injectHighlights,
  injectTags,
  injectNotes,
  colorToHex,
  resolvePdfAttachmentKey,
  searchByTitle as zoteroSearchByTitle,
  filenameToQuery as zoteroFilenameToQuery,
  createZoteroItem,
  listCollections as zoteroListCollections,
  listItems as zoteroListItems,
  addItemToCollection as zoteroAddItemToCollection,
  listAllItems as zoteroListAllItems,
  listItemsRich as zoteroListItemsRich,
  listItemsRichWithVersion as zoteroListItemsRichWithVersion,
  replaceTags as zoteroReplaceTags,
  clearExtra as zoteroClearExtra,
  fetchFullItem as zoteroFetchFullItem,
  setZoteroConfig,
  getZoteroConfig,
} from './integrations/zotero/local-api.js';
export type { ZoteroSearchResult, ZoteroItemCreate, ZoteroItemRich } from './integrations/zotero/local-api.js';
export { patchItemTags as zoteroPatchItemTags, readItemVersion as zoteroReadItemVersion, VersionConflictError as ZoteroVersionConflictError } from './integrations/zotero/write-api.js';
export type { WriteApiConfig as ZoteroWriteApiConfig } from './integrations/zotero/write-api.js';
export { hasDirectionalMarks, stripBom, stripSurroundingDirectionalMarks, countDirectionalMarks } from './util/bidi.js';
export { extractWikilinks, resolveWikilinkAlias } from './util/wikilinks.js';
export type {
  ZoteroPaperMeta,
  ZoteroPaperFetch,
  ZoteroHighlight,
  ZoteroHighlightColor,
} from './integrations/zotero/local-api.js';
export { writeNote } from './integrations/obsidian/local-rest.js';
export {
  getVaultRoot,
  getVaultName,
  listTopLevelFolders,
  readNote,
  listNotes,
  searchNotes,
  findByCitekey,
  listAllTasks,
  toggleTask,
  parseFrontmatter,
  writeFrontmatter,
  splitFrontmatter,
  writeNoteRaw,
  noteExists,
  moveInVault,
  moveContentsInVault,
  countNotesInFolder,
} from './integrations/obsidian/vault-reader.js';
export type {
  VaultNote,
  VaultSection,
  VaultTask,
  ListOpts,
} from './integrations/obsidian/vault-reader.js';

export {
  buildMeetingExtractPrompt,
  buildMeetingSummaryPrompt,
  buildMeetingChatPrompt,
  MeetingRecordSchema,
} from './agents/meetings/index.js';
export type { MeetingsPromptContext, MeetingRecord } from './agents/meetings/index.js';

export {
  parseTemplate,
  listTemplates,
} from './integrations/obsidian/template-parser.js';
export type { TemplateSchema, TemplateField, TemplateSection } from './integrations/obsidian/template-parser.js';

export {
  renderNote,
  renderLitNote,
} from './integrations/obsidian/note-renderer.js';
export type { RenderPayload, LitNotePayload } from './integrations/obsidian/note-renderer.js';

// (Zotero exports moved up to the main Zotero export block above)

export { parseClippings } from './integrations/kindle/clippings-parser.js';
export type { Clipping, ClippingType } from './integrations/kindle/clippings-parser.js';
export { splitIntoChapters } from './integrations/kindle/chapter-split.js';
export type { Chapter } from './integrations/kindle/chapter-split.js';
