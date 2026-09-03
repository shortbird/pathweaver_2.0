import { useEffect, useState } from 'react'
import api from '../services/api'
import { isMasquerading } from '../services/masqueradeService'

// Gate for parent registration funnel completion.
//
// Two policies share one cached lookup of "does this user have an unfinished
// registration run":
//   - useRegistrationGate: a PURE parent (primary effective role
//     'parent') is locked to the funnel from every authenticated route (applied
//     globally in PrivateRoute).
//   - useParentClassRegistrationGate: any guardian — INCLUDING staff whose
//     primary role is a staff one (advisor, campus_coordinator, org_admin;
//     they gain 'parent' in org_roles) — must finish the full registration
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

export const clearRegistrationGate = () => {
  cache = { userId: null, incomplete: null, promise: null }
}

// Core lookup: has this org user got an unfinished registration run?
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
      cache.promise = api.get('/api/registration/my-registration')
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

// Global gate: a pure parent is bounced to the funnel from everywhere.
// Dual-role staff (any staff role primary, 'parent' alongside it) are
// intentionally NOT blocked wholesale — see useParentClassRegistrationGate.
export function useRegistrationGate(user, isAuthenticated, effectiveRole) {
  const { checking, incomplete } = useRegistrationIncomplete(user, isAuthenticated)
  // Only a pure parent can be globally gated, so only they wait on the check —
  // non-parent org users (students, advisors, admins) never see the spinner.
  // An admin masquerading as that parent is exempt: the point of masquerading
  // into a stuck account is to see what the parent would see AFTER the funnel,
  // and being locked to /enroll/resume makes the session useless. The parent's
  // own login is unaffected — this reads the masquerade session, not the user.
  //
  // This is the ONE place a masquerade deliberately shows more than the person
  // being viewed, kept on purpose (decision reaffirmed 2026-08-18). Everything
  // else answers to the target: backend authorization included, see
  // utils/auth/decorators.authorizing_user_id. Do not add a second exemption
  // without the same explicit decision — the value of the tool is that its
  // divergences can be counted on one finger.
  const applies = effectiveRole === 'parent' && !isMasquerading()
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
