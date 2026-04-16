/**
 * Specialist identity tests — locks in the Week-1 canonical rename so that
 * dispatching with `manager` names الراعي and dispatching with `architect`
 * names المصمم.
 */
import { describe, it, expect } from 'vitest';
import { getSpecialistIdentity, getSpecialistDisplayName } from './specialists.js';

describe('getSpecialistIdentity — canonical rename', () => {
  it('resolves manager → الراعي', () => {
    const identity = getSpecialistIdentity('manager');
    expect(identity.arabic).toBe('الراعي');
    expect(identity.transliteration).toBe("Al-Ra'i");
  });

  it('resolves architect → المصمم', () => {
    const identity = getSpecialistIdentity('architect');
    expect(identity.arabic).toBe('المصمم');
    expect(identity.transliteration).toBe('Al-Musammim');
  });

  it('resolves Arabic keys to themselves', () => {
    expect(getSpecialistIdentity('الراعي').arabic).toBe('الراعي');
    expect(getSpecialistIdentity('المصمم').arabic).toBe('المصمم');
  });

  it('getSpecialistDisplayName returns the Arabic display name', () => {
    expect(getSpecialistDisplayName('manager')).toBe('الراعي');
    expect(getSpecialistDisplayName('architect')).toBe('المصمم');
    expect(getSpecialistDisplayName('research')).toBe('عبدان');
  });

  it('falls back to the input string for unknown specialists', () => {
    expect(getSpecialistIdentity('unknown-agent').arabic).toBe('unknown-agent');
  });
});
