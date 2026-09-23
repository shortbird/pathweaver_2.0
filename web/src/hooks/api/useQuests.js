import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { queryKeys, mutationKeys } from '../../utils/queryKeys'
import toast from 'react-hot-toast'
import { useStudentScope } from '../useStudentScope'

/**
 * Every read here carries the family scope (hooks/useStudentScope): a parent
 * working on a child's account gets the CHILD's rows from the same URL, via
 * `?student_id=`, and the child's id is in the query key so switching
 * children never serves the previous child from cache. Writes carry
 * `student_id` in the body (or FormData) the same way. Unscoped, nothing
 * changes: `params` is empty and the key ends in 'me'.
 */

/**
 * Hook for fetching quest list with filters
 */
export const useQuests = (filters = {}, options = {}) => {
  const { params: scope } = useStudentScope()
  const scoped = { ...filters, ...scope }
  return useQuery({
    queryKey: queryKeys.quests.list(scoped),
    queryFn: async () => {
      const params = new URLSearchParams(scoped).toString()
      const response = await api.get(`/api/quests?${params}`)
      return response.data
    },
    ...options,
  })
}

/**
 * Hook for fetching quest details
 */
export const useQuestDetail = (questId, options = {}) => {
  const { params, scopeId } = useStudentScope()
  return useQuery({
    queryKey: queryKeys.quests.detail(questId, scopeId),
    queryFn: async () => {
      const response = await api.get(`/api/quests/${questId}`, { params })
      return response.data.quest
    },
    enabled: !!questId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    ...options,
  })
}

/**
 * Hook for fetching user's active quests
 */
export const useActiveQuests = (userId, options = {}) => {
  const { params } = useStudentScope()
  return useQuery({
    queryKey: queryKeys.quests.active(userId),
    queryFn: async () => {
      const response = await api.get('/api/users/dashboard', { params })
      return response.data.active_quests || []
    },
    enabled: !!userId,
    ...options,
  })
}

/**
 * Hook for fetching user's completed quests
 */
export const useCompletedQuests = (userId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.quests.completed(userId),
    queryFn: async () => {
      const response = await api.get(`/api/users/${userId}/completed-quests`)
      return response.data
    },
    enabled: !!userId,
    ...options,
  })
}

/**
 * Hook for enrolling in a quest
 * Supports optional body parameters for quest restart scenarios
 */
export const useEnrollQuest = () => {
  const queryClient = useQueryClient()
  const { params: scope } = useStudentScope()

  return useMutation({
    mutationKey: [mutationKeys.enrollQuest],
    mutationFn: async ({ questId, options = {} }) => {
      const response = await api.post(`/api/quests/${questId}/enroll`, { ...scope, ...options })
      return response.data
    },
    onSuccess: (data, { questId }) => {
      // Invalidate quest detail to refresh enrollment status
      queryClient.invalidateQueries(queryKeys.quests.detailAll(questId))

      // Invalidate user dashboard and active quests
      queryClient.invalidateQueries(queryKeys.user.dashboard())
      queryClient.invalidateQueries(queryKeys.quests.all)

      // Only show success toast if not already shown by component
      if (!data.tasks_loaded) {
        toast.success('Successfully enrolled in quest!')
      }
    },
    onError: (error) => {
      // Don't show error toast for 409 (conflict) - let component handle it
      if (error.response?.status !== 409) {
        toast.error(error.response?.data?.error || 'Failed to enroll in quest')
      }
    },
  })
}

/**
 * Hook for completing a task
 */
export const useCompleteTask = () => {
  const queryClient = useQueryClient()
  const { studentId } = useStudentScope()

  return useMutation({
    mutationKey: [mutationKeys.completeTask],
    mutationFn: async ({ taskId, evidence, userId }) => {
      // The completion route takes multipart form data; in scope the form
      // names the child and the backend records the parent as completed_by.
      if (studentId) {
        if (evidence instanceof FormData) {
          if (!evidence.has('student_id')) evidence.append('student_id', studentId)
        } else if (evidence && typeof evidence === 'object') {
          evidence = { student_id: studentId, ...evidence }
        }
      }
      const response = await api.post(`/api/tasks/${taskId}/complete`, evidence)
      return response.data
    },
    onSuccess: (data, variables) => {
      const userId = variables.userId

      // Invalidate all quest-related data (React Query will auto-refetch)
      queryKeys.invalidateQuests(queryClient, userId)

      // Also invalidate user dashboard to update active quests immediately
      if (userId) {
        queryClient.invalidateQueries(queryKeys.user.dashboard(userId))
      }

      toast.success('Task completed successfully!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to complete task')
    },
  })
}

/**
 * Hook for abandoning a quest
 */
export const useAbandonQuest = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [mutationKeys.abandonQuest],
    mutationFn: async (questId) => {
      const response = await api.post(`/api/quests/${questId}/abandon`, {})  // send a JSON body (CSRF/Content-Type)
      return response.data
    },
    onSuccess: (data, questId) => {
      // Invalidate quest-related queries
      queryKeys.invalidateQuests(queryClient)

      toast.success('Quest abandoned')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to abandon quest')
    },
  })
}

/**
 * Hook for permanently deleting a quest enrollment and reversing XP
 */
export const useDeleteEnrollment = () => {
  const queryClient = useQueryClient()
  const { studentId: scopedStudentId } = useStudentScope()

  return useMutation({
    mutationKey: [mutationKeys.deleteEnrollment],
    mutationFn: async ({ questId, studentId = scopedStudentId }) => {
      const params = studentId ? `?student_id=${studentId}` : ''
      const response = await api.delete(`/api/quests/${questId}/enrollment${params}`)
      return response.data
    },
    onSuccess: (data) => {
      queryKeys.invalidateQuests(queryClient)
      queryClient.invalidateQueries(queryKeys.user.dashboard())
      toast.success(data.message || 'Enrollment deleted successfully')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to delete enrollment')
    },
  })
}

/**
 * Hook for non-destructively archiving an enrollment (H1). Keeps progress + XP,
 * just hides the quest from the active list. Optional exit survey {reason, feedback}.
 */
export const useArchiveEnrollment = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['archiveEnrollment'],
    mutationFn: async ({ questId, reason, feedback }) => {
      const response = await api.post(`/api/quests/${questId}/archive`, { reason, feedback })
      return response.data
    },
    onSuccess: () => {
      queryKeys.invalidateQuests(queryClient)
      queryClient.invalidateQueries(queryKeys.user.dashboard())
      toast.success('Quest archived — your progress is saved')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to archive quest')
    },
  })
}

/**
 * Hook for restoring an H1-archived ("saved for later") enrollment to the
 * active list.
 */
export const useUnarchiveEnrollment = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['unarchiveEnrollment'],
    mutationFn: async ({ questId }) => {
      const response = await api.post(`/api/quests/${questId}/unarchive`, {})
      return response.data
    },
    onSuccess: () => {
      queryKeys.invalidateQuests(queryClient)
      queryClient.invalidateQueries(queryKeys.user.dashboard())
      toast.success('Quest is back on your list')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to restore quest')
    },
  })
}

/**
 * Hook for ending/finishing a quest
 */
export const useEndQuest = () => {
  const queryClient = useQueryClient()
  const { params: scope } = useStudentScope()

  return useMutation({
    mutationKey: [mutationKeys.endQuest],
    mutationFn: async (questId) => {
      const response = await api.post(`/api/quests/${questId}/end`, { ...scope })
      return response.data
    },
    onSuccess: (data, questId) => {
      // Invalidate quest-related queries
      queryKeys.invalidateQuests(queryClient)

      // Also invalidate user dashboard to remove quest from active quests immediately
      queryClient.invalidateQueries(queryKeys.user.dashboard())

      toast.success(data.message || 'Quest finished successfully!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to finish quest')
    },
  })
}

/**
 * Hook for reopening a quest that was ended.
 *
 * The undo for useEndQuest. Ending a quest is one tap and it hides every
 * unfinished task from the dashboard, the student's feed and the parent's, so
 * there has to be a way back that doesn't need a support ticket.
 */
export const useReopenQuest = () => {
  const queryClient = useQueryClient()
  const { params: scope } = useStudentScope()

  return useMutation({
    mutationKey: ['reopenQuest'],
    mutationFn: async (questId) => {
      const response = await api.post(`/api/quests/${questId}/reopen`, { ...scope })
      return response.data
    },
    onSuccess: () => {
      queryKeys.invalidateQuests(queryClient)
      queryClient.invalidateQueries(queryKeys.user.dashboard())
      toast.success('Quest reopened — your tasks are back')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to reopen quest')
    },
  })
}

/**
 * Hook for fetching quest tasks
 */
export const useQuestTasks = (questId, options = {}) => {
  const { params, scopeId } = useStudentScope()
  return useQuery({
    queryKey: queryKeys.quests.tasks(questId, scopeId),
    queryFn: async () => {
      const response = await api.get(`/api/quests/${questId}/tasks`, { params })
      return response.data
    },
    enabled: !!questId,
    ...options,
  })
}

/**
 * Hook for getting quest progress
 */
export const useQuestProgress = (userId, questId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.quests.progress(userId, questId),
    queryFn: async () => {
      const response = await api.get(`/api/quests/${questId}/progress`)
      return response.data
    },
    enabled: !!(userId && questId),
    ...options,
  })
}

/**
 * Hook for fetching quest engagement/rhythm metrics
 * Used for the GitHub-style activity calendar and rhythm indicator
 */
export const useQuestEngagement = (questId, options = {}) => {
  // `ownOnly` reads the signed-in user's own engagement even while a family
  // scope is set. An org admin who is also a parent sees her OWN assigned
  // quests on her admin home (MyEnrolledQuests); with Brady picked, the
  // scoped read sent ?student_id= and her card showed Brady's rhythm
  // (iCreate, Molly, tickets 376cb2ce / bec3639e, 2026-09-23).
  const { ownOnly = false, ...queryOptions } = options
  const scope = useStudentScope()
  const params = ownOnly ? {} : scope.params
  const scopeId = ownOnly ? undefined : scope.scopeId
  return useQuery({
    queryKey: queryKeys.quests.engagement(questId, scopeId),
    queryFn: async () => {
      const response = await api.get(`/api/quests/${questId}/engagement`, { params })
      return response.data.engagement
    },
    enabled: !!questId,
    staleTime: 60 * 1000, // 1 minute
    cacheTime: 5 * 60 * 1000, // 5 minutes
    ...queryOptions,
  })
}

/**
 * Hook for fetching a child's quest-specific engagement, scoped to the child
 * (not the logged-in parent). Used by the active-quest cards on the parent's
 * Child Overview, where the self-scoped /api/quests/:id/engagement would query
 * the parent's (empty) activity and always read "Ready to Begin".
 */
export const useStudentQuestEngagement = (studentId, questId, options = {}) => {
  return useQuery({
    queryKey: ['student-quest-engagement', studentId, questId],
    queryFn: async () => {
      const response = await api.get(`/api/parent/${studentId}/engagement`, {
        params: { quest_id: questId },
      })
      return response.data.engagement
    },
    enabled: !!studentId && !!questId,
    staleTime: 60 * 1000,
    cacheTime: 5 * 60 * 1000,
    ...options,
  })
}

/**
 * Hook for fetching global user engagement/rhythm metrics
 * Used on the dashboard for overall platform engagement
 */
export const useGlobalEngagement = (options = {}) => {
  const { params, scopeId } = useStudentScope()
  return useQuery({
    queryKey: queryKeys.user.engagement(scopeId),
    queryFn: async () => {
      const response = await api.get('/api/users/me/engagement', { params })
      return response.data.engagement
    },
    staleTime: 60 * 1000, // 1 minute
    cacheTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  })
}

/**
 * Hook for fetching student engagement/rhythm metrics (for parent dashboard)
 * Allows parents to view their child's engagement data
 */
export const useStudentEngagement = (studentId, options = {}) => {
  return useQuery({
    queryKey: ['student-engagement', studentId],
    queryFn: async () => {
      const response = await api.get(`/api/parent/${studentId}/engagement`)
      return response.data.engagement
    },
    enabled: !!studentId,
    staleTime: 60 * 1000, // 1 minute
    cacheTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  })
}