// Zotero Web API client (fallback when the local desktop app is not running).
// Requires ZOTERO_API_KEY and ZOTERO_USER_ID in the environment.

import type {
  ZoteroHighlight,
  ZoteroPaperFetch,
  ZoteroPaperMeta,
} from './local-api.js';
import { colorToHex } from './local-api.js';

const ZOTERO_WEB_BASE_URL = 'https://api.zotero.org';

function getAuth(): { apiKey: string; userId: string } {
  const apiKey = process.env.ZOTERO_API_KEY;
  const userId = process.env.ZOTERO_USER_ID;
  if (!apiKey || !userId) {
    throw new Error(
      'Zotero Web API requires ZOTERO_API_KEY and ZOTERO_USER_ID environment variables.'
    );
  }
  return { apiKey, userId };
}

/** Custom error type carrying the HTTP status so callers can make
 *  per-code decisions (e.g., 404 on /fulltext is expected and silent,
 *  401/403 should surface). */
export class ZoteroApiError extends Error {
  constructor(public status: number, public path: string, public body: string) {
    super(`Zotero Web API ${status} at ${path}: ${body.slice(0, 300)}`);
    this.name = 'ZoteroApiError';
  }
}

async function zoteroWebRequest(path: string, init?: RequestInit): Promise<Response> {
  const { apiKey, userId } = getAuth();
  const url = `${ZOTERO_WEB_BASE_URL}/users/${encodeURIComponent(userId)}${path}`;
  const headers = new Headers(init?.headers);
  headers.set('Zotero-API-Key', apiKey);
  headers.set('Zotero-API-Version', '3');
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ZoteroApiError(res.status, path, body);
  }
  return res;
}

export async function fetchZoteroPaper(itemKey: string): Promise<ZoteroPaperFetch> {
  const metaRes = await zoteroWebRequest(`/items/${encodeURIComponent(itemKey)}`);
  const metaJson = (await metaRes.json()) as { data?: Record<string, unknown> };
  const data = metaJson.data ?? {};

  const authorsField = Array.isArray(data.creators)
    ? (data.creators as Array<Record<string, string>>)
        .map((c) => [c.firstName, c.lastName].filter(Boolean).join(' ').trim())
        .filter(Boolean)
        .join(', ')
    : undefined;
  const yearField = typeof data.date === 'string' ? Number((data.date.match(/\d{4}/) || [])[0]) : undefined;

  const meta: ZoteroPaperMeta = {
    title: typeof data.title === 'string' ? data.title : undefined,
    authors: authorsField,
    year: Number.isFinite(yearField) ? yearField : undefined,
    journal: typeof data.publicationTitle === 'string' ? data.publicationTitle : undefined,
    doi: typeof data.DOI === 'string' ? data.DOI : undefined,
    itemType: typeof data.itemType === 'string' ? data.itemType : undefined,
    abstractNote: typeof data.abstractNote === 'string' ? data.abstractNote : undefined,
  };

  let fullText = '';
  let totalPages = 0;
  try {
    const ftRes = await zoteroWebRequest(`/items/${encodeURIComponent(itemKey)}/fulltext`);
    const ft = (await ftRes.json()) as { content?: string; indexedPages?: number; totalPages?: number };
    fullText = typeof ft.content === 'string' ? ft.content : '';
    totalPages =
      typeof ft.totalPages === 'number'
        ? ft.totalPages
        : typeof ft.indexedPages === 'number'
          ? ft.indexedPages
          : 0;
  } catch (err) {
    // Fulltext endpoint returns 404 for items without indexed PDF
    // attachments (parent items, web pages, snapshots, etc.) — that
    // is normal, metadata-only is still useful. Re-throw ONLY if
    // it's an auth/rate issue the caller needs to see.
    if (err instanceof ZoteroApiError && err.status !== 404) throw err;
  }

  return { meta, fullText, totalPages };
}

export async function injectHighlights(
  itemKey: string,
  highlights: ZoteroHighlight[]
): Promise<void> {
  if (highlights.length === 0) return;
  const body = highlights.map((h) => ({
    itemType: 'annotation',
    parentItem: itemKey,
    annotationType: 'highlight',
    annotationText: h.text,
    annotationColor: colorToHex(h.color),
    annotationComment: h.reason,
    annotationPageLabel: String(h.page),
  }));
  await zoteroWebRequest(`/items`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function injectTags(itemKey: string, tags: string[]): Promise<void> {
  if (tags.length === 0) return;
  const getRes = await zoteroWebRequest(`/items/${encodeURIComponent(itemKey)}`);
  const getJson = (await getRes.json()) as {
    version?: number;
    data?: { tags?: Array<{ tag: string }> };
  };
  const existing = getJson.data?.tags ?? [];
  const merged = [...existing, ...tags.map((t) => ({ tag: t }))];
  const version = getJson.version ?? 0;
  await zoteroWebRequest(`/items/${encodeURIComponent(itemKey)}`, {
    method: 'PATCH',
    headers: { 'If-Unmodified-Since-Version': String(version) },
    body: JSON.stringify({ tags: merged }),
  });
}

export async function injectNotes(itemKey: string, notes: string[]): Promise<void> {
  if (notes.length === 0) return;
  const body = notes.map((n) => ({
    itemType: 'note',
    parentItem: itemKey,
    note: n,
  }));
  await zoteroWebRequest(`/items`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
