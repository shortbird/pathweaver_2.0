/**
 * The family record's Billing tab: how this family pays and whether they are
 * current, from sis_billing_service.household_billing_summary (M7). This is
 * the hub -- the Billing page's family detail and the recurring-tuition list
 * link here (/people?open=<household>&tab=billing) rather than keeping their
 * own family views (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, G2).
 */
import React, { useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { useHouseholdBilling } from '../../../hooks/api/useSisFamilyDetail'
import { formatCents as money } from '../../../utils/money'

const FamilyBillingPanel = ({ householdId, orgId }) => {
  const billing = useHouseholdBilling(householdId, orgId)
  const data = billing.data
  const loading = billing.isLoading

  useEffect(() => {
    if (billing.isError) toast.error('Could not load billing')
  }, [billing.isError])

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>
  const invoices = data?.invoices || []
  // The server's summary (sis_billing_service.household_billing_summary) is
  // the one answer to "how does this family pay, and are they current"; this
  // tab is the hub the Billing page and the recurring-tuition list link into.
  const outstanding = data?.outstanding_cents ?? 0
  const overdue = data?.overdue_cents ?? 0
  const recurring = data?.recurring_tuition || { schedules: [], active_monthly_cents: 0 }
  const activeSchedules = recurring.schedules.filter((s) => s.status === 'active')
  const subscription = data?.subscription || null
  const card = data?.card || null

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-neutral-50 px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-neutral-500">
          Outstanding balance
          {overdue > 0 && <span className="text-red-600"> · {money(overdue)} overdue</span>}
        </span>
        <span className={`text-lg font-bold ${outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>{money(outstanding)}</span>
      </div>

      {/* Two things can both be called "monthly", and a family can be on
          either or both. Say which. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-gray-100 px-3 py-2.5">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1">Monthly tuition (invoiced by the school)</div>
          {activeSchedules.length ? (
            <>
              <div className="font-semibold text-neutral-800">{money(recurring.active_monthly_cents)}/month</div>
              <div className="text-xs text-neutral-500">
                {activeSchedules.map((s) => s.student_name).filter(Boolean).join(', ') || `${activeSchedules.length} student${activeSchedules.length === 1 ? '' : 's'}`}
              </div>
            </>
          ) : recurring.schedules.length ? (
            <div className="text-neutral-500">{recurring.schedules.length} schedule{recurring.schedules.length === 1 ? '' : 's'}, none active</div>
          ) : <div className="text-neutral-400">None</div>}
        </div>
        <div className="rounded-lg border border-gray-100 px-3 py-2.5">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1">Monthly plan (Stripe subscription)</div>
          {subscription ? (
            <>
              <div className="font-semibold text-neutral-800">{money(subscription.monthly_cents)}/month</div>
              <div className="text-xs text-neutral-500">Managed on the school&apos;s Stripe account</div>
            </>
          ) : <div className="text-neutral-400">None</div>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
        <span>Card on file: {card ? <span className="text-neutral-700">{card.brand || 'card'} ending {card.last4}</span> : 'none'}</span>
        {data?.funding_source && <span>Funding: <span className="text-neutral-700">{data.funding_source}</span></span>}
        {data?.sbs_pay_url && (
          <a href={data.sbs_pay_url} target="_blank" rel="noreferrer" className="text-optio-purple font-medium hover:underline">Open pay portal →</a>
        )}
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Invoices</h4>
        {invoices.length === 0 ? <p className="text-sm text-neutral-400">No invoices yet.</p> : (
          <div className="space-y-1.5">
            {invoices.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-sm border border-gray-100 rounded-lg px-3 py-2">
                <span className="text-neutral-600">
                  {money(i.total_cents)}
                  {i.amount_paid_cents ? <span className="text-neutral-400"> · paid {money(i.amount_paid_cents)}</span> : null}
                  {i.due_date && <span className="text-neutral-400"> · due {String(i.due_date).slice(0, 10)}</span>}
                </span>
                <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${i.status === 'paid' ? 'bg-green-100 text-green-700' : i.status === 'void' ? 'bg-neutral-100 text-neutral-500' : 'bg-amber-100 text-amber-700'}`}>{i.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {(data?.upcoming_installments || []).length > 0 && (
        <p className="text-xs text-neutral-400">{data.upcoming_installments.length} upcoming installment{data.upcoming_installments.length === 1 ? '' : 's'} scheduled.</p>
      )}
    </div>
  )
}

export default FamilyBillingPanel
