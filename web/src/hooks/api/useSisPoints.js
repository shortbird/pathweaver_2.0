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
