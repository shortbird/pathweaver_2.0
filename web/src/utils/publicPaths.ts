/**
 * Pages a signed-out visitor may stay on when the session check fails.
 *
 * services/api.ts sends everyone else to /login after a refresh that fails for
 * good. Every page here is opened by someone with no session -- a shared link,
 * a kiosk, a marketing page -- and the app-load /api/auth/me check 401s for
 * them by design, so a page missing from this list is a link that bounces its
 * reader to /login. Moved out of api.ts on 2026-09-30 so the list has a test:
 * /offer/<slug> (a partner's class link) shipped missing from it.
 */
export function isPublicPath(currentPath: string): boolean {
  const authPaths = ['/login', '/register', '/email-verification', '/forgot-password', '/reset-password', '/staff/welcome', '/student/welcome', '/auth/welcome', '/', '/terms', '/privacy', '/academy-agreement', '/academy-handbook', '/services', '/catalog', '/how-it-works', '/poe', '/auth/callback']
  const isPublicDiploma = currentPath.startsWith('/public/diploma/') || currentPath.startsWith('/portfolio/')
  const isConsultationPage = currentPath === '/consultation'
  const isDemoPage = currentPath === '/demo'
  const isQuestsPage = currentPath.startsWith('/quests') || currentPath.startsWith('/badges')
  const isJoinPage = currentPath.startsWith('/join/')
  const isPublicCoursePage = currentPath.startsWith('/course/')
  const isObserverAcceptPage = currentPath.startsWith('/observer/accept/')
  const isPublicReportPage = currentPath.startsWith('/report/')
  const isSharedPage = currentPath.startsWith('/shared/')
  const isInvitationPage = currentPath.startsWith('/invitation/')
  const isDocsPage = currentPath.startsWith('/docs')
  const isPublicTranscript = currentPath.startsWith('/public/transcript/')
  const isPromoPage = currentPath.startsWith('/for-students')
  const isMarketingPage = currentPath === '/philosophy' || currentPath === '/for-families' || currentPath === '/for-schools' || currentPath === '/classes' || currentPath === '/how-it-works'
  // Canvas LTI iframe pages — a refresh failure here should never
  // navigate to /login; the iframe lives in someone else's chrome.
  const isLtiPage = currentPath.startsWith('/lti-')
  // The kiosks (/kiosk for any org, /treehouse-kiosk for the Treehouse
  // program) are public, token-gated shared-device pages. Every page load
  // runs /api/auth/me, and a fresh iPad has no session, so the refresh
  // fails on the very first visit — before an admin has even pasted the
  // device code. That, and the 401 right after a student logs out to hand
  // off the device, must keep us on the kiosk, not bounce to /login.
  // (/kiosk was missing from this list until 2026-09-07 and could not be
  // set up at all: a cold load went straight to /login.)
  const isKiosk = currentPath === '/kiosk' || currentPath.startsWith('/kiosk/')
    || currentPath.startsWith('/treehouse-kiosk')
  // Org login pages (/login/<slug>) are themselves login pages — a 401
  // from the background session check must not bounce a school's
  // students off their branded login onto the main /login.
  const isOrgLoginPage = currentPath.startsWith('/login/')
  // Family registration funnel (/enroll/<code>, legacy
  // /register/icreate/<code>) — public entry links shared with
  // anonymous families; the app-load session check 401s for them by
  // design and must not eat the link with a bounce to /login.
  const isRegistrationFunnel = currentPath.startsWith('/enroll/') || currentPath.startsWith('/register/icreate/')
  // POE pilot pages. authPaths lists '/poe' as an exact match, which left
  // the deeper ones (/poe/showcase, the key-gated summary sent to POE
  // leadership) bouncing anonymous visitors to /login on the app-load
  // session check — the link looked broken to exactly the people it was
  // sent to. Prefix-match the whole area.
  const isPoePage = currentPath === '/poe' || currentPath.startsWith('/poe/')
  // A credit-class partner's buyer link (pages/OfferPage.jsx).
  const isOfferPage = currentPath.startsWith('/offer/')
  // A new school's setup link (pages/SchoolSetupPage.jsx), opened before the
  // operator has an account.
  const isSchoolSetupPage = currentPath.startsWith('/start-school/')

  return authPaths.includes(currentPath) || isPublicDiploma || isConsultationPage || isDemoPage
  || isQuestsPage || isJoinPage || isPublicCoursePage || isObserverAcceptPage || isPublicReportPage
  || isSharedPage || isInvitationPage || isDocsPage || isPublicTranscript || isPromoPage
  || isMarketingPage || isLtiPage || isKiosk || isOrgLoginPage || isRegistrationFunnel || isPoePage
  || isOfferPage || isSchoolSetupPage
}
