import React, { useState } from 'react'
import useVersionCheck from '../hooks/useVersionCheck'

/**
 * Non-intrusive "a new version is available" banner. Appears when a newer build is
 * deployed; the app will also auto-reload on the next navigation (see
 * useVersionCheck). Dismissible — dismissing just hides the banner; the next
 * navigation still picks up the new version safely.
 *
 * Must render inside the Router (useVersionCheck uses useLocation).
 */
const UpdateAvailableBanner = () => {
  const { updateAvailable, reload } = useVersionCheck()
  const [dismissed, setDismissed] = useState(false)

  if (!updateAvailable || dismissed) return null

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 rounded-full bg-neutral-900 text-white pl-4 pr-2 py-2 shadow-lg"
    >
      <span className="text-sm">A new version of Optio is available.</span>
      <button
        onClick={reload}
        className="text-sm font-semibold rounded-full bg-gradient-to-r from-optio-purple to-optio-pink px-3 py-1"
      >
        Reload
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="text-neutral-400 hover:text-white px-1"
      >
        ✕
      </button>
    </div>
  )
}

export default UpdateAvailableBanner
