import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { gaTrackPageView } from '../services/googleAnalytics'

/**
 * Drives GA4 page_view events for client-side (SPA) navigation.
 *
 * Constraints mirror MetaPixelTracker:
 *  1. Wait until auth state is settled (`loading` false) so a logged-in user is
 *     never momentarily treated as anonymous during session restore.
 *  2. Only track UNAUTHENTICATED browsing. GA here measures the acquisition
 *     funnel (landing -> signup), which is pre-login, and this platform serves
 *     K-12 students (minors) we never feed to advertising tools.
 *
 * Unlike Meta, index.html fires NO initial GA page_view (GA4 is configured with
 * send_page_view:false), so every route — including the first — is sent here.
 * gaTrackPageView no-ops off the prod host, so this is safe in all environments.
 */
export default function GaTracker() {
  const { pathname } = useLocation()
  const { isAuthenticated, loading } = useAuth()

  useEffect(() => {
    if (loading || isAuthenticated) return
    gaTrackPageView(pathname)
  }, [pathname, isAuthenticated, loading])

  return null
}
