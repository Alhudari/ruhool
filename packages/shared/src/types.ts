import { z } from 'zod';

// ─── Bilingual text ───
export const BilingualText = z.object({
  en: z.string(),
  ar: z.string(),
});
export type BilingualText = z.infer<typeof BilingualText>;

// ─── Module manifest ───
export const ModuleType = z.enum([
  'agent',
  'workflow',
  'tool',
  'skill',
  'llm-provider',
  'theme',
  'widget',
  'integration',
]);
export type ModuleType = z.infer<typeof ModuleType>;

export const ModuleManifest = z.object({
  id: z.string(),
  version: z.string(),
  type: ModuleType,
  name: BilingualText,
  description: BilingualText,
  author: z.string(),
  icon: z.string().optional(),
  color: z.string().optional(),
  requires: z
    .object({
      skills: z.array(z.string()).optional(),
      tools: z.array(z.string()).optional(),
      'llm-provider': z.string().optional(),
    })
    .optional(),
  permissions: z.array(z.string()).optional(),
  defaultConfig: z.record(z.unknown()).optional(),
});
export type ModuleManifest = z.infer<typeof ModuleManifest>;

// ─── LLM types ───
export type LLMRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: LLMRole;
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  output: string;
  isError?: boolean;
}

export interface ChatParams {
  model: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  stream?: boolean;
}

export interface ChatChunk {
  type: 'text' | 'tool_call' | 'usage' | 'done' | 'error';
  content?: string;
  toolCall?: ToolCall;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens?: number;
  };
  error?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LLMModel {
  id: string;
  name: string;
  provider: string;
  maxTokens: number;
  supportsVision?: boolean;
  supportsTools?: boolean;
  inputCostPer1k: number;
  outputCostPer1k: number;
}

export interface LLMProvider {
  id: string;
  name: BilingualText;
  testConnection(): Promise<{ ok: boolean; error?: string }>;
  listModels(): Promise<LLMModel[]>;
  chat(params: ChatParams): AsyncIterable<ChatChunk>;
  estimateCost(
    inputTokens: number,
    outputTokens: number,
    model: string
  ): number;
}

// ─── Agent types ───
export type MemoryTier = 'working' | 'short-term' | 'long-term';

export interface AgentIdentity {
  id: string;
  moduleId: string;
  name: BilingualText;
  systemPrompt: string;
  skills: string[];
  tools: string[];
  preferredProvider?: string;
  preferredModel?: string;
  config: Record<string, unknown>;
}

export interface Memory {
  id: string;
  agentId: string;
  tier: MemoryTier;
  content: string;
  embedding?: number[];
  sourceConversationId?: string;
  confidence: number;
  createdAt: Date;
  lastAccessedAt: Date;
}

// ─── Task types ───
export type TaskStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AgentTask {
  id: string;
  type: string;
  status: TaskStatus;
  progress: number;
  progressMessage?: string;
  agentId: string;
  workflowId?: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  startedAt?: Date;
  completedAt?: Date;
}

// ─── API Usage ───
export interface APIUsageRecord {
  id: string;
  timestamp: Date;
  provider: string;
  model: string;
  agentId?: string;
  workflowId?: string;
  conversationId?: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

// ─── Theme ───
export type ThemeVariant = 'light' | 'dark' | 'system';

export interface ThemeConfig {
  id: string;
  name: BilingualText;
  variants: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
}

// ─── Privacy ───
export type PrivacyMode = 'strict' | 'balanced' | 'open';

// ─── Events ───
export type PlatformEvent =
  | { type: 'agent:message'; agentId: string; message: ChatMessage }
  | { type: 'agent:task:start'; agentId: string; taskId: string }
  | {
      type: 'agent:task:progress';
      taskId: string;
      progress: number;
      message?: string;
    }
  | {
      type: 'agent:task:complete';
      taskId: string;
      output: Record<string, unknown>;
    }
  | { type: 'agent:task:error'; taskId: string; error: string }
  | { type: 'memory:created'; agentId: string; memoryId: string }
  | { type: 'memory:deleted'; agentId: string; memoryId: string }
  | { type: 'conversation:created'; conversationId: string }
  | { type: 'api:usage'; record: APIUsageRecord };
