/**
 * Tests for fingerprintPath — the helper that collapses volatile id segments so
 * Sentry groups API 5xx errors by endpoint instead of by Axios's shared native
 * constructor frame (the NODE-9 "construct(native)" mis-grouping).
 */

import { fingerprintPath } from '@/src/services/api';

describe('fingerprintPath', () => {
  it('replaces a UUID path segment with :id', () => {
    expect(fingerprintPath('/api/learning-events/40edf848-eb62-4148-a196-0a8c057007e8'))
      .toBe('/api/learning-events/:id');
  });

  it('replaces numeric id segments with :id', () => {
    expect(fingerprintPath('/api/messages/12345/read')).toBe('/api/messages/:id/read');
  });

  it('strips query strings', () => {
    expect(fingerprintPath('/api/quests?limit=20&offset=40')).toBe('/api/quests');
  });

  it('collapses two different ids of the same route to the same key', () => {
    const a = fingerprintPath('/api/groups/6de133b7-05c7-48c1-a545-1ee168a838d7');
    const b = fingerprintPath('/api/groups/00000000-0000-0000-0000-000000000000');
    expect(a).toBe(b);
    expect(a).toBe('/api/groups/:id');
  });

  it('returns a stable placeholder for missing urls', () => {
    expect(fingerprintPath(undefined)).toBe('unknown');
  });
});
