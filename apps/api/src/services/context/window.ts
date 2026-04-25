// C-5: Token-Based Context Window Management
// Replaces message-count based trimming with token-aware trimming
// ~4 chars per token for Arabic/English mixed text

export const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessageTokens(msg: { content: string | unknown }): number {
  const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
  return estimateTokens(text) + 4; // 4 tokens overhead per message
}

/**
 * Trim messages to fit within a token budget.
 * Always preserves the most recent messages.
 * Ensures the first retained message has role='user'.
 */
export function trimToTokenBudget<T extends { role: string; content: string | unknown }>(
  messages: T[],
  maxTokens: number,
  reserveTokens = 4_000 // system prompt + response buffer
): { trimmed: T[]; droppedCount: number; tokenEstimate: number } {
  const budget = maxTokens - reserveTokens;
  let used = 0;
  const result: T[] = [];

  // Scan from newest to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = estimateMessageTokens(messages[i]);
    if (used + tokens > budget) break;
    result.unshift(messages[i]);
    used += tokens;
  }

  const droppedCount = messages.length - result.length;

  // Ensure first message is user (model requirement)
  while (result.length > 0 && result[0].role !== 'user') {
    result.shift();
  }

  return { trimmed: result, droppedCount, tokenEstimate: used };
}

// Model context windows (tokens)
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-sonnet-4-6':           180_000,
  'claude-opus-4-7':             200_000,
  'claude-haiku-4-5-20251001':   180_000,
  'claude-sonnet-4-5':           180_000,
};

export function getContextWindow(model: string): number {
  return MODEL_CONTEXT_WINDOWS[model] ?? 180_000;
}
