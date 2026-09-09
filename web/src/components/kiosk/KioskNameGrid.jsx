import React, { useRef, useState } from 'react'
import ModalOverlay from '../ui/ModalOverlay'

/**
 * The kiosk's "Who's here?" screen: large touch-friendly student cards
 * (photo or initials + first name) under the org's logo and name.
 *
 * A small gear icon in the corner opens device settings, guarded by a
 * triple-tap (3 taps within 1.5s) so students don't wander in by accident.
 */
const StudentCard = ({ student, accent, busy, onPick }) => (
  <button
    disabled={busy}
    onClick={() => onPick(student)}
    className="flex flex-col items-center gap-3 bg-white rounded-3xl p-5 shadow-sm hover:shadow-md active:scale-95 transition disabled:opacity-50 touch-manipulation"
  >
    {student.avatar_url ? (
      <img src={student.avatar_url} alt="" className="w-24 h-24 rounded-full object-cover" />
    ) : (
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold bg-gradient-to-br from-optio-purple to-optio-pink"
        style={accent ? { background: accent } : undefined}
      >
        {(student.name || '?').charAt(0).toUpperCase()}
      </div>
    )}
    <span className="text-lg font-bold text-neutral-900">{student.name}</span>
  </button>
)

export default function KioskNameGrid({ org, students, error, busy, onPick, onForget }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const taps = useRef([])

  const gearTap = () => {
    const now = Date.now()
    taps.current = [...taps.current.filter((t) => now - t < 1500), now]
    if (taps.current.length >= 3) {
      taps.current = []
      setSettingsOpen(true)
    }
  }

  const accent = org?.colors?.primary || null

  return (
    <div className="min-h-screen bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 font-poppins p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col items-center">
          {org?.logo_url && (
            <img src={org.logo_url} alt={org?.name || 'School logo'} className="h-20 w-auto object-contain mb-3" />
          )}
          {org?.name && <p className="text-neutral-500 font-semibold">{org.name}</p>}
          <h1 className="text-3xl font-bold text-neutral-900 mt-1" style={accent ? { color: accent } : undefined}>
            Tap your name
          </h1>
        </div>
        {error && <p className="text-rose-600 text-center mt-3">{error}</p>}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5 mt-8">
          {(students || []).map((s) => (
            <StudentCard key={s.id} student={s} accent={accent} busy={busy} onPick={onPick} />
          ))}
          {(students || []).length === 0 && (
            <p className="text-neutral-500 col-span-full text-center">No students on this device yet.</p>
          )}
        </div>
      </div>

      {/* Gear: triple-tap to open device settings. */}
      <button
        onClick={gearTap}
        aria-label="Device settings"
        className="fixed bottom-4 right-4 p-3 rounded-full text-neutral-300 hover:text-neutral-400"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {settingsOpen && (
        <ModalOverlay onClose={() => setSettingsOpen(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-neutral-900">Device settings</h2>
            <p className="text-sm text-neutral-500 mt-1">
              Forgetting this device removes its code. You will need a new code from an admin to
              set it up again.
            </p>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setSettingsOpen(false)}
                className="flex-1 rounded-xl py-2.5 border border-neutral-200 font-semibold text-neutral-700"
              >
                Cancel
              </button>
              <button
                onClick={() => { setSettingsOpen(false); onForget() }}
                className="flex-1 rounded-xl py-2.5 bg-rose-600 text-white font-semibold"
              >
                Forget this device
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}
