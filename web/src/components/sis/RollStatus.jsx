import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import SearchSelect from '../ui/SearchSelect'
import { useSisStaff } from '../../hooks/api/useSisStaff'

/**
 * Who took a class's roll, and who is covering it (P7, iCreate 2026-09-23).
 *
 * `session` is a class session as the API describes it
 * (sis_class_session_service.describe): taken_by_name, taken_at,
 * substitute_name, sub_status, planned. The first person to save the roll is
 * the one named here; later saves never replace them, so "Roll taken by" is
 * the answer to "who was in the room when roll was called".
 *
 * Shared by the coordinator dashboard, the admin dashboard, the class page and
 * the attendance page, so the sentence reads the same everywhere.
 */

/** "2026-09-22T15:04:00+00:00" -> "9:04 AM" in the viewer's clock. */
export const clockTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  try { return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) } catch { return '' }
}

/** The one sentence: "Roll taken by X at 9:04 AM" or "No roll yet". */
export const rollText = (session) => {
  if (!session?.taken_by) return 'No roll yet'
  const at = clockTime(session.taken_at)
  return `Roll taken by ${session.taken_by_name || 'someone'}${at ? ` at ${at}` : ''}`
}

/** The covering line, or '' when nobody is covering. */
export const substituteText = (session) => {
  if (!session?.substitute_name) return ''
  if (session.sub_status === 'confirmed_sub') return `Substitute: ${session.substitute_name}`
  if (session.sub_status === 'flagged') return `Covered by ${session.substitute_name}? To check`
  if (session.planned) return `Substitute planned: ${session.substitute_name}`
  return ''
}

export const RollStatus = ({ session, className = '' }) => {
  const sub = substituteText(session)
  return (
    <span className={`block text-xs ${className}`} data-roll-status>
      <span className={session?.taken_by ? 'text-green-700' : 'text-neutral-400'}>{rollText(session)}</span>
      {sub && <span className="text-amber-700"> · {sub}</span>}
    </span>
  )
}

// The staff list is read only once the picker opens: the control sits on every
// row of Today's schedule, and a closed one should cost nothing.
const StaffPicker = ({ orgId, onPick }) => {
  const { data: staff = [] } = useSisStaff(orgId)
  return (
    <SearchSelect
      className="min-w-[200px]"
      value=""
      onChange={(id) => { if (id) onPick(id) }}
      options={staff}
      getId={(s) => s.id}
      getLabel={(s) => s.name}
      placeholder="Who is covering?"
    />
  )
}

/**
 * "Substitute: X" for one class on one date, set by the office. Picking a
 * person gives them that class's roster and attendance for that date only, and
 * the start-of-class reminder. Backed by PUT /api/sis/classes/:id/substitute
 * (ADMIN_ROLES).
 */
export const SubstituteControl = ({ classId, date, orgId, session, onSaved }) => {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const planned = session?.planned ? session.substitute_name : null

  const save = async (substituteId) => {
    setBusy(true)
    try {
      const { data } = await api.put(`/api/sis/classes/${classId}/substitute`, {
        organization_id: orgId, date, substitute_id: substituteId || null,
      })
      toast.success(substituteId ? 'Substitute saved' : 'Substitute removed')
      setOpen(false)
      onSaved && onSaved(data?.session || null)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the substitute')
    } finally { setBusy(false) }
  }

  if (open) {
    return (
      <span className="flex items-center gap-2 flex-wrap" data-substitute-picker>
        <StaffPicker orgId={orgId} onPick={save} />
        {planned && (
          <button type="button" disabled={busy} onClick={() => save(null)}
            className="text-xs text-red-600 hover:underline disabled:opacity-50">
            Remove substitute
          </button>
        )}
        <button type="button" onClick={() => setOpen(false)}
          className="text-xs text-neutral-500 hover:underline">
          Cancel
        </button>
      </span>
    )
  }
  return (
    <button type="button" onClick={() => setOpen(true)}
      className="text-xs font-medium text-optio-purple hover:underline">
      {planned ? `Substitute: ${planned}` : 'Mark substitute'}
    </button>
  )
}

export default RollStatus
