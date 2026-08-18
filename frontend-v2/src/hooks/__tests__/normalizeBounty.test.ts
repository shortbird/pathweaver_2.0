import { describe, it, expect } from '@jest/globals';
import { normalizeBounty } from '../useBounties';

/** normalizeBounty returns `Bounty | null`, and null only for a null input.
 *  Every case below passes a real object, so this satisfies the type AND fails
 *  loudly if that ever stops holding — which a bare `!` would hide. */
function normalized(input: unknown) {
  const b = normalizeBounty(input);
  if (!b) throw new Error('normalizeBounty unexpectedly returned null');
  return b;
}

describe('normalizeBounty deliverables coercion', () => {
  it('returns null for a null bounty', () => {
    expect(normalizeBounty(null)).toBeNull();
  });

  it('keeps an array of deliverables as-is', () => {
    const d = [{ id: 'd1' }, { id: 'd2' }];
    expect(normalized({ id: 'b1', deliverables: d }).deliverables).toEqual(d);
  });

  it('parses a JSON-string deliverables array (the row that crashed the review screen)', () => {
    const b = normalized({
      id: 'b1',
      deliverables: '[{"id":"d1","label":"Photo"},{"id":"d2","label":"Log hours"}]',
    });
    expect(Array.isArray(b.deliverables)).toBe(true);
    expect(b.deliverables).toHaveLength(2);
    expect(b.deliverables[0].id).toBe('d1');
  });

  it('falls back to an empty array for malformed or non-array values', () => {
    expect(normalized({ id: 'b1', deliverables: 'not json' }).deliverables).toEqual([]);
    expect(normalized({ id: 'b1', deliverables: '{"id":"d1"}' }).deliverables).toEqual([]);
    expect(normalized({ id: 'b1', deliverables: null }).deliverables).toEqual([]);
    expect(normalized({ id: 'b1', deliverables: undefined }).deliverables).toEqual([]);
  });
});
