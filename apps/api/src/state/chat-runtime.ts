/**
 * Chat runtime state — extracted from the god-file (index.ts) as part of
 * REL-01 stage 2d.
 *
 * These Sets are per-process in-memory guards that reset on restart. They
 * prevent repeated work for the same conversation/message exchange.
 *
 * We export singletons here (the god-file has always treated them as such),
 * but any module that wants to inject them as deps may simply import these
 * and pass them to the relevant factory.
 */

/** Conversations we've already auto-summarized into long-term memory. */
export const summarizedConversations = new Set<string>();

/** Conversations we've already auto-titled (resets on process restart). */
export const titledConversations = new Set<string>();

/** "userMsgId:assistantMsgId" pairs we've already run the graph extractor on. */
export const graphExtractedMessages = new Set<string>();
