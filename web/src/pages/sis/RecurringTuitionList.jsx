import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { INPUT_CLASS } from '../../components/ui/Input'
import { withOrg } from './useSisOrg'
import { formatCents as money } from '../../utils/money'
import { useRecordDoors } from '../../components/sis/RecordDoors'
import { useUpdateRecurringTuition } from '../../hooks/api/useSisBillingPlans'

/**
 * The school's monthly tuition — who is being billed a set amount every month,
 * and why a family is or isn't being charged yet.
 *
 * Grouped BY FAMILY, not by student. A household saves one card, through one
 * link, held by one parent; listing a row per child gave a two-child family two
 * "Email setup link" buttons for a single setup, which reads as two things to
 * send. The family is the payer and owns the card and the link; the children
 * under it are the amounts, each pausable on its own.
 *
 * Lives in its own component because it belongs on more than one screen. It
 * used to exist only inside the Add dialog, which meant a school that bills
 * monthly (Optio Academy) had a Billing page and a Tuition page that were both
 * empty — no invoice exists until the first month is charged — while the
 * schedules they had just created were behind a button neither page mentioned.
 *
 * Reads and acts; adding a schedule stays in the dialog.
 */

export { money }

const STATUS_STYLE = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-amber-100 text-amber-800',
}

const sentOn = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString()
}

/** Why this family isn't being charged yet, in the words the office needs.
 *
 * "Waiting on the family" was the only answer the row could give, and it was
 * wrong twice over: for a family nobody had emailed yet, and for a family with
 * no reachable parent at all — where the school is waiting on itself. */
export const billingState = (fam) => {
  if (fam.card) return null
  if (!fam.contact) {
    return { tone: 'text-red-700', label: 'no parent to email — add one in People' }
  }
  if (!fam.sentAt) return { tone: 'text-amber-700', label: 'setup link not sent yet' }
  const on = sentOn(fam.sentAt)
  return { tone: 'text-amber-700', label: `link sent${on ? ` ${on}` : ''} — waiting on the family` }
}

/** Schedules folded into one entry per household. */
export const groupByFamily = (schedules) => {
  const families = new Map()
  for (const s of schedules || []) {
    const key = s.household_id || s.id
    if (!families.has(key)) {
      families.set(key, {
        householdId: s.household_id,
        name: s.household_name || 'No family',
        card: s.card || null,
        // Per household, so any row carries it; the first one wins.
        contact: s.billing_contact || null,
        sentAt: s.setup_link_sent_at || null,
        students: [],
        monthlyCents: 0,
      })
    }
    const fam = families.get(key)
    fam.students.push(s)
    if (s.status === 'active') fam.monthlyCents += s.monthly_cents || 0
  }
  return [...families.values()]
}

/** Load the org's schedules. Shared so a caller can show a count without a
 *  second copy of the request. */
export const useRecurringTuition = (orgId, enabled = true) => {
  const [schedules, setSchedules] = useState(null)
  // Families paying monthly by an autopay payment plan instead (ticket
  // bc9010f4). Read-only here; the same response carries them.
  const [paymentPlans, setPaymentPlans] = useState(null)

  const load = useCallback(() => {
    if (!orgId || !enabled) return
    api.get(withOrg('/api/sis/tuition/recurring', orgId))
      .then((r) => {
        setSchedules(r.data?.schedules || [])
        setPaymentPlans(r.data?.payment_plans || [])
      })
      .catch(() => {
        setSchedules([]); setPaymentPlans([])
        toast.error('Could not load monthly tuition')
      })
  }, [orgId, enabled])

  useEffect(() => { load() }, [load])
  return { schedules, paymentPlans, load, setSchedules }
}

const shortDate = (iso) => {
  if (!iso) return null
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString()
}

/** What one plan payment is, in the row: the amount "/month", "every 5
 *  months", or "in one payment". */
export const planAmountText = (p) => (p.cadence === 'semester'
  ? `${money(p.monthly_cents)} every 5 months`
  : p.cadence === 'full' ? `${money(p.monthly_cents)} in one payment`
    : `${money(p.monthly_cents)}/month`)

/**
 * Families who pay by a PAYMENT PLAN — one term invoice split into
 * installments — rather than by monthly tuition. Every cadence since
 * 2026-10-16: a semester or pay-in-full plan the school set from the invoice
 * bills the family as surely as a monthly one, and the server refuses monthly
 * tuition for any of them.
 *
 * Ticket bc9010f4 (Marika, iCreate, 2026-10-02): "It is saying there is no
 * student on a monthly rate, yet I know there are at least a couple who are.
 * Do we have to add them manually to the monthly tuition tab?" The tab only
 * listed monthly tuition, and iCreate bills monthly through plans. Adding a
 * plan family as monthly tuition would charge them twice, so this list is
 * read-only: the plan is managed on the family's Billing tab, where it lives.
 */
export const MonthlyPaymentPlanList = ({ plans, onChanged }) => {
  const { openFamily } = useRecordDoors()
  if (!plans?.length) return null
  return (
    <section aria-label="On a payment plan" className="mt-8">
      <h2 className="text-sm font-semibold text-neutral-800">On a payment plan</h2>
      <p className="mt-1 mb-3 text-sm text-neutral-500 max-w-2xl">
        These families pay a term bill in installments. Their plan bills them, so do
        not add them as monthly tuition above. Open a family to change the plan.
      </p>
      <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
        {plans.map((p) => {
          const next = shortDate(p.next_due_date)
          // The whole row opens the family's Billing tab, not only the name
          // (Tanner, 2026-10-02, verifying ticket bc9010f4).
          const Row = p.household_id ? 'button' : 'div'
          const rowProps = p.household_id
            ? { type: 'button',
                'aria-label': `Open ${p.household_name || 'family'} billing`,
                onClick: () => openFamily(p.household_id, { tab: 'billing', onSaved: onChanged }) }
            : {}
          return (
            <Row key={p.plan_id} {...rowProps}
              className={`w-full text-left flex items-center justify-between gap-3 px-3 py-2${
                p.household_id ? ' hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-optio-purple' : ''}`}>
              <span className="min-w-0 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-neutral-800">
                  {p.household_name || (p.household_id ? 'Family' : 'No family')}
                </span>
                {p.student_name && (
                  <span className="text-sm text-neutral-600">{p.student_name}</span>
                )}
                <span className="text-xs text-neutral-500">{planAmountText(p)}</span>
                {next && <span className="text-xs text-neutral-500">next {next}</span>}
                {p.remaining_count > 0 && (
                  <span className="text-xs text-neutral-500">
                    {p.remaining_count} {p.remaining_count === 1 ? 'installment' : 'installments'} left
                  </span>
                )}
              </span>
              <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${p.auto_charge
                ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-700'}`}>
                {p.auto_charge ? 'Autopay on' : 'Autopay off'}
              </span>
            </Row>
          )
        })}
      </div>
    </section>
  )
}

const toCents = (str) => {
  const n = parseFloat(str)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/** When a changed amount is first charged, in the office's words.
 *
 * Monthly tuition is not a Stripe subscription. Each month the sweep makes a
 * new invoice from the amount on the schedule and charges the card on file for
 * that invoice (sis_recurring_tuition_service.bill_household). So a new amount
 * changes nothing in Stripe and nothing already sent: it is simply the amount
 * the next month's invoice is made with. */
export const whenItApplies = (row) => {
  const next = shortDate(row?.next_charge_on)
  if (row?.status === 'paused') {
    return 'The new amount is used for the first charge after you resume. Invoices already sent do not change.'
  }
  if (next) {
    return `The new amount is used from the next monthly charge, on ${next}. Invoices already sent do not change.`
  }
  return 'The new amount is used for the first charge, when the family sets up payment.'
}

/** Change one child's monthly amount or its description. The PATCH also takes
 *  day_of_month, but it is not offered: the billing day is the day the family
 *  set up payment (owner, 2026-10-05), and the PATCH does not move
 *  next_charge_on, so a changed day would not change when they are charged. */
export const EditRecurringTuitionModal = ({ row, orgId, onClose, onSaved }) => {
  // Mounted per row (keyed by its id), so the form starts from that row.
  const [monthlyStr, setMonthlyStr] = useState(() => ((row?.monthly_cents || 0) / 100).toFixed(2))
  const [description, setDescription] = useState(() => row?.description || '')
  const [error, setError] = useState(null)
  const update = useUpdateRecurringTuition(orgId)
  const saving = update.isPending

  const monthlyCents = toCents(monthlyStr)
  const changed = !!row && (monthlyCents !== row.monthly_cents
    || description.trim() !== (row.description || ''))
  const canSave = !!row && monthlyCents > 0 && changed && !saving

  const save = async () => {
    if (!canSave) return
    setError(null)
    try {
      await update.mutateAsync({
        id: row.id,
        monthly_cents: monthlyCents,
        // '' clears it; the server stores an empty description as none.
        description: description.trim(),
      })
      toast.success('Monthly tuition updated')
      onSaved?.()
      onClose()
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not update monthly tuition')
    }
  }

  return (
    <Modal
      isOpen={!!row}
      onClose={onClose}
      title={row ? `Edit monthly tuition: ${row.student_name}` : 'Edit monthly tuition'}
      footer={(
        <div className="flex items-center justify-end w-full gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!canSave}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      )}
    >
      {row && (
        <div className="space-y-4">
          <div>
            <label htmlFor="edit-monthly-amount" className="block text-xs font-medium text-neutral-600 mb-1">
              Amount each month
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">$</span>
              <input id="edit-monthly-amount" type="text" inputMode="decimal"
                className={`${INPUT_CLASS} pl-6`} value={monthlyStr}
                onChange={(e) => setMonthlyStr(e.target.value)} />
            </div>
          </div>
          <div>
            <label htmlFor="edit-monthly-description" className="block text-xs font-medium text-neutral-600 mb-1">
              Description <span className="text-neutral-400">(optional)</span>
            </label>
            <input id="edit-monthly-description" type="text" className={INPUT_CLASS}
              placeholder="Monthly tuition" value={description}
              onChange={(e) => setDescription(e.target.value)} />
          </div>
          <p className="text-sm text-neutral-600">{whenItApplies(row)}</p>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>
      )}
    </Modal>
  )
}

const RecurringTuitionList = ({ orgId, schedules, onChanged, emptyHint }) => {
  const { openFamily } = useRecordDoors()
  const [busyId, setBusyId] = useState(null)
  const [editing, setEditing] = useState(null)
  const families = useMemo(() => groupByFamily(schedules), [schedules])

  const setStatus = async (row, status) => {
    setBusyId(row.id)
    try {
      await api.post(withOrg(`/api/sis/tuition/recurring/${row.id}/status`, orgId), { status })
      toast.success(status === 'canceled' ? 'Monthly tuition ended'
        : status === 'paused' ? 'Paused' : 'Resumed')
      onChanged?.()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not update the schedule')
    } finally { setBusyId(null) }
  }

  const sendSetupLink = async (fam) => {
    setBusyId(fam.householdId)
    try {
      const r = await api.post(
        withOrg(`/api/sis/tuition/recurring/households/${fam.householdId}/setup-link`, orgId), {})
      const to = r.data?.sent_to || []
      toast.success(to.length ? `Setup link emailed to ${to[0]}` : 'Setup link emailed')
      onChanged?.()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not send the setup link')
    } finally { setBusyId(null) }
  }

  if (schedules === null) return <p className="text-sm text-neutral-400">Loading…</p>
  if (!families.length) {
    return <p className="text-sm text-neutral-400">{emptyHint || 'No monthly tuition set up yet.'}</p>
  }

  return (
    <div className="space-y-3">
      {families.map((fam) => {
        const state = billingState(fam)
        const busy = busyId === fam.householdId
        return (
          <div key={fam.householdId}
            className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            {/* The family: one card, one link, one parent. */}
            <div className="flex items-center justify-between gap-3 p-3 bg-neutral-50 border-b border-gray-200">
              <div className="min-w-0">
                <div className="text-sm font-medium text-neutral-800">
                  {fam.householdId
                    ? (
                      <button type="button" onClick={() => openFamily(fam.householdId, { tab: 'billing', onSaved: onChanged })}
                        className="hover:text-optio-purple hover:underline">
                        {fam.name}
                      </button>
                    )
                    : fam.name}
                  <span className="ml-2 text-neutral-500 font-normal">
                    {money(fam.monthlyCents)}/month
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-neutral-500 flex items-center gap-2 flex-wrap">
                  {fam.card
                    ? <span>
                        {fam.card.type === 'us_bank_account' ? 'bank' : 'card'} {fam.card.brand} ····{fam.card.last4}
                      </span>
                    : <span className={state.tone}>{state.label}</span>}
                  {!fam.card && !!fam.contact && (
                    <><span>·</span><span>goes to {fam.contact.name}</span></>
                  )}
                </div>
              </div>
              {!fam.card && (
                <Button size="sm" variant="secondary" disabled={busy || !fam.contact}
                  onClick={() => sendSetupLink(fam)}>
                  {fam.sentAt ? 'Resend setup link' : 'Email setup link'}
                </Button>
              )}
            </div>

            {/* The children: one amount each, paused or ended on its own. */}
            <div className="divide-y divide-gray-100">
              {fam.students.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-neutral-800">{s.student_name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_STYLE[s.status] || 'bg-neutral-100 text-neutral-700'}`}>
                      {s.status}
                    </span>
                    <span className="text-xs text-neutral-500">{money(s.monthly_cents)}/month</span>
                    {s.description && (
                      <span className="text-xs text-neutral-400">{s.description}</span>
                    )}
                    {s.next_charge_on && (
                      <span className="text-xs text-neutral-500">next {s.next_charge_on}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.status !== 'canceled' && (
                      <Button size="sm" variant="secondary" disabled={busyId === s.id}
                        aria-label={`Edit ${s.student_name}`}
                        onClick={() => setEditing(s)}>Edit</Button>
                    )}
                    {s.status === 'active' ? (
                      <Button size="sm" variant="secondary" disabled={busyId === s.id}
                        onClick={() => setStatus(s, 'paused')}>Pause</Button>
                    ) : (
                      <Button size="sm" variant="secondary" disabled={busyId === s.id}
                        onClick={() => setStatus(s, 'active')}>Resume</Button>
                    )}
                    <Button size="sm" variant="secondary" disabled={busyId === s.id}
                      onClick={() => setStatus(s, 'canceled')}>End</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {editing && (
        <EditRecurringTuitionModal key={editing.id} row={editing} orgId={orgId}
          onClose={() => setEditing(null)} onSaved={onChanged} />
      )}
    </div>
  )
}

export default RecurringTuitionList
