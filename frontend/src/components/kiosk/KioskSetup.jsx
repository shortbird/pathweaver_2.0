import React, { useState } from 'react'

/**
 * One-time device setup: an admin pastes the device token (shown once when the
 * device was provisioned in SIS Settings). Validated by attempting a roster
 * fetch; on success the token is remembered in localStorage for this device.
 */
export default function KioskSetup({ onSubmit, error, busy }) {
  const [entered, setEntered] = useState('')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 font-poppins p-6">
      <div className="bg-white rounded-3xl shadow-lg p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-neutral-900 text-center">Kiosk setup</h1>
        <p className="text-neutral-500 text-center mt-1">
          Paste this device's code to connect it to your school.
        </p>
        <input
          value={entered}
          onChange={(e) => setEntered(e.target.value.trim())}
          placeholder="ksk_..."
          aria-label="Device code"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="w-full mt-4 rounded-xl border border-neutral-200 px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
        />
        {error && <p className="text-rose-600 text-sm mt-2">{error}</p>}
        <button
          onClick={() => entered && onSubmit(entered)}
          disabled={busy || !entered}
          className="w-full mt-4 rounded-xl py-3 text-white font-semibold bg-gradient-to-r from-optio-purple to-optio-pink disabled:opacity-50"
        >
          {busy ? 'Checking...' : 'Set up device'}
        </button>
      </div>
    </div>
  )
}
