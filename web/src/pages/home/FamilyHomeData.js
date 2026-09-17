import { useQuery } from '@tanstack/react-query'
import api from '../../services/api'
import { moduleKnownOff } from '../../modules/moduleEnabled'
import { useSisParentContext } from '../../hooks/api/useSchoolContext'

/**
 * Data hooks for FamilyHome (pages/home/FamilyHome.jsx).
 *
 * Every hook here composes EXISTING endpoints — the same ones FamilyFormsPage
 * uses —
 * read-only, via react-query. The home is a
 * digest, so every source degrades silently: a failed fetch shows nothing,
 * never an error wall. The page each item deep-links to owns error display.
 */

const SILENT = {
  retry: false,
  refetchOnWindowFocus: false,
  staleTime: 60 * 1000,
}


// The children themselves, and each child's card summary, come from
// hooks/api/useFamilyChildren -- one fetch shared with the scope switcher, the
// settings modal and the capture button, where this file used to keep its own
// copy of the union rule.

/**
 * "Needs your attention": pending checklist items and open requests (the two
 * halves of FamilyFormsPage, each its own API). Each source is its own query
 * so one failing hides only itself. Non-SIS families get empty orgs from the
 * context call and every downstream query stays disabled.
 *
 * The balance due was a third card here until 2026-09-16. It is on Billing
 * now, as the notice at the top of the household with the pay button in it:
 * the home is for the children, and money on it was the one card most
 * families always had, so the strip was never empty and stopped meaning
 * anything.
 */
export function useFamilyAttention() {
  // The shared guardian-context read (hooks/api/useSchoolContext), the same
  // one the family pages and the sidebar start from.
  const ctx = useSisParentContext()
  // The portal and forms pages both default to the first org; the home digest
  // does the same (multi-school families see the rest on the pages themselves).
  const org = ctx.orgs?.[0] || null
  const orgId = org?.organization_id

  // Each read below is gated server-side on a different building block, and a
  // school that turned one off answers 404. "Degrades silently" made that
  // invisible here but not in the telemetry: /context is the ungated call that
  // says what the org has on, so ask it rather than probing. Optio Academy has
  // onboarding off and every family visit logged a ModuleGate warning
  // (Sentry OPTIO-BACKEND-81). /context carries no feature_flags, so this must
  // be moduleKnownOff — see the note on that helper.
  const onboarding = useQuery({
    queryKey: ['family-home', 'onboarding', orgId],
    queryFn: async () => {
      const r = await api.get(`/api/sis/parent/onboarding?organization_id=${orgId}`)
      return r.data?.assignments || []
    },
    enabled: Boolean(orgId) && !moduleKnownOff(org, 'onboarding'),
    ...SILENT,
  })

  const forms = useQuery({
    queryKey: ['family-home', 'forms', orgId],
    queryFn: async () => {
      const r = await api.get(`/api/sis/parent/forms?organization_id=${orgId}`)
      return r.data?.submissions || []
    },
    enabled: Boolean(orgId),
    ...SILENT,
  })

  const orgName = org?.organization_name || 'your school'
  const items = []

  const checklistPending = (onboarding.data || [])
    .reduce((sum, a) => sum + Math.max((a.total_count || 0) - (a.done_count || 0), 0), 0)
  if (checklistPending > 0) {
    items.push({
      id: 'checklist',
      kind: 'checklist',
      to: '/family/forms',
      label: `${checklistPending} form item${checklistPending === 1 ? '' : 's'} to complete`,
      detail: `${orgName} needs these signed or filled in`,
    })
  }

  const openRequests = (forms.data || []).filter((s) => s.status !== 'resolved').length
  if (openRequests > 0) {
    items.push({
      id: 'forms',
      kind: 'forms',
      to: '/family/forms#requests',
      label: `${openRequests} request${openRequests === 1 ? '' : 's'} waiting on ${orgName}`,
      detail: 'Their reply shows up under it',
    })
  }

  return { items }
}
