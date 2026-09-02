import { useEffect } from 'react'
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
 * Public pages the pixel must never see at all — not even a PageView.
 *
 * These are link-gated pages whose URL carries the secret that grants access,
 * and whose content is student work. A PageView sends the full document
 * location, so firing one here would hand the access key to Meta and log a
 * page of minors' evidence as ad-targetable browsing. Anonymous is not the
 * same as public.
 */
const isPixelExcluded = (pathname) => pathname.startsWith('/poe/showcase')

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
 *  3. The base pixel in index.html is DEFERRED: it defines
 *     window.__optioLoadMetaPixel() and loads nothing until called. This
 *     component is its only caller, which is what extends constraints 1 and 2
 *     to the hard page load — previously index.html fired a PageView before
 *     auth was known, so a signed-in student's page load still reached
 *     facebook.com. The loader fires the initial PageView itself and returns
 *     true on the load that did it, so we only fire our own PageView after that.
 */
export default function MetaPixelTracker() {
  const { pathname } = useLocation()
  const { isAuthenticated, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (isAuthenticated) return
    if (isPixelExcluded(pathname)) return

    const justLoadedPixel =
      typeof window.__optioLoadMetaPixel === 'function'
        ? window.__optioLoadMetaPixel()
        : false

    if (!justLoadedPixel) trackPageView()

    const contentName = VIEW_CONTENT_ROUTES[pathname]
    if (contentName) trackEvent('ViewContent', { content_name: contentName })
  }, [pathname, isAuthenticated, loading])

  return null
}
