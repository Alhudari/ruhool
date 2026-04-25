// Download PDF bytes for a Zotero attachment item.
// Prefers local Connector; falls back to Web API if local is unreachable.

const ZOTERO_LOCAL_BASE_URL = process.env.ZOTERO_LOCAL_URL || 'http://localhost:23119/api';
const ZOTERO_WEB_BASE_URL = 'https://api.zotero.org';

async function tryLocal(attachmentKey: string): Promise<Buffer | null> {
  try {
    const res = await fetch(
      `${ZOTERO_LOCAL_BASE_URL}/items/${encodeURIComponent(attachmentKey)}/file`
    );
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

async function tryWeb(attachmentKey: string): Promise<Buffer> {
  const apiKey = process.env.ZOTERO_API_KEY;
  const userId = process.env.ZOTERO_USER_ID;
  if (!apiKey || !userId) {
    throw new Error(
      'PDF fetch fell back to Zotero Web API but ZOTERO_API_KEY / ZOTERO_USER_ID are not set.'
    );
  }
  const res = await fetch(
    `${ZOTERO_WEB_BASE_URL}/users/${encodeURIComponent(userId)}/items/${encodeURIComponent(attachmentKey)}/file`,
    {
      headers: {
        'Zotero-API-Key': apiKey,
        'Zotero-API-Version': '3',
      },
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Zotero Web API file fetch ${res.status}: ${body.slice(0, 300)}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

export async function fetchZoteroPdf(attachmentKey: string): Promise<Buffer> {
  const local = await tryLocal(attachmentKey);
  if (local) return local;
  return tryWeb(attachmentKey);
}
