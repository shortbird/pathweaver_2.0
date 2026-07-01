import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { trackPageView, trackEvent } from '../utils/metaPixel'

/**
 * Key public "offering" pages that should fire a Meta Pixel `ViewContent`
 * event (in addition to PageView) so marketing can build interest-based
 * audiences and optimize ads toward these pages. Keyed by exact pathname.
 */
const VIEW_CONTENT_ROUTES = {
  '/classes': 'Classes',
  '/poe': 'Pipe Organ Encounter',
}

/**
 * Drives Meta Pixel events for client-side (SPA) navigation.
 *
 * Deliberate constraints:
 *  1. Wait until auth state is settled (`loading` false) so a logged-in user is
 *     never momentarily treated as anonymous during session restore.
 *  2. Only track UNAUTHENTICATED browsing. The marketing funnel that matters
 *     (landing -> signup) is pre-login, and this platform serves K-12 students
 *     (minors). Per our privacy policy we never feed children's/students'
 *     in-app activity to advertising tools.
 *  3. index.html fires the initial PageView for the hard page load, so we skip
 *     the first event here to avoid double-counting it. ViewContent is NOT
 *     fired by index.html, so it fires even on that first event.
 */
export default function MetaPixelTracker() {
  const { pathname } = useLocation()
  const { isAuthenticated, loading } = useAuth()
  const isFirstEvent = useRef(true)

  useEffect(() => {
    if (loading) return

    const firstEvent = isFirstEvent.current
    isFirstEvent.current = false

    if (isAuthenticated) return

    if (!firstEvent) trackPageView()

    const contentName = VIEW_CONTENT_ROUTES[pathname]
    if (contentName) trackEvent('ViewContent', { content_name: contentName })
  }, [pathname, isAuthenticated, loading])

  return null
}
