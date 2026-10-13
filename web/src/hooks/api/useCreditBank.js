import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'

/** A student's credit bank on their SIS record (routes/sis/credit_bank.py). */

export const useStudentCreditBank = (studentId) => useQuery({
  queryKey: queryKeys.sis.creditBank(studentId),
  queryFn: async () => (await api.get(`/api/sis/students/${studentId}/credit-bank`)).data?.credits,
  enabled: !!studentId,
})

export const useAddStudentCredits = (studentId) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body) => (await api.post(`/api/sis/students/${studentId}/credit-bank`, body)).data?.credits,
    onSuccess: (credits) => queryClient.setQueryData(queryKeys.sis.creditBank(studentId), credits),
  })
}
