// Zotero API client — supports BOTH local Connector (desktop) AND Web API (cloud).
//
// LOCAL mode: talks to the user's running Zotero desktop on localhost:23119.
//   Personal library lives under /users/0 (the local-only sentinel user ID).
//   Without that prefix, Zotero returns "No endpoint found" 404s.
//
// WEB mode: talks to https://api.zotero.org. Requires the user's numeric
//   Zotero user ID + an API key (created at https://www.zotero.org/settings/keys).
//   Library lives under /users/{userID}. Same path structure as Local.
//   Use this when accessing from phone/iPad or any device where the desktop
//   app isn't reachable.

const ZOTERO_LOCAL_BASE_URL = process.env.ZOTERO_LOCAL_URL || 'http://localhost:23119/api/users/0';

// Runtime config — backend can switch modes via setZoteroConfig() at any time.
type ZoteroMode = 'local' | 'web';
interface ZoteroConfig {
  mode: ZoteroMode;
  localUrl: string;
  webUserId: string;  // numeric, e.g. "12345"
  webApiKey: string;
}
const config: ZoteroConfig = {
  mode: 'local',
  localUrl: ZOTERO_LOCAL_BASE_URL,
  webUserId: process.env.ZOTERO_WEB_USER_ID ?? '',
  webApiKey: process.env.ZOTERO_WEB_API_KEY ?? '',
};

export function setZoteroConfig(patch: Partial<ZoteroConfig>): void {
  Object.assign(config, patch);
}
export function getZoteroConfig(): Readonly<ZoteroConfig> {
  // Never leak the API key to callers — return a redacted view
  return { ...config, webApiKey: config.webApiKey ? '***' : '' };
}

function activeBase(): string {
  if (config.mode === 'web') {
    if (!config.webUserId || !config.webApiKey) {
      throw new Error('Zotero Web mode requires both webUserId and webApiKey. Configure via /api/zotero/config.');
    }
    return `https://api.zotero.org/users/${config.webUserId}`;
  }
  return config.localUrl;
}

function authHeader(): Record<string, string> {
  if (config.mode === 'web' && config.webApiKey) {
    return { 'Zotero-API-Key': config.webApiKey };
  }
  return {};
}

export interface ZoteroPaperMeta {
  title?: string;
  authors?: string;
  year?: number;
  journal?: string;
  doi?: string;
  itemType?: string;
  abstractNote?: string;
}

export interface ZoteroPaperFetch {
  meta: ZoteroPaperMeta;
  fullText: string;
  totalPages: number;
}

export type ZoteroHighlightColor = 'yellow' | 'green' | 'red' | 'blue' | 'purple' | 'orange';

export interface ZoteroHighlight {
  text: string;
  color: ZoteroHighlightColor;
  reason: string;
  page: number;
}

// Mapping mirrors Zotero's built-in annotation palette.
export function colorToHex(color: ZoteroHighlightColor): string {
  switch (color) {
    case 'yellow':
      return '#ffd400';
    case 'green':
      return '#5fb236';
    case 'red':
      return '#ff6666';
    case 'blue':
      return '#2ea8e5';
    case 'purple':
      return '#a28ae5';
    case 'orange':
      return '#f19837';
    default: {
      const _exhaustive: never = color;
      throw new Error(`Unknown highlight color: ${String(_exhaustive)}`);
    }
  }
}

async function zoteroRequest(path: string, init?: RequestInit): Promise<Response> {
  const base = activeBase();
  const url = `${base}${path}`;
  const headers = { ...(init?.headers as Record<string, string> | undefined ?? {}), ...authHeader() };
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (err) {
    const modeMsg = config.mode === 'web'
      ? `Zotero Web API unreachable at ${base}. Check your internet connection.`
      : `Zotero Local API unreachable at ${base}. Start Zotero desktop and ensure the Connector server is enabled.`;
    throw new Error(`${modeMsg} Underlying error: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Zotero ${config.mode === 'web' ? 'Web' : 'Local'} API ${res.status} at ${path}: ${body.slice(0, 300)}`);
  }
  return res;
}

export async function fetchZoteroPaper(itemKey: string): Promise<ZoteroPaperFetch> {
  const metaRes = await zoteroRequest(`/items/${encodeURIComponent(itemKey)}`);
  const metaJson = (await metaRes.json()) as {
    data?: Record<string, unknown>;
  };
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

  const fullTextRes = await zoteroRequest(`/items/${encodeURIComponent(itemKey)}/fulltext`);
  const fullTextJson = (await fullTextRes.json()) as {
    content?: string;
    totalPages?: number;
    indexedPages?: number;
  };

  const fullText = typeof fullTextJson.content === 'string' ? fullTextJson.content : '';
  const totalPages =
    typeof fullTextJson.totalPages === 'number'
      ? fullTextJson.totalPages
      : typeof fullTextJson.indexedPages === 'number'
        ? fullTextJson.indexedPages
        : 0;

  return { meta, fullText, totalPages };
}

// Zotero annotations must be attached to the PDF *attachment* child, never the
// parent item. If the user pastes a paper's item key, walk its children and
// find the PDF attachment to use as `parentItem` for the annotation POST.
export async function resolvePdfAttachmentKey(itemKey: string): Promise<string> {
  const res = await zoteroRequest(`/items/${encodeURIComponent(itemKey)}`);
  const json = (await res.json()) as { data?: { itemType?: string; contentType?: string } };
  const data = json.data ?? {};
  if (
    typeof data.itemType === 'string' &&
    data.itemType === 'attachment' &&
    typeof data.contentType === 'string' &&
    data.contentType.toLowerCase().includes('pdf')
  ) {
    return itemKey;
  }

  const childRes = await zoteroRequest(`/items/${encodeURIComponent(itemKey)}/children`);
  const childJson = (await childRes.json()) as Array<{
    key?: string;
    data?: { itemType?: string; contentType?: string; key?: string };
  }>;
  for (const entry of childJson) {
    const d = entry.data ?? {};
    if (d.itemType === 'attachment' && d.contentType === 'application/pdf') {
      const key = d.key ?? entry.key;
      if (typeof key === 'string' && key.length > 0) return key;
    }
  }
  throw new Error(
    'No PDF attachment found on this Zotero item. Highlights can only be injected on PDF attachments.'
  );
}

export async function injectHighlights(
  itemKey: string,
  highlights: ZoteroHighlight[]
): Promise<void> {
  if (highlights.length === 0) return;

  const pdfKey = await resolvePdfAttachmentKey(itemKey);

  const body = highlights.map((h) => ({
    itemType: 'annotation',
    parentItem: pdfKey,
    annotationType: 'highlight',
    annotationText: h.text,
    annotationColor: colorToHex(h.color),
    annotationComment: h.reason,
    annotationPageLabel: String(h.page),
  }));

  await zoteroRequest(`/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function injectTags(itemKey: string, tags: string[]): Promise<void> {
  if (tags.length === 0) return;
  await zoteroRequest(`/items/${encodeURIComponent(itemKey)}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tags.map((t) => ({ tag: t }))),
  });
}

// ── Search / create ──────────────────────────────────────────────────

export interface ZoteroSearchResult {
  itemKey: string;
  title: string;
  authors: string;
  year: number | undefined;
  itemType: string;
  abstractNote: string;
}

// Search the local Zotero library by title / filename fragment.
// Uses the /items?q= endpoint (Zotero searches title + author + year).
export async function searchByTitle(query: string, limit = 10): Promise<ZoteroSearchResult[]> {
  if (!query.trim()) return [];
  const res = await zoteroRequest(`/items?q=${encodeURIComponent(query)}&limit=${limit}&itemType=-attachment`);
  const json = (await res.json()) as Array<{ key?: string; data?: Record<string, unknown> }>;
  return json
    .map((entry) => {
      const d = entry.data ?? {};
      const authors = Array.isArray(d.creators)
        ? (d.creators as Array<Record<string, string>>)
            .map((c) => [c.firstName, c.lastName].filter(Boolean).join(' ').trim())
            .filter(Boolean)
            .join(', ')
        : '';
      const year = typeof d.date === 'string' ? Number((d.date.match(/\d{4}/) || [])[0]) : undefined;
      return {
        itemKey: d.key as string || entry.key || '',
        title: typeof d.title === 'string' ? d.title : '',
        authors,
        year: Number.isFinite(year) ? year : undefined,
        itemType: typeof d.itemType === 'string' ? d.itemType : '',
        abstractNote: typeof d.abstractNote === 'string' ? d.abstractNote : '',
      } as ZoteroSearchResult;
    })
    .filter((r) => r.itemKey && r.title);
}

// Strip common file suffixes and clean up a filename to use as a search query.
// "2024-BIM adoption in Kuwait.pdf" → "BIM adoption in Kuwait"
export function filenameToQuery(filename: string): string {
  return filename
    .replace(/\.[a-z]{2,5}$/i, '') // strip extension
    .replace(/^\d{4}[-_\s]+/, '')   // strip leading year
    .replace(/[-_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Create a stub Zotero item (no PDF, no full text) from metadata.
// Returns the new itemKey.
export interface ZoteroItemCreate {
  itemType?: string;
  title: string;
  authors?: Array<{ firstName: string; lastName: string }>;
  year?: number;
  doi?: string;
  url?: string;
  abstractNote?: string;
  tags?: string[];
}

export async function createZoteroItem(item: ZoteroItemCreate): Promise<string> {
  const creators = (item.authors ?? []).map((a) => ({
    creatorType: 'author',
    firstName: a.firstName,
    lastName: a.lastName,
  }));
  const body = [
    {
      itemType: item.itemType ?? 'journalArticle',
      title: item.title,
      creators,
      date: item.year ? String(item.year) : '',
      DOI: item.doi ?? '',
      url: item.url ?? '',
      abstractNote: item.abstractNote ?? '',
      tags: (item.tags ?? []).map((t) => ({ tag: t })),
    },
  ];
  const res = await zoteroRequest('/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { successful?: Record<string, { key?: string; data?: { key?: string } }> };
  const first = Object.values(json.successful ?? {})[0];
  const key = first?.data?.key ?? first?.key;
  if (!key) throw new Error('Zotero createItem: no key returned');
  return key;
}

// List all collections in the Zotero library
export async function listCollections(): Promise<Array<{ key: string; name: string; parentCollection?: string }>> {
  const res = await zoteroRequest('/collections');
  const json = (await res.json()) as Array<{ key?: string; data?: { key?: string; name?: string; parentCollection?: string } }>;
  return json
    .map((c) => ({
      key: (c.data?.key ?? c.key) as string,
      name: (c.data?.name as string) ?? '',
      parentCollection: c.data?.parentCollection as string | undefined,
    }))
    .filter((c) => c.key && c.name);
}

// Rich item shape — exposes the fields needed by the platform's table/card views.
export interface ZoteroItemRich {
  itemKey: string;
  title: string;
  authors: string;
  authorsList: string[];
  year: number | undefined;
  itemType: string;
  abstractNote: string;
  publicationTitle: string;
  volume: string;
  issue: string;
  pages: string;
  publisher: string;
  doi: string;
  url: string;
  isbn: string;
  issn: string;
  language: string;
  place: string;
  numPages: string;
  shortTitle: string;
  extra: string;
  dateAdded: string;
  dateModified: string;
  tags: string[];
  collections: string[];
  rating: number;
}

function extractRich(entry: { key?: string; data?: Record<string, unknown> }): ZoteroItemRich {
  const d = entry.data ?? {};
  const creators = Array.isArray(d.creators) ? (d.creators as Array<Record<string, string>>) : [];
  const authorsList = creators
    .map((c) => [c.firstName, c.lastName].filter(Boolean).join(' ').trim())
    .filter(Boolean);
  const year = typeof d.date === 'string' ? Number((d.date.match(/\d{4}/) || [])[0]) : undefined;
  const tags = Array.isArray(d.tags)
    ? (d.tags as Array<{ tag?: string }>).map((t) => t.tag ?? '').filter(Boolean)
    : [];
  // Rating is stored as star-tags like "⭐", "⭐⭐", etc.
  const rating = tags.reduce((acc, t) => (/^⭐+$/.test(t) ? Math.max(acc, t.length) : acc), 0);
  return {
    itemKey: (d.key as string) || entry.key || '',
    title: (d.title as string) ?? '',
    authors: authorsList.join(', '),
    authorsList,
    year: Number.isFinite(year) ? year : undefined,
    itemType: (d.itemType as string) ?? '',
    abstractNote: (d.abstractNote as string) ?? '',
    publicationTitle: (d.publicationTitle as string) ?? (d.bookTitle as string) ?? (d.journalAbbreviation as string) ?? '',
    volume: (d.volume as string) ?? '',
    issue: (d.issue as string) ?? '',
    pages: (d.pages as string) ?? '',
    publisher: (d.publisher as string) ?? '',
    doi: (d.DOI as string) ?? '',
    url: (d.url as string) ?? '',
    isbn: (d.ISBN as string) ?? '',
    issn: (d.ISSN as string) ?? '',
    language: (d.language as string) ?? '',
    place: (d.place as string) ?? '',
    numPages: (d.numPages as string) ?? '',
    shortTitle: (d.shortTitle as string) ?? '',
    extra: (d.extra as string) ?? '',
    dateAdded: (d.dateAdded as string) ?? '',
    dateModified: (d.dateModified as string) ?? '',
    tags,
    collections: Array.isArray(d.collections) ? (d.collections as string[]) : [],
    rating,
  };
}

// Rich listing — returns all useful fields for the browser UI.
// Paginates automatically: Zotero Web API caps responses at 100 items per request,
// so for libraries > 100 items we need to walk pages until exhausted (or until we
// hit the requested limit). Local API doesn't enforce the same cap but the same
// loop works correctly for both modes.
export interface ListItemsRichOptions {
  /** Scope to a single collection. */
  collectionKey?: string;
  /** Maximum number of items to return across all pages. */
  limit?: number;
  /** Zotero library version — returns only items modified since. 0 = full pull. */
  since?: number;
}

/**
 * Rich listing. When `since > 0`, passes the Zotero `?since=<version>` query
 * so only items modified after that version are returned. Caller can persist
 * `lastZoteroVersion` to skip unchanged items on the next run.
 */
/**
 * Like `listItemsRich` but also returns the latest `Last-Modified-Version`
 * header from Zotero. Callers persist this and pass it as `since` next run
 * for a cheap delta fetch.
 */
export async function listItemsRichWithVersion(opts: ListItemsRichOptions = {}): Promise<{ items: ZoteroItemRich[]; libraryVersion: number }> {
  const { collectionKey, limit = 1000, since = 0 } = opts;
  const PAGE_SIZE = 100;
  const all: ZoteroItemRich[] = [];
  let start = 0;
  let libraryVersion = since;
  while (all.length < limit) {
    const remaining = limit - all.length;
    const fetchSize = Math.min(PAGE_SIZE, remaining);
    const sinceParam = since > 0 ? `&since=${since}` : '';
    const path = collectionKey
      ? `/collections/${collectionKey}/items?itemType=-attachment&limit=${fetchSize}&start=${start}${sinceParam}`
      : `/items?itemType=-attachment&limit=${fetchSize}&start=${start}${sinceParam}`;
    const res = await zoteroRequest(path);
    const hdr = res.headers.get('Last-Modified-Version');
    if (hdr) libraryVersion = Math.max(libraryVersion, Number(hdr));
    const json = (await res.json()) as Array<{ key?: string; data?: Record<string, unknown> }>;
    if (!Array.isArray(json) || json.length === 0) break;
    const batch = json.map(extractRich).filter((r) => r.itemKey && r.title);
    all.push(...batch);
    if (json.length < fetchSize) break;
    start += json.length;
  }
  return { items: all, libraryVersion };
}

export async function listItemsRich(
  collectionKeyOrOpts?: string | ListItemsRichOptions,
  legacyLimit?: number,
): Promise<ZoteroItemRich[]> {
  // Back-compat: earlier signature was `listItemsRich(collectionKey?, limit?)`.
  const opts: ListItemsRichOptions = typeof collectionKeyOrOpts === 'string' || collectionKeyOrOpts === undefined
    ? { collectionKey: collectionKeyOrOpts as string | undefined, limit: legacyLimit ?? 1000 }
    : { limit: 1000, ...collectionKeyOrOpts };

  const { collectionKey, limit = 1000, since = 0 } = opts;
  const PAGE_SIZE = 100;
  const all: ZoteroItemRich[] = [];
  let start = 0;
  while (all.length < limit) {
    const remaining = limit - all.length;
    const fetchSize = Math.min(PAGE_SIZE, remaining);
    const sinceParam = since > 0 ? `&since=${since}` : '';
    const path = collectionKey
      ? `/collections/${collectionKey}/items?itemType=-attachment&limit=${fetchSize}&start=${start}${sinceParam}`
      : `/items?itemType=-attachment&limit=${fetchSize}&start=${start}${sinceParam}`;
    const res = await zoteroRequest(path);
    const json = (await res.json()) as Array<{ key?: string; data?: Record<string, unknown>; version?: number }>;
    if (!Array.isArray(json) || json.length === 0) break;
    const batch = json.map(extractRich).filter((r) => r.itemKey && r.title);
    all.push(...batch);
    if (json.length < fetchSize) break;
    start += json.length;
  }
  return all;
}

// List items in a collection (or all top-level if collectionKey omitted)
export async function listItems(collectionKey?: string, limit = 100): Promise<ZoteroSearchResult[]> {
  const url = collectionKey
    ? `/collections/${collectionKey}/items?itemType=-attachment&limit=${limit}`
    : `/items?itemType=-attachment&limit=${limit}`;
  const res = await zoteroRequest(url);
  const json = (await res.json()) as Array<{ key?: string; data?: Record<string, unknown> }>;
  return json
    .map((entry) => {
      const d = entry.data ?? {};
      const authors = Array.isArray(d.creators)
        ? (d.creators as Array<Record<string, string>>)
            .map((c) => [c.firstName, c.lastName].filter(Boolean).join(' ').trim())
            .filter(Boolean)
            .join(', ')
        : '';
      const year = typeof d.date === 'string' ? Number((d.date.match(/\d{4}/) || [])[0]) : undefined;
      return {
        itemKey: (d.key as string) || entry.key || '',
        title: typeof d.title === 'string' ? d.title : '',
        authors,
        year: Number.isFinite(year) ? year : undefined,
        itemType: typeof d.itemType === 'string' ? d.itemType : '',
        abstractNote: typeof d.abstractNote === 'string' ? d.abstractNote : '',
      } as ZoteroSearchResult;
    })
    .filter((r) => r.itemKey && r.title);
}

// Add an item to an existing collection
export async function addItemToCollection(itemKey: string, collectionKey: string): Promise<void> {
  // Read current item
  const get = await zoteroRequest(`/items/${itemKey}`);
  const item = await get.json() as { data?: { collections?: string[] } };
  const collections = item.data?.collections ?? [];
  if (collections.includes(collectionKey)) return;
  // Patch with merged collections
  await zoteroRequest(`/items/${itemKey}`, {
    method: 'PATCH',
    body: JSON.stringify({ collections: [...collections, collectionKey] }),
    headers: { 'Content-Type': 'application/json' },
  });
}

// Fetch the full item record (data field includes version — required for writes)
export async function fetchFullItem(itemKey: string): Promise<{ version: number; data: Record<string, unknown> }> {
  const res = await zoteroRequest(`/items/${itemKey}`);
  const json = await res.json() as { version?: number; data?: Record<string, unknown> };
  return {
    version: (json.version ?? (json.data?.version as number)) ?? 0,
    data: json.data ?? {},
  };
}

// Replace the entire tag list on an item. Pass [] to remove all tags.
export async function replaceTags(itemKey: string, tags: string[]): Promise<void> {
  const full = await fetchFullItem(itemKey);
  const next = {
    ...full.data,
    tags: tags.map((t) => ({ tag: t })),
  };
  await zoteroRequest(`/items/${itemKey}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'If-Unmodified-Since-Version': String(full.version),
    },
    body: JSON.stringify(next),
  });
}

// Clear the "extra" field which often stores custom metadata like reading status.
export async function clearExtra(itemKey: string): Promise<void> {
  const full = await fetchFullItem(itemKey);
  const next = { ...full.data, extra: '' };
  await zoteroRequest(`/items/${itemKey}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'If-Unmodified-Since-Version': String(full.version),
    },
    body: JSON.stringify(next),
  });
}

// Enumerate ALL items (paginated) — for full backups.
// Zotero caps at 100 per request; we page through with 'start'.
export async function listAllItems(): Promise<Array<{ key: string; data: Record<string, unknown> }>> {
  const all: Array<{ key: string; data: Record<string, unknown> }> = [];
  let start = 0;
  const pageSize = 100;
  while (true) {
    const res = await zoteroRequest(`/items?limit=${pageSize}&start=${start}&itemType=-attachment`);
    const page = await res.json() as Array<{ key?: string; data?: Record<string, unknown> }>;
    if (!Array.isArray(page) || page.length === 0) break;
    for (const entry of page) {
      if (entry.key || entry.data?.key) {
        all.push({ key: (entry.data?.key ?? entry.key) as string, data: entry.data ?? {} });
      }
    }
    if (page.length < pageSize) break;
    start += pageSize;
    if (start > 10_000) break; // safety cap
  }
  return all;
}

export async function injectNotes(itemKey: string, notes: string[]): Promise<void> {
  if (notes.length === 0) return;
  const body = notes.map((n) => ({
    itemType: 'note',
    parentItem: itemKey,
    note: n,
  }));
  await zoteroRequest(`/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
