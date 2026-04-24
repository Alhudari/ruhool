# Zotero + Obsidian Setup — 10 min

Connect Shwasha to your Zotero library and Obsidian vault.
No code changes. Follow top to bottom.

## Zotero — 5 min

1. Install Zotero 7: https://www.zotero.org/download/
2. Open Zotero → `Edit` → `Preferences` → `Advanced` → `Config Editor` → accept the warning.
3. Search `extensions.zotero.httpServer.enabled` and set it to **true** (double-click to toggle).
4. **Restart Zotero** (File → Quit, then reopen).
5. Test in Ruhool: Settings → Shwasha → Integrations → click **Test** on the Zotero row. Expect `[OK]`.

### Finding an item key

- Right-click any paper in Zotero → `Show in Library` (if it's in a search/collection view).
- Open the info pane on the right. The 8-character key (e.g. `ABCD1234`) is shown under **Info** or in the URL when you double-click the item.
- Paste the key into Shwasha's Zotero source form.

### What Ruhool does on save

- **Highlights** → annotations injected into the PDF attachment (travels with the PDF).
- **Tags** → added to the parent item.
- **Note** → one child note on the parent item with the full Shwasha markdown summary.

## Obsidian — 5 min

1. Install Obsidian: https://obsidian.md/
2. Open your vault → `Settings` → `Community plugins` → `Browse`.
3. Search **"Local REST API"** by **Adam Coddington**. Install → Enable.
4. In the plugin settings:
   - Copy the **API Key**.
   - Note the **HTTP port** (default `27123`). Prefer HTTP over HTTPS for localhost.
5. Add to `C:\Users\alhud\platform\apps\api\.env`:

   ```
   OBSIDIAN_API_KEY=paste-here
   OBSIDIAN_LOCAL_URL=http://localhost:27123
   OBSIDIAN_VAULT_FOLDER=References/Shwasha
   ```

   `OBSIDIAN_VAULT_FOLDER` is optional. If omitted, notes land in the vault root.

6. **Restart the Ruhool API** (kill the running process, then `pnpm dev` from the repo root). Env vars are read at boot.
7. Test in Ruhool: Settings → Shwasha → Integrations → click **Test** on the Obsidian row. Expect `[OK]`.

## Troubleshooting

| Problem | Fix |
|---|---|
| Zotero test fails | Confirm Zotero is open, port `23119` is free, the `httpServer.enabled` pref is `true`, and you restarted Zotero after flipping it. |
| Obsidian test fails | Plugin enabled? Use HTTP `27123` (not HTTPS `27124`) unless you configured TLS. Confirm the API key was pasted in full, no surrounding quotes. |
| "No PDF attachment found" on save | Attach the paper's PDF to the Zotero item first — annotations must live on a PDF attachment child, not the parent item. |
| Env change had no effect | Restart the API. `.env` is only read at boot. |

## What happens next

When you hit **Save** on a Shwasha session:
highlights go to Zotero annotations (attached to the PDF, so they travel with the file into Zotero's reader), a single markdown note is written to your Obsidian vault (under `OBSIDIAN_VAULT_FOLDER` if set), and tags land on the parent Zotero item. The Obsidian note and the Zotero annotations both reference the same Shwasha session — giving you a clean round-trip between reading, annotating, and writing.
