/**
 * Client-Side Activity Tracking Service
 *
 * Captures user interactions (tab switches, button clicks, modal opens)
 * and sends them to the backend in batches for efficient processing.
 *
 * Features:
 * - Event batching (flush every 30s or when 10 events queued)
 * - Uses navigator.sendBeacon for reliable delivery on page unload
 * - Debounces rapid events (scroll, resize)
 * - Respects existing session_id cookie from backend
 */

import api from './api'
import logger from '../utils/logger'

// Event type constants
export const EVENT_TYPES = {
  // Navigation
  TAB_SWITCHED: 'tab_switched',
  SECTION_TOGGLED: 'section_toggled',
  MODAL_OPENED: 'modal_opened',
  MODAL_CLOSED: 'modal_closed',
  PAGE_NAVIGATION: 'page_navigation',

  // Interaction
  BUTTON_CLICKED: 'button_clicked',
  FORM_STARTED: 'form_started',
  FORM_SUBMITTED: 'form_submitted',
  FORM_ABANDONED: 'form_abandoned',
  SEARCH_PERFORMED: 'search_performed',
  FILTER_APPLIED: 'filter_applied',

  // Engagement
  CONTENT_VIEWED: 'content_viewed',
  CONTENT_SCROLLED: 'content_scrolled',
  PAGE_TIME: 'page_time',

  // Feature usage
  FEATURE_USED: 'feature_used'
}

// Event category constants
export const EVENT_CATEGORIES = {
  NAVIGATION: 'navigation',
  INTERACTION: 'interaction',
  ENGAGEMENT: 'engagement',
  FEATURE: 'feature'
}

// Map event types to categories
const EVENT_CATEGORY_MAP = {
  [EVENT_TYPES.TAB_SWITCHED]: EVENT_CATEGORIES.NAVIGATION,
  [EVENT_TYPES.SECTION_TOGGLED]: EVENT_CATEGORIES.NAVIGATION,
  [EVENT_TYPES.MODAL_OPENED]: EVENT_CATEGORIES.NAVIGATION,
  [EVENT_TYPES.MODAL_CLOSED]: EVENT_CATEGORIES.NAVIGATION,
  [EVENT_TYPES.PAGE_NAVIGATION]: EVENT_CATEGORIES.NAVIGATION,
  [EVENT_TYPES.BUTTON_CLICKED]: EVENT_CATEGORIES.INTERACTION,
  [EVENT_TYPES.FORM_STARTED]: EVENT_CATEGORIES.INTERACTION,
  [EVENT_TYPES.FORM_SUBMITTED]: EVENT_CATEGORIES.INTERACTION,
  [EVENT_TYPES.FORM_ABANDONED]: EVENT_CATEGORIES.INTERACTION,
  [EVENT_TYPES.SEARCH_PERFORMED]: EVENT_CATEGORIES.INTERACTION,
  [EVENT_TYPES.FILTER_APPLIED]: EVENT_CATEGORIES.INTERACTION,
  [EVENT_TYPES.CONTENT_VIEWED]: EVENT_CATEGORIES.ENGAGEMENT,
  [EVENT_TYPES.CONTENT_SCROLLED]: EVENT_CATEGORIES.ENGAGEMENT,
  [EVENT_TYPES.PAGE_TIME]: EVENT_CATEGORIES.ENGAGEMENT,
  [EVENT_TYPES.FEATURE_USED]: EVENT_CATEGORIES.FEATURE
}

class ActivityTracker {
  constructor() {
    this.eventQueue = []
    this.flushInterval = null
    this.initialized = false
    this.lastEventTime = null

    // Configuration
    this.config = {
      flushThreshold: 10,        // Flush when this many events queued
      flushIntervalMs: 30000,    // Flush every 30 seconds
      maxQueueSize: 50,          // Max events in queue
      debounceMs: 500            // Debounce rapid events
    }

    // Debounce tracking
    this.debounceTimers = {}
  }

  /**
   * Initialize the tracking service
   * Call once on app mount
   */
  init() {
    if (this.initialized) {
      return
    }

    // Start periodic flush interval
    this.flushInterval = setInterval(() => {
      this.flush()
    }, this.config.flushIntervalMs)

    // Flush on page unload (use sendBeacon for reliability)
    window.addEventListener('beforeunload', () => {
      this.flushSync()
    })

    // Flush when page becomes hidden (mobile background)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flushSync()
      }
    })

    this.initialized = true
    logger.debug('[ActivityTracker] Initialized')
  }

  /**
   * Track an event
   * @param {string} eventType - Type of event (use EVENT_TYPES constants)
   * @param {object} eventData - Event-specific data
   * @param {object} pageContext - Page context (url, component)
   */
  track(eventType, eventData = {}, pageContext = {}) {
    if (!this.initialized) {
      console.warn('[ActivityTracker] Not initialized, call init() first')
      return
    }

    // Get category from map or default to 'client'
    const eventCategory = EVENT_CATEGORY_MAP[eventType] || 'client'

    // Calculate time since last event
    const now = Date.now()
    const timeSinceLastEvent = this.lastEventTime ? now - this.lastEventTime : 0
    this.lastEventTime = now

    // Build event object
    const event = {
      event_type: eventType,
      event_category: eventCategory,
      event_data: {
        ...eventData,
        time_since_last_event_ms: timeSinceLastEvent
      },
      page_url: pageContext.page_url || window.location.pathname,
      referrer_url: pageContext.referrer_url || document.referrer || null,
      timestamp: new Date().toISOString()
    }

    // Add to queue
    this.eventQueue.push(event)

    // Trim queue if over max size
    if (this.eventQueue.length > this.config.maxQueueSize) {
      this.eventQueue = this.eventQueue.slice(-this.config.maxQueueSize)
    }

    // Auto-flush if threshold reached
    if (this.eventQueue.length >= this.config.flushThreshold) {
      this.flush()
    }
  }

  /**
   * Track with debouncing (for rapid events like scroll)
   * @param {string} key - Unique key for debounce grouping
   * @param {string} eventType - Type of event
   * @param {object} eventData - Event-specific data
   * @param {object} pageContext - Page context
   */
  trackDebounced(key, eventType, eventData = {}, pageContext = {}) {
    // Clear existing timer for this key
    if (this.debounceTimers[key]) {
      clearTimeout(this.debounceTimers[key])
    }

    // Set new timer
    this.debounceTimers[key] = setTimeout(() => {
      this.track(eventType, eventData, pageContext)
      delete this.debounceTimers[key]
    }, this.config.debounceMs)
  }

  /**
   * Flush events asynchronously
   */
  async flush() {
    if (this.eventQueue.length === 0) {
      return
    }

    // Take events from queue
    const events = [...this.eventQueue]
    this.eventQueue = []

    try {
      await api.post('/api/activity/track', { events })
      console.debug(`[ActivityTracker] Flushed ${events.length} events`)
    } catch (error) {
      // Put events back in queue on failure (will retry on next flush)
      this.eventQueue = [...events, ...this.eventQueue].slice(0, this.config.maxQueueSize)
      console.warn('[ActivityTracker] Failed to flush events, will retry', error)
    }
  }

  /**
   * Flush events synchronously using sendBeacon (for page unload)
   */
  flushSync() {
    if (this.eventQueue.length === 0) {
      return
    }

    const events = [...this.eventQueue]
    this.eventQueue = []

    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
      const url = `${baseUrl}/api/activity/track`
      const data = JSON.stringify({ events })

      // sendBeacon is more reliable than fetch on page unload
      const success = navigator.sendBeacon(url, new Blob([data], { type: 'application/json' }))

      if (success) {
        console.debug(`[ActivityTracker] Beacon sent ${events.length} events`)
      } else {
        console.warn('[ActivityTracker] Beacon failed, events lost')
      }
    } catch (error) {
      console.warn('[ActivityTracker] Beacon error', error)
    }
  }

  /**
   * Clean up (call on app unmount)
   */
  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }

    // Clear all debounce timers
    Object.values(this.debounceTimers).forEach(timer => clearTimeout(timer))
    this.debounceTimers = {}

    // Final flush
    this.flushSync()

    this.initialized = false
    logger.debug('[ActivityTracker] Destroyed')
  }

  // Convenience methods for common events

  /**
   * Track tab switch within a component
   */
  trackTabSwitch(tabName, previousTab, component) {
    this.track(EVENT_TYPES.TAB_SWITCHED, {
      tab_name: tabName,
      previous_tab: previousTab,
      component
    })
  }

  /**
   * Track modal open
   */
  trackModalOpen(modalName, component, context = {}) {
    this.track(EVENT_TYPES.MODAL_OPENED, {
      modal_name: modalName,
      component,
      ...context
    })
  }

  /**
   * Track modal close
   */
  trackModalClose(modalName, component, context = {}) {
    this.track(EVENT_TYPES.MODAL_CLOSED, {
      modal_name: modalName,
      component,
      ...context
    })
  }

  /**
   * Track button click
   */
  trackButtonClick(buttonName, action, component, context = {}) {
    this.track(EVENT_TYPES.BUTTON_CLICKED, {
      button_name: buttonName,
      action,
      component,
      ...context
    })
  }

  /**
   * Track section expand/collapse
   */
  trackSectionToggle(sectionName, isExpanded, component) {
    this.track(EVENT_TYPES.SECTION_TOGGLED, {
      section_name: sectionName,
      is_expanded: isExpanded,
      component
    })
  }

  /**
   * Track page navigation (React Router)
   */
  trackPageNavigation(toPath, fromPath) {
    this.track(EVENT_TYPES.PAGE_NAVIGATION, {
      to_path: toPath,
      from_path: fromPath
    }, {
      page_url: toPath,
      referrer_url: fromPath
    })
  }

  /**
   * Track time spent on a page/component
   */
  trackPageTime(component, durationMs, pageUrl) {
    this.track(EVENT_TYPES.PAGE_TIME, {
      component,
      duration_ms: durationMs
    }, {
      page_url: pageUrl
    })
  }

  /**
   * Track feature usage
   */
  trackFeatureUsed(featureName, component, context = {}) {
    this.track(EVENT_TYPES.FEATURE_USED, {
      feature_name: featureName,
      component,
      ...context
    })
  }
}

// Export singleton instance
export const activityTracker = new ActivityTracker()

export default activityTracker
