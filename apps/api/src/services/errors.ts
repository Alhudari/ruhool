export type RuhoolErrorCode =
  | 'E_IDENTITY_OVERRIDE'
  | 'E_INJECTION_DETECTED'
  | 'E_TASK_MAX_RETRIES'
  | 'E_TASK_TIMEOUT'
  | 'E_PIPELINE_STEP_FAILED'
  | 'E_PIPELINE_ABORTED'
  | 'E_PROVIDER_UNAVAILABLE'
  | 'E_SCHEDULE_INVALID'
  | 'E_DELEGATION_UNKNOWN'
  | 'E_CONTEXT_OVERFLOW'
  | 'E_TOOL_EXECUTION'
  | 'E_RUN_NOT_FOUND';

export class RuhoolError extends Error {
  readonly code: RuhoolErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: RuhoolErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RuhoolError';
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export function isRuhoolError(e: unknown): e is RuhoolError {
  return e instanceof RuhoolError;
}
