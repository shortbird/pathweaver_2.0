/**
 * Push Notifications Hook
 *
 * Manages Web Push notification subscriptions for the current user.
 * Handles browser permission requests, subscription management,
 * and iOS PWA detection.
 */

import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import logger from '../utils/logger'
import { isIOS, isSafari } from '../utils/browserDetection'

/**
 * Convert a base64 string to Uint8Array for applicationServerKey
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Check if running as iOS PWA (added to home screen)
 */
export function isIOSPWA() {
  return isIOS() && window.navigator.standalone === true
}

/**
 * Check if push notifications are supported in this browser
 */
export function isPushSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * Check if we're on iOS but not in PWA mode
 * (Push only works on iOS when added to home screen)
 */
export function isIOSNeedsPWA() {
  return isIOS() && !isIOSPWA()
}

/**
 * Get current notification permission status
 */
export function getPermissionStatus() {
  if (!('Notification' in window)) {
    return 'unsupported'
  }
  return Notification.permission // 'default', 'granted', 'denied'
}

/**
 * Hook for managing push notification subscriptions
 */
export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [permission, setPermission] = useState('default')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [vapidKey, setVapidKey] = useState(null)
  const [needsIOSPWA, setNeedsIOSPWA] = useState(false)

  // Check support and current status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        // Check browser support
        const supported = isPushSupported()
        setIsSupported(supported)

        // Check if iOS needs PWA
        setNeedsIOSPWA(isIOSNeedsPWA())

        if (!supported) {
          setLoading(false)
          return
        }

        // Get current permission
        setPermission(getPermissionStatus())

        // Check if already subscribed
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        setIsSubscribed(!!subscription)

        // Fetch VAPID key from server
        try {
          const response = await api.get('/api/push/vapid-public-key')
          if (response.data?.vapid_public_key) {
            setVapidKey(response.data.vapid_public_key)
          }
        } catch (err) {
          logger.warn('[Push] VAPID key not available:', err)
          // Server might not have push configured
        }

        setLoading(false)
      } catch (err) {
        logger.error('[Push] Error checking status:', err)
        setError(err.message)
        setLoading(false)
      }
    }

    checkStatus()
  }, [])

  /**
   * Request notification permission and subscribe to push
   */
  const subscribe = useCallback(async () => {
    if (!isSupported || !vapidKey) {
      setError('Push notifications not supported or not configured')
      return false
    }

    if (needsIOSPWA) {
      setError('Please add this site to your home screen first')
      return false
    }

    setLoading(true)
    setError(null)

    try {
      // Request permission if not already granted
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission()
        setPermission(result)

        if (result !== 'granted') {
          setError('Notification permission denied')
          setLoading(false)
          return false
        }
      } else if (Notification.permission === 'denied') {
        setError('Notifications are blocked. Please enable in browser settings.')
        setLoading(false)
        return false
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      })

      // Send subscription to server
      const subscriptionJson = subscription.toJSON()
      await api.post('/api/push/subscribe', {
        subscription: {
          endpoint: subscriptionJson.endpoint,
          keys: subscriptionJson.keys
        }
      })

      setIsSubscribed(true)
      logger.info('[Push] Successfully subscribed to push notifications')
      setLoading(false)
      return true

    } catch (err) {
      logger.error('[Push] Error subscribing:', err)
      setError(err.message || 'Failed to subscribe to notifications')
      setLoading(false)
      return false
    }
  }, [isSupported, vapidKey, needsIOSPWA])

  /**
   * Unsubscribe from push notifications
   */
  const unsubscribe = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        // Unsubscribe from push manager
        await subscription.unsubscribe()

        // Remove from server
        await api.post('/api/push/unsubscribe', {
          endpoint: subscription.endpoint
        })
      }

      setIsSubscribed(false)
      logger.info('[Push] Successfully unsubscribed from push notifications')
      setLoading(false)
      return true

    } catch (err) {
      logger.error('[Push] Error unsubscribing:', err)
      setError(err.message || 'Failed to unsubscribe')
      setLoading(false)
      return false
    }
  }, [])

  /**
   * Send a test push notification
   */
  const sendTestNotification = useCallback(async () => {
    try {
      const response = await api.post('/api/push/test', {})
      return response.data
    } catch (err) {
      logger.error('[Push] Error sending test notification:', err)
      throw err
    }
  }, [])

  return {
    // State
    isSupported,
    isSubscribed,
    permission,
    loading,
    error,
    needsIOSPWA,
    vapidConfigured: !!vapidKey,

    // Actions
    subscribe,
    unsubscribe,
    sendTestNotification,

    // Helpers
    canSubscribe: isSupported && !needsIOSPWA && permission !== 'denied' && !!vapidKey
  }
}

export default usePushNotifications
