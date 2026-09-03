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

/** Which web host owns a path that mobile hands off to the browser.
 *
 *  The web build is ONE SPA serving two products on two hosts: the learning app
 *  on www.optioeducation.com and the SIS console on sis.optioeducation.com.
 *  A bare notification link ("/inbox", "/attendance") says nothing about which.
 *  Get it wrong and the reader lands on a host whose router has never heard of
 *  the path, which renders as a dead page.
 *
 *  The web app already hands paths across in both directions
 *  (frontend/src/utils/appSurface.js). Mobile sent EVERY handoff to www, so an
 *  iCreate coordinator tapping "iCreate inbox: message from ..." was offered
 *  www.optioeducation.com/inbox -- a page that does not exist on that host
 *  (2026-09-03: "cant open the message notification"). Her bell is mostly
 *  /inbox and /attendance, so this was most of her notifications.
 */
export type WebSurface = 'learning' | 'sis';

/** Web-only prefixes owned by the LEARNING app (www.optioeducation.com).
 *
 *  These reach the view-on-web screen for the same reason the SIS ones do:
 *  without them a notification carrying one of these links fell through to the
 *  unrecognised-link fallback, which pushes the notifications list. Tapping a
 *  notification while already ON that list re-renders and opens nothing, which
 *  is exactly what was reported (iCreate, 2026-08-26: "I can't open any of
 *  them. I click on them and they go refresh, sort of.").
 */
const LEARNING_ONLY_PREFIXES = [
  '/dashboard',
  '/courses',
  // "/quests" and "/quests/<id>" resolve to the mobile quest screens first
  // (REMAP + dynamic match below); this prefix only catches deeper sub-paths.
  '/quests',
  '/admin',
  // Both hosts serve /advisor/*, but the learning app owns the check-in and
  // verification pages notifications actually link to.
  '/advisor',
  '/invitations',
  '/credit-dashboard',
  '/credit-review',
  // The family portal ("/family/portal", "/family/required-documents") is the
  // most common notification link for SIS orgs — onboarding + signatures — and
  // it is family-facing, so it lives on www, not the staff console.
  '/family',
  '/treehouse',
];

/** Web-only prefixes owned by the SIS CONSOLE (sis.optioeducation.com).
 *
 *  Mirrors SIS_SURFACE_PATHS in frontend/src/utils/appSurface.js, which is the
 *  source of truth — deepLinkRouter.test.ts reads that file and fails if this
 *  list stops covering it. Kept as a copy rather than a shared module because
 *  the @legal-style alias costs a metro + jest + tsconfig + vite change.
 *
 *  /resources is staff-only despite www having a family page at the same path:
 *  the only notification linking there is the "Required reading" fan-out to
 *  staff (backend/routes/sis/resources.py).
 */
const SIS_ONLY_PREFIXES = [
  '/attendance',
  '/billing',
  '/classes',
  '/clp',
  '/community',
  '/curriculum',
  '/directory',
  '/forms',
  '/goals',
  '/inbox',
  '/messaging',
  '/my-classes',
  '/my-documents',
  '/my-schedule',
  '/my-tasks',
  '/my-time',
  '/onboarding',
  '/people',
  '/prior-learning',
  '/registration',
  '/reports',
  '/resources',
  '/secure-documents',
  '/sis',
  '/submissions',
  '/tasks',
  '/time',
  '/timesheets',
  '/training',
  '/tuition',
];

/** Every prefix that has to leave the app, with the host that owns it. Longest
 *  first so "/timesheets" is never shadowed by a shorter neighbour. */
const WEB_ONLY_PREFIXES: [string, WebSurface][] = [
  ...LEARNING_ONLY_PREFIXES.map((p) => [p, 'learning'] as [string, WebSurface]),
  ...SIS_ONLY_PREFIXES.map((p) => [p, 'sis'] as [string, WebSurface]),
].sort((a, b) => b[0].length - a[0].length);

/** True when `path` belongs to the SIS console rather than the learning app.
 *  Exported for the drift test against the web app's SIS_SURFACE_PATHS. */
export function isSisSurfacePath(rawPath: string): boolean {
  const clean = String(rawPath || '').split('?')[0].split('#')[0];
  return SIS_ONLY_PREFIXES.some((p) => clean === p || clean.startsWith(`${p}/`));
}

/** Legacy/web paths → mobile equivalents. Matched against the path only (query
 *  string stripped first), so `/bounties?tab=active` still resolves here. */
const REMAP: [RegExp, string][] = [
  [/^\/parent-dashboard\/?$/, '/(app)/(tabs)/family'],
  [/^\/feedback\/?$/, '/(app)/(tabs)/feed'],
  // Sub-paths too ("/connections/approvals") — the web page's tabs are all the
  // same surface from mobile's point of view.
  [/^\/connections(\/.*)?$/, '/(app)/(tabs)/feed'],
  [/^\/quests\/?$/, '/(app)/(tabs)/quests'],
  [/^\/observer\/feed\/?$/, '/(app)/(tabs)/feed'],
  [/^\/profile\/?$/, '/(app)/(tabs)/profile'],
  [/^\/journal\/?$/, '/(app)/(tabs)/journal'],
  [/^\/feed\/?$/, '/(app)/(tabs)/feed'],
  [/^\/messages\/?$/, '/(app)/(tabs)/messages'],
  // Web messaging route ("/communication?user=…" / "?group=…") → messages tab.
  [/^\/communication\/?$/, '/(app)/(tabs)/messages'],
  [/^\/bounties\/?$/, '/(app)/(tabs)/bounties'],
  [/^\/notifications\/?$/, '/(app)/notifications'],
  // The school surface. "/announcements" is the web page's legacy alias, kept
  // so older emailed/notification links land on the same screen.
  [/^\/school\/?$/, '/(app)/school'],
  [/^\/announcements\/?$/, '/(app)/school'],
  [/^\/absences\/?$/, '/(app)/school/absences'],
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
  const query = queryIndex === -1 ? '' : link.slice(queryIndex + 1);

  // Bounty-submission notifications point the WEB app at its review queue
  // ("/bounties?tab=review&bounty=<id>&claim=<id>"). Mobile has a dedicated
  // per-bounty review screen instead, so translate that link into it and carry
  // the claim through so the screen can scroll to / highlight that submission.
  if (/^\/bounties\/?$/.test(path) && getQueryParam(query, 'tab') === 'review') {
    const bountyId = getQueryParam(query, 'bounty');
    if (bountyId) {
      const claimId = getQueryParam(query, 'claim');
      return {
        target: `/(app)/bounties/review/${bountyId}`,
        ...(claimId ? { params: { claim: claimId } } : {}),
      };
    }
  }

  // DM notifications link "/communication?user=<sender>" (and groups
  // "?group=<id>"). The param is the whole point — without it a tapped
  // carpool-reply push lands on the conversation LIST, not the conversation —
  // so carry it through to the messages screen.
  if (/^\/(communication|messages)\/?$/.test(path)) {
    const user = getQueryParam(query, 'user');
    const group = getQueryParam(query, 'group');
    return {
      target: '/(app)/(tabs)/messages',
      ...(user ? { params: { user } } : group ? { params: { group } } : {}),
    };
  }

  // Exact remaps first (matched on path, query ignored)
  for (const [pattern, target] of REMAP) {
    if (pattern.test(path)) return { target };
  }

  // Dynamic routes that exist on mobile
  const bountyReview = path.match(/^\/bounties\/review\/([^/]+)$/);
  if (bountyReview) {
    const claimId = getQueryParam(query, 'claim');
    return {
      target: `/(app)/bounties/review/${bountyReview[1]}`,
      ...(claimId ? { params: { claim: claimId } } : {}),
    };
  }

  const bountyDetail = path.match(/^\/bounties\/([^/]+)$/);
  if (bountyDetail) return { target: `/(app)/bounties/${bountyDetail[1]}` };

  // Quest detail exists on mobile (app/(app)/quests/[id].tsx) — don't send it
  // to view-on-web with the rest of the /quests prefix.
  const questDetail = path.match(/^\/quests\/([^/]+)$/);
  if (questDetail) return { target: `/(app)/quests/${questDetail[1]}` };

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

  // Observer accept-invite → mobile observer flow. The mobile screen is
  // app/(app)/observers/accept.tsx taking ?code= — there is no accept/[code]
  // route, so the path-segment form 404'd to the unmatched screen.
  const observerAccept = path.match(/^\/observer\/accept\/([^/]+)$/);
  if (observerAccept) {
    return { target: '/(app)/observers/accept', params: { code: observerAccept[1] } };
  }

  // Observer → student portfolio.
  const observerStudent = path.match(/^\/observers?\/student\/([^/]+)$/);
  if (observerStudent) return { target: `/(app)/observers/student/${observerStudent[1]}` };

  // Web-only prefixes → "view on web" fallback (carries the full original link).
  for (const [prefix, surface] of WEB_ONLY_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return {
        target: '/(app)/view-on-web',
        // `surface` decides which host the screen offers. Without it every
        // handoff went to www, and the SIS-only ones landed on a page that
        // host has never served.
        params: { path: link, label: labelForPrefix(prefix), surface },
      };
    }
  }

  // Unknown/unmapped link: land on the notifications list rather than pushing a
  // route that doesn't exist (which would crash with "no route").
  return { target: '/(app)/notifications' };
}

/**
 * Read a single param out of a raw query string ("a=1&b=2"). Kept dependency-free
 * (no URL/URLSearchParams) so it behaves the same across Hermes/JSC/web. Returns
 * null when absent or empty.
 */
function getQueryParam(query: string, key: string): string | null {
  if (!query) return null;
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    const k = eq === -1 ? pair : pair.slice(0, eq);
    if (k === key) {
      const v = eq === -1 ? '' : decodeURIComponent(pair.slice(eq + 1));
      return v || null;
    }
  }
  return null;
}

function labelForPrefix(prefix: string): string {
  switch (prefix) {
    case '/dashboard': return 'The dashboard';
    case '/credit-dashboard': return 'The credit dashboard';
    case '/credit-review': return 'Credit review';
    case '/family': return 'The family portal';
    case '/courses': return 'Courses';
    case '/quests': return 'Quests';
    case '/admin': return 'The admin panel';
    case '/advisor': return 'The teacher panel';
    case '/invitations': return 'Quest invitations';
    case '/treehouse': return 'The Treehouse page';
    // SIS console. Named individually because "This page isn't available in
    // the mobile app yet" tells a coordinator nothing about where she was
    // being sent, and these are the bulk of a staff member's bell.
    case '/inbox': return 'The school inbox';
    case '/messaging': return 'School messaging';
    case '/attendance': return 'Attendance';
    case '/billing': return 'Billing';
    case '/tuition': return 'Tuition approvals';
    case '/timesheets': return 'Timesheets';
    case '/time': return 'Your time entries';
    case '/classes': return 'Classes';
    case '/my-classes': return 'Your classes';
    case '/my-schedule': return 'Your schedule';
    case '/my-tasks': return 'Your tasks';
    case '/my-documents': return 'Your documents';
    case '/my-time': return 'Your time entries';
    case '/tasks': return 'The task center';
    case '/forms': return 'Forms';
    case '/goals': return 'Goals review';
    case '/submissions': return 'Submissions';
    case '/registration': return 'Registration';
    case '/people': return 'People';
    case '/directory': return 'The staff directory';
    case '/community': return 'The community page';
    case '/curriculum': return 'Curriculum';
    case '/training': return 'Staff training';
    case '/onboarding': return 'Onboarding';
    case '/reports': return 'Reports';
    case '/resources': return 'School resources';
    case '/secure-documents': return 'Secure documents';
    case '/prior-learning': return 'Prior learning';
    case '/clp': return 'The learning plan';
    case '/sis': return 'The school console';
    default: return 'This page';
  }
}
