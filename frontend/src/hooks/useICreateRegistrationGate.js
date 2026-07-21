import { useEffect, useState } from 'react'
import api from '../services/api'

// Gate for iCreate registration funnel completion.
//
// Two policies share one cached lookup of "does this user have an unfinished
// registration run":
//   - useICreateRegistrationGate: a PURE iCreate parent (primary effective role
//     'parent') is locked to the funnel from every authenticated route (applied
//     globally in PrivateRoute).
//   - useParentClassRegistrationGate: any guardian — INCLUDING parent+teacher
//     staff whose primary role is advisor — must finish the full registration
//     (and its fee) before the Schedule Builder opens for their kids. This gates
//     only the parent class-registration surface, so staff keep their teacher
//     features reachable while their registration is still pending.
//
// The registration status is fetched once per user and cached for the session.
// The backend returns registration:null for users who never used the funnel
// (e.g. staff-created accounts), so they are never blocked.
//
// Post-payment steps (schedule / appointment) do NOT block: the wizard sends
// parents into the Schedule Builder at that point, so the app must be usable.

const BLOCKING_STATUSES = new Set(['verify', 'family', 'details', 'paperwork', 'fee'])

let cache = { userId: null, incomplete: null, promise: null }

export const clearICreateRegistrationGate = () => {
  cache = { userId: null, incomplete: null, promise: null }
}

// Core lookup: has this org user got an unfinished iCreate registration run?
// Cached per user for the session so route changes don't refetch.
function useRegistrationIncomplete(user, isAuthenticated) {
  const eligible = !!(isAuthenticated && user?.organization_id)
  const cached = cache.userId === user?.id && cache.incomplete !== null
  const [state, setState] = useState(() => (
    cached ? { checking: false, incomplete: cache.incomplete }
      : { checking: eligible, incomplete: false }
  ))

  useEffect(() => {
    if (!eligible) return undefined
    if (cache.userId === user.id && cache.incomplete !== null) {
      setState({ checking: false, incomplete: cache.incomplete })
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
    cache.promise.then((v) => { if (alive) setState({ checking: false, incomplete: v }) })
    return () => { alive = false }
  }, [eligible, user?.id])

  return eligible ? state : { checking: false, incomplete: false }
}

const hasParentRole = (user) => (
  user?.role === 'parent' ||
  user?.org_role === 'parent' ||
  (Array.isArray(user?.org_roles) && user.org_roles.includes('parent'))
)

// Global gate: a pure iCreate parent is bounced to the funnel from everywhere.
// Dual-role parent+teacher staff (primary role advisor) are intentionally NOT
// blocked wholesale here — see useParentClassRegistrationGate.
export function useICreateRegistrationGate(user, isAuthenticated, effectiveRole) {
  const { checking, incomplete } = useRegistrationIncomplete(user, isAuthenticated)
  // Only a pure parent can be globally gated, so only they wait on the check —
  // non-parent org users (students, advisors, admins) never see the spinner.
  const applies = effectiveRole === 'parent'
  return { checking: applies && checking, mustRegister: applies && incomplete }
}

// Parent class-registration gate: a guardian must complete registration + fee
// before signing their children up for classes, regardless of whether 'parent'
// is their primary role. Keyed off having children (linked students/dependents
// or a parent role), so parent+teacher staff are covered without blocking their
// teacher surfaces.
export function useParentClassRegistrationGate(user, isAuthenticated) {
  const { checking, incomplete } = useRegistrationIncomplete(user, isAuthenticated)
  const hasChildren = !!(user?.has_dependents || user?.has_linked_students || hasParentRole(user))
  return { checking, mustRegister: hasChildren && incomplete }
}
