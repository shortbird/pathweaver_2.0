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
];

/** Legacy web paths → mobile equivalents. */
const REMAP: Array<[RegExp, string]> = [
  [/^\/parent-dashboard\/?$/, '/(app)/(tabs)/family'],
  [/^\/feedback\/?$/, '/(app)/(tabs)/feed'],
  [/^\/connections\/?$/, '/(app)/(tabs)/feed'],
  [/^\/observer\/feed\/?$/, '/(app)/(tabs)/feed'],
  [/^\/profile\/?$/, '/(app)/(tabs)/profile'],
  [/^\/journal\/?$/, '/(app)/(tabs)/journal'],
  [/^\/feed\/?$/, '/(app)/(tabs)/feed'],
  [/^\/messages\/?$/, '/(app)/(tabs)/messages'],
  [/^\/bounties\/?$/, '/(app)/(tabs)/bounties'],
  [/^\/notifications\/?$/, '/(app)/notifications'],
];

/**
 * Given a raw link (e.g., "/quests/abc", "/messages/123"), return the route
 * the mobile app should navigate to. Returns null if the link is empty.
 */
export function resolveDeepLink(rawLink: string | null | undefined): ResolvedRoute | null {
  if (!rawLink) return null;
  const link = rawLink.startsWith('/') ? rawLink : `/${rawLink}`;

  // Exact remaps first
  for (const [pattern, target] of REMAP) {
    if (pattern.test(link)) return { target };
  }

  // Dynamic routes that exist on mobile
  const bountyDetail = link.match(/^\/bounties\/([^/]+)$/);
  if (bountyDetail) return { target: `/(app)/bounties/${bountyDetail[1]}` };

  const bountyReview = link.match(/^\/bounties\/review\/([^/]+)$/);
  if (bountyReview) return { target: `/(app)/bounties/review/${bountyReview[1]}` };

  // Web-only prefixes → fallback screen
  for (const prefix of WEB_ONLY_PREFIXES) {
    if (link === prefix || link.startsWith(`${prefix}/`)) {
      return {
        target: '/(app)/view-on-web',
        params: { path: link, label: labelForPrefix(prefix) },
      };
    }
  }

  // Default: pass through as expo-router path under (app) group
  return { target: `/(app)${link}` };
}

function labelForPrefix(prefix: string): string {
  switch (prefix) {
    case '/dashboard': return 'The dashboard';
    case '/courses': return 'Courses';
    case '/quests': return 'Quests';
    case '/admin': return 'The admin panel';
    case '/advisor': return 'The advisor panel';
    case '/invitations': return 'Quest invitations';
    default: return 'This page';
  }
}
