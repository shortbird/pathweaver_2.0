import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'

/**
 * The SIS Messaging page's reads and writes (iCreate meeting, 2026-09-23):
 * Compose's audience and send (bf8b754d, 8ee000b6), the Sent list with read
 * receipts (9b46c748), "Make a task" from a thread, and the threads a staff
 * member was handed with one (d93b24d2).
 *
 * `orgId` follows withOrg: a superadmin names the org, everyone else passes
 * null and the server pins them to their own.
 */

export const messagingKeys = {
  audience: (orgId) => ['sis-messaging', 'audience', orgId || null],
  staff: (orgId) => ['sis-messaging', 'staff', orgId || null],
  sends: (orgId) => ['sis-messaging', 'sends', orgId || null],
  send: (orgId, id) => ['sis-messaging', 'send', orgId || null, id],
  granted: (userId, orgId) => ['school-granted', userId, orgId || null],
}

/** Everybody Compose can write to, with the class split and staff quick picks. */
export const useComposeAudience = (orgId, { enabled = true } = {}) => useQuery({
  queryKey: messagingKeys.audience(orgId),
  queryFn: async () => (await api.get(withOrg('/api/sis/messaging/audience', orgId))).data || {},
  enabled,
  staleTime: 60000,
})

/** The org's staff, for picking who a task goes to. */
export const useStaffRecipients = (orgId, { enabled = true } = {}) => useQuery({
  queryKey: messagingKeys.staff(orgId),
  queryFn: async () => (await api.get(withOrg('/api/sis/messaging/recipients', orgId))).data?.people || [],
  enabled,
  staleTime: 60000,
})

/** One Compose send. Resolves to the server's answer ({mode, sent, skipped, emailed, send_id}). */
export const useSendCompose = (orgId) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload) => (await api.post(withOrg('/api/sis/messaging/send', orgId), payload)).data || {},
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sis-messaging', 'sends'] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}

/** Recent Compose sends, each with "read by N of M". */
export const useSentMessages = (orgId) => useQuery({
  queryKey: messagingKeys.sends(orgId),
  queryFn: async () => (await api.get(withOrg('/api/sis/messaging/sends', orgId))).data?.sends || [],
  refetchInterval: 60000,
})

/** One send with every recipient and when they read it. */
export const useSentMessage = (orgId, sendId) => useQuery({
  queryKey: messagingKeys.send(orgId, sendId),
  queryFn: async () => (await api.get(withOrg(`/api/sis/messaging/sends/${sendId}`, orgId))).data?.send || null,
  enabled: !!sendId,
})

/** "Make a task" from a school thread (conversationId) or school group (groupId). */
export const useMakeThreadTask = (orgId) => useMutation({
  mutationFn: async ({ conversationId, groupId, ...body }) => {
    const path = groupId
      ? `/api/school-inbox/groups/${groupId}/task`
      : `/api/school-inbox/conversations/${conversationId}/task`
    return (await api.post(withOrg(path, orgId), body)).data
  },
})

/** The school threads a non-office staff member holds a task for. */
export const useGrantedThreads = (userId, orgId, { enabled = true, refetchInterval = 120000 } = {}) => useQuery({
  queryKey: messagingKeys.granted(userId, orgId),
  queryFn: async () => {
    const r = await api.get(withOrg('/api/school-inbox/granted', orgId))
    return r.data?.data || r.data
  },
  enabled: enabled && !!userId,
  refetchInterval,
})
