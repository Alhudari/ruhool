/**
 * Library entity field-mutation guard.
 *
 * Identifiers and relational fields that NO agent (one-shot Librarian or chat
 * Library Agent) is ever allowed to modify via a `propose_cell_value` call —
 * even if the user accepts the proposal. This list is the single source of
 * truth; both `routes/library-matrix.ts` and `routes/library-agent-chat.ts`
 * import it.
 *
 * Adding/removing a key here changes the security posture of every agent path
 * that mutates LibraryEntity records — keep the list tight.
 */
export const IMMUTABLE_TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'archivedAt',
  'links',
  'subNotes',
  'type',
  'zoteroKey',
  'citekey',
  'importSource',
]);
