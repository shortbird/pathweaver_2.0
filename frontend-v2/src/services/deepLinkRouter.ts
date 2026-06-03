/**
 * Deep-link router.
 *
 * Translates backend-provided notification links (which originated on the web
 * app) into mobile-appropriate routes. When a link points to a feature that
 * only exists on web, returns a "view on web" redirect with the original URL
 * preserved for the user to open in a browser.
 */

export type ResolvedRoute = {
  /** expo-router path, relative to (app) group */
  target: string;
  /** query params to pass to the screen */
  params?: Record<string, string>;
};

/** Route prefixes that only exist on the web app. */
const WEB_ONLY_PREFIXES = [
  '/dashboard',
  '/courses',
  '/quests',
  '/admin',
  '/advisor',
  '/invitations',
  '/credit-dashboard',
];

/** Legacy/web paths → mobile equivalents. Matched against the path only (query
 *  string stripped first), so `/bounties?tab=active` still resolves here. */
const REMAP: Array<[RegExp, string]> = [
  [/^\/parent-dashboard\/?$/, '/(app)/(tabs)/family'],
  [/^\/feedback\/?$/, '/(app)/(tabs)/feed'],
  [/^\/connections\/?$/, '/(app)/(tabs)/feed'],
  [/^\/observer\/feed\/?$/, '/(app)/(tabs)/feed'],
  [/^\/profile\/?$/, '/(app)/(tabs)/profile'],
  [/^\/journal\/?$/, '/(app)/(tabs)/journal'],
  [/^\/feed\/?$/, '/(app)/(tabs)/feed'],
  [/^\/messages\/?$/, '/(app)/(tabs)/messages'],
  // Web messaging route ("/communication?user=…" / "?group=…") → messages tab.
  [/^\/communication\/?$/, '/(app)/(tabs)/messages'],
  [/^\/bounties\/?$/, '/(app)/(tabs)/bounties'],
  [/^\/notifications\/?$/, '/(app)/notifications'],
];

/**
 * Given a raw link (e.g., "/quests/abc", "/bounties?tab=active"), return the
 * route the mobile app should navigate to. Returns null only for empty input.
 *
 * Safety contract: this NEVER returns a route that doesn't exist in the mobile
 * app. Any unrecognised link falls back to the in-app notifications list. A
 * tapped notification that resolved to a non-existent expo-router path used to
 * render the "no route" unmatched screen, which reads to users as a crash.
 */
export function resolveDeepLink(rawLink: string | null | undefined): ResolvedRoute | null {
  if (!rawLink) return null;
  const link = rawLink.startsWith('/') ? rawLink : `/${rawLink}`;

  // Some backend notifications already emit a fully-qualified mobile route
  // (e.g. "/(app)/(tabs)/family?student=…"). Use those verbatim.
  if (link.startsWith('/(app)') || link.startsWith('/(auth)')) {
    return { target: link };
  }

  // Strip the query string for matching; keep the original `link` (with query)
  // for the view-on-web fallback so the browser opens the exact page.
  const queryIndex = link.indexOf('?');
  const path = queryIndex === -1 ? link : link.slice(0, queryIndex);

  // Exact remaps first (matched on path, query ignored)
  for (const [pattern, target] of REMAP) {
    if (pattern.test(path)) return { target };
  }

  // Dynamic routes that exist on mobile
  const bountyReview = path.match(/^\/bounties\/review\/([^/]+)$/);
  if (bountyReview) return { target: `/(app)/bounties/review/${bountyReview[1]}` };

  const bountyDetail = path.match(/^\/bounties\/([^/]+)$/);
  if (bountyDetail) return { target: `/(app)/bounties/${bountyDetail[1]}` };

  // Parent → kid's quest detail. The web app uses `/parent/quest/<sid>/<qid>`
  // and the mobile app mirrors that path under the (app) group.
  const parentQuest = path.match(/^\/parent\/quest\/([^/]+)\/([^/]+)$/);
  if (parentQuest) return { target: `/(app)/parent/quest/${parentQuest[1]}/${parentQuest[2]}` };

  // Parent → kid's journal.
  const parentJournal = path.match(/^\/parent\/journal\/([^/]+)$/);
  if (parentJournal) return { target: `/(app)/parent/journal/${parentJournal[1]}` };

  // Parent bounty review queue → mobile parent's bounty tab (review queue is
  // the default surface there).
  if (/^\/parent\/bounties\/?$/.test(path)) return { target: '/(app)/(tabs)/bounties' };

  // Observer accept-invite → mobile observer flow.
  const observerAccept = path.match(/^\/observer\/accept\/([^/]+)$/);
  if (observerAccept) return { target: `/(app)/observers/accept/${observerAccept[1]}` };

  // Observer → student portfolio.
  const observerStudent = path.match(/^\/observers?\/student\/([^/]+)$/);
  if (observerStudent) return { target: `/(app)/observers/student/${observerStudent[1]}` };

  // Web-only prefixes → "view on web" fallback (carries the full original link).
  for (const prefix of WEB_ONLY_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return {
        target: '/(app)/view-on-web',
        params: { path: link, label: labelForPrefix(prefix) },
      };
    }
  }

  // Unknown/unmapped link: land on the notifications list rather than pushing a
  // route that doesn't exist (which would crash with "no route").
  return { target: '/(app)/notifications' };
}

function labelForPrefix(prefix: string): string {
  switch (prefix) {
    case '/dashboard': return 'The dashboard';
    case '/credit-dashboard': return 'The credit dashboard';
    case '/courses': return 'Courses';
    case '/quests': return 'Quests';
    case '/admin': return 'The admin panel';
    case '/advisor': return 'The advisor panel';
    case '/invitations': return 'Quest invitations';
    default: return 'This page';
  }
}
