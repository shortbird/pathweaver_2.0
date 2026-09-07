import React, { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getPostLoginPath } from '../utils/postLoginPath'
import { hasLocalSessionHint } from '../utils/sessionHint'
import { goToSisSurface, isSisSurfacePath } from '../utils/appSurface'
import { isSisStaff } from '../pages/sis/sisRole'
import { marketingUrl } from '../utils/marketingUrl'

// Matches App's PageLoader; role=status so screen readers announce the wait.
const DecidingLoader = () => (
  <div role="status" aria-label="Loading" className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
  </div>
)

/**
 * True when the page is running as an installed PWA rather than in a browser
 * tab. `display-mode: standalone` covers Android/desktop; navigator.standalone
 * is the iOS equivalent.
 */
const isStandalone = () => {
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches === true
      || window.navigator?.standalone === true
    )
  } catch {
    return false
  }
}

/**
 * Leaves this host for the marketing site. A real navigation, not a router
 * one: the destination is a different origin. `replace` so the back button
 * does not bounce the visitor straight back here and round again.
 */
const RedirectToMarketing = () => {
  useEffect(() => {
    window.location.replace(marketingUrl('/'))
  }, [])
  return <DecidingLoader />
}

/**
 * The `/` route. Signed-in users go to their landing page. Anonymous visitors
 * are sent to the marketing homepage on www.
 *
 * They used to be SHOWN it, from a copy of the marketing homepage inside this
 * SPA. That copy stopped being the real homepage at the 2026-09-01 cutover: www
 * became an Astro site with the maintained content, and this host kept a stale
 * duplicate that `/` alone still rendered. Sending them to the real one retires
 * the duplicate rather than letting the two drift further apart.
 *
 * An installed PWA is the exception. Its start_url is this path, so an
 * unconditional redirect would eject a logged-out PWA user out of the app shell
 * and into a browser on the marketing site, with no route back short of
 * reinstalling. They get /login, which is what somebody opening the app wanted.
 *
 * NOTE: we now wait for the session check rather than guessing from the
 * session_sync hint. Rendering marketing early was free to get wrong -- when
 * auth resolved, the signed-in branch just took over. A cross-origin redirect
 * is not: guess wrong and a signed-in user is already gone, on a marketing page
 * offering them a "Login" button. The cost is a brief loader for anonymous
 * visitors who are leaving anyway. Crawlers do not enter into it any more --
 * this path is Disallow'd in public/robots.txt.
 */
const HomeRoute = () => {
  const { isAuthenticated, user, loading } = useAuth()
  if (loading) {
    return <DecidingLoader />
  }
  if (isAuthenticated && user) {
    return <Navigate to={getPostLoginPath(user)} replace />
  }
  if (isStandalone()) {
    return <Navigate to="/login" replace />
  }
  return <RedirectToMarketing />
}

/**
 * Unknown paths. Signed-in users go to their landing page — silently dumping
 * them on the marketing homepage made every stale bookmark or removed route
 * read as "you got logged out". Anonymous visitors keep landing on `/`, which
 * now forwards them to the marketing site (or to /login inside a PWA).
 */
export const NotFoundRedirect = () => {
  const { isAuthenticated, user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return hasLocalSessionHint() ? <DecidingLoader /> : <Navigate to="/" replace />
  }
  // The other half of SisRoutes' handoff. A notification link carries a bare
  // path with no idea which host owns it, and the SIS-only ones ("/attendance",
  // "/inbox", "/forms") do not exist here — so a teacher reading their bell on
  // www was sent to their dashboard instead of the page they were notified
  // about (iCreate, 2026-08-26). Staff only: for anyone else the SIS console
  // would just bounce them straight back, and two catch-alls pointing at each
  // other is a redirect loop.
  if (isAuthenticated && user && isSisStaff(user)
      && isSisSurfacePath(location.pathname)) {
    goToSisSurface(location.pathname + location.search)
    return <DecidingLoader />
  }
  if (isAuthenticated && user) {
    return <Navigate to={getPostLoginPath(user)} replace />
  }
  return <Navigate to="/" replace />
}

export default HomeRoute
