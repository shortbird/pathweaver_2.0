import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { queryKeys } from '../../utils/queryKeys'

/**
 * School points (Apogee Cache Valley's ClassDojo, 2026-10-08): the board staff
 * work from, one student's history, a family's own points, and the writes.
 * The server keeps the ledger and every balance; every write invalidates the
 * school's points keys so the board, an open history and the Recent list all
 * reload from it rather than being patched here.
 *
 * orgId is in each key, so a superadmin switching schools is never shown the
 * previous school's balances from cache.
 */

export const useSisPoints = (orgId) => useQuery({
  queryKey: queryKeys.sis.points(orgId),
  queryFn: async () => (await api.get(withOrg('/api/sis/points', orgId))).data,
  enabled: !!orgId,
  staleTime: 15 * 1000,
})

export const useSisPointsHistory = (orgId, studentId) => useQuery({
  queryKey: queryKeys.sis.pointsStudent(orgId, studentId),
  queryFn: async () => (await api.get(withOrg(`/api/sis/points/students/${studentId}`, orgId))).data,
  enabled: !!orgId && !!studentId,
})

export const useMyPoints = () => useQuery({
  queryKey: queryKeys.sis.pointsMine,
  queryFn: async () => (await api.get('/api/sis/points/mine')).data?.students || [],
})

/** {amount, reason}: a student gives themselves points (ticket 910668d8).
 * Positive only and capped per day by the server; staff can undo it. */
export const useAddMyPoints = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body) => (await api.post('/api/sis/points/mine', body)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sis.pointsMine }),
  })
}

const useInvalidatePoints = (orgId) => {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.sis.points(orgId) })
}

/** {student_ids, amount, reason}: a negative amount takes points. */
export const useAddPoints = (orgId) => {
  const invalidate = useInvalidatePoints(orgId)
  return useMutation({
    mutationFn: async (body) => (await api.post(withOrg('/api/sis/points/entries', orgId), body)).data,
    onSuccess: invalidate,
  })
}

export const useUndoPoints = (orgId) => {
  const invalidate = useInvalidatePoints(orgId)
  return useMutation({
    mutationFn: async (entryId) => (await api.delete(withOrg(`/api/sis/points/entries/${entryId}`, orgId))).data,
    onSuccess: invalidate,
  })
}

export const useSavePointButtons = (orgId) => {
  const invalidate = useInvalidatePoints(orgId)
  return useMutation({
    mutationFn: async (buttons) => (await api.put(withOrg('/api/sis/points/buttons', orgId), { buttons })).data,
    onSuccess: invalidate,
  })
}

/**
 * Points helpers (ticket 0f401a62): students the school names to give points
 * to other students. Staff read the list ({helpers, can_edit}); admins save
 * it. A helper reads their own screen and gives; the server refuses everyone
 * else, so `enabled` only saves a request that would be a 403.
 */
export const useSisPointHelpers = (orgId) => useQuery({
  queryKey: queryKeys.sis.pointsHelpers(orgId),
  queryFn: async () => (await api.get(withOrg('/api/sis/points/helpers', orgId))).data,
  enabled: !!orgId,
})

export const useSavePointHelpers = (orgId) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (studentIds) => (await api.put(withOrg('/api/sis/points/helpers', orgId),
      { student_ids: studentIds })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sis.pointsHelpers(orgId) }),
  })
}

/** Whether the signed-in student is a points helper, from /mine's own row.
 * For the classroom tablet, which signs one student in after another: its own
 * key and gcTime 0, so one student's answer is never the next one's. */
export const useIsPointsHelper = (enabled) => useQuery({
  queryKey: [...queryKeys.sis.pointsMine, 'isHelper'],
  queryFn: async () => Boolean(
    (await api.get('/api/sis/points/mine')).data?.students?.some((s) => s.is_helper)),
  enabled: !!enabled,
  gcTime: 0,
  retry: false,
})

export const useHelperPoints = (enabled = true) => useQuery({
  queryKey: queryKeys.sis.pointsHelper,
  queryFn: async () => (await api.get('/api/sis/points/helper')).data,
  enabled,
  // The key names no user, and the classroom tablet signs one student in
  // after another: drop the screen when it closes, so the next helper never
  // sees the last one's list for a moment.
  gcTime: 0,
})

/** {student_ids, amount, reason}: positive only, capped by the server. */
export const useHelperGivePoints = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body) => (await api.post('/api/sis/points/helper/entries', body)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sis.pointsHelper }),
  })
}
