import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../server/logging.js';
import { moduleRegistry } from '../../modules/loader.js';
import { MANAGER_SYSTEM_PROMPT } from '../../prompts/index.js';

/**
 * AGT-05: structured tool-call delegation for الراعي (Manager).
 *
 * Replaces the text-marker pattern ("أحلتها لعبدان ✓") with an Anthropic
 * `tool_use` block. The manager loop receives a `delegate_to_specialist` tool
 * whose `specialist` enum is derived at runtime from the agent modules loaded
 * by the ARC-04 module registry (enforcing "manager can only delegate to
 * specialists declared in loaded modules").
 *
 * The text-marker pattern remains as a legacy fallback for models that return
 * plain text instead of a tool_use block.
 */

// Known specialist IDs (baseline — merged with module registry at call time).
const KNOWN_SPECIALIST_IDS = [
  'abdan',
  'shwasha',
  'alsafra',
  'rammana',
  'aldabsa',
  'musammim',
  'creative',
  'tasks-agent',
  'analyst',
  'munazzim',
  'mushakhkhis',
];

// Arabic display names → canonical IDs (for both tool enum and text-marker fallback).
const ARABIC_TO_ID: Record<string, string> = {
  عبدان: 'abdan',
  شواشة: 'shwasha',
  الصفرا: 'alsafra',
  رمّانة: 'rammana',
  الدبسا: 'aldabsa',
  المصمم: 'musammim',
  الكرييتف: 'creative',
  مهام: 'tasks-agent',
  المحلل: 'analyst',
  المنظّم: 'munazzim',
  المشخّص: 'mushakhkhis',
};

export interface DelegationRecord {
  specialist: string;
  task: string;
  context?: string;
  source: 'tool_use' | 'text_marker';
}

export interface ActivityLogger {
  (
    type: 'chat' | 'api_call' | 'task' | 'approval' | 'memory' | 'agent_created' | 'agent_deleted' | 'file_upload' | 'backup' | 'error' | 'system',
    action: string,
    details: string,
    opts?: { agentId?: string; metadata?: Record<string, unknown>; requestId?: string | null }
  ): unknown;
}

/** Build the set of specialist IDs the manager is allowed to delegate to. */
export function allowedSpecialistIds(): string[] {
  const fromRegistry = moduleRegistry
    .byType('agent')
    .map((m) => m.manifest.id)
    .filter((id) => id !== 'manager');
  const merged = new Set<string>([...KNOWN_SPECIALIST_IDS, ...fromRegistry]);
  return Array.from(merged);
}

/** The Anthropic tool definition the manager receives. */
export function delegateToSpecialistTool(): Anthropic.Tool {
  return {
    name: 'delegate_to_specialist',
    description:
      'Delegate a task to a specialist agent. Use this when the user asks for research, writing critique, comparison, creative work, or anything outside the manager\'s direct responsibilities.',
    input_schema: {
      type: 'object',
      properties: {
        specialist: {
          type: 'string',
          enum: allowedSpecialistIds(),
          description: 'The specialist to delegate to.',
        },
        task: {
          type: 'string',
          description: 'A one-sentence description of the task, in Arabic if the conversation is Arabic.',
        },
        context: {
          type: 'string',
          description: 'Optional prior context the specialist will need.',
        },
        pass_prior_context: {
          type: 'boolean',
          description:
            'Whether to include prior rounds from this user turn in the specialist system prompt. Defaults to true; set false to isolate the specialist from earlier rounds.',
        },
      },
      required: ['specialist', 'task'],
    },
  };
}

/**
 * Phase 2: the `plan_and_run_workflow` tool.
 * Kicks off a multi-step DAG when the user's request naturally decomposes into
 * sequential specialist tasks (research → report → visuals → etc.).
 */
export function planAndRunWorkflowTool(): Anthropic.Tool {
  return {
    name: 'plan_and_run_workflow',
    description:
      'For multi-step tasks requiring sequential specialists (research → report → visuals → etc.). Generates a plan and executes it asynchronously. Returns runId to monitor.',
    input_schema: {
      type: 'object',
      properties: {
        user_request: { type: 'string', description: 'The full user request, verbatim.' },
        title: { type: 'string', description: 'Optional Arabic title for the workflow.' },
      },
      required: ['user_request'],
    },
  };
}

/** Parse Anthropic response blocks for tool_use delegations. */
export function parseToolUseDelegations(content: Anthropic.ContentBlock[]): DelegationRecord[] {
  const out: DelegationRecord[] = [];
  for (const block of content) {
    if (block.type !== 'tool_use') continue;
    if (block.name !== 'delegate_to_specialist') continue;
    const input = block.input as {
      specialist?: string;
      task?: string;
      context?: string;
    };
    if (!input?.specialist || !input?.task) continue;
    out.push({
      specialist: input.specialist,
      task: input.task,
      context: input.context,
      source: 'tool_use',
    });
  }
  return out;
}

/**
 * Legacy fallback: extract "أحلتها لعبدان ✓" style markers from plain text.
 */
export function parseTextMarkerDelegations(text: string): DelegationRecord[] {
  const out: DelegationRecord[] = [];
  const pattern = /(?:أحلت(?:ها|ُ|تها)?\s+ل)(\p{L}+)/gu;
  for (const match of text.matchAll(pattern)) {
    const arabicName = match[1];
    const id = ARABIC_TO_ID[arabicName] || arabicName;
    out.push({ specialist: id, task: '', source: 'text_marker' });
  }
  return out;
}

/**
 * Log each delegation to the activity log.
 */
export function logDelegations(
  delegations: DelegationRecord[],
  logActivity: ActivityLogger,
  opts: { requestId?: string | null; conversationId?: string } = {}
): void {
  for (const d of delegations) {
    logActivity('chat', 'delegation', `manager → ${d.specialist}: ${d.task || '(no task)'}`, {
      agentId: d.specialist,
      requestId: opts.requestId ?? null,
      metadata: {
        from: 'الراعي',
        to: d.specialist,
        task: d.task,
        context: d.context,
        source: d.source,
        conversationId: opts.conversationId,
      },
    });
    logger.info(
      {
        requestId: opts.requestId,
        from: 'الراعي',
        to: d.specialist,
        task: d.task,
        source: d.source,
      },
      'manager.delegate'
    );
  }
}

/**
 * Build the messages array and tools for a manager Anthropic call.
 * Consumers (chat stream, agent runner) call this to get a ready-to-use
 * `messages.create` request body.
 */
export function managerAnthropicRequest(input: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  model: string;
  maxTokens?: number;
}): {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  tools: Anthropic.Tool[];
} {
  return {
    model: input.model,
    max_tokens: input.maxTokens ?? 2048,
    system: MANAGER_SYSTEM_PROMPT,
    messages: input.messages,
    tools: [delegateToSpecialistTool()],
  };
}
