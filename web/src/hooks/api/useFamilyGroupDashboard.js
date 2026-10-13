import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'

/**
 * A family group's dashboard (pages/FamilyGroupDashboardPage.jsx): the groups
 * this person runs, the group's students with their credit balances, and the
 * writes the page makes. Every write refreshes the student list, because a
 * drop, a re-enroll or a credit order changes the row it came from.
 */

export const useMyFamilyGroups = () => useQuery({
  queryKey: queryKeys.familyGroups.mine,
  queryFn: async () => (await api.get('/api/family-groups/mine')).data?.groups || [],
  staleTime: 5 * 60 * 1000,
})

export const useFamilyGroupStudents = (groupId) => useQuery({
  queryKey: queryKeys.familyGroups.students(groupId),
  queryFn: async () => (await api.get(`/api/family-groups/${groupId}/students`)).data,
  enabled: !!groupId,
  retry: (count, error) => error?.response?.status !== 404 && count < 2,
})

const useGroupWrite = (groupId, request) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.familyGroups.students(groupId) }),
  })
}

/** Drop ({studentId, drop: true}) or re-enroll ({studentId, drop: false}). */
export const useSetStudentStanding = (groupId) => useGroupWrite(groupId, async ({ studentId, drop }) =>
  (await api.post(`/api/family-groups/${groupId}/students/${studentId}/${drop ? 'drop' : 'reenroll'}`, {})).data)

/** Bank credits from an order; answers the student's new balance. */
export const useAddGroupStudentCredits = (groupId) => useGroupWrite(groupId, async ({ studentId, body }) =>
  (await api.post(`/api/family-groups/${groupId}/students/${studentId}/credits`, body)).data?.credits)
