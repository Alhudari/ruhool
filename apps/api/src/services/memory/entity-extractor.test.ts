import { describe, it, expect } from 'vitest';
import { extractEntities } from './entity-extractor.js';

describe('extractEntities', () => {
  it('extracts quoted paper titles', () => {
    const text = 'قرأت ورقة "BIM Adoption in Kuwait: Barriers and Opportunities" وهي مميزة';
    const entities = extractEntities(text);
    expect(entities.some(e => e.type === 'paper' && e.name.includes('BIM Adoption'))).toBe(true);
  });

  it('extracts decision markers', () => {
    const text = 'قررنا استخدام منهج الدراسة الكيفية للبحث';
    const entities = extractEntities(text);
    expect(entities.some(e => e.type === 'decision')).toBe(true);
  });

  it('extracts concept in parentheses', () => {
    const text = 'نستخدم نموذج (Technology Acceptance) في البحث';
    const entities = extractEntities(text);
    expect(entities.some(e => e.type === 'concept')).toBe(true);
  });

  it('returns empty for short text', () => {
    const entities = extractEntities('مرحبا');
    expect(entities).toHaveLength(0);
  });

  it('limits to 12 entities max', () => {
    const text = Array.from({ length: 20 }, (_, i) => `"Paper Title Number ${i + 1} With More Words Here"`).join(' ');
    const entities = extractEntities(text);
    expect(entities.length).toBeLessThanOrEqual(12);
  });

  it('deduplicates same entities', () => {
    const text = '"Shared Paper Title Here" mentioned again "Shared Paper Title Here"';
    const entities = extractEntities(text);
    const paperCount = entities.filter(e => e.name === 'Shared Paper Title Here').length;
    expect(paperCount).toBe(1);
  });
});
