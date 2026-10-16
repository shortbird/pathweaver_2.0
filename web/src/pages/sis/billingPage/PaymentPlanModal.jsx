/**
 * Put an invoice on a payment plan: monthly, semester, or one payment in full
 * (2026-10-16). POST /api/sis/invoices/<id>/payment-plan existed with no screen
 * calling it, so the only plan a family could be on was the monthly x10 a
 * parent starts by turning on autopay.
 *
 * The schedule shown is the server's own (the same POST with preview: true), so
 * the dates and cents the office reads here are the ones the save creates. The
 * plan spreads what is still owed. Semester payments are 5 months apart.
 *
 * Without a card, a plan is a schedule: the family sees each payment and when
 * it is due, and the office records them. If the family turns on autopay, their
 * card goes on this schedule and is charged on each date. The server refuses an
 * invoice already on autopay; the office stops autopay first.
 */

import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import Button from '../../../components/ui/Button'
import { Modal } from '../../../components/ui'
import { usePaymentPlanPreview, useSavePaymentPlan } from '../../../hooks/api/useSisBillingPlans'
import INPUT_CLASS from './field'
import money from './money'
import today from './today'

export const CADENCE_CHOICES = [
  { value: 'monthly', label: 'Monthly', defaultCount: 10 },
  { value: 'semester', label: 'Semester', defaultCount: 2 },
  { value: 'full', label: 'Pay in full', defaultCount: 1 },
]

export const cadenceWords = (cadence) => ({
  monthly: 'Monthly',
  semester: 'Semester (every 5 months)',
  full: 'Pay in full',
}[cadence] || cadence)

const PaymentPlanModal = ({ invoiceId, orgId, doc, onCancel, onSaved }) => {
  const current = doc.payment_plan || null
  const balance = doc.amount_due_cents ?? ((doc.total_cents || 0) - (doc.amount_paid_cents || 0))
  const [cadence, setCadence] = useState(current?.cadence || 'monthly')
  const [countStr, setCountStr] = useState(String(
    current?.installment_count
      || CADENCE_CHOICES.find((c) => c.value === (current?.cadence || 'monthly')).defaultCount))
  const [startDate, setStartDate] = useState(
    (current?.installments || []).find((i) => i.status !== 'paid')?.due_date
      || (doc.due_date ? String(doc.due_date).slice(0, 10) : today()))

  const count = cadence === 'full' ? 1 : parseInt(countStr, 10)
  const body = {
    organization_id: orgId, cadence,
    installment_count: Number.isFinite(count) ? count : null,
    start_date: startDate || null,
  }
  // Settled terms, a moment after the last keystroke, so typing "12" asks for
  // one schedule rather than for "1" and then "12".
  const bodyKey = JSON.stringify(body)
  const [terms, setTerms] = useState(body)
  useEffect(() => {
    const t = setTimeout(() => setTerms(JSON.parse(bodyKey)), 250)
    return () => clearTimeout(t)
  }, [bodyKey])
  const settled = JSON.stringify(terms) === bodyKey
  const preview = usePaymentPlanPreview(invoiceId, terms)
  const schedule = settled && preview.isSuccess ? preview.data : null
  const previewError = settled && preview.isError
    ? (preview.error?.response?.data?.error || 'Could not work out the schedule') : null
  const savePlan = useSavePaymentPlan(invoiceId)
  const saving = savePlan.isPending

  const pickCadence = (value) => {
    setCadence(value)
    setCountStr(String(CADENCE_CHOICES.find((c) => c.value === value).defaultCount))
  }

  const save = async () => {
    try {
      await savePlan.mutateAsync(body)
      toast.success('Payment plan saved')
      onSaved()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save the payment plan')
    }
  }

  return (
    <Modal isOpen size="sm" title={`Payment plan for ${doc.invoice_number || 'invoice'}`} onClose={onCancel}>
      <p className="text-xs text-neutral-500 mb-3">
        Spreads the {money(balance)} still owed. The family sees each payment and its date. If they
        turn on autopay, their card is charged on each date; otherwise you record the payments.
        {current && ' This replaces the plan the invoice is on now.'}
      </p>
      <div className="space-y-3 text-sm">
        <fieldset>
          <legend className="text-neutral-700 mb-1">How the family pays</legend>
          <div className="flex flex-wrap gap-3">
            {CADENCE_CHOICES.map((c) => (
              <label key={c.value} className="flex items-center gap-1.5">
                <input type="radio" name="plan-cadence" value={c.value}
                  checked={cadence === c.value} onChange={() => pickCadence(c.value)} />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {cadence !== 'full' && (
          <label className="block">
            <span className="text-neutral-700">Number of payments</span>
            <input className={INPUT_CLASS} type="number" min="2" step="1"
              value={countStr} onChange={(e) => setCountStr(e.target.value)}
              aria-label="Number of payments" />
            {cadence === 'semester' && (
              <span className="text-xs text-neutral-500">Semester payments are 5 months apart.</span>
            )}
          </label>
        )}
        <label className="block">
          <span className="text-neutral-700">{cadence === 'full' ? 'Due date' : 'First payment date'}</span>
          <input className={INPUT_CLASS} type="date" value={startDate}
            onChange={(e) => setStartDate(e.target.value)} aria-label="First payment date" />
        </label>

        <div className="border-t border-gray-100 pt-2" data-testid="plan-preview">
          <div className="text-xs uppercase tracking-wide text-neutral-400 mb-1">Schedule</div>
          {previewError && <p role="alert" className="text-sm text-red-700">{previewError}</p>}
          {!previewError && !schedule && <p className="text-neutral-400">Working it out…</p>}
          {!previewError && schedule && schedule.map((s, i) => (
            <div key={`${s.due_date}-${i}`} className="flex justify-between text-neutral-700">
              <span>{s.due_date}</span><span>{money(s.amount_cents)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving || !schedule || !!previewError}>
          {saving ? 'Saving…' : 'Save plan'}
        </Button>
      </div>
    </Modal>
  )
}

export default PaymentPlanModal
