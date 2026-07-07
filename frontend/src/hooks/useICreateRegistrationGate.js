import { useEffect, useState } from 'react'
import api from '../services/api'

// Gate for iCreate parents with an unfinished registration funnel: they are
// bounced from every authenticated learning route to /register/icreate/resume
// until the fee is settled (see PrivateRoute). Only fires for org-managed
// parents; everyone else short-circuits. The backend returns registration:null
// for users who never used the funnel (e.g. staff-created parents), so they are
// never blocked.
//
// Post-payment steps (schedule / appointment) do NOT block: the wizard sends
// parents into the Schedule Builder at that point, so the app must be usable.
//
// The result is cached per user for the session so route changes don't refetch.

const BLOCKING_STATUSES = new Set(['verify', 'family', 'details', 'paperwork', 'fee'])

let cache = { userId: null, incomplete: null, promise: null }

export const clearICreateRegistrationGate = () => {
  cache = { userId: null, incomplete: null, promise: null }
}

export function useICreateRegistrationGate(user, isAuthenticated, effectiveRole) {
  const eligible = !!(isAuthenticated && user?.organization_id && effectiveRole === 'parent')
  const cached = cache.userId === user?.id && cache.incomplete !== null
  const [state, setState] = useState(() => (
    cached ? { checking: false, mustRegister: cache.incomplete }
      : { checking: eligible, mustRegister: false }
  ))

  useEffect(() => {
    if (!eligible) return undefined
    if (cache.userId === user.id && cache.incomplete !== null) {
      setState({ checking: false, mustRegister: cache.incomplete })
      return undefined
    }
    if (!cache.promise || cache.userId !== user.id) {
      cache.userId = user.id
      cache.incomplete = null
      cache.promise = api.get('/api/icreate/my-registration')
        .then((r) => {
          cache.incomplete = BLOCKING_STATUSES.has(r.data?.registration?.status)
          return cache.incomplete
        })
        .catch(() => { cache.incomplete = false; return false })
    }
    let alive = true
    cache.promise.then((v) => { if (alive) setState({ checking: false, mustRegister: v }) })
    return () => { alive = false }
  }, [eligible, user?.id])

  return eligible ? state : { checking: false, mustRegister: false }
}
