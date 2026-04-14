import { describe, it, expect } from '@jest/globals';
import { resolveDeepLink } from '../deepLinkRouter';

describe('resolveDeepLink', () => {
  it('returns null for empty input', () => {
    expect(resolveDeepLink(null)).toBeNull();
    expect(resolveDeepLink(undefined)).toBeNull();
    expect(resolveDeepLink('')).toBeNull();
  });

  it('prepends slash when missing', () => {
    expect(resolveDeepLink('feed')?.target).toBe('/(app)/(tabs)/feed');
  });

  it('maps legacy parent-dashboard to family tab', () => {
    expect(resolveDeepLink('/parent-dashboard')?.target).toBe('/(app)/(tabs)/family');
  });

  it('maps observer legacy routes to feed tab', () => {
    expect(resolveDeepLink('/feedback')?.target).toBe('/(app)/(tabs)/feed');
    expect(resolveDeepLink('/connections')?.target).toBe('/(app)/(tabs)/feed');
    expect(resolveDeepLink('/observer/feed')?.target).toBe('/(app)/(tabs)/feed');
  });

  it('maps main tab paths', () => {
    expect(resolveDeepLink('/journal')?.target).toBe('/(app)/(tabs)/journal');
    expect(resolveDeepLink('/bounties')?.target).toBe('/(app)/(tabs)/bounties');
    expect(resolveDeepLink('/messages')?.target).toBe('/(app)/(tabs)/messages');
    expect(resolveDeepLink('/profile')?.target).toBe('/(app)/(tabs)/profile');
  });

  it('resolves dynamic bounty detail and review routes', () => {
    expect(resolveDeepLink('/bounties/abc-123')?.target).toBe('/(app)/bounties/abc-123');
    expect(resolveDeepLink('/bounties/review/xyz-999')?.target).toBe('/(app)/bounties/review/xyz-999');
  });

  it('routes web-only prefixes to view-on-web with params', () => {
    const resolved = resolveDeepLink('/quests/quest-id');
    expect(resolved?.target).toBe('/(app)/view-on-web');
    expect(resolved?.params?.path).toBe('/quests/quest-id');
    expect(resolved?.params?.label).toBe('Quests');
  });

  it('routes /courses, /admin, /advisor, /dashboard to view-on-web', () => {
    expect(resolveDeepLink('/courses')?.target).toBe('/(app)/view-on-web');
    expect(resolveDeepLink('/admin/users')?.target).toBe('/(app)/view-on-web');
    expect(resolveDeepLink('/advisor')?.target).toBe('/(app)/view-on-web');
    expect(resolveDeepLink('/dashboard')?.target).toBe('/(app)/view-on-web');
  });

  it('routes /invitations to view-on-web', () => {
    const resolved = resolveDeepLink('/invitations');
    expect(resolved?.target).toBe('/(app)/view-on-web');
    expect(resolved?.params?.label).toBe('Quest invitations');
  });

  it('passes unknown paths through under (app) group', () => {
    expect(resolveDeepLink('/some/new/route')?.target).toBe('/(app)/some/new/route');
  });
});
