import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api, { parentAPI } from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'
import { useAuth } from '../../contexts/AuthContext'

/**
 * The parent's children, once.
 *
 * GET /api/family/children: every child of the signed-in guardian through
 * all three links (a managed profile, an approved parent-student link, a
 * shared household), hydrated and avatar-signed by the backend. Until
 * 2026-09-15 this hook unioned two older routes itself, and neither of them
 * knew the household link, so a family that registered through the SIS
 * funnel could be missing a child here.
 *
 * This used to be fetched seven times over, by seven components each with
 * its own copy of the union rule (FamilyHomeData, ParentDashboardPage,
 * ProfileSwitcher, DependentSettingsModal,
 * ConversationList, BountyCreatePage). One hook, one cache entry, one place
 * to invalidate when a child is added, renamed or removed -- see
 * useInvalidateFamilyChildren below.
 *
 * Each child: { id, name, firstName, avatarUrl, isDependent, managedByMe,
 * dateOfBirth, links, raw } where `raw` is the row as the endpoint returned
 * it (id, first_name, last_name, display_name, email, avatar_url,
 * date_of_birth, age, is_dependent, managed_by_me, promotion_eligible,
 * organization_id, total_xp, level, active_quest_count, links, the four AI
 * flags), for the modals that read those fields directly.
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

export function toFamilyChild(row) {
  const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.display_name || 'Child'
  return {
    id: row.id,
    name,
    firstName: row.first_name || name.split(' ')[0],
    avatarUrl: row.avatar_url || null,
    isDependent: Boolean(row.is_dependent),
    managedByMe: Boolean(row.managed_by_me),
    dateOfBirth: row.date_of_birth || null,
    links: row.links || {},
    raw: row,
  }
}

export async function fetchFamilyChildren() {
  // A signed-in account that is nobody's guardian gets an empty list, not a
  // refusal, so there is no 403 to expect here.
  const res = await api.get('/api/family/children')
  return (res.data?.children || []).map(toFamilyChild)
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
