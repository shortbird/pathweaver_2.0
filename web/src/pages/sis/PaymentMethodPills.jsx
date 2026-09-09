import React from 'react'

// "Form of Payment" — what a family picked in the registration funnel, shown
// back to staff verbatim rather than squeezed into the four-value
// `funding_source` enum. The office invoices off this: Utah Fits All families
// are billed differently, and at a different time, from self-paying ones.
//
// Utah Fits All is the pill that gets the loud colour because it is the one
// that changes what gets sent. Everything else is quiet.

export const PLAN_LABELS = { in_full: 'Pays in full', monthly: 'Monthly payments' }
export const PLAN_SHORT = { in_full: 'In full', monthly: 'Monthly' }

export const NO_ANSWER = '__none__'

const isUfa = (m) => /utah fits all/i.test(m || '')

const Pill = ({ className, title, children }) => (
  <span title={title}
    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${className}`}>
    {children}
  </span>
)

/**
 * @param methods      the family's answers, verbatim
 * @param ufaPrivate   their answer to the UFA-Private follow-up (true/false/null)
 * @param plan         'in_full' | 'monthly' | null
 * @param emptyLabel   what to show when they never answered (null renders nothing)
 */
export const PaymentMethodPills = ({ methods = [], ufaPrivate, plan, emptyLabel = null }) => {
  if (!methods.length && !plan) {
    return emptyLabel ? <span className="text-xs text-neutral-400">{emptyLabel}</span> : null
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {methods.map((m) => (
        <Pill key={m}
          className={isUfa(m) ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-700'}>
          {isUfa(m) && ufaPrivate ? 'Utah Fits All · Private School' : m}
        </Pill>
      ))}
      {plan && (
        <Pill className="bg-neutral-100 text-neutral-600"
          title={PLAN_LABELS[plan] || plan}>
          {PLAN_SHORT[plan] || plan}
        </Pill>
      )}
    </span>
  )
}

/** Every distinct answer present in a set of rows, so the filter offers what
 *  this school's families actually chose rather than a hardcoded list. */
export const paymentFilterOptions = (rows = []) => {
  const seen = new Map()
  rows.forEach((r) => (r.stated_payment_methods || []).forEach((m) => {
    if (m) seen.set(m.toLowerCase(), m)
  }))
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

export const matchesPaymentFilter = (row, filter) => {
  if (!filter) return true
  const methods = row?.stated_payment_methods || []
  if (filter === NO_ANSWER) return methods.length === 0
  return methods.some((m) => (m || '').toLowerCase() === filter.toLowerCase())
}

/** The filter control itself — one <select>, shared by the Families list and
 *  the tuition approver so the two read the same way. */
export const PaymentFilterSelect = ({ rows, value, onChange, className = '' }) => {
  const options = paymentFilterOptions(rows)
  if (!options.length) return null
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value)}
      aria-label="Filter by form of payment"
      className={`rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple ${className}`}
    >
      <option value="">All forms of payment</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
      <option value={NO_ANSWER}>No answer on file</option>
    </select>
  )
}

export default PaymentMethodPills
