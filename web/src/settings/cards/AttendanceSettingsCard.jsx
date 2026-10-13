import React, { useState } from 'react'
import { ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline'
import { patchSisSettings } from '../../hooks/api/useSisSettings'
import { statusLabel } from '../../components/sis/ui/statusMaps'
import {
  ATTENDANCE_STATUSES, REQUIRED_STATUSES, attendanceSettingsFor,
} from '../../pages/sis/attendanceSettings'

/**
 * How this school takes attendance (ticket 0680d03c, Apogee Cache Valley:
 * "schoolwide daily attendance for teachers", Present / Absent / Picked up,
 * school days Mon-Thu). Shown when the attendance module is on.
 *
 * - Daily roll: one whole-school roll a day on the Attendance page, for a
 *   school that does not take roll by class. Off (the default), Attendance is
 *   the class roll, as before.
 * - Pickup check-out: a "Picked up" button on the daily roll that records the
 *   time.
 * - Statuses: which buttons the rolls offer. Present and Absent always stay.
 * - School days: which weekdays the daily roll steps through.
 *
 * Stored at feature_flags.sis_settings.attendance through the one settings
 * PATCH, as one object (the server replaces it whole and refuses a bad value).
 */

const WEEKDAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']]

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export default function AttendanceSettingsCard({ orgId, org, onUpdate }) {
  const [saved, setSaved] = useState(() => attendanceSettingsFor(org))
  const [draft, setDraft] = useState(saved)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggleIn = (key, value, order) => setDraft((d) => {
    const has = d[key].includes(value)
    const next = has ? d[key].filter((v) => v !== value) : [...d[key], value]
    return { ...d, [key]: order.filter((v) => next.includes(v)) }
  })

  const save = async () => {
    if (!draft.school_days.length) { setError('Pick at least one school day.'); return }
    setError('')
    setSaving(true)
    try {
      await patchSisSettings(orgId, { sis_settings: { attendance: draft } })
      setSaved(draft)
      onUpdate?.()
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not save the attendance settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold mb-2">Attendance</h2>
      <div className="p-4 border border-gray-200 rounded-lg bg-white space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-optio-purple/10">
            <ClipboardDocumentCheckIcon className="w-5 h-5 text-optio-purple" />
          </div>
          <div className="flex-1 space-y-3">
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={draft.daily_roll}
                onChange={(e) => setDraft((d) => ({ ...d, daily_roll: e.target.checked }))} />
              <span>
                <span className="block font-medium text-gray-900">Daily roll</span>
                <span className="block text-sm text-gray-500">
                  One attendance list for the whole school each day, on the Attendance page.
                  Teachers mark every student, with or without classes.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={draft.checkout}
                onChange={(e) => setDraft((d) => ({ ...d, checkout: e.target.checked }))} />
              <span>
                <span className="block font-medium text-gray-900">Pickup check-out</span>
                <span className="block text-sm text-gray-500">
                  A &quot;Picked up&quot; button on the daily roll that records the time a student leaves.
                </span>
              </span>
            </label>
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-gray-700 mb-1">Statuses</legend>
          <p className="text-xs text-gray-500 mb-2">The buttons teachers see. Present and Absent always stay.</p>
          <div className="flex flex-wrap gap-3">
            {ATTENDANCE_STATUSES.map((st) => (
              <label key={st} className="flex items-center gap-1.5 text-sm text-gray-700">
                <input type="checkbox" checked={draft.statuses.includes(st)}
                  disabled={REQUIRED_STATUSES.includes(st)}
                  onChange={() => toggleIn('statuses', st, ATTENDANCE_STATUSES)} />
                {statusLabel('attendance', st)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-gray-700 mb-1">School days</legend>
          <div className="flex flex-wrap gap-3">
            {WEEKDAYS.map(([d, label]) => (
              <label key={d} className="flex items-center gap-1.5 text-sm text-gray-700">
                <input type="checkbox" checked={draft.school_days.includes(d)}
                  onChange={() => toggleIn('school_days', d, WEEKDAYS.map(([n]) => n))} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center gap-2">
          <button type="button" onClick={save} disabled={saving || same(saved, draft)}
            className="px-3 py-1.5 rounded-lg bg-optio-purple text-white text-sm font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}
