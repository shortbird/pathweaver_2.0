/**
 * useActivityTracking Hook
 *
 * React hook that provides activity tracking functions for components.
 * Wraps the activityTracker service with React-friendly patterns.
 *
 * Usage:
 * ```jsx
 * const { trackTabSwitch, trackModalOpen, trackButtonClick } = useActivityTracking('QuestDetail')
 *
 * // Track tab switch
 * const handleTabChange = (newTab) => {
 *   trackTabSwitch(newTab, currentTab)
 *   setCurrentTab(newTab)
 * }
 * ```
 */

import { useCallback, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { activityTracker, EVENT_TYPES } from '../services/activityTracker'

/**
 * Hook for tracking user activity in a component
 * @param {string} componentName - Name of the component using this hook
 * @returns {object} Tracking functions
 */
export const useActivityTracking = (componentName) => {
  const location = useLocation()
  const mountTimeRef = useRef(Date.now())
  const previousPathRef = useRef(null)

  // Track page time on unmount
  useEffect(() => {
    mountTimeRef.current = Date.now()

    return () => {
      const duration = Date.now() - mountTimeRef.current
      // Only track if user spent meaningful time (> 1 second)
      if (duration > 1000) {
        activityTracker.trackPageTime(componentName, duration, location.pathname)
      }
    }
  }, [componentName, location.pathname])

  // Track page navigation when location changes
  useEffect(() => {
    if (previousPathRef.current && previousPathRef.current !== location.pathname) {
      activityTracker.trackPageNavigation(location.pathname, previousPathRef.current)
    }
    previousPathRef.current = location.pathname
  }, [location.pathname])

  /**
   * Track tab switch within the component
   */
  const trackTabSwitch = useCallback((tabName, previousTab) => {
    activityTracker.trackTabSwitch(tabName, previousTab, componentName)
  }, [componentName])

  /**
   * Track modal open
   */
  const trackModalOpen = useCallback((modalName, context = {}) => {
    activityTracker.trackModalOpen(modalName, componentName, context)
  }, [componentName])

  /**
   * Track modal close
   */
  const trackModalClose = useCallback((modalName, context = {}) => {
    activityTracker.trackModalClose(modalName, componentName, context)
  }, [componentName])

  /**
   * Track button click with semantic meaning
   */
  const trackButtonClick = useCallback((buttonName, action, context = {}) => {
    activityTracker.trackButtonClick(buttonName, action, componentName, context)
  }, [componentName])

  /**
   * Track section expand/collapse
   */
  const trackSectionToggle = useCallback((sectionName, isExpanded) => {
    activityTracker.trackSectionToggle(sectionName, isExpanded, componentName)
  }, [componentName])

  /**
   * Track feature usage
   */
  const trackFeatureUsed = useCallback((featureName, context = {}) => {
    activityTracker.trackFeatureUsed(featureName, componentName, context)
  }, [componentName])

  /**
   * Track generic event
   */
  const trackEvent = useCallback((eventType, eventData = {}) => {
    activityTracker.track(eventType, {
      ...eventData,
      component: componentName
    }, {
      page_url: location.pathname
    })
  }, [componentName, location.pathname])

  /**
   * Track form start
   */
  const trackFormStart = useCallback((formName) => {
    activityTracker.track(EVENT_TYPES.FORM_STARTED, {
      form_name: formName,
      component: componentName
    }, {
      page_url: location.pathname
    })
  }, [componentName, location.pathname])

  /**
   * Track form submit
   */
  const trackFormSubmit = useCallback((formName, success = true) => {
    activityTracker.track(EVENT_TYPES.FORM_SUBMITTED, {
      form_name: formName,
      success,
      component: componentName
    }, {
      page_url: location.pathname
    })
  }, [componentName, location.pathname])

  /**
   * Track search performed
   */
  const trackSearch = useCallback((query, resultsCount) => {
    activityTracker.track(EVENT_TYPES.SEARCH_PERFORMED, {
      query_length: query?.length || 0,
      results_count: resultsCount,
      component: componentName
    }, {
      page_url: location.pathname
    })
  }, [componentName, location.pathname])

  /**
   * Track filter applied
   */
  const trackFilter = useCallback((filterName, filterValue) => {
    activityTracker.track(EVENT_TYPES.FILTER_APPLIED, {
      filter_name: filterName,
      filter_value: filterValue,
      component: componentName
    }, {
      page_url: location.pathname
    })
  }, [componentName, location.pathname])

  return {
    trackTabSwitch,
    trackModalOpen,
    trackModalClose,
    trackButtonClick,
    trackSectionToggle,
    trackFeatureUsed,
    trackEvent,
    trackFormStart,
    trackFormSubmit,
    trackSearch,
    trackFilter
  }
}

export default useActivityTracking
