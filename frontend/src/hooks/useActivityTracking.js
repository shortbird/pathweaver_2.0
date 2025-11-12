import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api';

/**
 * Custom hook for automatic activity tracking.
 * Tracks page views, route changes, and time on page.
 *
 * Usage:
 * const { trackEvent } = useActivityTracking();
 *
 * // Manual event tracking
 * trackEvent('quest_started', { quest_id: '123', quest_title: 'Learn Python' });
 */
export const useActivityTracking = () => {
  const location = useLocation();
  const pageLoadTime = useRef(Date.now());
  const currentPath = useRef(location.pathname);
  const hasTrackedPage = useRef(false);

  // Track page view on route change
  useEffect(() => {
    const trackPageView = async () => {
      const loadTime = Date.now() - pageLoadTime.current;

      try {
        await api.post('/api/analytics/activity/track', {
          event_type: 'page_view',
          event_category: 'navigation',
          event_data: {
            page_path: location.pathname,
            page_title: document.title,
            load_time_ms: loadTime
          },
          page_url: window.location.href,
          referrer_url: document.referrer
        });

        hasTrackedPage.current = true;
      } catch (error) {
        // Silent fail - don't disrupt user experience
        // Only log in development
        if (process.env.NODE_ENV === 'development') {
          console.debug('Activity tracking failed:', error);
        }
      }

      // Reset timer for next page
      pageLoadTime.current = Date.now();
      currentPath.current = location.pathname;
    };

    // Only track if path changed
    if (currentPath.current !== location.pathname) {
      hasTrackedPage.current = false;
    }

    // Track page view
    if (!hasTrackedPage.current) {
      trackPageView();
    }
  }, [location]);

  // Track time on page when user leaves
  useEffect(() => {
    const trackTimeOnPage = async () => {
      const timeSpent = Date.now() - pageLoadTime.current;

      // Only track if user spent > 1 second (avoid accidental bounces)
      if (timeSpent < 1000) {
        return;
      }

      try {
        await api.post('/api/analytics/activity/track', {
          event_type: 'page_exit',
          event_category: 'navigation',
          event_data: {
            page_path: currentPath.current,
            duration_ms: timeSpent
          }
        });
      } catch (error) {
        // Silent fail
        if (process.env.NODE_ENV === 'development') {
          console.debug('Time tracking failed:', error);
        }
      }
    };

    // Track on unmount (user navigates away)
    return () => {
      const timeSpent = Date.now() - pageLoadTime.current;
      if (timeSpent > 1000) {
        trackTimeOnPage();
      }
    };
  }, []);

  // Manual tracking function for custom events
  const trackEvent = useCallback(async (eventType, eventData = {}) => {
    try {
      await api.post('/api/analytics/activity/track', {
        event_type: eventType,
        event_category: categorizeEvent(eventType),
        event_data: eventData,
        page_url: window.location.href
      });
    } catch (error) {
      // Silent fail
      if (process.env.NODE_ENV === 'development') {
        console.debug('Event tracking failed:', error);
      }
    }
  }, []);

  return { trackEvent };
};

/**
 * Helper to categorize events based on event type prefix.
 * @param {string} eventType - The event type
 * @returns {string} - The event category
 */
function categorizeEvent(eventType) {
  if (eventType.startsWith('quest_') || eventType.startsWith('task_')) {
    return 'quest';
  }
  if (eventType.startsWith('badge_')) {
    return 'badge';
  }
  if (eventType.startsWith('tutor_')) {
    return 'tutor';
  }
  if (eventType.startsWith('connection_') || eventType.startsWith('profile_')) {
    return 'community';
  }
  if (eventType.startsWith('parent_')) {
    return 'parent';
  }
  if (eventType.startsWith('evidence_')) {
    return 'quest';
  }
  return 'other';
}
