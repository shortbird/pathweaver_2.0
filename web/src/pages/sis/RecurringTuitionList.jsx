import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { withOrg } from './useSisOrg'
import { formatCents as money } from '../../utils/money'
import { useRecordDoors } from '../../components/sis/RecordDoors'

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

/**
 * Families who pay monthly by an autopay PAYMENT PLAN — one term invoice split
 * into monthly installments — rather than by monthly tuition.
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
    <section aria-label="On a monthly payment plan" className="mt-8">
      <h2 className="text-sm font-semibold text-neutral-800">On a monthly payment plan</h2>
      <p className="mt-1 mb-3 text-sm text-neutral-500 max-w-2xl">
        These families pay a term bill in monthly installments. Their plan bills them, so do
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
                <span className="text-xs text-neutral-500">{money(p.monthly_cents)}/month</span>
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

const RecurringTuitionList = ({ orgId, schedules, onChanged, emptyHint }) => {
  const { openFamily } = useRecordDoors()
  const [busyId, setBusyId] = useState(null)
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
                    ? <span>card {fam.card.brand} ····{fam.card.last4}</span>
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
    </div>
  )
}

export default RecurringTuitionList
