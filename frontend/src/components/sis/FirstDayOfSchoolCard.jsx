import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

/**
 * First day of school (organizations.feature_flags.sis_settings.first_day_of_school).
 * Closes parent self-service schedule changes: families can add/drop/waitlist in
 * the Schedule Builder until this date; after that, staff make schedule changes.
 * Class registration itself opens as soon as a family registers — access is
 * controlled by who has the registration link, not by this date.
 *
 * Lives on the SIS Settings page (Registration & enrollment). Props mirror the
 * other org-settings cards: orgId, org (the organization row), onUpdate.
 */
const FirstDayOfSchoolCard = ({ orgId, org, onUpdate }) => {
  const settings = org.feature_flags?.sis_settings || {}
  const [firstDay, setFirstDay] = useState(settings.first_day_of_school || '')
  const [saving, setSaving] = useState(false)

  const saveFirstDay = async (value) => {
    setFirstDay(value)
    setSaving(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: {
          ...(org.feature_flags || {}),
          sis_settings: { ...settings, first_day_of_school: value || null },
        },
      })
      toast.success(value ? 'First day of school saved' : 'First day of school cleared')
      onUpdate && onUpdate()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-neutral-900">First day of school</h2>
          <div className="text-sm text-neutral-500">
            Families can add, drop, and waitlist classes in the Schedule Builder until this date; after
            that, schedule changes are made by staff here. Leave blank to keep it open.
          </div>
        </div>
        <input
          type="date" value={firstDay} disabled={saving}
          onChange={(e) => saveFirstDay(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple disabled:opacity-50"
        />
      </div>
    </div>
  )
}

export default FirstDayOfSchoolCard
