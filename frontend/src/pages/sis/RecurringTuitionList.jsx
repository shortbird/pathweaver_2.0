import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { withOrg } from './useSisOrg'

/**
 * The school's monthly tuition schedules — the record of who is being billed a
 * set amount every month, and why a family is or isn't being charged yet.
 *
 * Lives in its own component because it belongs on two screens. It used to
 * exist only inside the Add dialog on Tuition, which meant a school that bills
 * monthly (Optio Academy) had a Billing page and a Tuition page that were both
 * empty — no invoice exists until the first month is charged — while the
 * schedules they had just created were behind a button neither page mentioned.
 * The office reasonably concluded nothing had been saved.
 *
 * Reads and acts; adding a schedule stays in the dialog.
 */

export const money = (cents) => `$${((cents || 0) / 100).toFixed(2)}`

const STATUS_STYLE = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-amber-100 text-amber-800',
}

const sentOn = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString()
}

/** Why this schedule isn't billing yet, in the words the office needs.
 *
 * "Waiting on the family" was the only answer the row could give, and it was
 * wrong twice over: for a family nobody had emailed yet, and for a family with
 * no reachable parent at all — where the school is waiting on itself. */
export const billingState = (s) => {
  if (s.card) return null
  if (!s.guardians?.length) {
    return { tone: 'text-red-700', label: 'no parent to email — add one in People' }
  }
  if (!s.setup_link_sent_at) {
    return { tone: 'text-amber-700', label: 'setup link not sent yet' }
  }
  const on = sentOn(s.setup_link_sent_at)
  return { tone: 'text-amber-700', label: `link sent${on ? ` ${on}` : ''} — waiting on the family` }
}

/** Load the org's schedules. Shared so the Tuition button can show a count
 *  without a second copy of the request. */
export const useRecurringTuition = (orgId, enabled = true) => {
  const [schedules, setSchedules] = useState(null)

  const load = useCallback(() => {
    if (!orgId || !enabled) return
    api.get(withOrg('/api/sis/tuition/recurring', orgId))
      .then((r) => setSchedules(r.data?.schedules || []))
      .catch(() => { setSchedules([]); toast.error('Could not load monthly tuition') })
  }, [orgId, enabled])

  useEffect(() => { load() }, [load])
  return { schedules, load, setSchedules }
}

const RecurringTuitionList = ({ orgId, schedules, onChanged, emptyHint }) => {
  const [busyId, setBusyId] = useState(null)

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

  const sendSetupLink = async (row) => {
    setBusyId(row.id)
    try {
      const r = await api.post(
        withOrg(`/api/sis/tuition/recurring/households/${row.household_id}/setup-link`, orgId), {})
      // Name who it went to. "Emailed 2 guardians" is the answer to a question
      // nobody asked; the office wants to know it reached the right parent.
      const to = r.data?.sent_to || []
      toast.success(to.length ? `Setup link emailed to ${to.join(' and ')}`
        : 'Setup link emailed')
      onChanged?.()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not send the setup link')
    } finally { setBusyId(null) }
  }

  if (schedules === null) return <p className="text-sm text-neutral-400">Loading…</p>
  if (!schedules.length) {
    return <p className="text-sm text-neutral-400">{emptyHint || 'No monthly tuition set up yet.'}</p>
  }

  return (
    <div className="space-y-2">
      {schedules.map((s) => {
        const state = billingState(s)
        const recipients = (s.guardians || []).map((g) => g.name).join(' and ')
        return (
          <div key={s.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-neutral-800">{s.student_name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_STYLE[s.status] || 'bg-neutral-100 text-neutral-700'}`}>
                  {s.status}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-neutral-500 flex items-center gap-2 flex-wrap">
                <span>{money(s.monthly_cents)}/month</span>
                <span>·</span>
                <span>{s.household_name || 'No family'}</span>
                {s.card
                  ? <><span>·</span><span>card {s.card.brand} ····{s.card.last4}</span></>
                  : <><span>·</span><span className={state.tone}>{state.label}</span></>}
                {s.next_charge_on && (<><span>·</span><span>next {s.next_charge_on}</span></>)}
              </div>
              {!s.card && !!recipients && (
                <div className="mt-0.5 text-xs text-neutral-400">Goes to {recipients}</div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!s.card && (
                <Button size="sm" variant="secondary"
                  disabled={busyId === s.id || !s.guardians?.length}
                  onClick={() => sendSetupLink(s)}>
                  {s.setup_link_sent_at ? 'Resend setup link' : 'Email setup link'}
                </Button>
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
        )
      })}
    </div>
  )
}

export default RecurringTuitionList
