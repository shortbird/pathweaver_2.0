import { useQuery } from '@tanstack/react-query'
import api, { parentAPI } from '../../services/api'
import { getMyDependents } from '../../services/dependentAPI'

/**
 * Data hooks for FamilyHome (pages/home/FamilyHome.jsx).
 *
 * Every hook here composes EXISTING endpoints — the same ones the management
 * pages use (ParentDashboardPage, FamilyPortalPage, FamilyFormsPage,
 * FamilyBillingPage, SchoolPage) — read-only, via react-query. The home is a
 * digest, so every source degrades silently: a failed fetch shows nothing,
 * never an error wall. The page each item deep-links to owns error display.
 */

const SILENT = {
  retry: false,
  refetchOnWindowFocus: false,
  staleTime: 60 * 1000,
}

/**
 * The parent's children: approved parent_student_links + under-13 dependents,
 * merged into one card-ready list. Same sources and the same overlap rule as
 * ParentDashboardPage — the my-dependents RPC returns linked students too, so
 * anything already in `children` is stripped from `dependents` (linked kids
 * are independent accounts, not managed profiles).
 */
export function useFamilyChildren() {
  return useQuery({
    queryKey: ['family-home', 'children'],
    queryFn: async () => {
      const [childrenRes, dependentsRes] = await Promise.allSettled([
        parentAPI.getMyChildren(),
        getMyDependents(),
      ])
      const children = childrenRes.status === 'fulfilled'
        ? (childrenRes.value.data?.children || [])
        : []
      const dependentsRaw = dependentsRes.status === 'fulfilled'
        ? (dependentsRes.value?.dependents || [])
        : []
      const childIds = new Set(children.map((c) => c.student_id))
      return [
        ...children.map((c) => ({
          id: c.student_id,
          name: `${c.student_first_name || ''} ${c.student_last_name || ''}`.trim() || 'Student',
          avatarUrl: c.avatar_url || null,
          isDependent: false,
          raw: c,
        })),
        ...dependentsRaw
          .filter((d) => !childIds.has(d.id))
          .map((d) => ({
            id: d.id,
            name: `${d.first_name || ''} ${d.last_name || ''}`.trim() || d.display_name || 'Child',
            avatarUrl: d.avatar_url || null,
            isDependent: true,
            raw: d,
          })),
      ]
    },
    ...SILENT,
  })
}

/**
 * One child's recent completions (last 30 days, FamilyBillingPage-style silent
 * failure) — feeds the compact activity line on the child card. Same endpoint
 * the parent evidence view reads (/api/parent/completions/:studentId).
 */
export function useChildActivity(studentId) {
  return useQuery({
    queryKey: ['family-home', 'activity', studentId],
    queryFn: async () => {
      const r = await parentAPI.getRecentCompletions(studentId)
      return r.data?.completions || []
    },
    enabled: Boolean(studentId),
    ...SILENT,
  })
}

/** XP earned in the last 7 days, from a 30-day completions list. */
export function weekXpFrom(completions) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  return (completions || [])
    .filter((c) => c.completed_at && new Date(c.completed_at).getTime() >= weekAgo)
    .reduce((sum, c) => sum + (c.task?.xp_value || 0), 0)
}

/**
 * "Needs your attention": pending checklist items (FamilyPortalPage's API),
 * open requests (FamilyFormsPage's API), balance due (FamilyBillingPage's
 * API). Each source is its own query so one failing hides only itself.
 * Non-SIS families get empty orgs from the context call and every downstream
 * query stays disabled.
 */
export function useFamilyAttention() {
  const ctx = useQuery({
    queryKey: ['family-home', 'sis-context'],
    queryFn: async () => {
      const r = await api.get('/api/sis/parent/context')
      return r.data?.orgs || []
    },
    ...SILENT,
  })
  // The portal and forms pages both default to the first org; the home digest
  // does the same (multi-school families see the rest on the pages themselves).
  const org = ctx.data?.[0] || null
  const orgId = org?.organization_id

  const onboarding = useQuery({
    queryKey: ['family-home', 'onboarding', orgId],
    queryFn: async () => {
      const r = await api.get(`/api/sis/parent/onboarding?organization_id=${orgId}`)
      return r.data?.assignments || []
    },
    enabled: Boolean(orgId),
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
  const context = useQuery({
    queryKey: ['family-home', 'school-context'],
    queryFn: async () => {
      const r = await api.get('/api/sis/school/context')
      return r.data?.success ? (r.data.orgs || [])[0] || null : null
    },
    enabled,
    ...SILENT,
  })

  const announcements = useQuery({
    queryKey: ['family-home', 'announcements'],
    queryFn: async () => {
      const r = await api.get('/api/announcements/archive', { params: { limit: 3, offset: 0 } })
      return r.data?.success ? (r.data.announcements || []) : []
    },
    enabled,
    ...SILENT,
  })

  return {
    schoolOrg: context.data || null,
    announcements: announcements.data || [],
  }
}
