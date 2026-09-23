import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'

/**
 * Optio's own invoices, behind /admin/billing (backend
 * services/org_billing_service.py). Superadmin only.
 *
 * Stripe is the record, so every write refetches the list: an invoice's status
 * is whatever Stripe says after the write, not something to patch in the cache.
 */
const BASE = '/api/admin/billing/invoices'

export const useAdminInvoices = (orgId = '', options = {}) => useQuery({
  queryKey: queryKeys.admin.billing.invoices(orgId),
  queryFn: async () => (await api.get(BASE, { params: orgId ? { organization_id: orgId } : {} })).data,
  staleTime: 30 * 1000,
  placeholderData: keepPreviousData,
  ...options,
})

/**
 * One mutation for every write. `op` is one of:
 *   { kind: 'send', body: { recipient_email, recipient_name, organization_id, lines, memo, days_until_due } }
 *   { kind: 'remind' | 'void' | 'mark-paid', invoiceId, body? }
 */
export const useAdminInvoiceAction = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ kind, invoiceId, body = {} }) => {
      if (kind === 'send') return (await api.post(BASE, body)).data
      return (await api.post(`${BASE}/${invoiceId}/${kind}`, body)).data
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.billing.all }),
  })
}

export default useAdminInvoices
