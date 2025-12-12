import React, { useState, useEffect } from 'react'
import { X, AlertCircle, CheckCircle, Smartphone } from 'lucide-react'
import { isSafari, isIOS, testCookieSupport } from '../../utils/browserDetection'
import api from '../../services/api'

/**
 * Safari Troubleshooting Banner
 * Displays helpful information for Safari/iOS users about cookie compatibility
 * Only shows on Safari/iOS and can be dismissed
 */
const SafariTroubleshootingBanner = () => {
  const [visible, setVisible] = useState(false)
  const [diagnostics, setDiagnostics] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkCompatibility = async () => {
      // Only run on Safari/iOS
      if (!isSafari() && !isIOS()) {
        setLoading(false)
        return
      }

      // Check if user dismissed banner this session
      const dismissed = sessionStorage.getItem('safari_banner_dismissed')
      if (dismissed) {
        setLoading(false)
        return
      }

      // Run diagnostics
      try {
        const results = await testCookieSupport(api)
        setDiagnostics(results)

        // Show banner if:
        // 1. User is on Safari/iOS
        // 2. Either cookies are blocked OR we want to inform about auth method
        // 3. User is authenticated (so they can see their auth method)
        if (results.isAuthenticated) {
          setVisible(true)
        }
      } catch (error) {
        console.error('[SafariBanner] Failed to run diagnostics:', error)
      } finally {
        setLoading(false)
      }
    }

    checkCompatibility()
  }, [])

  const handleDismiss = () => {
    setVisible(false)
    sessionStorage.setItem('safari_banner_dismissed', 'true')
  }

  if (loading || !visible || !diagnostics) {
    return null
  }

  const isWorking = diagnostics.cookiesWorking || diagnostics.authHeaderWorking
  const authMethod = diagnostics.authMethod || 'Authorization header'

  return (
    <div className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-40 w-full max-w-2xl px-4`}>
      <div className={`rounded-lg shadow-lg p-4 ${
        isWorking ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'
      }`}>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {isWorking ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-yellow-600" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Smartphone className="w-4 h-4 text-gray-600" />
              <h3 className={`font-semibold text-sm ${
                isWorking ? 'text-green-900' : 'text-yellow-900'
              }`}>
                {isIOS() ? 'iOS' : 'Safari'} Browser Detected
              </h3>
            </div>

            <div className="space-y-2">
              {isWorking ? (
                <>
                  <p className="text-sm text-green-800">
                    Your authentication is working correctly using <strong>{authMethod}</strong>.
                  </p>
                  {diagnostics.authMethod === 'Authorization header' && (
                    <p className="text-xs text-green-700">
                      Safari may block cookies, but we're using a backup method that works perfectly.
                      You won't notice any difference in functionality.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm text-yellow-800">
                    We detected you're using {isIOS() ? 'an iOS device' : 'Safari'}. If you experience
                    login issues, try refreshing the page or clearing your browser cache.
                  </p>
                  <div className="text-xs text-yellow-700 space-y-1">
                    <p className="font-medium">Troubleshooting tips:</p>
                    <ul className="list-disc list-inside space-y-0.5 ml-2">
                      <li>Disable "Prevent Cross-Site Tracking" in Safari settings</li>
                      <li>Try logging out and logging back in</li>
                      <li>Clear Safari cache and cookies</li>
                      <li>Use a different browser if issues persist</li>
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 rounded hover:bg-white/50 transition-colors"
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Debug info - only in development */}
        {import.meta.env.DEV && diagnostics && (
          <details className="mt-3 pt-3 border-t border-gray-200">
            <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-900">
              Debug Info (dev only)
            </summary>
            <pre className="mt-2 text-xs bg-white/50 p-2 rounded overflow-auto max-h-32">
              {JSON.stringify(diagnostics, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}

export default SafariTroubleshootingBanner
