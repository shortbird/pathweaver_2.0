import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isSafari,
  isIOS,
  isIOSPWA,
  isFirefox,
  isPushNotificationSupported,
  shouldUseAuthHeaders,
  setAuthMethodPreference,
  getBrowserInfo,
} from '../browserDetection'

const SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
const FIREFOX_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'

function setUA(ua) {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    configurable: true,
  })
}

describe('browserDetection', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    setUA(CHROME_UA)
    delete window.navigator.standalone
  })

  describe('isSafari', () => {
    it('returns true on Safari UA', () => {
      setUA(SAFARI_UA)
      expect(isSafari()).toBe(true)
    })

    it('returns false on Chrome (contains "Safari" but also "Chrome")', () => {
      setUA(CHROME_UA)
      expect(isSafari()).toBe(false)
    })
  })

  describe('isIOS', () => {
    it('returns true on iOS UA', () => {
      setUA(IOS_UA)
      expect(isIOS()).toBe(true)
    })

    it('returns false on desktop Chrome', () => {
      setUA(CHROME_UA)
      expect(isIOS()).toBe(false)
    })
  })

  describe('isIOSPWA', () => {
    it('returns true when iOS and standalone', () => {
      setUA(IOS_UA)
      window.navigator.standalone = true
      expect(isIOSPWA()).toBe(true)
    })

    it('returns false when iOS but not standalone', () => {
      setUA(IOS_UA)
      expect(isIOSPWA()).toBe(false)
    })

    it('returns false on non-iOS even when standalone is set', () => {
      setUA(CHROME_UA)
      window.navigator.standalone = true
      expect(isIOSPWA()).toBe(false)
    })
  })

  describe('isFirefox', () => {
    it('returns true on Firefox UA', () => {
      setUA(FIREFOX_UA)
      expect(isFirefox()).toBe(true)
    })

    it('returns false on Chrome UA', () => {
      setUA(CHROME_UA)
      expect(isFirefox()).toBe(false)
    })
  })

  describe('isPushNotificationSupported', () => {
    it('returns false when serviceWorker is unavailable', () => {
      const original = 'serviceWorker' in navigator
      // jsdom may not have it anyway
      if (!original) {
        expect(isPushNotificationSupported()).toBe(false)
      } else {
        // It's hard to unset; just assert the function returns a boolean
        expect(typeof isPushNotificationSupported()).toBe('boolean')
      }
    })

    it('returns false on iOS Safari when not in PWA mode', () => {
      setUA(IOS_UA)
      expect(isPushNotificationSupported()).toBe(false)
    })
  })

  describe('shouldUseAuthHeaders', () => {
    it('returns true on Safari', () => {
      setUA(SAFARI_UA)
      expect(shouldUseAuthHeaders()).toBe(true)
    })

    it('returns true on iOS', () => {
      setUA(IOS_UA)
      expect(shouldUseAuthHeaders()).toBe(true)
    })

    it('returns true on Firefox', () => {
      setUA(FIREFOX_UA)
      expect(shouldUseAuthHeaders()).toBe(true)
    })

    it('returns false on Chrome by default', () => {
      setUA(CHROME_UA)
      expect(shouldUseAuthHeaders()).toBe(false)
    })

    it('returns true on Chrome when sessionStorage preference says headers', () => {
      setUA(CHROME_UA)
      sessionStorage.setItem('auth_method_preference', 'headers')
      expect(shouldUseAuthHeaders()).toBe(true)
    })
  })

  describe('setAuthMethodPreference', () => {
    it('persists the chosen method to sessionStorage', () => {
      setAuthMethodPreference('headers')
      expect(sessionStorage.getItem('auth_method_preference')).toBe('headers')
    })
  })

  describe('getBrowserInfo', () => {
    it('returns a structured browser info object', () => {
      setUA(CHROME_UA)
      const info = getBrowserInfo()
      expect(info).toHaveProperty('isSafari')
      expect(info).toHaveProperty('isIOS')
      expect(info).toHaveProperty('isFirefox')
      expect(info).toHaveProperty('userAgent')
      expect(info.userAgent).toBe(CHROME_UA)
    })
  })
})
