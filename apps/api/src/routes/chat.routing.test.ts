/**
 * Routing regression tests — 2026-04-15.
 *
 * Two production bugs reported by Abdullah:
 *   1. First message in a fresh conversation appeared to be dropped (frontend
 *      navigation race — tested with a UI/E2E pattern, this file covers the
 *      server-side contract only: first message in a fresh conv → response
 *      chunk stream yields a 'conversation' event + the user message is
 *      persisted).
 *   2. "@الراعي ..." messages routed to المصمم (architect) because the word
 *      "الراعي" lived in `architectKeywords` inside `detectIntent`.
 *
 * The routing test here locks intent detection + mention detection so neither
 * bug can recur silently.
 */
import { describe, it, expect } from 'vitest';
import { detectIntent } from './chat.js';
import { detectMention } from '../services/chat/mention.js';

describe('detectIntent — الراعي must never map to architect', () => {
  it('returns manager (not architect) when message is the bare name الراعي', () => {
    expect(detectIntent('الراعي')).toBe('manager');
  });

  it('returns manager for الراعي with surrounding words', () => {
    expect(detectIntent('الراعي عرّفوا بعضكم في 3 جولات')).toBe('manager');
  });

  it('ALWAYS returns manager post-2026-04-15 redesign — no keyword reroutes', () => {
    // Pre-redesign, these messages used to reroute to specialists via keyword
    // matching. The WhatsApp-group redesign removes all keyword-based intent
    // shortcuts: الراعي is the sole default and delegates via tool_use.
    expect(detectIntent('أنشئ وكيل جديد')).toBe('manager');
    expect(detectIntent('create agent please')).toBe('manager');
    expect(detectIntent('ابحث عن BIM')).toBe('manager');
    expect(detectIntent('قارن بين الخيارات')).toBe('manager');
    expect(detectIntent('اكتب لي مسودة')).toBe('manager');
    expect(detectIntent('video idea please')).toBe('manager');
  });

  it('falls back to manager for a plain greeting', () => {
    expect(detectIntent('مرحبا')).toBe('manager');
  });
});

describe('detectMention — @الراعي canonical routing', () => {
  it('routes @الراعي to manager', () => {
    const out = detectMention('@الراعي مرحبا', []);
    expect(out.agentId).toBe('manager');
  });

  it('routes @الراعي in the middle of a sentence to manager', () => {
    const out = detectMention('هلا @الراعي كيف الحال', []);
    expect(out.agentId).toBe('manager');
  });

  it('routes @المصمم to architect (unchanged)', () => {
    const out = detectMention('@المصمم عدّل الباحث', []);
    expect(out.agentId).toBe('architect');
  });

  it('returns null for concatenated أنتالراعي (no @, no space) — falls through to detectIntent', () => {
    // This is an edge the user hit: Arabic users sometimes omit the space between
    // a pronoun and the addressee. Without @ the mention detector returns null;
    // routing must then fall through to detectIntent which, post-fix, still
    // correctly routes to manager because الراعي is no longer an architect keyword.
    const out = detectMention('أنتالراعي عرّف نفسك', []);
    expect(out.agentId).toBeNull();
    // And the intent fallback must route to manager, not architect.
    expect(detectIntent('أنتالراعي عرّف نفسك')).toBe('manager');
  });
});
