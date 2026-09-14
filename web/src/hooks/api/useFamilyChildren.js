import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api, { parentAPI } from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'
import { useAuth } from '../../contexts/AuthContext'

/**
 * The parent's children, once.
 *
 * Approved parent_student_links (/api/parents/my-children) plus managed
 * under-13 dependents (/api/dependents/my-dependents), merged into one list.
 * The my-dependents RPC returns linked students too, so anything already in
 * `children` is stripped from `dependents` -- linked kids are independent
 * accounts, not managed profiles, and must not appear twice.
 *
 * This used to be fetched seven times over, by seven components each with
 * its own copy of the union rule (FamilyHomeData, ParentDashboardPage,
 * ProfileSwitcher, ParentInvitationSection, DependentSettingsModal,
 * ConversationList, BountyCreatePage). One hook, one cache entry, one place
 * to invalidate when a child is added, renamed or removed -- see
 * useInvalidateFamilyChildren below.
 *
 * Each child: { id, name, firstName, avatarUrl, isDependent, dateOfBirth, raw }
 * where `raw` is the row as its endpoint returned it, for the modals that
 * still read endpoint-specific fields.
 */
export function useFamilyChildren(options = {}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.family.children(user?.id),
    queryFn: fetchFamilyChildren,
    enabled: !!user?.id,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
    ...options,
  })
}

export async function fetchFamilyChildren() {
  // expect403: an account with no parent role is refused by both routes, and
  // that refusal is the ordinary answer here, not a regression for Sentry.
  const [childrenRes, dependentsRes] = await Promise.allSettled([
    api.get('/api/parents/my-children', { expect403: true }),
    api.get('/api/dependents/my-dependents', { expect403: true }),
  ])
  const children = childrenRes.status === 'fulfilled'
    ? (childrenRes.value.data?.children || [])
    : []
  const dependentsRaw = dependentsRes.status === 'fulfilled'
    ? (dependentsRes.value.data?.dependents || [])
    : []
  const childIds = new Set(children.map((c) => c.student_id))
  return [
    ...children.map((c) => ({
      id: c.student_id,
      name: `${c.student_first_name || ''} ${c.student_last_name || ''}`.trim() || 'Student',
      firstName: c.student_first_name || 'Student',
      avatarUrl: c.avatar_url || null,
      isDependent: false,
      dateOfBirth: c.date_of_birth || null,
      raw: c,
    })),
    ...dependentsRaw
      .filter((d) => !childIds.has(d.id))
      .map((d) => ({
        id: d.id,
        name: `${d.first_name || ''} ${d.last_name || ''}`.trim() || d.display_name || 'Child',
        firstName: d.first_name || (d.display_name || 'Child').split(' ')[0],
        avatarUrl: d.avatar_url || null,
        isDependent: true,
        dateOfBirth: d.date_of_birth || null,
        raw: d,
      })),
  ]
}

/** Refetch the family after a child is added, edited or removed. */
export function useInvalidateFamilyChildren() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.family.children(user?.id) })
}

/**
 * One child's summary for their card on the family dashboard: XP, streak,
 * last activity, the quests they are on and their last few completions.
 * /api/parent/dashboard/:studentId -- the same read the mobile Family tab
 * makes (useChildDashboard), gated server-side on the guardian relationship.
 * Silent on failure: the card stands on its own without it.
 */
export function useChildSummary(studentId) {
  return useQuery({
    queryKey: queryKeys.family.childSummary(studentId),
    queryFn: async () => {
      const r = await parentAPI.getDashboard(studentId)
      return r.data || null
    },
    enabled: Boolean(studentId),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
  })
}

/**
 * Upload a child's profile picture (POST /api/parent/child/:id/avatar, the
 * guardian route that serves both a managed profile and a linked student).
 * On success the family list and the child's card summary refetch, so the
 * new picture shows everywhere at once. Resolves the signed URL.
 */
export function useUploadChildAvatar() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ childId, file }) => {
      const formData = new FormData()
      formData.append('avatar', file)
      const r = await api.post(`/api/parent/child/${childId}/avatar`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return r.data?.avatar_url || null
    },
    onSuccess: (_url, { childId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.family.children(user?.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.family.childSummary(childId) })
    },
  })
}
