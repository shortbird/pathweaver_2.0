// Demo Analytics Module
// Tracks all user interactions within the demo experience

const DEMO_EVENTS = {
  // Page level events
  DEMO_PAGE_VIEW: 'demo_page_view',
  DEMO_SECTION_VIEW: 'demo_section_view',
  DEMO_COMPLETE: 'demo_complete',
  
  // Interaction events
  QUEST_CARD_CLICK: 'demo_quest_card_click',
  EVIDENCE_EXPAND: 'demo_evidence_expand',
  CTA_CLICK: 'demo_cta_click',
  FILTER_CHANGE: 'demo_filter_change',
  SEARCH_QUERY: 'demo_search_query',
  
  // Engagement events
  TIME_ON_PAGE: 'demo_time_on_page',
  SCROLL_DEPTH: 'demo_scroll_depth',
  EXIT_INTENT: 'demo_exit_intent',
  
  // Conversion events
  DEMO_TO_SIGNUP: 'demo_to_signup',
  QUEST_START_ATTEMPT: 'demo_quest_start_attempt',
  
  // A/B Test events
  AB_TEST_VARIANT_ASSIGNED: 'demo_ab_variant_assigned',
  AB_TEST_CONVERSION: 'demo_ab_conversion'
};

// Check if Google Analytics is available
const isGAAvailable = () => {
  return typeof window !== 'undefined' && window.gtag;
};

// Track event helper
export const trackDemoEvent = (eventName, parameters = {}) => {
  // Add common parameters
  const enrichedParams = {
    ...parameters,
    timestamp: new Date().toISOString(),
    page_path: window.location.pathname,
    referrer: document.referrer,
    device_type: getDeviceType(),
    screen_resolution: `${window.screen.width}x${window.screen.height}`,
    viewport_size: `${window.innerWidth}x${window.innerHeight}`,
    user_agent: navigator.userAgent
  };

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('📊 Demo Analytics Event:', eventName, enrichedParams);
  }

  // Send to Google Analytics if available
  if (isGAAvailable()) {
    try {
      window.gtag('event', eventName, {
        event_category: 'Demo',
        event_label: parameters.label || '',
        value: parameters.value || 0,
        custom_dimensions: enrichedParams
      });
    } catch (error) {
      console.error('Failed to track GA event:', error);
    }
  }

  // Store in localStorage for analysis
  storeEventLocally(eventName, enrichedParams);

  // Check for conversion events
  if (eventName === DEMO_EVENTS.DEMO_COMPLETE) {
    trackConversion('demo_completed', enrichedParams);
  }
};

// Store events locally for later analysis
const storeEventLocally = (eventName, parameters) => {
  try {
    const storageKey = 'optio_demo_analytics';
    const existing = localStorage.getItem(storageKey);
    const events = existing ? JSON.parse(existing) : [];
    
    events.push({
      event: eventName,
      ...parameters
    });
    
    // Keep only last 100 events to prevent storage overflow
    if (events.length > 100) {
      events.shift();
    }
    
    localStorage.setItem(storageKey, JSON.stringify(events));
  } catch (error) {
    // Silently fail if localStorage is not available
    console.warn('Failed to store analytics event locally:', error);
  }
};

// Track conversion events
const trackConversion = (conversionType, parameters) => {
  if (isGAAvailable()) {
    window.gtag('event', 'conversion', {
      send_to: 'CONVERSION_ID', // Replace with actual conversion ID
      value: 1,
      currency: 'USD',
      conversion_type: conversionType,
      ...parameters
    });
  }
};

// Get device type
const getDeviceType = () => {
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
};

// Track scroll depth
export const trackScrollDepth = () => {
  let maxScroll = 0;
  let hasTracked = {
    25: false,
    50: false,
    75: false,
    100: false
  };

  const handleScroll = () => {
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPercent = Math.round((window.scrollY / scrollHeight) * 100);
    
    if (scrollPercent > maxScroll) {
      maxScroll = scrollPercent;
      
      // Track milestone percentages
      [25, 50, 75, 100].forEach(milestone => {
        if (scrollPercent >= milestone && !hasTracked[milestone]) {
          hasTracked[milestone] = true;
          trackDemoEvent(DEMO_EVENTS.SCROLL_DEPTH, {
            depth_percent: milestone,
            max_depth: maxScroll
          });
        }
      });
    }
  };

  // Throttle scroll events
  let scrollTimer;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(handleScroll, 100);
  });

  // Track final scroll depth on page unload
  window.addEventListener('beforeunload', () => {
    trackDemoEvent(DEMO_EVENTS.SCROLL_DEPTH, {
      depth_percent: maxScroll,
      final: true
    });
  });
};

// Track exit intent
export const trackExitIntent = () => {
  let hasTrackedExit = false;

  const handleMouseLeave = (e) => {
    if (e.clientY <= 0 && !hasTrackedExit) {
      hasTrackedExit = true;
      trackDemoEvent(DEMO_EVENTS.EXIT_INTENT, {
        time_on_page: Math.floor((Date.now() - pageLoadTime) / 1000),
        scroll_depth: getCurrentScrollDepth()
      });
    }
  };

  document.addEventListener('mouseleave', handleMouseLeave);
};

// Get current scroll depth
const getCurrentScrollDepth = () => {
  const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
  return Math.round((window.scrollY / scrollHeight) * 100);
};

// Track page load time
const pageLoadTime = Date.now();

// Initialize tracking
export const initializeDemoAnalytics = () => {
  // Track initial page view
  trackDemoEvent(DEMO_EVENTS.DEMO_PAGE_VIEW, {
    source: new URLSearchParams(window.location.search).get('source') || 'direct'
  });

  // Set up scroll tracking
  trackScrollDepth();

  // Set up exit intent tracking (desktop only)
  if (getDeviceType() === 'desktop') {
    trackExitIntent();
  }

  // Track time on page when user leaves
  window.addEventListener('beforeunload', () => {
    const timeOnPage = Math.floor((Date.now() - pageLoadTime) / 1000);
    trackDemoEvent(DEMO_EVENTS.TIME_ON_PAGE, {
      duration_seconds: timeOnPage,
      duration_formatted: formatDuration(timeOnPage)
    });
  });
};

// Format duration for display
const formatDuration = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

// Get analytics summary (for debugging/reporting)
export const getAnalyticsSummary = () => {
  try {
    const storageKey = 'optio_demo_analytics';
    const events = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    const summary = {
      total_events: events.length,
      unique_sessions: new Set(events.map(e => e.timestamp?.split('T')[0])).size,
      event_types: {},
      conversions: 0,
      average_time_on_page: 0
    };

    events.forEach(event => {
      summary.event_types[event.event] = (summary.event_types[event.event] || 0) + 1;
      
      if (event.event === DEMO_EVENTS.DEMO_COMPLETE) {
        summary.conversions++;
      }
      
      if (event.event === DEMO_EVENTS.TIME_ON_PAGE) {
        summary.average_time_on_page = event.duration_seconds;
      }
    });

    return summary;
  } catch (error) {
    console.error('Failed to get analytics summary:', error);
    return null;
  }
};

// Clear analytics data (for testing)
export const clearAnalyticsData = () => {
  try {
    localStorage.removeItem('optio_demo_analytics');
    console.log('Analytics data cleared');
  } catch (error) {
    console.error('Failed to clear analytics data:', error);
  }
};

export { DEMO_EVENTS };