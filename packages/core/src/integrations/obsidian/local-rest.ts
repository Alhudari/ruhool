// Obsidian Local REST API client.
// Requires the "Local REST API" community plugin running on the user's vault.

const OBSIDIAN_LOCAL_BASE_URL = process.env.OBSIDIAN_LOCAL_URL || 'http://localhost:27123';

function getApiKey(): string {
  const key = process.env.OBSIDIAN_API_KEY;
  if (!key) {
    throw new Error(
      'Obsidian integration requires OBSIDIAN_API_KEY. Configure it in the Local REST API plugin and mirror it to env.'
    );
  }
  return key;
}

function normalizeVaultPath(p: string): string {
  // Strip a single leading slash so callers can pass either "notes/foo.md" or "/notes/foo.md".
  return p.replace(/^\/+/, '');
}

function applyVaultFolder(notePath: string): string {
  const folder = (process.env.OBSIDIAN_VAULT_FOLDER || '').trim().replace(/[/\\]+$/, '');
  const clean = normalizeVaultPath(notePath);
  if (!folder) return clean;
  return `${folder.replace(/\\/g, '/')}/${clean}`;
}

export async function writeNote(notePath: string, markdown: string): Promise<void> {
  const key = getApiKey();
  const url = `${OBSIDIAN_LOCAL_BASE_URL}/vault/${applyVaultFolder(notePath)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'text/markdown',
      },
      body: markdown,
    });
  } catch (err) {
    throw new Error(
      `Obsidian Local REST unreachable at ${OBSIDIAN_LOCAL_BASE_URL}. ` +
        `Ensure the Local REST API plugin is enabled. ` +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Obsidian writeNote ${res.status} at ${notePath}: ${body.slice(0, 300)}`);
  }
}
