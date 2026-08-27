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

  it('translates the web review-queue submission link to the mobile review screen', () => {
    // Backend bounty-submission notification link (web-shaped).
    const resolved = resolveDeepLink('/bounties?tab=review&bounty=b-1&claim=c-9');
    expect(resolved?.target).toBe('/(app)/bounties/review/b-1');
    expect(resolved?.params?.claim).toBe('c-9');
  });

  it('routes the review queue to the bounties tab when no specific bounty is given', () => {
    // tab=review without a bounty id can't open a per-bounty screen; fall back
    // to the bounties tab rather than a dead route.
    expect(resolveDeepLink('/bounties?tab=review')?.target).toBe('/(app)/(tabs)/bounties');
  });

  it('carries ?claim through the direct /bounties/review/<id> route', () => {
    const resolved = resolveDeepLink('/bounties/review/xyz-999?claim=c-3');
    expect(resolved?.target).toBe('/(app)/bounties/review/xyz-999');
    expect(resolved?.params?.claim).toBe('c-3');
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

  it('falls back to the notifications list for unknown paths (never a dead route)', () => {
    expect(resolveDeepLink('/some/new/route')?.target).toBe('/(app)/notifications');
    expect(resolveDeepLink('/messages/conversation-123')?.target).toBe('/(app)/notifications');
  });

  it('strips query strings before matching tab routes', () => {
    expect(resolveDeepLink('/bounties?tab=active')?.target).toBe('/(app)/(tabs)/bounties');
    expect(resolveDeepLink('/bounties?tab=my-bounties')?.target).toBe('/(app)/(tabs)/bounties');
  });

  it('maps the web communication route to the messages tab AND carries ?user through', () => {
    // The DM push notification links "/communication?user=<sender>". Dropping
    // the param landed carpool-reply taps on the conversation LIST instead of
    // the conversation.
    const resolved = resolveDeepLink('/communication?user=u1');
    expect(resolved?.target).toBe('/(app)/(tabs)/messages');
    expect(resolved?.params?.user).toBe('u1');
    const group = resolveDeepLink('/communication?group=g1');
    expect(group?.target).toBe('/(app)/(tabs)/messages');
    expect(group?.params?.group).toBe('g1');
    // No params object at all for a bare link.
    expect(resolveDeepLink('/communication')?.params).toBeUndefined();
  });

  it('carries ?user on the plain /messages path too', () => {
    expect(resolveDeepLink('/messages?user=u2')?.params?.user).toBe('u2');
  });

  it('maps school links to the mobile School stack', () => {
    expect(resolveDeepLink('/school')?.target).toBe('/(app)/school');
    // /announcements is the legacy web alias for the school page.
    expect(resolveDeepLink('/announcements')?.target).toBe('/(app)/school');
    expect(resolveDeepLink('/absences')?.target).toBe('/(app)/school/absences');
  });

  it('routes /credit-dashboard to view-on-web', () => {
    expect(resolveDeepLink('/credit-dashboard')?.target).toBe('/(app)/view-on-web');
  });

  it('routes SIS console links to view-on-web rather than back to the list', () => {
    // These fell through to the unrecognised-link fallback, which pushes the
    // notifications list. Tapping a notification while already on that list
    // re-renders and opens nothing (iCreate, 2026-08-26: "I can't open any of
    // them. I click on them and they go refresh, sort of.").
    for (const link of ['/forms', '/tasks', '/attendance', '/my-classes', '/billing', '/sis']) {
      expect(resolveDeepLink(link)?.target).toBe('/(app)/view-on-web');
    }
  });

  it('passes already-qualified mobile routes through verbatim', () => {
    expect(resolveDeepLink('/(app)/(tabs)/family?student=s1')?.target).toBe(
      '/(app)/(tabs)/family?student=s1',
    );
  });

  it('resolves parent journal deep links', () => {
    expect(resolveDeepLink('/parent/journal/student-1')?.target).toBe(
      '/(app)/parent/journal/student-1',
    );
  });

  it('keeps the query string in the view-on-web path param', () => {
    const resolved = resolveDeepLink('/quests/q1?task=t1');
    expect(resolved?.target).toBe('/(app)/view-on-web');
    expect(resolved?.params?.path).toBe('/quests/q1?task=t1');
  });
});
