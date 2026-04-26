/**
 * Wave 1 regression: prove the storage backend switch is wired correctly
 * for the new Postgres mode. JSON-file mode is already covered by the rest
 * of the test suite — this file focuses on the new code path.
 *
 * The `postgres` driver is mocked at the module boundary so these tests
 * never hit a real DB. The mock captures the parameters that the tagged-
 * template helper would have sent, so we can assert on the shape of the
 * request without standing up Postgres.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface CapturedQuery { strings: TemplateStringsArray; values: unknown[] }
const capturedQueries: CapturedQuery[] = [];
const mockSelectResult: { value: unknown[] } = { value: [] };

vi.mock('postgres', () => {
  // Tagged-template fake: `sql\`...\`` records the call and resolves with the
  // queued mock result. `sql.json(v)` returns a sentinel we can recognize.
  const factory = vi.fn(() => {
    const fn = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      capturedQueries.push({ strings, values });
      return Promise.resolve(mockSelectResult.value);
    }) as unknown as {
      json: (v: unknown) => { __json: unknown };
      end: () => Promise<void>;
    };
    fn.json = (v: unknown) => ({ __json: v });
    fn.end = vi.fn().mockResolvedValue(undefined);
    return fn;
  });
  return { default: factory };
});

const { initializeStore, getStore, saveStore, _resetStoreForTests } = await import('./index.js');

function makeProvider(over: Record<string, unknown> = {}) {
  return {
    id: 'p1', type: 'anthropic', enabled: true, displayName: 'Anthropic',
    apiKey: '', baseUrl: '', defaultModel: 'claude-sonnet-4-6',
    status: 'unknown', costPerMillion: 0, lastTestAt: null,
    ...over,
  } as never;
}

describe('Wave 1: Postgres backend wiring', () => {
  beforeEach(() => {
    _resetStoreForTests();
    capturedQueries.length = 0;
    mockSelectResult.value = [];
    process.env.STORE_BACKEND = 'postgres';
    process.env.DATABASE_URL = 'postgresql://fake@localhost/ruhool';
  });

  afterEach(() => {
    delete process.env.STORE_BACKEND;
    delete process.env.DATABASE_URL;
    _resetStoreForTests();
  });

  it('initializeStore SELECTs from app_state and populates the singleton', async () => {
    mockSelectResult.value = [{ data: { providers: [makeProvider({ id: 'p2' })] } }];
    await initializeStore();
    const store = getStore();
    expect(store.providers).toHaveLength(1);
    expect(store.providers[0].id).toBe('p2');
    expect(capturedQueries[0].strings.join('?')).toMatch(/SELECT data FROM app_state/);
  });

  it('initializeStore handles empty DB (no row) by starting from emptyStore', async () => {
    mockSelectResult.value = [];
    await initializeStore();
    const store = getStore();
    expect(store.providers).toEqual([]);
    expect(store.tasks).toEqual([]);
  });

  it('saveStore UPSERTs to the DB', async () => {
    mockSelectResult.value = [];
    await initializeStore();
    const store = getStore();
    store.providers = [makeProvider({ id: 'p3' })];
    capturedQueries.length = 0; // ignore the migration-flush write from init
    await saveStore();
    const upsert = capturedQueries[0];
    const sqlText = upsert.strings.join('?');
    expect(sqlText).toMatch(/INSERT INTO app_state/);
    expect(sqlText).toMatch(/ON CONFLICT/);
    const jsonArg = upsert.values[1] as { __json: { providers: { id: string }[] } };
    expect(jsonArg.__json.providers[0].id).toBe('p3');
  });

  it('getStore without initializeStore throws clearly', () => {
    _resetStoreForTests();
    expect(() => getStore()).toThrow(/initializeStore/i);
  });

  it('encrypts provider apiKey before persisting to DB', async () => {
    mockSelectResult.value = [];
    await initializeStore();
    const store = getStore();
    store.providers = [makeProvider({ id: 'p4', apiKey: 'sk-secret-xyz' })];
    capturedQueries.length = 0; // ignore the migration-flush write from init
    await saveStore();
    const jsonArg = capturedQueries[0].values[1] as { __json: { providers: { apiKey: string }[] } };
    const persistedKey = jsonArg.__json.providers[0].apiKey;
    expect(persistedKey.startsWith('enc:v1:')).toBe(true);
    expect(persistedKey).not.toContain('sk-secret-xyz');
  });

  it('M3: concurrent initializeStore() calls share one DB load (no race)', async () => {
    mockSelectResult.value = [];
    // Fire two concurrent inits before either resolves.
    const [a, b] = await Promise.all([initializeStore(), initializeStore()]);
    expect(a).toBeUndefined();
    expect(b).toBeUndefined();
    // Only ONE SELECT should have hit the DB (plus possibly one UPSERT from
    // the migration flush — but never two SELECTs).
    const selects = capturedQueries.filter((q) => q.strings.join('?').match(/SELECT data FROM app_state/));
    expect(selects).toHaveLength(1);
  });

  it('M7: migrations applied during init are flushed to DB immediately', async () => {
    // Empty DB → migrations always run on first load (schemaVersion gets stamped).
    mockSelectResult.value = [];
    await initializeStore();
    // The flush should have produced an UPSERT during init, not waited for
    // the next user-triggered save.
    const upserts = capturedQueries.filter((q) => q.strings.join('?').match(/INSERT INTO app_state/));
    expect(upserts.length).toBeGreaterThanOrEqual(1);
  });

  it('decrypts provider apiKey on initial load from DB', async () => {
    const { encryptSecret } = await import('./encryption.js');
    const ciphertext = encryptSecret('sk-real-key');
    mockSelectResult.value = [{
      data: { providers: [makeProvider({ id: 'p5', apiKey: ciphertext })] },
    }];
    await initializeStore();
    const store = getStore();
    expect(store.providers[0].apiKey).toBe('sk-real-key');
  });
});
