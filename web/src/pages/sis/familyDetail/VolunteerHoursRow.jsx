import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import Button from '../../../components/ui/Button'
import { INPUT_CLASS as field } from '../../../components/ui/Input'
import { sisFamilyApi } from '../../../hooks/api/useSisFamilyDetail'

// One volunteer-hours number per family. iCreate 01082b30: "Could we make a
// way for parents to be able to see how many volunteer hours they have
// completed? We can keep it updated, but ... keep it private so not everyone
// sees everyone elses." Staff keep it here; only this family's guardians see
// it (their School page). Saved on its own, so editing the address never
// re-stamps when the hours were last updated.
const VolunteerHoursRow = ({ household, orgId, onSaved }) => {
  const initial = Number(household.volunteer_hours || 0)
  const [hours, setHours] = useState(String(initial))
  const [busy, setBusy] = useState(false)
  const value = hours.trim() === '' ? 0 : Number(hours)
  const valid = Number.isFinite(value) && value >= 0 && value <= 9999
  const dirty = valid && value !== initial

  const save = async () => {
    if (!valid) { toast.error('Enter a number of hours from 0 to 9999'); return }
    setBusy(true)
    try {
      await sisFamilyApi.updateHousehold(household.id, { volunteer_hours: value }, orgId)
      toast.success('Volunteer hours saved'); onSaved?.()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not save') }
    finally { setBusy(false) }
  }

  const updated = household.volunteer_hours_updated_at
    ? new Date(household.volunteer_hours_updated_at).toLocaleDateString()
    : null

  return (
    <div className="border-t border-gray-100 pt-3">
      <label className="text-xs text-neutral-500 block">Volunteer hours
        <div className="mt-1 flex items-center gap-2">
          <input type="number" min="0" max="9999" step="0.25" inputMode="decimal"
            value={hours} onChange={(e) => setHours(e.target.value)}
            className={`${field} w-32`} aria-label="Volunteer hours" />
          <Button size="sm" variant="secondary" onClick={save} loading={busy} disabled={!dirty}>Save hours</Button>
        </div>
      </label>
      <span className="mt-1 block text-[11px] text-neutral-400">
        {'This family\'s guardians see this number on their School page. Other families never see it.'}
        {updated && ` Last updated ${updated}.`}
      </span>
    </div>
  )
}

export default VolunteerHoursRow
