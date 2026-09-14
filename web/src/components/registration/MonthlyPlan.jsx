/**
 * The monthly-payment half of the funnel's payment step, shared between the
 * live funnel (pages/registerFunnel/FeeStep.jsx) and the SIS Registration
 * setup preview (components/sis/registrationSetup/PaperworkFeeSteps.jsx) so
 * staff see exactly the plan families do.
 *
 * Stateless: the page owns the { [studentId]: [addOnKeys] } selection and
 * hands it back through onToggle. Pricing is monthlyPricing.js, which mirrors
 * the server's arithmetic -- nothing here does sums of its own.
 */
import React from 'react'
import { money, moneyCompact } from './funnelUi'
import { monthlyLineItems, monthlyTotalCents, monthlyPlanSentence } from './monthlyPricing'

export const planSentence = (plan) => monthlyPlanSentence(plan, moneyCompact)

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
                  {covered ? 'Program fee included below' : `${moneyCompact(plan.per_student_cents)}/month`}
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
                      {moneyCompact(a.amount_cents)}/month
                    </span>
                  </span>
                  {a.description && (
                    <span className="block text-xs text-neutral-500 mt-1">{a.description}</span>
                  )}
                  {a.includes_program_fee && plan.per_student_cents > 0 && (
                    <span className="block text-xs text-neutral-500 mt-1">
                      Includes the {moneyCompact(plan.per_student_cents)} program fee for {s.name}.
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

// The itemized month, plus the one-time registration fee when the org also
// charges one, and what that comes to today.
export const MonthlySummary = ({ plan, students, oneTimeCents = 0 }) => {
  const items = monthlyLineItems(plan, students)
  const monthly = monthlyTotalCents(plan, students)
  return (
    <div className="rounded-lg bg-neutral-50 border border-gray-200 p-4 text-sm">
      {items.map((i, idx) => (
        <div key={`${i.key}-${idx}`} className="flex items-start justify-between gap-4 py-1">
          <span className="text-neutral-700">
            {i.label}
            {i.students.length > 0 && <span className="text-neutral-400"> · {i.students.join(', ')}</span>}
            {i.capped && <span className="text-neutral-400"> (family cap)</span>}
          </span>
          <span className="text-neutral-800 whitespace-nowrap">{money(i.amount_cents)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4 border-t border-gray-200 mt-2 pt-2 font-semibold text-neutral-900">
        <span>Total each month</span>
        <span>{money(monthly)}</span>
      </div>
      {oneTimeCents > 0 && (
        <>
          <div className="flex items-center justify-between gap-4 py-1 mt-2 text-neutral-700">
            <span>Registration fee <span className="text-neutral-400">(one time)</span></span>
            <span className="text-neutral-800">{money(oneTimeCents)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 font-semibold text-neutral-900">
            <span>Due today</span>
            <span>{money(oneTimeCents + monthly)}</span>
          </div>
        </>
      )}
    </div>
  )
}
