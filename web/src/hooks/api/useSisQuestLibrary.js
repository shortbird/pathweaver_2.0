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

// Creating and editing a quest moved to hooks/api/useQuestEditor.js with the
// one quest form (P6, 2026-09-23): the library's create now starts a draft,
// and its edit is the same editor every other screen opens.

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
      // attach_to_curricula: false -- assigning from the library puts the
      // quest on this ONE class and leaves every curriculum alone. The class
      // endpoint otherwise adds it to each curriculum linked to the class
      // (iCreate, 56dbc3ab, 2026-09-23: US History assigned to Independent
      // Study also landed on the Applied Physics curriculum).
      const body = { quest_id: questId, attach_to_curricula: false }
      if (dueDate) body.due_date = dueDate
      const res = await api.post(withOrg(`/api/sis/classes/${classId}/quests`, orgId), body)
      return res.data
    },
    onSuccess: () => invalidateLibrary(queryClient, orgId),
  })
}

// Which of the school's students already have this quest, so the Give picker
// can say so before anyone presses Give (iCreate, ebfc9253, 2026-09-23: "I
// can't tell if they already have it or not until I enter it in again"). The
// key sits under the library's, so the invalidation after a Give refreshes it.
export const useQuestHolders = (orgId, questId) => useQuery({
  queryKey: [...queryKeys.sis.questLibrary(orgId), 'holders', questId],
  queryFn: async () => {
    const res = await api.get(withOrg(`/api/sis/quests/${questId}/students`, orgId))
    return res.data?.student_ids || []
  },
  enabled: !!orgId && !!questId,
  staleTime: 30 * 1000,
})

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
