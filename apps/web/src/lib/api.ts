const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || '';

function authHeaders(): Record<string, string> {
  return API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {};
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

export function apiStream(
  path: string,
  body: unknown,
  onChunk: (event: string, data: unknown) => void,
  onDone?: () => void,
  onError?: (err: string) => void
) {
  const controller = new AbortController();
  let doneCalled = false;
  let retries = 0;
  const MAX_RETRIES = 3;
  // F-007: idempotency key — same key sent on every retry so server can dedupe
  const turnId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  async function attemptStream(attempt: number): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': turnId,
          ...authHeaders(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        // F-007: 409 = duplicate request. Don't retry, but don't show as error either.
        if (res.status === 409 && err.code === 'E_DUPLICATE_TURN') {
          // Server already processing this turn — silently end
          if (!doneCalled) { doneCalled = true; onDone?.(); }
          return;
        }
        onError?.(err.error || `API error: ${res.status}`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.split('\n');
          let eventName = '';
          let dataStr = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventName = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              dataStr = line.slice(6);
            }
          }

          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);
            if (eventName === 'done') {
              if (!doneCalled) {
                doneCalled = true;
                onDone?.();
              }
            } else if (eventName === 'error') {
              onError?.(data.error || data.message);
            } else if (eventName) {
              onChunk(eventName, data);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      // Handle any remaining buffer
      if (buffer.trim()) {
        const lines = buffer.split('\n');
        let eventName = '';
        let dataStr = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) eventName = line.slice(7).trim();
          else if (line.startsWith('data: ')) dataStr = line.slice(6);
        }
        if (eventName === 'done' && !doneCalled) {
          doneCalled = true;
          onDone?.();
        } else if (eventName && dataStr) {
          try {
            const data = JSON.parse(dataStr);
            if (eventName === 'error') onError?.(data.error || data.message);
            else onChunk(eventName, data);
          } catch {}
        }
      }

    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      // Exponential backoff: 3s → 6s → 12s, max 3 retries
      if (attempt < MAX_RETRIES && !doneCalled) {
        retries = attempt + 1;
        const delay = Math.min(3000 * Math.pow(2, attempt), 30_000);
        onChunk('reconnecting', { attempt: retries, delayMs: delay });
        await new Promise((r) => setTimeout(r, delay));
        if (!controller.signal.aborted) {
          return attemptStream(retries);
        }
      } else {
        onError?.((err as Error).message);
      }
    }
  }

  void attemptStream(0);

  return () => controller.abort();
}

export const API_BASE_URL = API_BASE;
