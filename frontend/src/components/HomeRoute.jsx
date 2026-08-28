import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getPostLoginPath } from '../utils/postLoginPath'
import { hasLocalSessionHint } from '../utils/sessionHint'
import { goToSisSurface, isSisSurfacePath } from '../utils/appSurface'
import { isSisStaff } from '../pages/sis/sisRole'
import HomePage from '../pages/marketing/HomePage'

// Matches App's PageLoader; role=status so screen readers announce the wait.
const DecidingLoader = () => (
  <div role="status" aria-label="Loading" className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
  </div>
)

/**
 * The `/` route. Anonymous visitors get the marketing homepage; signed-in users
 * are forwarded to their landing page instead of being shown a marketing page
 * whose header offers "Login" — which read as "you got logged out". Every path
 * that funnels users here (PWA start_url, typed domain, the catch-all, error
 * bounces) is healed by this one branch.
 *
 * While the session check is in flight we pick the likely branch using the
 * session_sync hint AuthContext writes on every login/logout: hint present →
 * hold with a loader (no marketing flash for signed-in users, even across a
 * slow cold start); hint absent → render marketing immediately (no delay for
 * the anonymous majority, and no SEO cost — crawlers never have a hint).
 */
const HomeRoute = () => {
  const { isAuthenticated, user, loading } = useAuth()
  if (loading) {
    return hasLocalSessionHint() ? <DecidingLoader /> : <HomePage />
  }
  if (isAuthenticated && user) {
    return <Navigate to={getPostLoginPath(user)} replace />
  }
  return <HomePage />
}

/**
 * Unknown paths. Signed-in users go to their landing page — silently dumping
 * them on the marketing homepage made every stale bookmark or removed route
 * read as "you got logged out". Anonymous visitors keep landing on `/`.
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
