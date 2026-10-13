// The Billing tab for a family-first school (Optio Academy, 2026-10-12).
// Its families pay one of two ways, and neither shows in the school's own
// invoices: a monthly Stripe subscription made at registration (receipts and
// the card live on Stripe), or a funder such as OpenEd that pays the school
// directly. The generic billing page showed both an empty ledger.
import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import { CheckCircleIcon, CreditCardIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { formatCents as money } from '../../utils/money'

const dateLabel = (iso) => (iso
  ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  : '')

const methodText = (m) => {
  if (!m) return 'Not on file'
  const brand = m.brand ? m.brand.charAt(0).toUpperCase() + m.brand.slice(1) : (m.type === 'bank' ? 'Bank account' : 'Card')
  return m.last4 ? `${brand} ending in ${m.last4}` : brand
}

export function PaidInFull({ funder }) {
  return (
    <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-5 flex gap-3">
      <CheckCircleIcon className="w-6 h-6 text-green-600 flex-shrink-0" />
      <div>
        <div className="font-semibold text-gray-900">Paid in full for this school year</div>
        <p className="text-sm text-gray-700 mt-1">
          {funder || 'Your funding program'} pays your family&apos;s tuition directly to the school. You do not need to pay anything.
        </p>
      </div>
    </div>
  )
}

export function StripePlan({ organizationId, plan }) {
  const [opening, setOpening] = useState(false)

  const manage = async () => {
    setOpening(true)
    try {
      const r = await api.post('/api/sis/parent/billing/manage-payment', {
        organization_id: organizationId,
        return_url: window.location.href,
      })
      if (r.data?.url) window.location.href = r.data.url
      else toast.error('Could not open payment settings')
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not open payment settings')
    } finally { setOpening(false) }
  }

  if (plan.error) {
    return (
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {plan.error} Try again in a few minutes, or message Optio Support.
      </div>
    )
  }

  const active = ['active', 'trialing', 'past_due'].includes(plan.status)
  return (
    <div className="mb-6 space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">Monthly tuition</div>
            <div className="text-2xl font-semibold text-gray-900">{money(plan.monthly_cents)}</div>
            <div className="text-sm text-gray-600 mt-1">
              {plan.status === 'past_due'
                ? 'The last charge did not go through. Update your payment method to keep your enrollment active.'
                : active && plan.next_charge_on
                  ? `Next charge on ${dateLabel(plan.next_charge_on)}`
                  : 'Your subscription is not active.'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-gray-400">Payment method</div>
            <div className="text-sm text-gray-900 flex items-center gap-1 justify-end">
              <CreditCardIcon className="w-4 h-4 text-gray-500" />
              {methodText(plan.payment_method)}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <Button size="sm" onClick={manage} loading={opening}>Manage payment method</Button>
          <p className="text-xs text-gray-500 mt-2">
            Opens a secure Stripe page where you can change your card or bank account. To stop tuition, message Optio Support.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="px-5 py-3 border-b border-gray-100 font-semibold text-gray-900">Receipts</div>
        {plan.receipts?.length ? (
          <ul className="divide-y divide-gray-100">
            {plan.receipts.map((r) => (
              <li key={r.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
                <div>
                  <div className="text-gray-900">{dateLabel(r.date)}</div>
                  {r.number && <div className="text-xs text-gray-500">{r.number}</div>}
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-medium text-gray-900">{money(r.amount_cents)}</span>
                  {r.receipt_url && (
                    <a href={r.receipt_url} target="_blank" rel="noreferrer" className="text-optio-purple hover:underline">View</a>
                  )}
                  {r.pdf_url && (
                    <a href={r.pdf_url} target="_blank" rel="noreferrer" className="text-optio-purple hover:underline">PDF</a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-gray-500">No payments yet.</p>
        )}
      </div>
    </div>
  )
}
