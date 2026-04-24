/**
 * Google Tasks REST client. No googleapis dep — uses fetch directly so
 * we don't pull in Google's whole SDK for two endpoints.
 *
 * OAuth flow: user creates a Google Cloud project, enables Tasks API,
 * creates an OAuth 2.0 client ID (web app), adds our redirect URI,
 * copies the client ID + secret into Ruhool settings. Then clicks
 * "Connect" — we redirect to the Google consent page, user approves,
 * Google redirects back with an auth code, we exchange it for a
 * refresh token and store it encrypted. Every subsequent API call
 * refreshes the access token on the fly.
 */

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;  // unix-ms
  scope: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const API_BASE = 'https://tasks.googleapis.com/tasks/v1';
const SCOPES = ['https://www.googleapis.com/auth/tasks', 'https://www.googleapis.com/auth/userinfo.email'];

export function buildAuthUrl(cfg: GoogleOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  cfg: GoogleOAuthConfig,
  code: string,
): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: cfg.redirectUri,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google OAuth ${res.status}: ${text.slice(0, 200)}`);
  }
  const j = await res.json() as { access_token: string; refresh_token: string; expires_in: number; scope: string };
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: Date.now() + (j.expires_in - 60) * 1000,
    scope: j.scope,
  };
}

export async function refreshAccessToken(
  cfg: GoogleOAuthConfig,
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google refresh ${res.status}: ${text.slice(0, 200)}`);
  }
  const j = await res.json() as { access_token: string; expires_in: number };
  return {
    accessToken: j.access_token,
    expiresAt: Date.now() + (j.expires_in - 60) * 1000,
  };
}

export async function fetchUserEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return '';
  const j = await res.json() as { email?: string };
  return j.email ?? '';
}

export interface GoogleTaskList { id: string; title: string; updated: string }
export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string;
  completed?: string;
  updated: string;
  parent?: string;
}

export async function listTaskLists(accessToken: string): Promise<GoogleTaskList[]> {
  const res = await fetch(`${API_BASE}/users/@me/lists`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`listLists ${res.status}`);
  const j = await res.json() as { items?: GoogleTaskList[] };
  return j.items ?? [];
}

export async function listTasks(accessToken: string, listId: string, opts: { updatedMin?: string; showCompleted?: boolean } = {}): Promise<GoogleTask[]> {
  const params = new URLSearchParams();
  if (opts.updatedMin) params.set('updatedMin', opts.updatedMin);
  if (opts.showCompleted !== false) params.set('showCompleted', 'true');
  params.set('maxResults', '100');
  const res = await fetch(`${API_BASE}/lists/${listId}/tasks?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`listTasks ${res.status}`);
  const j = await res.json() as { items?: GoogleTask[] };
  return j.items ?? [];
}

export async function createTask(
  accessToken: string,
  listId: string,
  task: { title: string; notes?: string; due?: string },
): Promise<GoogleTask> {
  const res = await fetch(`${API_BASE}/lists/${listId}/tasks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(task),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`createTask ${res.status}: ${t.slice(0, 200)}`);
  }
  return await res.json() as GoogleTask;
}

export async function patchTask(
  accessToken: string,
  listId: string,
  taskId: string,
  patch: Partial<{ title: string; notes: string; status: 'needsAction' | 'completed'; due: string; completed: string }>,
): Promise<GoogleTask> {
  const res = await fetch(`${API_BASE}/lists/${listId}/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`patchTask ${res.status}: ${t.slice(0, 200)}`);
  }
  return await res.json() as GoogleTask;
}

export async function deleteTask(accessToken: string, listId: string, taskId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/lists/${listId}/tasks/${taskId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    const t = await res.text().catch(() => '');
    throw new Error(`deleteTask ${res.status}: ${t.slice(0, 200)}`);
  }
}
