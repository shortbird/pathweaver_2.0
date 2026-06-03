import { describe, it, expect } from '@jest/globals';
import { normalizeBounty } from '../useBounties';

describe('normalizeBounty deliverables coercion', () => {
  it('returns null for a null bounty', () => {
    expect(normalizeBounty(null)).toBeNull();
  });

  it('keeps an array of deliverables as-is', () => {
    const d = [{ id: 'd1' }, { id: 'd2' }];
    expect(normalizeBounty({ id: 'b1', deliverables: d }).deliverables).toEqual(d);
  });

  it('parses a JSON-string deliverables array (the row that crashed the review screen)', () => {
    const b = normalizeBounty({
      id: 'b1',
      deliverables: '[{"id":"d1","label":"Photo"},{"id":"d2","label":"Log hours"}]',
    });
    expect(Array.isArray(b.deliverables)).toBe(true);
    expect(b.deliverables).toHaveLength(2);
    expect(b.deliverables[0].id).toBe('d1');
  });

  it('falls back to an empty array for malformed or non-array values', () => {
    expect(normalizeBounty({ id: 'b1', deliverables: 'not json' }).deliverables).toEqual([]);
    expect(normalizeBounty({ id: 'b1', deliverables: '{"id":"d1"}' }).deliverables).toEqual([]);
    expect(normalizeBounty({ id: 'b1', deliverables: null }).deliverables).toEqual([]);
    expect(normalizeBounty({ id: 'b1', deliverables: undefined }).deliverables).toEqual([]);
  });
});
