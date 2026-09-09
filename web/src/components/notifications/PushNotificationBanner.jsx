/**
 * Push Notification Banner Component
 *
 * Prompts users to enable push notifications for messaging.
 * Handles iOS PWA detection and provides guidance for adding to home screen.
 */

import React, { useState, useEffect } from 'react'
import { BellIcon, XMarkIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import { usePushNotifications, isIOSPWA } from '../../hooks/usePushNotifications'
import { isIOS } from '../../utils/browserDetection'

const BANNER_DISMISSED_KEY = 'push_notification_banner_dismissed'
const BANNER_DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * Check if the banner was recently dismissed
 */
function wasBannerDismissed() {
  try {
    const dismissed = localStorage.getItem(BANNER_DISMISSED_KEY)
    if (!dismissed) return false

    const dismissedAt = parseInt(dismissed, 10)
    return Date.now() - dismissedAt < BANNER_DISMISS_DURATION
  } catch {
    return false
  }
}

/**
 * Mark the banner as dismissed
 */
function dismissBanner() {
  try {
    localStorage.setItem(BANNER_DISMISSED_KEY, Date.now().toString())
  } catch {
    // Ignore localStorage errors
  }
}

const PushNotificationBanner = () => {
  const [visible, setVisible] = useState(false)
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)

  const {
    isSupported,
    isSubscribed,
    permission,
    loading,
    error,
    needsIOSPWA,
    vapidConfigured,
    canSubscribe,
    subscribe
  } = usePushNotifications()

  // Determine if we should show the banner
  useEffect(() => {
    // Don't show if:
    // - Already subscribed
    // - Not supported
    // - Permission denied (can't recover)
    // - VAPID not configured
    // - Recently dismissed
    // - Still loading
    if (loading) return

    const shouldShow = (
      vapidConfigured &&
      !isSubscribed &&
      isSupported &&
      permission !== 'denied' &&
      !wasBannerDismissed()
    )

    setVisible(shouldShow)
  }, [isSubscribed, isSupported, permission, vapidConfigured, loading])

  // Handle enable button click
  const handleEnable = async () => {
    if (needsIOSPWA) {
      setShowIOSInstructions(true)
      return
    }

    const success = await subscribe()
    if (success) {
      setVisible(false)
    }
  }

  // Handle dismiss
  const handleDismiss = () => {
    dismissBanner()
    setVisible(false)
  }

  // Don't render if not visible
  if (!visible) return null

  // iOS PWA Instructions Modal
  if (showIOSInstructions) {
    return (
      <div className="bg-gradient-to-r from-optio-purple to-optio-pink text-white px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <ExclamationCircleIcon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">Add to Home Screen Required</p>
            <p className="text-sm text-white/90 mt-1">
              To receive push notifications on iOS, please add this site to your home screen:
            </p>
            <ol className="text-sm text-white/90 mt-2 space-y-1 list-decimal list-inside">
              <li>Tap the Share button <span className="inline-block px-1">(square with arrow)</span></li>
              <li>Scroll down and tap "Add to Home Screen"</li>
              <li>Tap "Add" in the top right</li>
              <li>Open Optio from your home screen and try again</li>
            </ol>
          </div>
          <button
            onClick={() => setShowIOSInstructions(false)}
            className="flex-shrink-0 p-1 hover:bg-white/10 rounded transition-colors"
            aria-label="Close instructions"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-r from-optio-purple to-optio-pink text-white px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          <BellIcon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            Never miss a message
          </p>
          <p className="text-xs text-white/80 hidden sm:block">
            Enable notifications to get alerts when you receive new messages
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleEnable}
            disabled={loading || !canSubscribe}
            className="px-3 py-1.5 bg-white text-optio-purple text-sm font-medium rounded-md hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : 'Enable'}
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 hover:bg-white/10 rounded transition-colors"
            aria-label="Dismiss"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
      {error && (
        <p className="text-xs text-white/80 mt-1 flex items-center gap-1">
          <ExclamationCircleIcon className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * Compact version for settings or other locations
 */
export const PushNotificationToggle = () => {
  const {
    isSupported,
    isSubscribed,
    permission,
    loading,
    error,
    needsIOSPWA,
    vapidConfigured,
    canSubscribe,
    subscribe,
    unsubscribe
  } = usePushNotifications()

  if (!isSupported || !vapidConfigured) {
    return (
      <div className="text-sm text-gray-500">
        Push notifications are not available in this browser.
      </div>
    )
  }

  if (permission === 'denied') {
    return (
      <div className="text-sm text-gray-500">
        Push notifications are blocked. Please enable them in your browser settings.
      </div>
    )
  }

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe()
    } else {
      await subscribe()
    }
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium text-gray-900">Push Notifications</p>
        <p className="text-sm text-gray-500">
          {isSubscribed
            ? 'You will receive notifications for new messages'
            : 'Enable to get notified of new messages'}
        </p>
        {needsIOSPWA && !isSubscribed && (
          <p className="text-xs text-amber-600 mt-1">
            Add this site to your home screen to enable notifications on iOS
          </p>
        )}
        {error && (
          <p className="text-xs text-red-600 mt-1">{error}</p>
        )}
      </div>
      <button
        onClick={handleToggle}
        disabled={loading || (!isSubscribed && !canSubscribe)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-optio-purple focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
          isSubscribed ? 'bg-optio-purple' : 'bg-gray-200'
        }`}
        role="switch"
        aria-checked={isSubscribed}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            isSubscribed ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

export default PushNotificationBanner
