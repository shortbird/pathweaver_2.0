import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'

/**
 * A credit-class partner's side (backend routes/partner_offerings.py): its
 * classes, each with the buyer link and the students who have a copy, plus
 * "Add a student" and "Remove". Org admin of that org, or superadmin.
 */
const base = (orgId) => `/api/admin/organizations/${orgId}/partner-offerings`

export const usePartnerOfferings = (orgId, options = {}) => useQuery({
  queryKey: queryKeys.partnerOfferings(orgId),
  queryFn: async () => (await api.get(base(orgId))).data?.offerings || [],
  enabled: !!orgId,
  staleTime: 30 * 1000,
  ...options,
})

export const useAddPartnerStudent = (orgId) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ offeringId, body }) =>
      (await api.post(`${base(orgId)}/${offeringId}/students`, body)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.partnerOfferings(orgId) }),
  })
}

export const useRemovePartnerStudent = (orgId) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ offeringId, enrollmentId }) =>
      (await api.post(`${base(orgId)}/${offeringId}/students/${enrollmentId}/remove`, {})).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.partnerOfferings(orgId) }),
  })
}

/** Superadmin: the students a partner owes for in `month` (YYYY-MM). */
export const usePartnerSeats = (orgId, month, options = {}) => useQuery({
  queryKey: queryKeys.admin.billing.partnerSeats(orgId, month),
  queryFn: async () => (await api.get('/api/admin/billing/partner-seats', {
    params: { organization_id: orgId, ...(month ? { month } : {}) },
  })).data,
  enabled: !!orgId,
  staleTime: 60 * 1000,
  ...options,
})
