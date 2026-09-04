import { describe, it, expect } from '@jest/globals';
import { resolveDeepLink, isSisSurfacePath } from '../deepLinkRouter';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

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
    // Sub-paths of /connections are the same web surface — approvals links
    // used to fall through to the notifications-list fallback.
    expect(resolveDeepLink('/connections/approvals')?.target).toBe('/(app)/(tabs)/feed');
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
    const resolved = resolveDeepLink('/courses/course-id');
    expect(resolved?.target).toBe('/(app)/view-on-web');
    expect(resolved?.params?.path).toBe('/courses/course-id');
    expect(resolved?.params?.label).toBe('Courses');
  });

  it('routes quest links to the mobile quest screens, not view-on-web', () => {
    // Mobile HAS quest screens (app/(app)/(tabs)/quests.tsx and
    // app/(app)/quests/[id].tsx) — these were wrongly treated web-only.
    expect(resolveDeepLink('/quests')?.target).toBe('/(app)/(tabs)/quests');
    expect(resolveDeepLink('/quests/abc-123')?.target).toBe('/(app)/quests/abc-123');
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

  it('routes the family portal and the other missed SIS surfaces to view-on-web', () => {
    // The most common SIS-org notification links (onboarding + signature
    // reminders) point at the family portal; these all fell through to the
    // notifications-list fallback before.
    const portal = resolveDeepLink('/family/portal');
    expect(portal?.target).toBe('/(app)/view-on-web');
    expect(portal?.params?.path).toBe('/family/portal');
    expect(portal?.params?.label).toBe('The family portal');
    for (const link of ['/family/required-documents', '/time', '/treehouse/facilitator', '/credit-review']) {
      expect(resolveDeepLink(link)?.target).toBe('/(app)/view-on-web');
    }
  });

  it('routes the observer accept link to the ?code= screen, not a dead path segment', () => {
    // The mobile screen is app/(app)/observers/accept.tsx taking ?code= —
    // there is no accept/[code].tsx, so the old path-segment target 404'd.
    const resolved = resolveDeepLink('/observer/accept/xyz');
    expect(resolved?.target).toBe('/(app)/observers/accept');
    expect(resolved?.params?.code).toBe('xyz');
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
    const resolved = resolveDeepLink('/courses/c1?lesson=l1');
    expect(resolved?.target).toBe('/(app)/view-on-web');
    expect(resolved?.params?.path).toBe('/courses/c1?lesson=l1');
  });
});

describe('which web host a handoff points at', () => {
  // An iCreate campus coordinator could not open her message notifications
  // (2026-09-03). They link "/inbox", which is a SIS console route, but the
  // view-on-web screen glued every handoff onto www.optioeducation.com — a
  // host whose router has never served /inbox. Her bell is almost entirely
  // /inbox and /attendance, so this was most of her notifications.
  it('sends SIS console paths to the SIS host', () => {
    const inbox = resolveDeepLink('/inbox');
    expect(inbox?.target).toBe('/(app)/view-on-web');
    expect(inbox?.params?.surface).toBe('sis');
    expect(inbox?.params?.label).toBe('The school inbox');

    expect(resolveDeepLink('/attendance')?.params?.surface).toBe('sis');
    expect(resolveDeepLink('/timesheets')?.params?.surface).toBe('sis');
    expect(resolveDeepLink('/people/staff')?.params?.surface).toBe('sis');
  });

  it('keeps learning-app paths on the www host', () => {
    expect(resolveDeepLink('/dashboard')?.params?.surface).toBe('learning');
    expect(resolveDeepLink('/courses')?.params?.surface).toBe('learning');
    // The family portal is family-facing: it lives on www, not the staff console.
    expect(resolveDeepLink('/family/portal')?.params?.surface).toBe('learning');
    expect(resolveDeepLink('/credit-dashboard')?.params?.surface).toBe('learning');
  });

  it('does not let /time shadow /timesheets', () => {
    expect(resolveDeepLink('/time')?.params?.label).toBe('Your time entries');
    expect(resolveDeepLink('/timesheets')?.params?.label).toBe('Timesheets');
  });

  // The web app owns the definitive split (it hands paths across in both
  // directions), so prove this list still covers it — a path added there and
  // forgotten here would silently point at www again.
  //
  // Except where the MOBILE APP owns the path. The two lists answer different
  // questions: the web one means "www does not serve this, use the SIS host",
  // this one means "the app cannot render this, open a browser". A path with a
  // screen in app/ must stay out of this list however web-only it is on the
  // web, or a deep link that should open in-app bounces the user to a website.
  // Each exception names the screen that owns it; if that screen is deleted,
  // the entry belongs back in the list.
  const OWNED_BY_THE_APP: Record<string, string> = {
    '/settings': 'app/(app)/settings.tsx',
  };

  it('every app-owned exception still has the screen that justifies it', () => {
    for (const [path, screen] of Object.entries(OWNED_BY_THE_APP)) {
      const full = join(__dirname, '..', '..', '..', screen);
      if (!existsSync(full)) {
        throw new Error(
          `${path} is excluded from SIS_ONLY_PREFIXES because ${screen} renders ` +
          `it, but that file is gone. Either restore it or add ${path} to ` +
          'SIS_ONLY_PREFIXES so the link opens on the SIS host instead of ' +
          'resolving to nothing.');
      }
    }
  });

  it('covers every SIS path the web app hands over', () => {
    const appSurface = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'frontend', 'src', 'utils', 'appSurface.js'),
      'utf8',
    );
    const block = appSurface.match(/export const SIS_SURFACE_PATHS = \[([\s\S]*?)\]/);
    expect(block).toBeTruthy();
    const webPaths = Array.from(block![1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
    expect(webPaths.length).toBeGreaterThan(10);
    const missed = webPaths.filter((p) => !isSisSurfacePath(p) && !(p in OWNED_BY_THE_APP));
    expect(missed).toEqual([]);
  });
});
