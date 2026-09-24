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
 * "Needs your attention": what the school is waiting on this family for --
 * their To do (FamilyFormsPage), counted by the server. Non-SIS families get
 * empty orgs from the context call and the query stays disabled.
 *
 * "Open requests" was a second card here until 2026-09-24, when requests were
 * retired: a family messages the school now, and the reply is in Messages.
 *
 * The balance due was a card here until 2026-09-16. It is on Billing now, as
 * the notice at the top of the household with the pay button in it: the home
 * is for the children, and money on it was the one card most families always
 * had, so the strip was never empty and stopped meaning anything.
 */
export function useFamilyAttention() {
  // The shared guardian-context read (hooks/api/useSchoolContext), the same
  // one the family pages and the sidebar start from.
  const ctx = useSisParentContext()
  // The To do page defaults to the first org; the home digest does the same
  // (multi-school families see the rest on the page itself).
  const org = ctx.orgs?.[0] || null
  const orgId = org?.organization_id

  // Gated on the tasks OR onboarding block (routes/sis/tasks.py), the same
  // rule the To do page and its card use. The server gate can only resolve an
  // org for a caller who belongs to one, and a platform parent usually does
  // not, so /context (the ungated call) is what says which blocks are off --
  // ask it rather than probing (Sentry OPTIO-BACKEND-81 was the onboarding
  // version).
  const todo = useQuery({
    queryKey: ['family-home', 'todo', orgId],
    queryFn: async () => {
      const r = await api.get(`/api/sis/tasks/mine?audience=family&organization_id=${orgId}`)
      return r.data?.counts || {}
    },
    enabled: Boolean(orgId)
      && !(moduleKnownOff(org, 'tasks') && moduleKnownOff(org, 'onboarding')),
    ...SILENT,
  })

  const orgName = org?.organization_name || 'your school'
  const items = []

  const open = todo.data?.open || 0
  if (open > 0) {
    items.push({
      id: 'todo',
      kind: 'todo',
      to: '/family/forms',
      label: `${open} thing${open === 1 ? '' : 's'} to do`,
      detail: `${orgName} is waiting on you for ${open === 1 ? 'this' : 'these'}`,
    })
  }

  return { items }
}
