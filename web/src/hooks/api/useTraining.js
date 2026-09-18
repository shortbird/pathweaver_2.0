import { useMutation } from '@tanstack/react-query'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'

/**
 * The Training page's writes on a link-kind training (routes/sis/
 * staff_training.py, the `kind='link'` branch; M18).
 *
 * iCreate, 2026-09-15: "I still dont' have a way to add resources to the
 * teacher training." A recorded training or a slide deck has no tasks to
 * invent, so it is a link: open it, press done. The page reads links in the
 * same list and the same who-has-done-what report as its quests
 * (GET /api/sis/training, GET /api/sis/training/progress), so the reads live
 * with the page; these are the three writes a link has that a quest does
 * not. Each takes the page's reload as `onSuccess`.
 */

/** Add a link, or save edits to one: `{ id?, body }`. */
export const useSaveTrainingLink = (orgId, options = {}) => useMutation({
  mutationFn: async ({ id, body }) => {
    const payload = { ...body, kind: 'link', organization_id: orgId }
    const res = id
      ? await api.patch(withOrg(`/api/sis/training/${id}`, orgId), payload)
      : await api.post('/api/sis/training', payload)
    return res.data
  },
  ...options,
})

export const useDeleteTrainingLink = (orgId, options = {}) => useMutation({
  mutationFn: async (id) => {
    const res = await api.delete(`${withOrg(`/api/sis/training/${id}`, orgId)}&kind=link`)
    return res.data
  },
  ...options,
})

/** The caller's own done mark: `{ id, done }` sets it to `done`. */
export const useSetTrainingDone = (orgId, options = {}) => useMutation({
  mutationFn: async ({ id, done }) => {
    const path = withOrg(`/api/sis/training/${id}/done`, orgId)
    const res = done ? await api.post(path, {}) : await api.delete(path)
    return res.data
  },
  ...options,
})
