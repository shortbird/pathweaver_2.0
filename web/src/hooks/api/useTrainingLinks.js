import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { queryKeys } from '../../utils/queryKeys'

/**
 * Training links: the Training page's links beside its quests
 * (/api/sis/training/links, routes/sis/training_links.py).
 *
 * iCreate, 2026-09-15: "I still dont' have a way to add resources to the
 * teacher training." A recorded training or a slide deck has no tasks to
 * invent, so it is a link: open it, press done. The list carries whether the
 * caller has done each; the progress read is the admin's who-has-done-what
 * columns. Every mutation invalidates the shared prefix so both refresh.
 */

export const useTrainingLinks = (orgId, options = {}) => useQuery({
  queryKey: queryKeys.sis.trainingLinks(orgId),
  queryFn: async () => {
    const res = await api.get(withOrg('/api/sis/training/links', orgId))
    return res.data?.links || []
  },
  enabled: !!orgId,
  staleTime: 30 * 1000,
  ...options,
})

export const useTrainingLinksProgress = (orgId, options = {}) => useQuery({
  queryKey: queryKeys.sis.trainingLinksProgress(orgId),
  queryFn: async () => {
    const res = await api.get(withOrg('/api/sis/training/links/progress', orgId))
    return res.data || { links: [], staff: [], required_total: 0 }
  },
  enabled: !!orgId,
  staleTime: 30 * 1000,
  ...options,
})

const useInvalidating = (orgId, mutationFn) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sis.trainingLinks(orgId) }),
  })
}

/** Add a link, or save edits to one: `{ linkId?, body }`. */
export const useSaveTrainingLink = (orgId) => useInvalidating(orgId, async ({ linkId, body }) => {
  const payload = { ...body, organization_id: orgId }
  const res = linkId
    ? await api.patch(withOrg(`/api/sis/training/links/${linkId}`, orgId), payload)
    : await api.post('/api/sis/training/links', payload)
  return res.data
})

export const useDeleteTrainingLink = (orgId) => useInvalidating(orgId, async (linkId) => {
  const res = await api.delete(withOrg(`/api/sis/training/links/${linkId}`, orgId))
  return res.data
})

/** The caller's own done mark: `{ linkId, done }` sets it to `done`. */
export const useSetTrainingLinkDone = (orgId) => useInvalidating(orgId, async ({ linkId, done }) => {
  const path = withOrg(`/api/sis/training/links/${linkId}/done`, orgId)
  const res = done ? await api.post(path, {}) : await api.delete(path)
  return res.data
})
