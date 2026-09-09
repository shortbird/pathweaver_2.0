import { useRef, useState, useEffect, useCallback } from 'react'
import { captureEvent } from '../../services/posthog'

/**
 * Hook to track when a section becomes visible in the viewport.
 * Fires a PostHog event once per section per page load.
 */
export const useSectionView = (sectionName, pageName) => {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          captureEvent('marketing_section_viewed', {
            page: pageName,
            section: sectionName,
          })
          observer.unobserve(el)
        }
      },
      { threshold: 0.2 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [sectionName, pageName])

  return ref
}

/**
 * Scroll-reveal animation hook (reusable across all marketing pages).
 */
export const useScrollReveal = () => {
  const ref = useRef(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.unobserve(el)
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, isVisible }
}

/**
 * Track CTA clicks with standard properties.
 */
export const useCtaTracker = (pageName) => {
  return useCallback((ctaName, extra = {}) => {
    captureEvent('marketing_cta_click', {
      page: pageName,
      cta: ctaName,
      ...extra,
    })
  }, [pageName])
}
