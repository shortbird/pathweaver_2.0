/**
 * Browser detection and cookie compatibility utilities
 * Used to detect Safari and implement automatic fallbacks
 */
import logger from './logger'

/**
 * Detect if the browser is Safari
 * Safari has stricter cookie policies than other browsers
 */
export const isSafari = () => {
  const ua = navigator.userAgent
  // Safari has 'Safari' in UA but Chrome also has it, so exclude Chrome
  return /Safari/.test(ua) && !/Chrome/.test(ua) && !/Chromium/.test(ua)
}

/**
 * Detect if the browser is on iOS (iPhone/iPad)
 * iOS browsers all use Safari's WebKit engine with strict cookie policies
 */
export const isIOS = () => {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}

/**
 * Detect if the app is running as an iOS PWA (added to home screen)
 * This is important for push notifications which require PWA mode on iOS
 */
export const isIOSPWA = () => {
  return isIOS() && window.navigator.standalone === true
}

/**
 * Check if push notifications are supported
 * Returns false on iOS Safari unless running as PWA
 */
export const isPushNotificationSupported = () => {
  // Basic feature detection
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return false
  }

  // iOS requires PWA mode for push notifications (iOS 16.4+)
  if (isIOS() && !isIOSPWA()) {
    return false
  }

  return true
}

/**
 * Detect if the browser is Firefox
 * Firefox has Enhanced Tracking Protection that blocks cross-site cookies
 */
export const isFirefox = () => {
  return /Firefox/.test(navigator.userAgent)
}

/**
 * Detect if the browser is Firefox in a cross-origin context
 * where Enhanced Tracking Protection (ETP) may block cookies
 * Returns true if:
 * - Browser is Firefox
 * - Running in cross-origin context (different origin for frontend/backend)
 * - ETP may be blocking third-party cookies
 */
export const isFirefoxCrossOrigin = () => {
  if (!isFirefox()) {
    return false
  }

  try {
    // Check if frontend and backend are on different origins
    const frontendOrigin = window.location.origin
    const backendUrl = import.meta.env.VITE_API_URL || ''

    // If no API URL configured, assume same-origin
    if (!backendUrl) {
      return false
    }

    // Extract origin from backend URL
    const backendOrigin = new URL(backendUrl).origin

    // If origins differ, this is cross-origin and ETP may block cookies
    return frontendOrigin !== backendOrigin
  } catch (error) {
    logger.warn('[BrowserDetection] Failed to detect Firefox cross-origin context:', error)
    // Assume cross-origin for safety on Firefox
    return true
  }
}

/**
 * Detect if the browser is in Private/Incognito mode
 * This is approximate and may not work in all browsers
 */
export const isPrivateMode = async () => {
  try {
    // Test localStorage access (blocked in some private modes)
    const testKey = '__private_mode_test__'
    localStorage.setItem(testKey, '1')
    localStorage.removeItem(testKey)

    // Test IndexedDB (blocked in Safari private mode)
    if ('indexedDB' in window) {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('test')
        request.onsuccess = () => resolve(true)
        request.onerror = () => resolve(false)
      })

      if (!db) return true
    }

    return false
  } catch (e) {
    // If localStorage or IndexedDB throws, likely in private mode
    return true
  }
}

/**
 * Test if cookies are being sent to the server
 * Makes a test request and checks if cookies were received
 */
export const testCookieSupport = async (apiInstance) => {
  try {
    const response = await apiInstance.get('/api/auth/cookie-debug')
    const data = response.data

    return {
      cookiesWorking: data.cookies_received?.has_access_token || false,
      authHeaderWorking: data.headers?.has_authorization || false,
      isAuthenticated: data.authentication?.is_authenticated || false,
      authMethod: data.authentication?.auth_method || null,
      browserInfo: data.browser || {},
      recommendations: data.recommendations || []
    }
  } catch (error) {
    logger.error('[BrowserDetection] Failed to test cookie support:', error)
    return {
      cookiesWorking: false,
      authHeaderWorking: false,
      isAuthenticated: false,
      authMethod: null,
      browserInfo: {},
      recommendations: []
    }
  }
}

/**
 * Determine if we should use Authorization headers instead of cookies
 * Returns true if:
 * - Browser is Safari
 * - Browser is on iOS
 * - Browser is Firefox (Enhanced Tracking Protection blocks cross-site cookies)
 * - Cookies are known to be blocked
 */
export const shouldUseAuthHeaders = () => {
  // Always use auth headers for Safari/iOS/Firefox (most reliable)
  if (isSafari() || isIOS() || isFirefox()) {
    return true
  }

  // Check if we have a stored preference (from previous cookie test)
  const storedPreference = sessionStorage.getItem('auth_method_preference')
  if (storedPreference === 'headers') {
    return true
  }

  return false
}

/**
 * Store the preferred authentication method for this session
 */
export const setAuthMethodPreference = (method) => {
  try {
    sessionStorage.setItem('auth_method_preference', method)
  } catch (error) {
    logger.warn('[BrowserDetection] Failed to store auth method preference:', error)
  }
}

/**
 * Get browser compatibility info for debugging
 */
export const getBrowserInfo = () => {
  return {
    isSafari: isSafari(),
    isIOS: isIOS(),
    isFirefox: isFirefox(),
    isFirefoxCrossOrigin: isFirefoxCrossOrigin(),
    userAgent: navigator.userAgent,
    cookiesEnabled: navigator.cookieEnabled,
    platform: navigator.platform,
    vendor: navigator.vendor
  }
}

/**
 * Log browser detection info to console (development only)
 */
export const logBrowserInfo = () => {
  if (import.meta.env.DEV) {
    logger.debug('[BrowserDetection] Browser Info:', getBrowserInfo())
    logger.debug('[BrowserDetection] Should use auth headers:', shouldUseAuthHeaders())
  }
}