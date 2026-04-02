import React, { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import MarketingNav from './MarketingNav'
import MarketingFooter from './MarketingFooter'
import { captureEvent } from '../../services/posthog'

const MarketingLayout = ({ children }) => {
  const location = useLocation()

  // Track page views on route change
  useEffect(() => {
    captureEvent('marketing_page_view', {
      path: location.pathname,
      referrer: document.referrer || null,
    })
  }, [location.pathname])

  // Track scroll depth
  useEffect(() => {
    let maxDepth = 0
    const thresholds = [25, 50, 75, 100]
    const fired = new Set()

    const onScroll = () => {
      const scrollTop = window.scrollY
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      if (docHeight <= 0) return
      const pct = Math.round((scrollTop / docHeight) * 100)
      if (pct > maxDepth) maxDepth = pct

      for (const t of thresholds) {
        if (pct >= t && !fired.has(t)) {
          fired.add(t)
          captureEvent('marketing_scroll_depth', {
            path: location.pathname,
            depth_percent: t,
          })
        }
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      // Capture final scroll depth on unmount
      if (maxDepth > 0) {
        captureEvent('marketing_scroll_depth_final', {
          path: location.pathname,
          max_depth_percent: maxDepth,
        })
      }
    }
  }, [location.pathname])

  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      {/* pt-16 offsets the fixed nav height */}
      <main className="flex-1 pt-16">
        {children}
      </main>
      <MarketingFooter />
    </div>
  )
}

export default MarketingLayout
