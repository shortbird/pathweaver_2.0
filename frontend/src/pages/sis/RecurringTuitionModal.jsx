import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { Modal } from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import SearchSelect from '../../components/ui/SearchSelect'
import { withOrg } from './useSisOrg'

/**
 * Monthly tuition — a set amount per student, charged every month until it is
 * turned off (Optio Academy, 2026-08-31).
 *
 * Not a payment plan: there is no total and no end date, so nothing here asks
 * for a number of months. One schedule per student, so each child's tuition can
 * be changed, paused or ended on its own; the monthly sweep then bills a family
 * ONCE, on one invoice with a line per child.
 *
 * Billing does not start until the family saves a card, which they do through a
 * no-login link this screen emails them. Until then a schedule reads "waiting on
 * the family" rather than looking active but silently never charging.
 */

const money = (cents) => `$${((cents || 0) / 100).toFixed(2)}`

const toCents = (str) => {
  const n = parseFloat(str)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'
const label = 'block text-xs font-medium text-neutral-600 mb-1'

const STATUS_STYLE = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-amber-100 text-amber-800',
}

const RecurringTuitionModal = ({ isOpen, onClose, orgId }) => {
  const [roster, setRoster] = useState(null)
  const [schedules, setSchedules] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const [studentId, setStudentId] = useState('')
  const [monthlyStr, setMonthlyStr] = useState('')
  const [description, setDescription] = useState('')
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => {
    if (!orgId) return
    api.get(withOrg('/api/sis/tuition/recurring', orgId))
      .then((r) => setSchedules(r.data?.schedules || []))
      .catch(() => { setSchedules([]); toast.error('Could not load monthly tuition') })
  }, [orgId])

  useEffect(() => {
    if (!isOpen || !orgId) return
    load()
    api.get(withOrg('/api/sis/roster', orgId))
      .then((r) => setRoster(r.data?.roster || []))
      .catch(() => setRoster([]))
  }, [isOpen, orgId, load])

  useEffect(() => {
    if (isOpen) return
    setStudentId(''); setMonthlyStr(''); setDescription(''); setDayOfMonth(1)
  }, [isOpen])

  // A student already on a schedule can't be given a second one, so they drop
  // out of the picker rather than failing at the save.
  const scheduled = useMemo(
    () => new Set((schedules || []).map((s) => s.student_user_id)),
    [schedules]
  )
  const students = useMemo(
    () => (roster || []).filter((r) => r.is_student && !scheduled.has(r.student_id)),
    [roster, scheduled]
  )
  const selected = students.find((s) => s.student_id === studentId) || null
  const noHousehold = !!selected && !selected.household_id

  const monthlyCents = toCents(monthlyStr)
  const canAdd = !!studentId && monthlyCents > 0 && !noHousehold && !adding

  const activeTotal = (schedules || [])
    .filter((s) => s.status === 'active')
    .reduce((sum, s) => sum + (s.monthly_cents || 0), 0)

  const add = async () => {
    if (!canAdd) return
    setAdding(true)
    try {
      await api.post(withOrg('/api/sis/tuition/recurring', orgId), {
        student_id: studentId,
        monthly_cents: monthlyCents,
        description: description.trim() || undefined,
        day_of_month: Number(dayOfMonth) || 1,
      })
      toast.success('Monthly tuition added')
      setStudentId(''); setMonthlyStr(''); setDescription('')
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not add monthly tuition')
    } finally { setAdding(false) }
  }

  const setStatus = async (row, status) => {
    setBusyId(row.id)
    try {
      await api.post(withOrg(`/api/sis/tuition/recurring/${row.id}/status`, orgId), { status })
      toast.success(status === 'canceled' ? 'Monthly tuition ended'
        : status === 'paused' ? 'Paused' : 'Resumed')
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not update the schedule')
    } finally { setBusyId(null) }
  }

  const sendSetupLink = async (row) => {
    setBusyId(row.id)
    try {
      const r = await api.post(
        withOrg(`/api/sis/tuition/recurring/households/${row.household_id}/setup-link`, orgId), {})
      const n = r.data?.emailed || 0
      toast.success(n ? `Setup link emailed to ${n} guardian${n === 1 ? '' : 's'}`
        : 'No guardian email on file')
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not send the setup link')
    } finally { setBusyId(null) }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Monthly tuition"
      size="xl"
      footer={(
        <div className="flex items-center justify-between w-full gap-3">
          <span className="text-sm text-neutral-500">
            {activeTotal > 0
              ? <>Billing <strong className="text-neutral-800">{money(activeTotal)}</strong> a month across this school</>
              : 'Nothing is being billed monthly yet'}
          </span>
          <Button variant="secondary" onClick={onClose}>Done</Button>
        </div>
      )}
    >
      <div className="space-y-5">
        <p className="text-sm text-neutral-500">
          A set amount per student, charged automatically every month until you stop it.
          Billing starts once the family saves a card — send them the setup link and the first
          payment is taken right away. A family with more than one student gets one invoice and
          one charge, itemised per child.
        </p>

        {/* ── Existing schedules ─────────────────────────────────────────── */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">
            Current schedules
          </h3>
          {schedules === null && <p className="text-sm text-neutral-400">Loading…</p>}
          {schedules?.length === 0 && (
            <p className="text-sm text-neutral-400">
              No monthly tuition set up yet. Add a student below.
            </p>
          )}
          <div className="space-y-2">
            {(schedules || []).map((s) => (
              <div key={s.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3">
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
                      : <><span>·</span><span className="text-amber-700">waiting on the family</span></>}
                    {s.next_charge_on && (<><span>·</span><span>next {s.next_charge_on}</span></>)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!s.card && (
                    <Button size="sm" variant="secondary" disabled={busyId === s.id}
                      onClick={() => sendSetupLink(s)}>
                      Email setup link
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
            ))}
          </div>
        </div>

        {/* ── Add ────────────────────────────────────────────────────────── */}
        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">
            Add a student
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={label}>Student</label>
              <SearchSelect
                value={studentId}
                onChange={setStudentId}
                options={students}
                getId={(s) => s.student_id}
                getLabel={(s) => (s.household_name ? `${s.name} — ${s.household_name}` : s.name)}
                placeholder={roster === null ? 'Loading students…' : 'Search students…'}
              />
              {noHousehold && (
                <p className="mt-1 text-xs text-amber-700">
                  {selected.name} isn&rsquo;t in a family yet, so there&rsquo;s no guardian to bill.
                </p>
              )}
            </div>
            <div>
              <label className={label}>Amount each month</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">$</span>
                <input type="text" inputMode="decimal" className={`${field} pl-6`}
                  placeholder="500.00" value={monthlyStr}
                  onChange={(e) => setMonthlyStr(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={label}>Charge on day</label>
              <input type="number" min={1} max={28} className={field} value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)} />
              <p className="mt-1 text-xs text-neutral-400">
                1–28, so the date exists every month.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Description <span className="text-neutral-400">(optional)</span></label>
              <input type="text" className={field} placeholder="Monthly tuition"
                value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button onClick={add} disabled={!canAdd}>
              {adding ? 'Adding…' : 'Add monthly tuition'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default RecurringTuitionModal
