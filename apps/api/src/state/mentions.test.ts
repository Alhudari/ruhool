/**
 * MENTION_MAP sanity tests.
 *
 * Locks in the Week-1 canonical rename:
 *   - الراعي  → manager
 *   - المصمم  → architect
 *   - الرحول  → manager (legacy alias; platform-name reuse)
 *
 * These assertions are the specific regressions that caused the earlier
 * inversion where "@الراعي" routed to the architect.
 */
import { describe, it, expect } from 'vitest';
import { MENTION_MAP } from './mentions.js';

describe('MENTION_MAP — canonical rename', () => {
  it('routes الراعي to manager', () => {
    expect(MENTION_MAP['الراعي']).toBe('manager');
  });

  it('routes المصمم to architect', () => {
    expect(MENTION_MAP['المصمم']).toBe('architect');
  });

  it('keeps الرحول as a legacy alias for manager', () => {
    expect(MENTION_MAP['الرحول']).toBe('manager');
  });

  it('routes Latin transliterations to the right agents', () => {
    expect(MENTION_MAP["al-ra'i"]).toBe('manager');
    expect(MENTION_MAP['alrai']).toBe('manager');
    expect(MENTION_MAP['al-rai']).toBe('manager');
    expect(MENTION_MAP['al-musammim']).toBe('architect');
    expect(MENTION_MAP['almusammim']).toBe('architect');
    expect(MENTION_MAP['ruhool']).toBe('manager');
  });

  it('never maps الراعي to architect (regression guard)', () => {
    expect(MENTION_MAP['الراعي']).not.toBe('architect');
  });

  it('never maps المصمم to manager (regression guard)', () => {
    expect(MENTION_MAP['المصمم']).not.toBe('manager');
  });
});
