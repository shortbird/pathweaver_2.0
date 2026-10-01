import React, { useState } from 'react'
import { usePartnerSeats } from '../../hooks/api/usePartnerOfferings'
import { formatCents } from '../../utils/money'

const thisMonth = () => new Date().toISOString().slice(0, 7)

/**
 * On /admin/billing, for an org that sells a credit class: how many students
 * it owes for in a month, and a button that turns that into an invoice line.
 * Nothing is sent from here; the line goes into the form like a typed one.
 * Counting rules: services/partner_offering_service.billable_students.
 */
export default function PartnerSeatsHint({ orgId, onAddLine }) {
  const [month, setMonth] = useState(thisMonth)
  const { data } = usePartnerSeats(orgId, month, { retry: false })
  const lines = data?.offerings || []
  if (!orgId || !lines.length) return null

  return (
    <div className="mt-4 rounded-lg border border-purple-100 bg-purple-50 p-3 text-sm space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-gray-800">Credit-class students for</span>
        <input
          type="month" aria-label="Billing month" value={month}
          onChange={e => setMonth(e.target.value || thisMonth())}
          className="rounded-lg border px-2 py-1 text-sm"
        />
      </div>
      {lines.map(l => (
        <div key={l.offering_id} className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-gray-700">
            {l.title}: {l.students} {l.students === 1 ? 'student' : 'students'} at {formatCents(l.unit_amount_cents)} = {formatCents(l.amount_cents)}
          </span>
          <button
            disabled={!l.students}
            onClick={() => onAddLine({
              description: `${l.title}: ${data.month_label}, ${l.students} ${l.students === 1 ? 'student' : 'students'}`,
              amount: (l.unit_amount_cents / 100).toFixed(2),
              quantity: String(l.students),
            })}
            className="text-sm font-medium text-optio-purple hover:underline disabled:opacity-40 disabled:no-underline"
          >
            Add to invoice
          </button>
        </div>
      ))}
    </div>
  )
}
