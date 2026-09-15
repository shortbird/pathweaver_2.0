import { useQuery } from '@tanstack/react-query'
import api from '../../services/api'
import { moduleKnownOff } from '../../modules/moduleEnabled'
import { mergeFeedItems } from '../../components/announcements/UnifiedFeed'
import { useSisParentContext, useSchoolContext } from '../../hooks/api/useSchoolContext'

/**
 * Data hooks for FamilyHome (pages/home/FamilyHome.jsx).
 *
 * Every hook here composes EXISTING endpoints — the same ones the management
 * pages use (FamilyPortalPage, FamilyFormsPage, FamilyBillingPage,
 * SchoolPage) — read-only, via react-query. The home is a
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
 * "Needs your attention": pending checklist items (FamilyPortalPage's API),
 * open requests (FamilyFormsPage's API), balance due (FamilyBillingPage's
 * API). Each source is its own query so one failing hides only itself.
 * Non-SIS families get empty orgs from the context call and every downstream
 * query stays disabled.
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

  const billing = useQuery({
    queryKey: ['family-home', 'billing'],
    queryFn: async () => {
      const r = await api.get('/api/sis/parent/billing')
      return r.data?.households || []
    },
    // Billing needs no org id, but it is a family-with-a-school surface —
    // don't fire it for platform parents with no school context.
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
      to: '/family/portal',
      label: `${checklistPending} checklist item${checklistPending === 1 ? '' : 's'} to complete`,
      detail: `Assigned to your family by ${orgName}`,
    })
  }

  const openRequests = (forms.data || []).filter((s) => s.status !== 'resolved').length
  if (openRequests > 0) {
    items.push({
      id: 'forms',
      kind: 'forms',
      to: '/family/forms',
      label: `${openRequests} open request${openRequests === 1 ? '' : 's'} with ${orgName}`,
      detail: 'Track replies or add details',
    })
  }

  const balanceCents = (billing.data || [])
    .reduce((sum, hh) => sum + Math.max(hh.totals?.balance_cents || 0, 0), 0)
  if (balanceCents > 0) {
    items.push({
      id: 'billing',
      kind: 'billing',
      to: '/family/billing',
      label: `$${(balanceCents / 100).toFixed(2)} balance due`,
      detail: `Invoices and receipts from ${orgName}`,
    })
  }

  return { items }
}

/**
 * The school digest: which surfaces the school offers this viewer
 * (/api/sis/school/context — SchoolPage's source for its card grid, guardian
 * cards included by is_guardian) and the latest sent messages
 * (/api/announcements/archive — SchoolPage's archive, first page only).
 */
export function useSchoolSection(enabled) {
  const context = useSchoolContext({ enabled })

  const announcements = useQuery({
    queryKey: ['family-home', 'announcements'],
    queryFn: async () => {
      // family_view: this page renders only for someone who holds the parent
      // role (RoleHome), so it is that person's PARENT view of the archive —
      // a staff role must not pull staff-only notices onto it.
      const r = await api.get('/api/announcements/archive', { params: { limit: 3, offset: 0, family_view: 1 } })
      return r.data?.success ? (r.data.announcements || []) : []
    },
    enabled,
    ...SILENT,
  })

  // The BOARD, which the archive above does not cover. Those two are different
  // records: the archive holds sends (a notification that went out), the board
  // holds posts (a notice people come and read). A board-only post -- which is
  // now the default shape of an announcement -- reached the /school page and
  // never this one, so the family home said "nothing from your school" on a day
  // the school had posted.
  const boardFeed = useQuery({
    queryKey: ['family-home', 'communityFeed'],
    queryFn: async () => {
      const r = await api.get('/api/sis/community/feed')
      return r.data?.success ? (r.data.announcements || []) : []
    },
    enabled,
    ...SILENT,
  })

  return {
    schoolOrg: context.orgs?.[0] || null,
    // Merged the way /school merges them, so the board copy of a post that was
    // ALSO sent does not appear twice (mergeFeedItems dedupes on
    // source_announcement_id). Unwrapped back to plain rows, and a board post's
    // `body` normalised onto `message`, because SchoolSection renders rows and
    // reads content || message.
    announcements: mergeFeedItems({ announcements: boardFeed.data || [] },
                                  announcements.data || [])
      .filter((i) => i.kind === 'announcement' || i.kind === 'message')
      .slice(0, 3)
      .map((i) => (i.kind === 'announcement'
        ? { ...i.data, message: i.data.body }
        : i.data)),
  }
}
