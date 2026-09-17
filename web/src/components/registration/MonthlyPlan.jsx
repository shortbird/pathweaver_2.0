/**
 * The monthly-payment half of the funnel's payment step, shared between the
 * live funnel (pages/registerFunnel/FeeStep.jsx) and the SIS Registration
 * setup preview (components/sis/registrationSetup/PaperworkFeeSteps.jsx) so
 * staff see exactly the plan families do.
 *
 * Stateless: the page owns the { [studentId]: [addOnKeys] } selection and
 * hands it back through onToggle. Nothing here does sums: the picker shows
 * the plan's own prices, and QuoteLines draws the lines the server quoted
 * (hooks/api/useRegistrationQuote).
 */
import React from 'react'
import { formatCents } from '../../utils/money'

// "$50 per student each month, capped at $150 per family."
export const planSentence = (plan) => {
  if (!plan?.per_student_cents) return ''
  const per = `${formatCents(plan.per_student_cents, { compact: true })} per student each month`
  return plan.family_cap_cents ? `${per}, capped at ${formatCents(plan.family_cap_cents, { compact: true })} per family.` : `${per}.`
}

// One card per student: what they cost each month, and the add-ons on offer.
// A student on an includes-the-fee add-on shows "included" in place of the
// program fee, so nobody adds $500 and $50 in their head and gets $550.
export const MonthlyPlanPicker = ({ plan, students, onToggle, disabled = false }) => {
  const includesFee = (key) => !!plan.add_ons.find((a) => a.key === key)?.includes_program_fee
  return (
    <div className="space-y-3">
      {students.map((s) => {
        const chosen = s.add_ons || []
        const covered = chosen.some(includesFee)
        return (
          <div key={s.id} className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-neutral-900">{s.name}</span>
              {plan.per_student_cents > 0 && (
                <span className="text-sm text-neutral-500">
                  {covered ? 'Program fee included below' : `${formatCents(plan.per_student_cents, { compact: true })}/month`}
                </span>
              )}
            </div>
            {plan.add_ons.map((a) => (
              <label key={a.key}
                className={`mt-3 flex items-start gap-3 rounded-lg border p-3 ${
                  chosen.includes(a.key) ? 'border-optio-purple bg-optio-purple/[0.04]' : 'border-gray-200'
                } ${disabled ? '' : 'cursor-pointer'}`}>
                <input type="checkbox" checked={chosen.includes(a.key)} disabled={disabled}
                  onChange={(e) => onToggle?.(s.id, a.key, e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-medium text-neutral-900">Add {a.label}</span>
                    <span className="text-sm font-semibold text-neutral-800 whitespace-nowrap">
                      {formatCents(a.amount_cents, { compact: true })}/month
                    </span>
                  </span>
                  {a.description && (
                    <span className="block text-xs text-neutral-500 mt-1">{a.description}</span>
                  )}
                  {a.includes_program_fee && plan.per_student_cents > 0 && (
                    <span className="block text-xs text-neutral-500 mt-1">
                      Includes the {formatCents(plan.per_student_cents, { compact: true })} program fee for {s.name}.
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// The quote, itemized: what recurs each month under one heading, what is
// paid once under another, then the totals. One rendering for a monthly
// plan, a one-time fee, or both -- the fee step used to draw the month and
// the fee as two different screens (audit I2).
const Line = ({ line }) => (
  <div className="flex items-start justify-between gap-4 py-1">
    <span className="text-neutral-700">
      {line.label}
      {line.students?.length > 0 && <span className="text-neutral-400"> · {line.students.join(', ')}</span>}
      {line.capped && <span className="text-neutral-400"> (family cap)</span>}
    </span>
    <span className="text-neutral-800 whitespace-nowrap">{formatCents(line.amount_cents)}</span>
  </div>
)

export const QuoteLines = ({ quote, feeDeferred = false }) => {
  const lines = quote?.lines || []
  const monthly = lines.filter((l) => l.cadence === 'month')
  const once = lines.filter((l) => l.cadence !== 'month')
  const monthlyTotal = quote?.monthly?.total_cents || 0
  const dueToday = quote?.due_today_cents || 0
  if (!lines.length) return null
  return (
    <div className="rounded-lg bg-neutral-50 border border-gray-200 p-4 text-sm">
      {monthly.length > 0 && (
        <>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1">Each month</div>
          {monthly.map((l, i) => <Line key={`${l.key}-${i}`} line={l} />)}
          <div className="flex items-center justify-between gap-4 border-t border-gray-200 mt-2 pt-2 font-semibold text-neutral-900">
            <span>Total each month</span>
            <span>{formatCents(monthlyTotal)}</span>
          </div>
        </>
      )}
      {once.length > 0 && (
        <>
          <div className={`text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1 ${monthly.length ? 'mt-4' : ''}`}>
            One time{feeDeferred ? ' · due when a spot opens' : ''}
          </div>
          {once.map((l, i) => <Line key={`${l.key}-${i}`} line={l} />)}
        </>
      )}
      <div className="flex items-center justify-between gap-4 border-t border-gray-200 mt-2 pt-2 font-semibold text-neutral-900">
        <span>Due today</span>
        <span>{formatCents(dueToday)}</span>
      </div>
    </div>
  )
}
