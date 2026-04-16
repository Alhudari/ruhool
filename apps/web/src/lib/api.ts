const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';
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

  fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
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

      // Parse SSE events properly
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || ''; // Keep incomplete part

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
            onError?.(data.error);
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
          if (eventName === 'error') onError?.(data.error);
          else onChunk(eventName, data);
        } catch {}
      }
    }

    // Server always sends an explicit 'done' event — no fallback needed
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      onError?.(err.message);
    }
  });

  return () => controller.abort();
}

export const API_BASE_URL = API_BASE;
