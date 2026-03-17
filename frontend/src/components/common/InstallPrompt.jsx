import React, { useState, useEffect } from 'react'

const DISMISS_KEY = 'optio_install_prompt_dismissed'
const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

function getMobilePlatform() {
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return null
}

function wasDismissedRecently() {
  try {
    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (!dismissed) return false
    return Date.now() - parseInt(dismissed, 10) < DISMISS_DURATION_MS
  } catch {
    return false
  }
}

const InstallPrompt = () => {
  const [platform, setPlatform] = useState(null)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Don't show if already installed or recently dismissed
    if (isStandalone() || wasDismissedRecently()) return

    const mobilePlatform = getMobilePlatform()
    if (!mobilePlatform) return

    setPlatform(mobilePlatform)

    if (mobilePlatform === 'android') {
      // Android: listen for the browser's beforeinstallprompt event
      const handler = (e) => {
        e.preventDefault()
        setDeferredPrompt(e)
        setVisible(true)
      }
      window.addEventListener('beforeinstallprompt', handler)

      // Fallback: if the event doesn't fire within 3s, show manual instructions
      const fallbackTimer = setTimeout(() => {
        setVisible((v) => {
          if (!v) {
            setPlatform('android-manual')
            return true
          }
          return v
        })
      }, 3000)

      return () => {
        window.removeEventListener('beforeinstallprompt', handler)
        clearTimeout(fallbackTimer)
      }
    } else {
      // iOS: no native install prompt, show manual instructions after short delay
      const timer = setTimeout(() => setVisible(true), 2000)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const result = await deferredPrompt.userChoice
      if (result.outcome === 'accepted') {
        dismiss()
      }
      setDeferredPrompt(null)
    }
  }

  const dismiss = () => {
    setVisible(false)
    try {
      localStorage.setItem(DISMISS_KEY, Date.now().toString())
    } catch {
      // localStorage unavailable
    }
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl border border-gray-200 p-4">
        <div className="flex items-start gap-3">
          <img
            src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg"
            alt="Optio"
            className="flex-shrink-0 w-10 h-10 rounded-xl"
          />

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">
              Install Optio
            </h3>

            {platform === 'ios' && (
              <p className="mt-1 text-sm text-gray-600">
                Tap the{' '}
                <svg className="inline w-4 h-4 text-blue-500 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {' '}share button, then <strong>Add to Home Screen</strong>.
              </p>
            )}

            {platform === 'android' && deferredPrompt && (
              <p className="mt-1 text-sm text-gray-600">
                Add Optio to your home screen for quick access.
              </p>
            )}

            {platform === 'android-manual' && (
              <p className="mt-1 text-sm text-gray-600">
                Tap your browser's menu (&#8942;), then <strong>Add to Home Screen</strong>.
              </p>
            )}
          </div>

          <button
            onClick={dismiss}
            className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 rounded-full"
            aria-label="Dismiss install prompt"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {platform === 'android' && deferredPrompt && (
          <button
            onClick={handleInstall}
            className="mt-3 w-full py-2 px-4 bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-medium rounded-lg"
          >
            Install
          </button>
        )}
      </div>
    </div>
  )
}

export default InstallPrompt
