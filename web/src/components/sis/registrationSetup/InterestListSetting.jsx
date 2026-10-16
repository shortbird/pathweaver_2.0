// The school's "Join the waitlist" switch and the label families see on it
// (feature_flags.registration.interest_list = { enabled, label }). Saves on
// its own, like the first-day and age-group cards: the families on the list
// are worked on Registration > Enrollment queues > Interest list.
import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import { patchSisSettings } from '../../../hooks/api/useSisSettings'
import { INPUT_CLASS } from '../../ui/Input'

const InterestListSetting = ({ orgId, setting, onUpdate }) => {
  const [enabled, setEnabled] = useState(setting?.enabled === true)
  const [label, setLabel] = useState(setting?.label || '')
  const [saving, setSaving] = useState(false)

  const save = async (next) => {
    setSaving(true)
    try {
      // The whole interest_list block: the server merges registration one
      // key deep, so this replaces only this block and keeps the rest.
      await patchSisSettings(orgId, { registration: { interest_list: next } })
      toast.success(next.enabled ? 'Waitlist sign-up saved' : 'Waitlist sign-up turned off')
      onUpdate && onUpdate()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-neutral-700 select-none">
        <input type="checkbox" checked={enabled} disabled={saving}
          onChange={(e) => { setEnabled(e.target.checked); save({ enabled: e.target.checked, label: label.trim() }) }}
          className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
        Let families join a waitlist before they register
      </label>
      <p className="text-xs text-neutral-500">
        Families who are not ready to register (for example, next year's kindergarten) leave their
        name, email and each child's birthday. They make no account and pay nothing. You see them
        under Enrollment queues, Interest list, and invite them to register when you have room.
      </p>
      <div>
        <label htmlFor="interest-list-label" className="block text-xs font-medium text-neutral-500 mb-1">
          What are they waiting for? (optional, families see this)
        </label>
        <div className="flex gap-2">
          <input id="interest-list-label" className={INPUT_CLASS} value={label} maxLength={80}
            placeholder="2027-28 school year" onChange={(e) => setLabel(e.target.value)} />
          <button type="button" disabled={saving || label.trim() === (setting?.label || '')}
            onClick={() => save({ enabled, label: label.trim() })}
            className="shrink-0 px-3 py-2 rounded-lg border border-optio-purple/40 text-sm font-semibold text-optio-purple hover:bg-optio-purple/5 disabled:opacity-40">
            Save label
          </button>
        </div>
      </div>
    </div>
  )
}

export default InterestListSetting
