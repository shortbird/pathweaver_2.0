import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { queryKeys } from '../../utils/queryKeys'

/**
 * The school's quest library (the Quests page under Operations).
 *
 * One read -- every quest the org owns, with the curricula and classes each is
 * on and the pickers for the assign dialog -- and two writes that are the same
 * writes the other screens make: onto a curriculum through the quest-scoped
 * route (shared with the curriculum page's writer), onto a class through the
 * class page's own route. Either write invalidates the library and the
 * curriculum/class caches it touched, so the row updates without a reload.
 */
export const useSisQuestLibrary = (orgId, options = {}) => useQuery({
  queryKey: queryKeys.sis.questLibrary(orgId),
  queryFn: async () => {
    const res = await api.get(withOrg('/api/sis/quests', orgId))
    return {
      quests: res.data?.quests || [],
      curricula: res.data?.curricula || [],
      classes: res.data?.classes || [],
    }
  },
  enabled: !!orgId,
  staleTime: 30 * 1000,
  ...options,
})

const invalidateLibrary = (queryClient, orgId) =>
  queryClient.invalidateQueries({ queryKey: queryKeys.sis.questLibrary(orgId) })

export const useCreateLibraryQuest = (orgId) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ title, description, tasks, curriculumId }) => {
      const body = { title, description, tasks }
      if (curriculumId) body.curriculum_id = curriculumId
      const res = await api.post(withOrg('/api/sis/quests', orgId), body)
      return res.data
    },
    onSuccess: () => invalidateLibrary(queryClient, orgId),
  })
}

export const useAddQuestToCurriculum = (orgId) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ questId, curriculumId }) => {
      const res = await api.post(withOrg(`/api/sis/quests/${questId}/curricula`, orgId),
        { curriculum_id: curriculumId })
      return res.data
    },
    onSuccess: () => invalidateLibrary(queryClient, orgId),
  })
}

export const useAssignQuestToClass = (orgId) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ questId, classId, dueDate }) => {
      const body = { quest_id: questId }
      if (dueDate) body.due_date = dueDate
      const res = await api.post(withOrg(`/api/sis/classes/${classId}/quests`, orgId), body)
      return res.data
    },
    onSuccess: () => invalidateLibrary(queryClient, orgId),
  })
}

export default useSisQuestLibrary
