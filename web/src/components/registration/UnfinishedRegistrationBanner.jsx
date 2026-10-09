import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { XMarkIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { queryKeys } from '../../utils/queryKeys'

const DISMISS_KEY = 'optio-unfinished-registration-dismissed'

// Dismissed for this sign-in only: the banner is a reminder, so it comes back
// the next time they open the app. Storage can be absent (Safari with site
// data blocked), and then a dismissal just lasts until the page reloads.
function readDismissed(userId) {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === userId
  } catch {
    return false
  }
}
function writeDismissed(userId) {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, userId)
  } catch {
    // No storage: the dismissal lasts until the page reloads.
  }
}

/**
 * "Your Optio Academy registration isn't finished" (2026-10-09), across the
 * top of every page for anyone an unfinished registration names.
 *
 * Two readers (backend routes/registration_funnel.unfinished_registration):
 *   - 'own': the person who started it. A pure parent never sees this -- the
 *     registration gate in PrivateRoute locks them to the funnel, on purpose
 *     -- so it is for everyone the lock lets through: a staff member who is
 *     also a parent, and a student who started a registration themselves.
 *   - 'student': a child on someone else's registration. The funnel belongs
 *     to whoever started it, so the banner names that account (often the
 *     student's own second account, since students began registering
 *     themselves) instead of offering a button that would turn them away.
 */
export default function UnfinishedRegistrationBanner() {
  const { user, isAuthenticated } = useAuth()
  const { pathname } = useLocation()
  const [dismissed, setDismissed] = useState(() => (user?.id ? readDismissed(user.id) : false))

  const { data: reg } = useQuery({
    queryKey: queryKeys.family.unfinishedRegistration(),
    queryFn: async () => {
      const { data } = await api.get('/api/registration/unfinished')
      return data?.registration || null
    },
    enabled: Boolean(isAuthenticated && user?.id),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  })

  // The funnel itself is where they finish; a banner there says it twice.
  if (!reg || dismissed || pathname.startsWith('/enroll')) return null

  const school = reg.organization_name || 'Optio Academy'
  const dismiss = () => {
    writeDismissed(user.id)
    setDismissed(true)
  }

  return (
    <div
      role="status"
      data-testid="unfinished-registration-banner"
      className="mx-4 mt-4 sm:mx-6 rounded-xl bg-gradient-primary text-white px-4 py-3 flex items-start gap-3 font-poppins"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">Your {school} registration isn’t finished yet</p>
        {reg.kind === 'own' ? (
          <p className="mt-0.5 text-xs leading-snug text-white/90">
            Pick up where you left off. It only takes a few minutes.
          </p>
        ) : (
          <p className="mt-0.5 text-xs leading-snug text-white/90">
            {/* An Apple sign-up's address is a private relay nobody recognizes. */}
            {reg.registrant_email?.endsWith('privaterelay.appleid.com')
              ? <>It was started with Sign in with Apple{reg.registrant_first_name ? ` by ${reg.registrant_first_name}` : ''}. Sign in to that account to finish it.</>
              : reg.registrant_email
                ? <>It was started from {reg.registrant_email}. Sign in with that account to finish it, or ask whoever did to finish it.</>
                : <>Ask the parent who started it to sign in and finish it.</>}
          </p>
        )}
      </div>
      {reg.kind === 'own' && (
        <Link
          to="/enroll/resume"
          className="shrink-0 self-center rounded-lg bg-white text-optio-purple text-sm font-semibold px-3 py-2 min-h-[44px] flex items-center hover:bg-white/90"
        >
          Finish registration
        </Link>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 text-white/80 hover:text-white"
      >
        <XMarkIcon className="w-5 h-5" aria-hidden="true" />
      </button>
    </div>
  )
}
