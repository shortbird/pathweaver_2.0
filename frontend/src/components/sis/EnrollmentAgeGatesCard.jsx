import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

/**
 * Enrollment age groups (organizations.feature_flags.sis_settings.enrollment_age_gates).
 * New students whose age (on the first day of school) falls in a waitlisted band
 * finish registering but join the enrollment waitlist instead of picking classes,
 * until staff release them. Toggling a band open only affects future registrants —
 * students already waiting stay on the list until released from the Enrollment
 * waitlist card (on the Registration page).
 *
 * Lives on the SIS Settings page (Registration & enrollment). Props mirror the
 * other org-settings cards: orgId, org (the organization row), onUpdate.
 */
const EnrollmentAgeGatesCard = ({ orgId, org, onUpdate }) => {
  const settings = org.feature_flags?.sis_settings || {}
  const [gates, setGates] = useState(settings.enrollment_age_gates || [])
  const [minAge, setMinAge] = useState('')
  const [maxAge, setMaxAge] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async (next) => {
    setSaving(true)
    const prev = gates
    setGates(next)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: {
          ...(org.feature_flags || {}),
          sis_settings: { ...settings, enrollment_age_gates: next },
        },
      })
      toast.success('Age groups saved')
      onUpdate && onUpdate()
    } catch (e) {
      setGates(prev)
      toast.error(e.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  const addBand = () => {
    const lo = minAge === '' ? null : Number(minAge)
    const hi = maxAge === '' ? null : Number(maxAge)
    if (lo == null && hi == null) return toast.error('Give the band a minimum or maximum age')
    if (lo != null && hi != null && lo > hi) return toast.error('Minimum age cannot be greater than maximum')
    save([...gates, { min_age: lo, max_age: hi, mode: 'waitlist' }])
    setMinAge(''); setMaxAge('')
  }

  const bandText = (g) => (g.min_age != null && g.max_age != null
    ? `Ages ${g.min_age}–${g.max_age}`
    : g.min_age != null ? `Ages ${g.min_age}+` : `Up to age ${g.max_age}`)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-neutral-900">Enrollment age groups</h2>
      <p className="text-sm text-neutral-500 mb-4">
        New students whose age (on the first day of school) falls in a waitlisted band finish
        registering but can't choose classes until you release them from the Enrollment waitlist.
        Opening a band back up only changes what happens to <em>new</em> registrations — students
        already on the waitlist stay there until you release them (individually, or a set number
        at a time), so you decide exactly who gets a spot and when. Each student you release is
        emailed automatically that they can now choose classes.
      </p>
      {gates.length > 0 && (
        <div className="space-y-2 mb-4">
          {gates.map((g, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
              <span className="text-sm font-medium text-neutral-800">
                {bandText(g)}
                <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">Waitlist</span>
              </span>
              <button onClick={() => save(gates.filter((_, j) => j !== i))} disabled={saving}
                className="text-sm text-neutral-500 hover:text-red-600 hover:underline disabled:opacity-50">
                Open this group
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input type="number" min={0} value={minAge} onChange={(e) => setMinAge(e.target.value)}
          placeholder="Min age" aria-label="Minimum age"
          className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple" />
        <span className="text-neutral-400">to</span>
        <input type="number" min={0} value={maxAge} onChange={(e) => setMaxAge(e.target.value)}
          placeholder="Max age" aria-label="Maximum age"
          className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple" />
        <button onClick={addBand} disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-semibold border border-optio-purple/40 text-optio-purple hover:bg-optio-purple/5 disabled:opacity-50">
          Waitlist this age group
        </button>
      </div>
    </div>
  )
}

export default EnrollmentAgeGatesCard
