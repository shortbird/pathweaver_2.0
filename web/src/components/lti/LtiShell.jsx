/**
 * LtiShell (v1) — shared iframe-aware layout for every LTI page.
 *
 * Mirrors the v2 design (docs/LTI_FRONTEND_REDESIGN.md) but ported to v1's
 * React-DOM + Tailwind stack so LTI can stay on the existing
 * www.optioeducation.com host — no separate v2 deploy needed.
 *
 * Responsibilities:
 *   - Width-constrained single column that works in narrow Canvas iframes
 *     (down to ~320px SpeedGrader) and wide embeds alike.
 *   - No app chrome — no nav, no marketing, no footer.
 *   - Unified loading + error states (the contract every LTI page uses).
 *   - Posts content height to the Canvas parent via the LTI
 *     `lti.frameResize` postMessage (ResizeObserver-driven) so the iframe
 *     isn't clipped. Outside an iframe / SSR-safe / failures are no-op.
 */

import { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'

function postFrameHeight(height) {
  if (typeof window === 'undefined' || window.parent === window) return
  try {
    window.parent.postMessage(
      { subject: 'lti.frameResize', height: Math.ceil(height) },
      '*',
    )
  } catch {
    /* cross-origin / postMessage failures are non-fatal — Canvas falls back
       to its default iframe height + inner scroll. */
  }
}

export default function LtiShell({
  children,
  title,
  subtitle,
  loading = false,
  error = null,
  maxWidthClassName = 'max-w-2xl',
}) {
  const rootRef = useRef(null)

  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof window === 'undefined') return
    const report = () => postFrameHeight(el.scrollHeight || el.offsetHeight || 0)
    const raf = requestAnimationFrame(report)
    let observer
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(report)
      observer.observe(el)
    }
    window.addEventListener('resize', report)
    return () => {
      cancelAnimationFrame(raf)
      observer?.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [loading, error, children])

  let body
  if (loading) {
    body = (
      <div
        data-testid="lti-shell-loading"
        className="flex items-center justify-center py-16"
      >
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-optio-purple" />
      </div>
    )
  } else if (error) {
    body = (
      <div
        data-testid="lti-shell-error"
        className="flex items-center justify-center px-2 py-12"
      >
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-lg font-semibold text-gray-900">
            Something went wrong
          </h1>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    )
  } else {
    body = children
  }

  return (
    <div className="min-h-screen bg-white px-3 py-3 sm:px-4">
      <div ref={rootRef} className={`w-full mx-auto ${maxWidthClassName}`}>
        {(title || subtitle) && !loading && !error ? (
          <div className="mb-3 space-y-0.5">
            {title ? (
              <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
            ) : null}
            {subtitle ? (
              // Quest descriptions can run long — Canvas already shows the
              // assignment context, so clamp instead of pushing tasks down.
              <p className="text-xs text-gray-500 line-clamp-2">{subtitle}</p>
            ) : null}
          </div>
        ) : null}
        {body}
      </div>
    </div>
  )
}

LtiShell.propTypes = {
  children: PropTypes.node,
  title: PropTypes.string,
  subtitle: PropTypes.string,
  loading: PropTypes.bool,
  error: PropTypes.string,
  maxWidthClassName: PropTypes.string,
}
