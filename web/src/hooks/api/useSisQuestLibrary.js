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

/**
 * Rename a quest, or rewrite its description, from the library row.
 *
 * Until 2026-09-22 the only way in was through the curriculum the quest sat
 * on, which meant a quest on no curriculum could not be edited at all -- and
 * those are exactly the quests this page was built to reach.
 */
export const useUpdateLibraryQuest = (orgId) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ questId, ...fields }) => {
      // Spread, not a fixed three: xp_threshold joined title and description
      // on 2026-09-22 and the server treats a key's ABSENCE as "leave it".
      const res = await api.patch(withOrg(`/api/sis/quests/${questId}`, orgId), fields)
      return res.data
    },
    onSuccess: () => invalidateLibrary(queryClient, orgId),
  })
}

/**
 * Copy a quest, its tasks and its attachments, into the school's own library.
 *
 * Offered on every row, including a shared Optio-library quest that cannot be
 * edited: the copy is the school's own, so duplicating is how you get an
 * editable version of one. The copy is attached to nothing, so the library
 * has to be re-read rather than patched -- the row is one the page has never
 * seen.
 */
export const useDuplicateLibraryQuest = (orgId) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ questId, title }) => {
      const res = await api.post(withOrg(`/api/sis/quests/${questId}/duplicate`, orgId),
        title ? { title } : {})
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

// Give a quest to students by name. Dallin (iCreate, 293c4d99, 2026-09-18):
// "Can we assign quests to individuals too?" The class door narrows to an
// audience inside a class; this one needs no class at all.
export const useGiveQuestToStudents = (orgId) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ questId, studentIds }) => {
      const res = await api.post(withOrg(`/api/sis/quests/${questId}/students`, orgId),
        { student_ids: studentIds })
      return res.data
    },
    onSuccess: () => invalidateLibrary(queryClient, orgId),
  })
}

export default useSisQuestLibrary
