import React, { useState } from 'react'
import { EnvelopeIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'

/**
 * The weekly parent digest: on or off, and when it goes out.
 *
 * Dallin Bird (Gryffin), 2026-09-07: parents are not logging in to see how
 * their child is doing, so the week should arrive in their inbox instead.
 *
 * Off for every organization until someone here turns it on, and the day and
 * hour are the school's own — a school in Utah does not want Sunday's email
 * arriving on Monday because the server runs in UTC. The backend reads these
 * three values and nothing else (services/parent_weekly_digest_service).
 */

const DAYS = [
  { value: 'sunday', label: 'Sunday' },
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
]

const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  value: hour,
  label: `${((hour + 11) % 12) + 1}:00 ${hour < 12 ? 'AM' : 'PM'}`,
}))

export default function ParentDigestCard({ orgId, org, onUpdate }) {
  const stored = org?.feature_flags?.sis_settings?.parent_weekly_digest
  const current = (typeof stored === 'boolean' ? { enabled: stored } : stored) || {}

  const [enabled, setEnabled] = useState(Boolean(current.enabled))
  const [day, setDay] = useState(current.day || 'sunday')
  const [hour, setHour] = useState(Number.isInteger(current.hour) ? current.hour : 17)
  const [saving, setSaving] = useState(false)

  const timezone = org?.timezone || 'America/Denver'

  // The PUT replaces feature_flags wholesale, so every write rebuilds the blob
  // from what we were given. Dropping the spread here would wipe every other
  // setting the school has.
  const save = async (next) => {
    setSaving(true)
    try {
      const flags = org?.feature_flags || {}
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: {
          ...flags,
          sis_settings: {
            ...(flags.sis_settings || {}),
            parent_weekly_digest: { enabled: next.enabled, day: next.day, hour: next.hour },
          },
        },
      })
      setEnabled(next.enabled)
      setDay(next.day)
      setHour(next.hour)
      onUpdate?.()
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update the weekly digest setting')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold mb-2">Parent emails</h2>
      <div className="p-4 border border-gray-200 rounded-lg bg-white">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-optio-purple/10">
            <EnvelopeIcon className="w-5 h-5 text-optio-purple" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-gray-900">Send parent weekly digest email</span>
              <button
                onClick={() => save({ enabled: !enabled, day, hour })}
                disabled={saving}
                role="switch"
                aria-checked={enabled}
                aria-label="Send parent weekly digest email"
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  enabled ? 'bg-optio-purple' : 'bg-gray-300'
                } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  enabled ? 'translate-x-4' : 'translate-x-1'
                }`} />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Emails each parent once a week with what their child finished, how much evidence
              they added, and anything still to finish. Photos and video stay behind their
              login — the email points them to the Optio app to see the work itself.
            </p>

            {enabled && (
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="text-xs text-gray-600">
                  <span className="block mb-1 font-medium">Day</span>
                  <select
                    value={day}
                    disabled={saving}
                    onChange={(e) => save({ enabled, day: e.target.value, hour })}
                    aria-label="Digest send day"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 min-h-[44px]"
                  >
                    {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </label>
                <label className="text-xs text-gray-600">
                  <span className="block mb-1 font-medium">Time</span>
                  <select
                    value={hour}
                    disabled={saving}
                    onChange={(e) => save({ enabled, day, hour: Number(e.target.value) })}
                    aria-label="Digest send time"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 min-h-[44px]"
                  >
                    {HOURS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
                  </select>
                </label>
                <p className="text-xs text-gray-500 pb-2">{timezone}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
