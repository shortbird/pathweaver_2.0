import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { queryKeys } from '../../utils/queryKeys'

/**
 * The one SIS quest form's API (P6, owner decision 2026-09-23).
 *
 * Every screen that makes or edits a quest -- the library, a class's Quests
 * tab, a curriculum, the training catalog -- opens components/sis/QuestEditor
 * over these calls. The form's own routes are /api/sis/quest-editor/*; the one
 * step that differs per screen, publishing, goes to that screen's own route,
 * which is also where the quest gets attached to its class, curriculum or
 * catalog row.
 */

// The same drafts key for every screen, with the screen's own tail, so a
// publish or a discard anywhere can refresh every Drafts list at once.
export const questDraftsKey = (orgId, ...rest) => [...queryKeys.sis.all, 'questDrafts', orgId, ...rest]

export const questEditorApi = {
  /** Start a draft. Returns {quest_id, training_id?}. */
  async start(orgId, { context, classId, curriculumId, audience }) {
    const body = { context }
    if (classId) body.class_id = classId
    if (curriculumId) body.curriculum_id = curriculumId
    if (audience) body.audience = audience
    const res = await api.post(withOrg(`/api/sis/quest-editor/drafts`, orgId), body)
    return res.data
  },

  async load(orgId, questId) {
    const res = await api.get(withOrg(`/api/sis/quest-editor/${questId}`, orgId))
    return res.data?.quest
  },

  async save(orgId, questId, body) {
    const res = await api.put(withOrg(`/api/sis/quest-editor/${questId}`, orgId), body)
    return res.data?.quest
  },

  async uploadImage(orgId, questId, file) {
    const fd = new FormData()
    fd.append('image', file)
    if (orgId) fd.append('organization_id', orgId)
    const res = await api.post(withOrg(`/api/sis/quest-editor/${questId}/header-image`, orgId), fd,
      { headers: { 'Content-Type': 'multipart/form-data' } })
    return res.data?.header_image_url || ''
  },

  async removeImage(orgId, questId) {
    const res = await api.delete(withOrg(`/api/sis/quest-editor/${questId}/header-image`, orgId))
    return res.data?.header_image_url || ''
  },

  /** Discard a draft. ifEmpty: only when nothing was ever written into it. */
  async discard(orgId, questId, { ifEmpty = false } = {}) {
    const url = withOrg(`/api/sis/quest-editor/${questId}`, orgId)
    const res = await api.delete(ifEmpty ? `${url}${url.includes('?') ? '&' : '?'}if_empty=1` : url)
    return res.data
  },

  /**
   * Publish a draft where it was started. Each screen's own route runs its
   * attach step: the library files it (optionally on a curriculum, not
   * pushed), a class puts it on the class and enrols the students, a
   * curriculum appends it and pushes it to its classes, training takes it live
   * in the catalog (and enrols everyone if "Put it on their accounts" is on).
   */
  async publish(orgId, questId, context, { classId, curriculumId, trainingId, body = {} }) {
    const url = {
      library: `/api/sis/quests/${questId}/publish`,
      class: `/api/sis/classes/${classId}/quests/${questId}/publish`,
      curriculum: `/api/sis/curriculum/${curriculumId}/quests/${questId}/publish`,
      training: `/api/sis/training/${trainingId}/publish`,
    }[context]
    const res = await api.post(withOrg(url, orgId), body)
    return res.data
  },

  // ── The context sections' own saves, on a quest that is already live ──

  async saveClassLink(orgId, classId, questId, fields) {
    const res = await api.patch(withOrg(`/api/sis/classes/${classId}/quests/${questId}`, orgId), fields)
    return res.data
  },

  async saveClassAudience(orgId, classId, questId, studentIds) {
    const res = await api.put(withOrg(`/api/sis/classes/${classId}/quests/${questId}/students`, orgId),
      { student_ids: studentIds })
    return res.data
  },

  async loadTraining(orgId, trainingId) {
    const res = await api.get(withOrg(`/api/sis/training/${trainingId}/quest`, orgId))
    return res.data?.training || {}
  },

  async saveTraining(orgId, trainingId, fields) {
    const res = await api.patch(withOrg(`/api/sis/training/${trainingId}`, orgId), fields)
    return res.data
  },
}

/**
 * The Drafts list for one screen.
 *   context 'class' + classId, 'curriculum' + curriculumId, or 'all' (the
 *   library's view: every draft outside training).
 */
export const useQuestDrafts = (orgId, { context, classId, curriculumId, enabled = true }) => useQuery({
  queryKey: questDraftsKey(orgId, context, classId || curriculumId || null),
  queryFn: async () => {
    const params = new URLSearchParams({ context })
    if (classId) params.set('class_id', classId)
    if (curriculumId) params.set('curriculum_id', curriculumId)
    const res = await api.get(withOrg(`/api/sis/quest-editor/drafts?${params.toString()}`, orgId))
    return res.data?.drafts || []
  },
  enabled: enabled && !!context,
  staleTime: 15 * 1000,
})

export const useDiscardQuestDraft = (orgId) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ questId }) => questEditorApi.discard(orgId, questId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: questDraftsKey(orgId) }),
  })
}

/** Refresh every Drafts list and the library after the editor closes. */
export const useRefreshAfterQuestEdit = (orgId) => {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: questDraftsKey(orgId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.sis.questLibrary(orgId) })
  }
}

export default questEditorApi
