import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { Modal } from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import SearchSelect from '../../components/ui/SearchSelect'
import { withOrg } from './useSisOrg'

/**
 * Put one student on monthly tuition — a set amount charged every month until
 * it is turned off (Optio Academy, 2026-08-31).
 *
 * Not a payment plan: there is no total and no end date, so nothing here asks
 * for a number of months. One schedule per student, so each child's tuition can
 * be changed, paused or ended on its own; the monthly sweep then bills a family
 * ONCE, on one invoice with a line per child.
 *
 * The ADD form only. What the school already bills is listed on the Tuition
 * page itself (RecurringTuitionList) rather than in here — a record the office
 * has to open a dialog to see is a record they reasonably conclude isn't there.
 * It still loads the schedules, to keep a student who already has one out of
 * the picker instead of failing at the save.
 */

const toCents = (str) => {
  const n = parseFloat(str)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'
const label = 'block text-xs font-medium text-neutral-600 mb-1'

const RecurringTuitionModal = ({ isOpen, onClose, orgId, onAdded }) => {
  const [roster, setRoster] = useState(null)
  const [schedules, setSchedules] = useState(null)

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
      // Adding a schedule emails nobody — billing starts when the family saves a
      // card. "Added" on its own reads as done, and the office walks away from a
      // schedule that will never charge.
      toast.success('Added. Email the family the setup link to start billing.')
      setStudentId(''); setMonthlyStr(''); setDescription('')
      load()
      onAdded?.()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not add monthly tuition')
    } finally { setAdding(false) }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add monthly tuition"
      size="lg"
      footer={(
        <div className="flex items-center justify-end w-full gap-3">
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

        <div>
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
