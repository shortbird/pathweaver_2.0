import { useMutation, useQuery } from '@tanstack/react-query'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { queryKeys } from '../../utils/queryKeys'

/**
 * The two billing plans staff set from the console (2026-10-16).
 *
 * Monthly tuition: change one child's amount or description. Each month the
 * sweep makes a new invoice from the amount on the schedule, so the change is
 * used from the next charge; it changes nothing in Stripe and no invoice
 * already sent.
 *
 * Payment plan on an invoice: Monthly, Semester (5 months apart) or Pay in
 * full. The preview is the server's own schedule (the save's POST with
 * preview: true), so what the office reads is what the save creates. The
 * callers reload their own lists after a save, so nothing here is invalidated.
 */

/** PATCH {monthly_cents, description} on one monthly tuition schedule. */
export const useUpdateRecurringTuition = (orgId) => useMutation({
  mutationFn: async ({ id, ...body }) =>
    (await api.patch(withOrg(`/api/sis/tuition/recurring/${id}`, orgId), body)).data,
})

/** The installments `terms` ({organization_id, cadence, installment_count,
 *  start_date}) would create on the invoice. Not retried: a refusal (a bad
 *  count, an invoice on autopay) is the answer, not a blip. */
export const usePaymentPlanPreview = (invoiceId, terms) => useQuery({
  queryKey: queryKeys.sis.paymentPlanPreview(invoiceId, terms),
  queryFn: async () => (await api.post(`/api/sis/invoices/${invoiceId}/payment-plan`,
    { ...terms, preview: true })).data?.schedule || [],
  enabled: !!invoiceId,
  retry: false,
  staleTime: 30 * 1000,
})

/** Save the plan: replaces a plan with no card, refused while autopay runs. */
export const useSavePaymentPlan = (invoiceId) => useMutation({
  mutationFn: async (terms) =>
    (await api.post(`/api/sis/invoices/${invoiceId}/payment-plan`, terms)).data,
})
