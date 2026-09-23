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
    mutationFn: async ({
      title, description, tasks, curriculumId, xpThreshold, teachersMayChangeXp, links,
    }) => {
      const body = { title, description, tasks }
      if (curriculumId) body.curriculum_id = curriculumId
      // The finish line and who may move it, on the create form too (iCreate,
      // b067c6c8, 2026-09-23). Only sent when the form names them, so the
      // plain create is the same request it always was.
      if (xpThreshold !== undefined && xpThreshold !== null && xpThreshold !== '') {
        body.xp_threshold = Number(xpThreshold)
      }
      if (typeof teachersMayChangeXp === 'boolean') body.teachers_may_change_xp = teachersMayChangeXp
      const res = await api.post(withOrg('/api/sis/quests', orgId), body)
      const data = res.data
      // Links typed on the create form go on once the quest has an id, through
      // the same route the attachments panel posts to. One failed link must
      // not lose the quest, so failures are counted and reported, not thrown.
      const questId = data?.quest_id
      const toAdd = (links || []).filter((l) => l?.url?.trim())
      let linksFailed = 0
      if (questId && toAdd.length) {
        for (const l of toAdd) {
          try {
            // Link vs video is told apart the way QuestResourcesPanel does it,
            // so a link added here is stored like one added there.
            const looksLikeVideo = /youtube\.com|youtu\.be|vimeo\.com|loom\.com|drive\.google\.com/
              .test(l.url)
            await api.post(withOrg(`/api/sis/quests/${questId}/resources`, orgId), {
              kind: looksLikeVideo ? 'video' : 'link',
              title: (l.title || '').trim(),
              url: l.url.trim(),
            })
          } catch {
            linksFailed += 1
          }
        }
      }
      return { ...data, links_added: toAdd.length - linksFailed, links_failed: linksFailed }
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
