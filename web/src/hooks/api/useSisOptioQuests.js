import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { queryKeys } from '../../utils/queryKeys'

/**
 * Library > Quests, the views that came over from the web org console on
 * 2026-10-15 (every org is an SIS org; the console goes):
 *
 *   Optio quests   the shared Optio library as this school sees it, the
 *                  school's quest visibility policy, and the curated grants
 *                  (GET /api/sis/optio-quests, PUT /api/sis/quest-visibility,
 *                  PUT /api/sis/optio-quests/access)
 *   Quest groups   named sets of the school's quests for batch assignment
 *                  (/api/organizations/<id>/quest-groups*, the endpoints the
 *                  console and the Treehouse facilitator page already use)
 */

const optioKey = (orgId) => [...queryKeys.sis.all, 'optioQuests', orgId]
const groupsKey = (orgId) => [...queryKeys.sis.all, 'questGroups', orgId]

export const useOptioQuests = (orgId, { search = '', type = '', show = 'all', page = 1 } = {}) => useQuery({
  queryKey: [...optioKey(orgId), { search, type, show, page }],
  queryFn: async () => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (type) params.set('type', type)
    if (show && show !== 'all') params.set('show', show)
    params.set('page', String(page))
    const res = await api.get(withOrg(`/api/sis/optio-quests?${params}`, orgId))
    return res.data
  },
  enabled: !!orgId,
  placeholderData: keepPreviousData,
  staleTime: 30 * 1000,
})

export const useSetQuestVisibility = (orgId) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (policy) => {
      const res = await api.put(withOrg('/api/sis/quest-visibility', orgId), { policy })
      return res.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: optioKey(orgId) }),
  })
}

/** Grant (available=true) or revoke Optio quests for a curated school. */
export const useSetOptioQuestAccess = (orgId) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ questIds, available }) => {
      const res = await api.put(withOrg('/api/sis/optio-quests/access', orgId),
        { quest_ids: questIds, available })
      return res.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: optioKey(orgId) }),
  })
}

export const useQuestGroups = (orgId, { enabled = true } = {}) => useQuery({
  queryKey: groupsKey(orgId),
  queryFn: async () => {
    const res = await api.get(`/api/organizations/${orgId}/quest-groups`)
    return res.data?.groups || []
  },
  enabled: !!orgId && enabled,
  staleTime: 30 * 1000,
})

export const useQuestGroupMutations = (orgId) => {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: groupsKey(orgId) })
  const base = `/api/organizations/${orgId}/quest-groups`
  return {
    create: useMutation({
      mutationFn: async (name) => (await api.post(base, { name })).data?.group,
      onSuccess: refresh,
    }),
    rename: useMutation({
      mutationFn: async ({ groupId, name }) => (await api.patch(`${base}/${groupId}`, { name })).data,
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: async (groupId) => (await api.delete(`${base}/${groupId}`)).data,
      onSuccess: refresh,
    }),
    setQuests: useMutation({
      mutationFn: async ({ groupId, questIds }) =>
        (await api.put(`${base}/${groupId}/quests`, { quest_ids: questIds })).data,
      onSuccess: refresh,
    }),
  }
}
