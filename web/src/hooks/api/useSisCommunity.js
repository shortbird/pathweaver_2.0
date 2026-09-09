import { useQuery } from '@tanstack/react-query'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { queryKeys } from '../../utils/queryKeys'

/**
 * The Community console: highlights, announcements, lost & found, recognition
 * and events (QF-03).
 *
 * CommunityPage carried 20 hand-rolled call sites across seven components --
 * the largest single hand-rolled surface left in the app when this was written
 * -- and each of the five tabs had its own `useState` pair, its own
 * `useCallback` loader and its own copy of the loading and error handling.
 *
 * WHAT THAT COST, beyond consistency. The Highlights tab is a server-side
 * digest of the other four: `/api/sis/community/highlights` returns the same
 * announcements, events, lost & found items and shout-outs the tabs fetch
 * individually. An office member who posts an announcement and clicks back to
 * Highlights got the stale digest, because the two lived in unrelated `useState`
 * and nothing connected them. `invalidateCommunity` below is the fix: every
 * mutation invalidates the whole `community` subtree, so the digest and the tab
 * that fed it cannot disagree.
 *
 * Everything is keyed on orgId. A superadmin switching schools must not be
 * served the previous school's announcements from cache.
 */

/** Every community query for one org. Call after any community mutation. */
export const invalidateCommunity = (queryClient, orgId) =>
  queryClient.invalidateQueries({ queryKey: queryKeys.sis.community(orgId) })

export const useCommunityHighlights = (orgId) => useQuery({
  queryKey: queryKeys.sis.communityHighlights(orgId),
  queryFn: async () => {
    const r = await api.get(withOrg('/api/sis/community/highlights', orgId))
    return r.data?.highlights || {}
  },
  enabled: !!orgId,
  staleTime: 30 * 1000,
})

export const useCommunityAnnouncements = (orgId) => useQuery({
  queryKey: queryKeys.sis.communityAnnouncements(orgId),
  queryFn: async () => {
    const r = await api.get(withOrg('/api/sis/community/announcements', orgId))
    return r.data?.announcements || []
  },
  enabled: !!orgId,
  staleTime: 30 * 1000,
})

export const useCommunityLostFound = (orgId) => useQuery({
  queryKey: queryKeys.sis.communityLostFound(orgId),
  queryFn: async () => {
    const r = await api.get(withOrg('/api/sis/community/lost-found', orgId))
    return r.data?.items || []
  },
  enabled: !!orgId,
  staleTime: 30 * 1000,
})

export const useCommunityRecognition = (orgId) => useQuery({
  queryKey: queryKeys.sis.communityRecognition(orgId),
  queryFn: async () => {
    const r = await api.get(withOrg('/api/sis/community/recognition', orgId))
    return r.data?.recognition || []
  },
  enabled: !!orgId,
  staleTime: 30 * 1000,
})

/**
 * Staff and students who can receive a shout-out.
 *
 * The recognition composer is a modal, so this used to fire on every open. It
 * is the same list every time and it changes when somebody joins the school,
 * which is not during a shout-out -- hence the longer staleTime.
 */
export const useCommunityMembers = (orgId) => useQuery({
  queryKey: queryKeys.sis.communityMembers(orgId),
  queryFn: async () => {
    const r = await api.get(withOrg('/api/sis/community/members', orgId))
    return r.data?.members || []
  },
  enabled: !!orgId,
  staleTime: 5 * 60 * 1000,
  // The composer degrades to free-text entry when this is empty, which is why
  // the hand-rolled version swallowed the error. Keep that: a failed member
  // list must not block posting a shout-out.
  retry: 1,
})

/**
 * Upcoming events, from the same sis_events the Calendar page reads.
 *
 * `from` is computed inside the queryFn rather than passed in. As a parameter
 * it would have to be in the key, and `new Date().toISOString()` changes every
 * millisecond -- every render would be a cache miss and a refetch.
 */
export const useCommunityEvents = (orgId) => useQuery({
  queryKey: queryKeys.sis.communityEvents(orgId),
  queryFn: async () => {
    const from = new Date().toISOString()
    const r = await api.get(withOrg(`/api/sis/events?from=${from}`, orgId))
    return r.data?.events || []
  },
  enabled: !!orgId,
  staleTime: 60 * 1000,
})

/**
 * Comments under one shout-out.
 *
 * NOT a react-query cache, deliberately, and this is the one place on the page
 * where that is the right answer. The thread is collapsed until somebody opens
 * it, the comment COUNT on the collapsed row comes from the recognition row
 * itself, and once a thread is open the page shows the live list so a comment
 * just posted is counted without a refetch. Under a query that would be an
 * invalidate-and-refetch on every post, replacing an instant local append with
 * a round trip -- worse behaviour, on the interaction people repeat most.
 *
 * So the comment calls stay imperative; they are collected here only so that
 * every community endpoint path lives in one module.
 */
export const sisCommunityApi = {
  deleteAnnouncement: (id, orgId) =>
    api.delete(withOrg(`/api/sis/community/announcements/${id}`, orgId)),
  saveAnnouncement: (id, payload) => (id
    ? api.patch(`/api/sis/community/announcements/${id}`, payload)
    : api.post('/api/sis/community/announcements', payload)),

  setLostFoundStatus: (id, orgId, status) =>
    api.patch(`/api/sis/community/lost-found/${id}`, { organization_id: orgId, status }),
  deleteLostFound: (id, orgId) =>
    api.delete(withOrg(`/api/sis/community/lost-found/${id}`, orgId)),
  markLostFoundExpired: (orgId) =>
    api.post('/api/sis/community/lost-found/mark-expired', { organization_id: orgId }),
  uploadLostFoundPhoto: (orgId, file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(withOrg('/api/sis/community/lost-found/upload', orgId), form)
  },
  saveLostFound: (id, payload) => (id
    ? api.patch(`/api/sis/community/lost-found/${id}`, payload)
    : api.post('/api/sis/community/lost-found', payload)),

  postRecognition: (payload) => api.post('/api/sis/community/recognition', payload),
  deleteRecognition: (id, orgId) =>
    api.delete(withOrg(`/api/sis/community/recognition/${id}`, orgId)),

  listComments: (recognitionId, orgId) =>
    api.get(withOrg(`/api/sis/community/recognition/${recognitionId}/comments`, orgId)),
  postComment: (recognitionId, orgId, body) =>
    api.post(withOrg(`/api/sis/community/recognition/${recognitionId}/comments`, orgId), { body }),
  deleteComment: (commentId, orgId) =>
    api.delete(withOrg(`/api/sis/community/recognition/comments/${commentId}`, orgId)),
}

export default useCommunityHighlights
