/**
 * Parser + executor tests for [REPORT:*] chat intents.
 */
import { describe, it, expect, vi } from 'vitest';
import { parseReportActions, executeReportActions } from './report-actions.js';
import type { StoreData, ReportDefinition } from '../../store/types.js';

function makeStore(reports: ReportDefinition[] = []): StoreData {
  return { reports } as unknown as StoreData;
}

const sampleReport = (overrides: Partial<ReportDefinition> = {}): ReportDefinition => ({
  id: 'rep-1',
  name: 'التقرير اليومي التنفيذي',
  prompt: 'write a daily report',
  signedBy: 'architect',
  schedule: { type: 'daily', hour: 22, minute: 0, timezone: 'Asia/Kuwait' },
  recipients: [],
  enabled: true,
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
  ...overrides,
});

describe('parseReportActions', () => {
  it('extracts CREATE with JSON blob', () => {
    const input = `بلاش قصص — عملتها لك:
[REPORT:CREATE] {"name":"تقرير الأحد","prompt":"اكتب عن تقدّم الدكتوراة","signedBy":"manager","schedule":{"type":"weekly","dayOfWeek":0,"hour":9,"minute":0,"timezone":"Asia/Kuwait"}}`;
    const actions = parseReportActions(input);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('create');
    if (actions[0].type === 'create') {
      expect(actions[0].data.name).toBe('تقرير الأحد');
    }
  });

  it('extracts UPDATE with id and data', () => {
    const input = `[REPORT:UPDATE:rep-1] {"enabled":false}`;
    const actions = parseReportActions(input);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: 'update', id: 'rep-1' });
  });

  it('extracts TOGGLE, SEND, DELETE by id', () => {
    const input = `[REPORT:TOGGLE:rep-1] [REPORT:SEND:rep-2] [REPORT:DELETE:rep-3]`;
    const actions = parseReportActions(input);
    expect(actions).toHaveLength(3);
    expect(actions.map((a) => a.type)).toEqual(['delete', 'send', 'toggle']);
    // DELETE / SEND / TOGGLE can appear in any regex order — just check the set.
    const ids = actions.map((a) => 'id' in a ? a.id : null);
    expect(ids).toEqual(expect.arrayContaining(['rep-1', 'rep-2', 'rep-3']));
  });

  it('skips malformed JSON silently', () => {
    const input = `[REPORT:CREATE] {not json}`;
    expect(parseReportActions(input)).toEqual([]);
  });

  it('returns empty when no markers present', () => {
    expect(parseReportActions('just a normal reply')).toEqual([]);
  });

  it('extracts FEEDBACK from trailing plain text', () => {
    const input = `نوّعلك:
[REPORT:FEEDBACK:daily] اجعلها أقصر، لا تذكر الميزانية`;
    const actions = parseReportActions(input);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: 'feedback', id: 'daily', text: 'اجعلها أقصر، لا تذكر الميزانية' });
  });

  it('extracts FEEDBACK from trailing JSON', () => {
    const input = `[REPORT:FEEDBACK:daily] {"text":"أضف توصية لبكرة دائماً","addedBy":"user"}`;
    const actions = parseReportActions(input);
    expect(actions).toHaveLength(1);
    if (actions[0].type === 'feedback') {
      expect(actions[0].text).toBe('أضف توصية لبكرة دائماً');
      expect(actions[0].addedBy).toBe('user');
    }
  });

  it('extracts multiple CREATE markers', () => {
    const input = `
[REPORT:CREATE] {"name":"A","prompt":"p","signedBy":"architect","schedule":{"type":"daily","hour":8,"minute":0,"timezone":"Asia/Kuwait"}}
[REPORT:CREATE] {"name":"B","prompt":"p","signedBy":"doctor","schedule":{"type":"manual"}}
`;
    expect(parseReportActions(input)).toHaveLength(2);
  });
});

describe('executeReportActions', () => {
  it('creates a new report with generated id + nextRunAt', () => {
    const store = makeStore();
    const saveStore = vi.fn();
    const results = executeReportActions(
      [{
        type: 'create',
        data: {
          name: 'daily',
          prompt: 'p',
          signedBy: 'architect',
          schedule: { type: 'daily', hour: 8, minute: 0, timezone: 'Asia/Kuwait' },
          recipients: [],
          enabled: true,
        },
      }],
      { getStore: () => store, saveStore },
    );
    expect(store.reports).toHaveLength(1);
    expect(store.reports![0].id).toBeTruthy();
    expect(store.reports![0].nextRunAt).toBeTruthy();
    expect(saveStore).toHaveBeenCalled();
    expect(results[0]).toMatchObject({ action: 'create', name: 'daily' });
  });

  it('rejects CREATE missing required fields', () => {
    const store = makeStore();
    const saveStore = vi.fn();
    const results = executeReportActions(
      [{ type: 'create', data: { name: 'incomplete' } }],
      { getStore: () => store, saveStore },
    );
    expect(store.reports).toHaveLength(0);
    expect(saveStore).not.toHaveBeenCalled();
    expect(results[0].error).toMatch(/missing/);
  });

  it('UPDATE by exact id', () => {
    const r = sampleReport();
    const store = makeStore([r]);
    const saveStore = vi.fn();
    executeReportActions(
      [{ type: 'update', id: 'rep-1', data: { enabled: false } }],
      { getStore: () => store, saveStore },
    );
    expect(store.reports![0].enabled).toBe(false);
    expect(saveStore).toHaveBeenCalled();
  });

  it('UPDATE by case-insensitive name fallback', () => {
    const r = sampleReport();
    const store = makeStore([r]);
    const saveStore = vi.fn();
    executeReportActions(
      [{ type: 'update', id: 'التقرير اليومي التنفيذي', data: { enabled: false } }],
      { getStore: () => store, saveStore },
    );
    expect(store.reports![0].enabled).toBe(false);
  });

  it('UPDATE with unknown id returns error, does not mutate', () => {
    const r = sampleReport();
    const store = makeStore([r]);
    const saveStore = vi.fn();
    const results = executeReportActions(
      [{ type: 'update', id: 'nope', data: { enabled: false } }],
      { getStore: () => store, saveStore },
    );
    expect(store.reports![0].enabled).toBe(true);
    expect(saveStore).not.toHaveBeenCalled();
    expect(results[0].error).toMatch(/not found/);
  });

  it('TOGGLE flips enabled', () => {
    const r = sampleReport({ enabled: true });
    const store = makeStore([r]);
    const saveStore = vi.fn();
    executeReportActions(
      [{ type: 'toggle', id: 'rep-1' }],
      { getStore: () => store, saveStore },
    );
    expect(store.reports![0].enabled).toBe(false);
  });

  it('DELETE removes from list', () => {
    const r = sampleReport();
    const store = makeStore([r]);
    const saveStore = vi.fn();
    executeReportActions(
      [{ type: 'delete', id: 'rep-1' }],
      { getStore: () => store, saveStore },
    );
    expect(store.reports).toHaveLength(0);
  });

  it('SEND invokes sendReport dep and logs the result', async () => {
    const r = sampleReport();
    const store = makeStore([r]);
    const saveStore = vi.fn();
    const sendReport = vi.fn().mockResolvedValue(undefined);
    const results = executeReportActions(
      [{ type: 'send', id: 'rep-1' }],
      { getStore: () => store, saveStore, sendReport },
    );
    // Settle the fire-and-forget microtask.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sendReport).toHaveBeenCalledWith('rep-1');
    expect(results[0]).toMatchObject({ action: 'send', id: 'rep-1' });
  });

  it('FEEDBACK appends an active entry with generated id + createdAt', () => {
    const r = sampleReport();
    const store = makeStore([r]);
    const saveStore = vi.fn();
    executeReportActions(
      [{ type: 'feedback', id: 'rep-1', text: 'اجعلها أقصر', addedBy: 'user' }],
      { getStore: () => store, saveStore },
    );
    expect(store.reports![0].feedback).toHaveLength(1);
    const fb = store.reports![0].feedback![0];
    expect(fb.text).toBe('اجعلها أقصر');
    expect(fb.active).toBe(true);
    expect(fb.source).toBe('chat');
    expect(fb.addedBy).toBe('user');
    expect(saveStore).toHaveBeenCalled();
  });

  it('empty actions → no-op, no save', () => {
    const store = makeStore();
    const saveStore = vi.fn();
    executeReportActions([], { getStore: () => store, saveStore });
    expect(saveStore).not.toHaveBeenCalled();
  });
});
