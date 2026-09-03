import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'
import { isMasquerading } from '../services/masqueradeService'

// Gate for school paperwork a family must sign before the platform opens.
//
// The school marks a document it sends as required; until the guardian signs
// it, every authenticated route lands on /family/required-documents. This is
// the router half of the rule — the enforcing half is
// backend/middleware/signature_gate.py, which answers the same question for
// callers that never load the router at all (a stale tab, the mobile app, a
// console). The two must agree, so this hook asks the backend rather than
// deciding anything itself.
//
// Modelled on useRegistrationGate, deliberately: one cached lookup per
// user for the session, only org users are eligible, and a failed lookup means
// NOT blocked. A network error must never be the thing that locks a family out
// of their school — the backend still holds the real line, so failing open
// here costs nothing.
//
// Two differences from the registration gate, both consequences of what this
// gates:
//
//   - Masquerade IS exempt (corrected 2026-08-22). An admin cannot sign a
//     family's paperwork for them, so holding them here is a flow they can
//     never finish; combined with the phone hold it produced a redirect loop
//     with no way out, because neither hold page renders the app chrome that
//     carries the exit-masquerade control.
//   - The superseded rule was: an admin viewing as a held parent sees the
//     hold, because that is what the parent sees. The registration gate's
//     hold, because that is what the parent sees.
//
//   - Staff are exempt on the SERVER, not here. A parent who also teaches is
//     not held, and the server says so by returning blocked:false — so this
//     hook needs no role logic and cannot disagree with the middleware about
//     who counts as staff.

let cache = { userId: null, blocked: null, promise: null }

export const clearRequiredDocumentsGate = () => {
  cache = { userId: null, blocked: null, promise: null }
}

export function useRequiredDocumentsGate(user, isAuthenticated) {
  // Only org users can be sent school paperwork, so only they pay for the
  // check — and only they can ever see the spinner it costs.
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
      cache.promise = api.get('/api/sis/parent/required-documents')
        .then((r) => {
          cache.blocked = !!r.data?.blocked
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

// Called by the signing page once the last required document is signed, so the
// redirect it was holding lifts without a reload.
export function useClearRequiredDocumentsGate() {
  return useCallback(() => clearRequiredDocumentsGate(), [])
}
