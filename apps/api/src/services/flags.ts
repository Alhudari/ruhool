function env(key: string, defaultVal: boolean): boolean {
  const v = process.env[key];
  if (v === undefined) return defaultVal;
  return v !== 'false' && v !== '0';
}

const FLAGS = {
  // B-series
  IDENTITY_LOCK:              env('FLAG_IDENTITY_LOCK', true),
  INPUT_SANITIZER:            env('FLAG_INPUT_SANITIZER', true),
  TOOL_TRUST_WRAP:            env('FLAG_TOOL_TRUST_WRAP', true),
  STABLE_PROMPT:              env('FLAG_STABLE_PROMPT', true),
  TASK_RETRY:                 env('FLAG_TASK_RETRY', true),
  PIPELINE_RESILIENCE:        env('FLAG_PIPELINE_RESILIENCE', true),
  CRASH_RECOVERY:             env('FLAG_CRASH_RECOVERY', true),
  TOOL_USE_ONLY_DELEGATION:   env('FLAG_TOOL_USE_ONLY', false),
  // C-series
  RUN_EVENTS:                 env('FLAG_RUN_EVENTS', true),      // C-1
  NESTED_STREAMING:           env('FLAG_NESTED_STREAMING', true), // C-2
  PIPELINE_CHECKPOINT:        env('FLAG_PIPELINE_CHECKPOINT', true), // C-3
  BUDGET_ENFORCEMENT:         env('FLAG_BUDGET_ENFORCEMENT', true),  // C-4
  TOKEN_CONTEXT_WINDOW:       env('FLAG_TOKEN_CONTEXT_WINDOW', true), // C-5
  PROMPT_VERSION_PINNING:     env('FLAG_PROMPT_VERSION_PINNING', true), // C-6
  ENTITY_MEMORY:              env('FLAG_ENTITY_MEMORY', true),   // C-7
  OBSERVABILITY:              env('FLAG_OBSERVABILITY', true),   // C-8
} as const;

export type FlagName = keyof typeof FLAGS;

export function flag(name: FlagName): boolean {
  return FLAGS[name];
}
