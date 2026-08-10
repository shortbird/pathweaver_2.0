import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getPostLoginPath } from '../utils/postLoginPath'
import { hasLocalSessionHint } from '../utils/sessionHint'
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
  if (loading) {
    return hasLocalSessionHint() ? <DecidingLoader /> : <Navigate to="/" replace />
  }
  if (isAuthenticated && user) {
    return <Navigate to={getPostLoginPath(user)} replace />
  }
  return <Navigate to="/" replace />
}

export default HomeRoute
