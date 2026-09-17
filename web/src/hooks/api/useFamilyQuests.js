import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'

/**
 * The family's quests (/api/family/quests), for the family dashboard.
 *
 * A quest is the family's when the parent set it up (created_by, private)
 * or is enrolled in it themselves, and somebody in the family is still on
 * it. Each carries `members`: the parent and the children with an
 * enrollment, each with their own progress. A child's own quests are not
 * here; those are the child's dashboard.
 */
export function useFamilyQuests(options = {}) {
  return useQuery({
    queryKey: queryKeys.family.quests(),
    queryFn: async () => {
      const r = await api.get('/api/family/quests')
      return r.data?.quests || []
    },
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
    ...options,
  })
}

/**
 * Set up a family quest: create it on the parent's account (private, owned
 * by the parent), then enroll the chosen children. The two routes are the
 * ones the removed multi-child "Family Quest" feature left behind under
 * /api/family; a parent starting a quest FOR ONE child from the child's
 * scoped pages goes through /api/quests/create instead (CreateQuestModal).
 */
export function useCreateFamilyQuest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ title, description, childIds }) => {
      const created = await api.post('/api/family/quests/create', { title, big_idea: description })
      const questId = created.data?.quest_id
      const enrolled = await api.post(`/api/family/quests/${questId}/enroll-children`, { child_ids: childIds })
      return { quest: created.data?.quest, enrolled: enrolled.data?.enrolled || [], failed: enrolled.data?.failed || [] }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.family.quests() })
      queryClient.invalidateQueries({ queryKey: ['quests'] })
    },
  })
}

/** Add children to a quest the family already has. */
export function useEnrollChildrenInQuest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ questId, childIds }) =>
      api.post(`/api/family/quests/${questId}/enroll-children`, { child_ids: childIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.family.quests() })
      queryClient.invalidateQueries({ queryKey: ['quests'] })
    },
  })
}

/**
 * End one member's run at a family quest -- the parent's own, or a child's
 * (student_id, resolved by the backend's @student_scope). Same route the
 * quest page's End button uses; the work and XP are kept and the quest can
 * be reopened from the child's completed quests.
 *
 * `force` is for LEAVING a quest a school set for the parent themself
 * (FamilyFormsPage). The route refuses to end a quest below its XP goal
 * (quests.xp_threshold) because that goal is a student's finish line for
 * credit -- iCreate's Exploration Quest asks for 400 XP. A parent ending
 * their own copy is not submitting for credit, and without `force` the only
 * exit was refused for every one of the 80 parents it was auto-assigned to.
 */
export function useEndMemberQuest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ questId, studentId, force = false }) =>
      api.post(`/api/quests/${questId}/end`, {
        ...(studentId ? { student_id: studentId } : {}),
        ...(force ? { force: true } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.family.quests() })
      queryClient.invalidateQueries({ queryKey: ['quests'] })
      queryClient.invalidateQueries({ queryKey: ['user'] })
    },
  })
}
