/**
 * Schedule math tests — locks computeNextRunAt behavior across
 * daily/weekly/monthly, timezone wrap-around, and edge cases.
 */
import { describe, it, expect } from 'vitest';
import { computeNextRunAt, describeSchedule } from './schedule.js';

describe('computeNextRunAt — daily', () => {
  it('advances to today if target time is later today (Asia/Kuwait)', () => {
    // Fixed instant: 2026-06-01 12:00 UTC → 15:00 Kuwait (UTC+3).
    const after = new Date('2026-06-01T12:00:00Z');
    const next = computeNextRunAt({ type: 'daily', hour: 22, minute: 0, timezone: 'Asia/Kuwait' }, after)!;
    // Expect 2026-06-01 22:00 Kuwait → 2026-06-01 19:00 UTC.
    expect(next).toBe('2026-06-01T19:00:00.000Z');
  });

  it('rolls over to tomorrow when target already passed today', () => {
    const after = new Date('2026-06-01T20:00:00Z'); // 23:00 Kuwait
    const next = computeNextRunAt({ type: 'daily', hour: 22, minute: 0, timezone: 'Asia/Kuwait' }, after)!;
    // Next run is 2026-06-02 22:00 Kuwait → 2026-06-02 19:00 UTC.
    expect(next).toBe('2026-06-02T19:00:00.000Z');
  });

  it('handles minute precision', () => {
    const after = new Date('2026-06-01T05:00:00Z'); // 08:00 Kuwait
    const next = computeNextRunAt({ type: 'daily', hour: 8, minute: 30, timezone: 'Asia/Kuwait' }, after)!;
    expect(next).toBe('2026-06-01T05:30:00.000Z');
  });
});

describe('computeNextRunAt — weekly', () => {
  it('fires this week when target DOW is later this week', () => {
    // 2026-06-01 is a Monday. dayOfWeek 3 = Wednesday (2026-06-03).
    const after = new Date('2026-06-01T10:00:00Z');
    const next = computeNextRunAt({ type: 'weekly', dayOfWeek: 3, hour: 10, minute: 0, timezone: 'Asia/Kuwait' }, after)!;
    // 2026-06-03 10:00 Kuwait → 07:00 UTC.
    expect(next).toBe('2026-06-03T07:00:00.000Z');
  });

  it('wraps to next week when target DOW is earlier in week', () => {
    // 2026-06-03 Wed → want dayOfWeek 1 (Monday). Next Monday = 2026-06-08.
    const after = new Date('2026-06-03T10:00:00Z');
    const next = computeNextRunAt({ type: 'weekly', dayOfWeek: 1, hour: 9, minute: 0, timezone: 'Asia/Kuwait' }, after)!;
    expect(next).toBe('2026-06-08T06:00:00.000Z');
  });

  it('when today is the target DOW but time has passed → next week', () => {
    // 2026-06-01 Monday 20:00 UTC = 23:00 Kuwait. Want Monday 09:00 Kuwait.
    const after = new Date('2026-06-01T20:00:00Z');
    const next = computeNextRunAt({ type: 'weekly', dayOfWeek: 1, hour: 9, minute: 0, timezone: 'Asia/Kuwait' }, after)!;
    // Next Monday = 2026-06-08 09:00 Kuwait → 06:00 UTC.
    expect(next).toBe('2026-06-08T06:00:00.000Z');
  });

  it('when today is target DOW and time still ahead → today', () => {
    const after = new Date('2026-06-01T05:00:00Z'); // 08:00 Kuwait Monday
    const next = computeNextRunAt({ type: 'weekly', dayOfWeek: 1, hour: 22, minute: 0, timezone: 'Asia/Kuwait' }, after)!;
    expect(next).toBe('2026-06-01T19:00:00.000Z');
  });
});

describe('computeNextRunAt — monthly', () => {
  it('fires this month when target day is later', () => {
    const after = new Date('2026-06-01T10:00:00Z');
    const next = computeNextRunAt({ type: 'monthly', dayOfMonth: 15, hour: 10, minute: 0, timezone: 'Asia/Kuwait' }, after)!;
    expect(next).toBe('2026-06-15T07:00:00.000Z');
  });

  it('rolls to next month when target day already passed', () => {
    const after = new Date('2026-06-20T10:00:00Z');
    const next = computeNextRunAt({ type: 'monthly', dayOfMonth: 15, hour: 10, minute: 0, timezone: 'Asia/Kuwait' }, after)!;
    expect(next).toBe('2026-07-15T07:00:00.000Z');
  });

  it('caps dayOfMonth at 28 to avoid Feb edge cases', () => {
    const after = new Date('2026-01-20T10:00:00Z');
    const next = computeNextRunAt({ type: 'monthly', dayOfMonth: 31, hour: 10, minute: 0, timezone: 'Asia/Kuwait' }, after)!;
    // Should be 2026-01-28 not 2026-01-31.
    expect(next.startsWith('2026-01-28')).toBe(true);
  });
});

describe('computeNextRunAt — once + manual', () => {
  it('returns the ISO for once schedules in the future', () => {
    const after = new Date('2026-06-01T00:00:00Z');
    const next = computeNextRunAt({ type: 'once', at: '2026-06-15T10:00:00.000Z' }, after);
    expect(next).toBe('2026-06-15T10:00:00.000Z');
  });

  it('returns null for once schedules already passed', () => {
    const after = new Date('2026-06-01T00:00:00Z');
    const next = computeNextRunAt({ type: 'once', at: '2026-05-15T10:00:00.000Z' }, after);
    expect(next).toBeNull();
  });

  it('returns null for manual schedules', () => {
    expect(computeNextRunAt({ type: 'manual' }, new Date())).toBeNull();
  });
});

describe('describeSchedule', () => {
  it('describes daily in Arabic', () => {
    expect(describeSchedule({ type: 'daily', hour: 9, minute: 30, timezone: 'Asia/Kuwait' })).toMatch(/يومياً.*09:30/);
  });

  it('describes weekly with day name', () => {
    expect(describeSchedule({ type: 'weekly', dayOfWeek: 1, hour: 10, minute: 0, timezone: 'Asia/Kuwait' })).toMatch(/الاثنين/);
  });

  it('handles manual', () => {
    expect(describeSchedule({ type: 'manual' })).toMatch(/يدوي/);
  });
});
