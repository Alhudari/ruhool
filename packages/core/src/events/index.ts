import EventEmitter from 'eventemitter3';

// Inline event types to avoid cross-package dependency issues with tsx
interface APIUsageRecord {
  id: string;
  timestamp: Date;
  provider: string;
  model: string;
  agentId?: string;
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

type PlatformEvent =
  | { type: 'api:usage'; record: APIUsageRecord }
  | { type: 'agent:task:start'; agentId: string; taskId: string }
  | { type: 'agent:task:progress'; taskId: string; progress: number; message?: string }
  | { type: 'agent:task:complete'; taskId: string; output: Record<string, unknown> }
  | { type: 'agent:task:error'; taskId: string; error: string }
  | { type: 'memory:created'; agentId: string; memoryId: string }
  | { type: 'memory:deleted'; agentId: string; memoryId: string }
  | { type: 'conversation:created'; conversationId: string };

type EventHandler<T extends PlatformEvent['type']> = (
  event: Extract<PlatformEvent, { type: T }>
) => void;

class EventBus {
  private emitter = new EventEmitter();

  on<T extends PlatformEvent['type']>(type: T, handler: EventHandler<T>) {
    this.emitter.on(type, handler as (...args: unknown[]) => void);
    return () => this.emitter.off(type, handler as (...args: unknown[]) => void);
  }

  once<T extends PlatformEvent['type']>(type: T, handler: EventHandler<T>) {
    this.emitter.once(type, handler as (...args: unknown[]) => void);
  }

  emit(event: PlatformEvent) {
    this.emitter.emit(event.type, event);
  }

  off<T extends PlatformEvent['type']>(type: T, handler: EventHandler<T>) {
    this.emitter.off(type, handler as (...args: unknown[]) => void);
  }

  removeAllListeners() {
    this.emitter.removeAllListeners();
  }
}

export const eventBus = new EventBus();
export type { EventBus, PlatformEvent };
