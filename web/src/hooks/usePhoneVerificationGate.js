import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'
import { isMasquerading } from '../services/masqueradeService'

// Gate for the phone number an org requires its adults to verify.
//
// Orgs that opt in (feature_flags.sis_settings.require_adult_phone_verification
// — iCreate, Aug 2026) require every adult account — org admins, campus
// coordinators, teachers, parents — to verify a phone number by SMS code
// before using the platform. Until then, every authenticated route lands on
// /verify-phone. This is the router half of the rule — the enforcing half is
// backend/middleware/phone_verification_gate.py, which answers the same
// question for callers that never load the router at all. The two must agree,
// so this hook asks the backend rather than deciding anything itself.
//
// Modelled on useRequiredDocumentsGate, deliberately: one cached lookup per
// user for the session, only org users are eligible, and a failed lookup means
// NOT blocked (the backend still holds the real line).
//
// Masquerade IS exempt, and that is a correction rather than a convenience.
// The original rule was "an admin viewing as a held adult sees the hold,
// because that is what the adult sees" — but this hold can only be lifted by
// typing a code texted to that adult's phone, which an admin does not have. So
// the admin was held somewhere they could never finish, on pages that render no
// app chrome and therefore no way back out (2026-08-22: a masquerade session
// bounced between /verify-phone and /family/required-documents with no exit).
// Seeing what the user sees is not worth a trap with no door.
//
// Unlike the documents gate this one is used on BOTH surfaces: PrivateRoute on
// the learning host and SisLayout on the SIS host, because teachers and
// coordinators live on the SIS console, which PrivateRoute never wraps.

let cache = { userId: null, blocked: null, promise: null }

export const clearPhoneVerificationGate = () => {
  cache = { userId: null, blocked: null, promise: null }
}

export function usePhoneVerificationGate(user, isAuthenticated) {
  // Only org users can be required to verify, so only they pay for the check —
  // and never while masquerading, which cannot satisfy an SMS hold.
  const eligible = !!(isAuthenticated && user?.organization_id && !isMasquerading())
  const cached = cache.userId === user?.id && cache.blocked !== null
  const [state, setState] = useState(() => (
    cached ? { checking: false, blocked: cache.blocked }
      : { checking: eligible, blocked: false }
  ))

  useEffect(() => {
    if (!eligible) return undefined
    if (cache.userId === user.id && cache.blocked !== null) {
      setState({ checking: false, blocked: cache.blocked })
      return undefined
    }
    if (!cache.promise || cache.userId !== user.id) {
      cache.userId = user.id
      cache.blocked = null
      cache.promise = api.get('/api/phone-verification/status')
        .then((r) => {
          cache.blocked = !!(r.data?.required && !r.data?.verified)
          return cache.blocked
        })
        .catch(() => { cache.blocked = false; return false })
    }
    let alive = true
    cache.promise.then((v) => { if (alive) setState({ checking: false, blocked: v }) })
    return () => { alive = false }
  }, [eligible, user?.id])

  return eligible ? state : { checking: false, blocked: false }
}

// Called by the verification page once the code checks out, so the redirect it
// was holding lifts without a reload.
export function useClearPhoneVerificationGate() {
  return useCallback(() => clearPhoneVerificationGate(), [])
}
