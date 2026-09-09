import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

/**
 * The two dates that bound family self-service in the Schedule Builder
 * (organizations.feature_flags.sis_settings):
 *
 *   first_day_of_school — families add/drop/waitlist themselves until this date;
 *     after it the builder is read-only and staff make schedule changes.
 *   add_drop_deadline — how long the school still accepts add/drop REQUESTS from
 *     families on that read-only page. Each one lands in the Task Center as a
 *     request the office works. Blank = no button, no requests.
 *
 * Class registration itself opens as soon as a family registers — access is
 * controlled by who has the registration link, not by these dates.
 *
 * Lives on the SIS Settings page (Registration & enrollment). Props mirror the
 * other org-settings cards: orgId, org (the organization row), onUpdate.
 */
const FirstDayOfSchoolCard = ({ orgId, org, onUpdate }) => {
  const settings = org.feature_flags?.sis_settings || {}
  const [firstDay, setFirstDay] = useState(settings.first_day_of_school || '')
  const [addDrop, setAddDrop] = useState(settings.add_drop_deadline || '')
  const [saving, setSaving] = useState(false)

  const save = async (patch, message) => {
    setSaving(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: {
          ...(org.feature_flags || {}),
          sis_settings: { ...settings, ...patch },
        },
      })
      toast.success(message)
      onUpdate && onUpdate()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  const saveFirstDay = (value) => {
    setFirstDay(value)
    save({ first_day_of_school: value || null },
      value ? 'First day of school saved' : 'First day of school cleared')
  }

  const saveAddDrop = (value) => {
    setAddDrop(value)
    save({ add_drop_deadline: value || null },
      value ? 'Add/drop deadline saved' : 'Add/drop requests turned off')
  }

  const dateInput = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple disabled:opacity-50'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
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
          className={dateInput}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 pt-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-neutral-900">Add/drop deadline</h2>
          <div className="text-sm text-neutral-500">
            Through this date, families see a "Request an add/drop" button on the Schedule Builder;
            each request arrives in the Task Center for the office to work. The button disappears at
            midnight after this date. Leave blank to take no add/drop requests.
          </div>
        </div>
        <input
          type="date" value={addDrop} disabled={saving}
          onChange={(e) => saveAddDrop(e.target.value)}
          className={dateInput}
        />
      </div>
    </div>
  )
}

export default FirstDayOfSchoolCard
