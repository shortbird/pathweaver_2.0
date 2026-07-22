import React, { useCallback, useEffect, useState } from 'react'
import { XMarkIcon, BriefcaseIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { ModalOverlay } from '../ui'

/**
 * StaffProfileModal (admin) — the employment side of a staff member: position,
 * employee/contractor status, pay type, payroll id + hourly rate (export
 * metadata only — the SIS never pays anyone), dates, active flag, time clock
 * enablement, emergency contact, plus their non-class duties.
 */

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent'
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
    {children}
  </label>
)

export default function StaffProfileModal({ orgId, staff, onClose, onSaved }) {
  const [form, setForm] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [duty, setDuty] = useState({ title: '', assignment_type: 'duty', day_of_week: '', start_time: '', end_time: '', location: '' })
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
        position: form.position, staff_type: form.staff_type || null,
        pay_type: form.pay_type || null, payroll_id: form.payroll_id,
        hourly_rate_cents: rate,
        start_date: form.start_date || null, end_date: form.end_date || null,
        is_active: form.is_active, uses_time_clock: form.uses_time_clock,
        work_schedule: form.work_schedule,
        emergency_contact_name: form.emergency_contact_name,
        emergency_contact_phone: form.emergency_contact_phone,
      })
      toast.success('Profile saved')
      onSaved()
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
      setDuty({ title: '', assignment_type: 'duty', day_of_week: '', start_time: '', end_time: '', location: '' })
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

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center">
              <BriefcaseIcon className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">{staff.name} — employment</h2>
          </div>
          <button type="button" onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {!form ? (
          <p className="p-6 text-neutral-500">Loading…</p>
        ) : (
          <div className="p-4 space-y-4 overflow-y-auto">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Position">
                <input value={form.position} onChange={set('position')} placeholder="e.g. Art teacher" className={inputClass} />
              </Field>
              <Field label="Status">
                <select value={form.staff_type} onChange={set('staff_type')} className={inputClass}>
                  <option value="">—</option>
                  <option value="employee">Employee</option>
                  <option value="contractor">Independent contractor</option>
                </select>
              </Field>
              <Field label="Pay type">
                <select value={form.pay_type} onChange={set('pay_type')} className={inputClass}>
                  <option value="">—</option>
                  <option value="hourly">Hourly</option>
                  <option value="salaried">Salaried</option>
                  <option value="stipend">Stipend</option>
                  <option value="unpaid">Unpaid / volunteer</option>
                </select>
              </Field>
              <Field label="Payroll ID">
                <input value={form.payroll_id} onChange={set('payroll_id')} className={inputClass} />
              </Field>
              <Field label="Hourly rate ($)">
                <input type="number" min="0" step="0.01" value={form.hourly_rate} onChange={set('hourly_rate')} className={inputClass} />
              </Field>
              <Field label="Regular schedule">
                <input value={form.work_schedule} onChange={set('work_schedule')} placeholder="e.g. Tue & Thu 9–3" className={inputClass} />
              </Field>
              <Field label="Start date">
                <input type="date" value={form.start_date} onChange={set('start_date')} className={inputClass} />
              </Field>
              <Field label="End date">
                <input type="date" value={form.end_date} onChange={set('end_date')} className={inputClass} />
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

            <div className="grid grid-cols-2 gap-3">
              <Field label="Emergency contact name">
                <input value={form.emergency_contact_name} onChange={set('emergency_contact_name')} className={inputClass} />
              </Field>
              <Field label="Emergency contact phone">
                <input value={form.emergency_contact_phone} onChange={set('emergency_contact_phone')} className={inputClass} />
              </Field>
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
                    <button onClick={() => removeDuty(a.id)} className="ml-auto text-xs text-red-600 hover:underline">Remove</button>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                <input value={duty.title} onChange={(e) => setDuty((d) => ({ ...d, title: e.target.value }))}
                  placeholder="Duty (e.g. Lunch duty)" className={`${inputClass} md:col-span-2`} />
                <select value={duty.assignment_type} onChange={(e) => setDuty((d) => ({ ...d, assignment_type: e.target.value }))} className={inputClass}>
                  <option value="duty">Duty</option>
                  <option value="event">Event</option>
                  <option value="meeting">Meeting</option>
                  <option value="substitute">Substitute</option>
                  <option value="other">Other</option>
                </select>
                <select value={duty.day_of_week} onChange={(e) => setDuty((d) => ({ ...d, day_of_week: e.target.value }))} className={inputClass}>
                  <option value="">Day…</option>
                  {DAY_LABELS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
                <input type="time" value={duty.start_time} onChange={(e) => setDuty((d) => ({ ...d, start_time: e.target.value }))} className={inputClass} />
                <input type="time" value={duty.end_time} onChange={(e) => setDuty((d) => ({ ...d, end_time: e.target.value }))} className={inputClass} />
              </div>
              <button onClick={addDuty} className="mt-2 text-sm text-optio-purple font-medium hover:underline">
                + Add duty
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            Close
          </button>
          <button onClick={save} disabled={saving || !form}
            className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
