import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import Button from '../../ui/Button'
import { Input, Select } from '../../ui/Input'
import { useAuth } from '../../../contexts/AuthContext'
import { canSeeFinance } from '../../../pages/sis/sisRole'

/**
 * The staff record's Employment tab: position, employee/contractor status,
 * pay type, payroll id and hourly rate (export metadata only -- the SIS never
 * pays anyone), dates, active flag, time clock enablement, emergency contact,
 * plus their non-class duties.
 *
 * This was StaffProfileModal, a second dialog opened from the record's
 * footer, until M13c (2026-09-18). Moved in as a tab; nothing about what it
 * reads or writes changed.
 */

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-xs font-medium text-neutral-600 mb-1">{label}</span>
    {children}
  </label>
)

const EMPTY_DUTY = { title: '', assignment_type: 'duty', day_of_week: '', start_time: '', end_time: '', location: '' }

const EmploymentPanel = ({ orgId, staff, onSaved }) => {
  const { user } = useAuth()
  const seesFinance = canSeeFinance(user)
  const [form, setForm] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [duty, setDuty] = useState(EMPTY_DUTY)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    api.get(`/api/sis/staff-admin/profiles/${staff.id}?organization_id=${orgId}`)
      .then((r) => {
        const p = r.data?.profile || {}
        setForm({
          position: p.position || '',
          staff_type: p.staff_type || '',
          pay_type: p.pay_type || '',
          payroll_id: p.payroll_id || '',
          hourly_rate: p.hourly_rate_cents != null ? (p.hourly_rate_cents / 100).toFixed(2) : '',
          start_date: p.start_date || '',
          end_date: p.end_date || '',
          is_active: p.is_active !== false,
          uses_time_clock: Boolean(p.uses_time_clock),
          work_schedule: p.work_schedule || '',
          emergency_contact_name: p.emergency_contact_name || '',
          emergency_contact_phone: p.emergency_contact_phone || '',
        })
        setAssignments(r.data?.assignments || [])
      })
      .catch(() => toast.error('Failed to load the staff profile'))
  }, [orgId, staff.id])

  useEffect(() => { load() }, [load])

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((prev) => ({ ...prev, [k]: v }))
  }
  const setDutyField = (k) => (e) => setDuty((d) => ({ ...d, [k]: e.target.value }))

  const save = async () => {
    setSaving(true)
    try {
      const rate = form.hourly_rate === '' ? null : Math.round(parseFloat(form.hourly_rate) * 100)
      if (rate != null && (Number.isNaN(rate) || rate < 0)) {
        toast.error('Hourly rate must be a positive number')
        setSaving(false)
        return
      }
      await api.put(`/api/sis/staff-admin/profiles/${staff.id}`, {
        organization_id: orgId,
        position: form.position,
        // Omitted entirely, not sent as null: the API rejects any pay or
        // employment key from a coordinator, and sending nulls would also wipe
        // an admin's values.
        ...(seesFinance ? {
          staff_type: form.staff_type || null,
          pay_type: form.pay_type || null, payroll_id: form.payroll_id,
          hourly_rate_cents: rate,
          start_date: form.start_date || null, end_date: form.end_date || null,
        } : {}),
        is_active: form.is_active, uses_time_clock: form.uses_time_clock,
        work_schedule: form.work_schedule,
        emergency_contact_name: form.emergency_contact_name,
        emergency_contact_phone: form.emergency_contact_phone,
      })
      toast.success('Employment saved')
      onSaved?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the profile')
    } finally {
      setSaving(false)
    }
  }

  const addDuty = async () => {
    if (!duty.title.trim()) { toast.error('Duty title is required'); return }
    try {
      await api.post('/api/sis/staff-admin/assignments', {
        organization_id: orgId, user_id: staff.id,
        title: duty.title.trim(), assignment_type: duty.assignment_type,
        day_of_week: duty.day_of_week === '' ? null : Number(duty.day_of_week),
        start_time: duty.start_time || null, end_time: duty.end_time || null,
        location: duty.location || null,
      })
      setDuty(EMPTY_DUTY)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not add the duty')
    }
  }

  const removeDuty = async (id) => {
    try {
      await api.delete(`/api/sis/staff-admin/assignments/${id}?organization_id=${orgId}`)
      load()
    } catch {
      toast.error('Could not remove the duty')
    }
  }

  if (!form) return <p className="text-sm text-neutral-500">Loading…</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Field label="Position">
          <Input value={form.position} onChange={set('position')} placeholder="e.g. Art teacher" className="text-sm" />
        </Field>
        {/* Pay and employment terms are admin-only. A campus coordinator
            can't read these (the API redacts them), so offering the inputs
            would show blanks and then 403 on save. */}
        {seesFinance && (
          <>
            <Field label="Status">
              <Select value={form.staff_type} onChange={set('staff_type')} className="text-sm">
                <option value="">—</option>
                <option value="employee">Employee</option>
                <option value="contractor">Independent contractor</option>
                <option value="family">Family</option>
              </Select>
            </Field>
            <Field label="Pay type">
              <Select value={form.pay_type} onChange={set('pay_type')} className="text-sm">
                <option value="">—</option>
                <option value="hourly">Hourly</option>
                <option value="salaried">Salaried</option>
                <option value="stipend">Stipend</option>
                <option value="unpaid">Unpaid / volunteer</option>
              </Select>
            </Field>
            <Field label="Payroll ID">
              <Input value={form.payroll_id} onChange={set('payroll_id')} className="text-sm" />
            </Field>
            <Field label="Hourly rate ($)">
              <Input type="number" min="0" step="0.01" value={form.hourly_rate} onChange={set('hourly_rate')} className="text-sm" />
            </Field>
            <Field label="Start date">
              <Input type="date" value={form.start_date} onChange={set('start_date')} className="text-sm" />
            </Field>
            <Field label="End date">
              <Input type="date" value={form.end_date} onChange={set('end_date')} className="text-sm" />
            </Field>
          </>
        )}
        <Field label="Regular schedule">
          <Input value={form.work_schedule} onChange={set('work_schedule')} placeholder="e.g. Tue & Thu 9–3" className="text-sm" />
        </Field>
        <div className="flex flex-col justify-end gap-1.5 text-sm text-neutral-700">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.is_active} onChange={set('is_active')} /> Active
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.uses_time_clock} onChange={set('uses_time_clock')} /> Uses time clock
          </label>
        </div>
      </div>

      {/* Their own number is on the Profile tab; the emergency contact below
          is someone else entirely. */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Emergency contact name">
          <Input value={form.emergency_contact_name} onChange={set('emergency_contact_name')} className="text-sm" />
        </Field>
        <Field label="Emergency contact phone">
          <Input value={form.emergency_contact_phone} onChange={set('emergency_contact_phone')} className="text-sm" />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={save} loading={saving}>Save employment</Button>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <h3 className="text-sm font-semibold text-neutral-900 mb-2">Duties & shifts</h3>
        {!assignments.length && <p className="text-sm text-neutral-500 mb-2">No duties assigned.</p>}
        <ul className="space-y-1.5 mb-3">
          {assignments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-neutral-600 capitalize">{a.assignment_type}</span>
              <span className="text-neutral-800">{a.title}</span>
              <span className="text-xs text-neutral-400">
                {a.specific_date || (a.day_of_week != null ? DAY_LABELS[a.day_of_week] : '')}
                {a.start_time ? ` ${a.start_time.slice(0, 5)}–${(a.end_time || '').slice(0, 5)}` : ''}
                {a.location ? ` · ${a.location}` : ''}
              </span>
              <button type="button" onClick={() => removeDuty(a.id)} className="ml-auto text-xs text-red-600 hover:underline">Remove</button>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <div className="md:col-span-2">
            <Input value={duty.title} onChange={setDutyField('title')} placeholder="Duty (e.g. Lunch duty)" className="text-sm" />
          </div>
          <Select value={duty.assignment_type} onChange={setDutyField('assignment_type')} className="text-sm">
            <option value="duty">Duty</option>
            <option value="event">Event</option>
            <option value="meeting">Meeting</option>
            <option value="substitute">Substitute</option>
            <option value="other">Other</option>
          </Select>
          <Select value={duty.day_of_week} onChange={setDutyField('day_of_week')} className="text-sm">
            <option value="">Day…</option>
            {DAY_LABELS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </Select>
          <Input type="time" value={duty.start_time} onChange={setDutyField('start_time')} className="text-sm" />
          <Input type="time" value={duty.end_time} onChange={setDutyField('end_time')} className="text-sm" />
        </div>
        <button type="button" onClick={addDuty} className="mt-2 text-sm text-optio-purple font-medium hover:underline">
          + Add duty
        </button>
      </div>
    </div>
  )
}

export default EmploymentPanel
