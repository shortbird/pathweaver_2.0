import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { range12h, fmtDateOnly } from '../../utils/timeFormat'
import { patchSisSettings } from '../../hooks/api/useSisSettings'
import { clockTime } from './RollStatus'

/**
 * "Teachers to check" — the coordinator's check on who is teaching each class
 * (P7, iCreate 2026-09-23). It sits beside "Students not accounted for" and
 * works the same way: rows that need a decision, each resolvable in place.
 *
 * Two kinds of row, both from GET /api/sis/coordinator/dashboard (and the
 * admin dashboard's `today.teachers_to_check`):
 *   - no_roll: today's classes that started more than N minutes ago and have no
 *     roll. N is sis_settings.roll_check_minutes (default 15).
 *   - flagged: a roll taken by someone who is not an assigned teacher of the
 *     class, or a class with a planned substitute whose own teacher took roll.
 *     The coordinator says what happened: POST
 *     /api/sis/attendance/sessions/:id/resolve.
 *
 * Renders nothing when there is nothing to check, so it can sit
 * unconditionally at the top of a dashboard.
 */

export const FlaggedRow = ({ session, orgId, onResolved }) => {
  const [other, setOther] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const resolve = async (outcome) => {
    if (outcome === 'other' && !note.trim()) { toast.error('Say what happened first'); return }
    setBusy(true)
    try {
      await api.post(`/api/sis/attendance/sessions/${session.id}/resolve`, {
        organization_id: orgId, outcome, note: note.trim() || undefined,
      })
      toast.success('Saved')
      onResolved && onResolved()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save that')
    } finally { setBusy(false) }
  }

  const at = clockTime(session.taken_at)
  const sub = session.substitute_name || session.taken_by_name
  const btn = 'px-2.5 py-1 rounded-lg text-xs font-semibold border disabled:opacity-50'

  return (
    <li data-flagged-session className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-amber-900">{session.class_name || 'A class'}</span>
        <span className="text-xs text-amber-800">
          Roll taken by {session.taken_by_name || 'someone'}{at ? ` at ${at}` : ''}
          {session.teacher_name ? ` · Teacher: ${session.teacher_name}` : ''}
          {session.planned && session.substitute_name ? ` · Planned substitute: ${session.substitute_name}` : ''}
        </span>
        <span className="text-xs text-amber-700 ml-auto">{fmtDateOnly(session.date)}</span>
      </div>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {sub && (
          <button type="button" disabled={busy} onClick={() => resolve('confirmed_sub')}
            className={`${btn} border-amber-300 bg-white text-amber-900 hover:bg-amber-100`}>
            Substitute: {sub}
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => resolve('teacher_present')}
          className={`${btn} border-amber-300 bg-white text-amber-900 hover:bg-amber-100`}>
          Teacher was present
        </button>
        <button type="button" disabled={busy} onClick={() => setOther((v) => !v)}
          aria-pressed={other}
          className={`${btn} border-amber-300 bg-white text-amber-900 hover:bg-amber-100`}>
          Other
        </button>
        {other && (
          <>
            <input value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="What happened?" aria-label="What happened"
              className="flex-1 min-w-[160px] rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-sm" />
            <button type="button" disabled={busy} onClick={() => resolve('other')}
              className={`${btn} border-amber-600 bg-amber-600 text-white`}>
              Save
            </button>
          </>
        )}
      </div>
    </li>
  )
}

const GraceSetting = ({ minutes, orgId, onSaved }) => {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(minutes))
  const save = async () => {
    const n = parseInt(value, 10)
    if (Number.isNaN(n) || n < 0) { toast.error('Enter a number of minutes'); return }
    try {
      await patchSisSettings(orgId, { sis_settings: { roll_check_minutes: n } })
      toast.success('Saved')
      setEditing(false)
      onSaved && onSaved()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save that')
    }
  }
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)}
        className="text-xs text-optio-purple hover:underline">
        Change
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input type="number" min="0" max="240" value={value} aria-label="Minutes after the start"
        onChange={(e) => setValue(e.target.value)}
        className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-xs" />
      <button type="button" onClick={save} className="text-xs font-semibold text-optio-purple">Save</button>
    </span>
  )
}

const TeachersToCheck = ({ data, orgId, onChanged, className = '' }) => {
  const noRoll = data?.no_roll || []
  const flagged = data?.flagged || []
  if (!noRoll.length && !flagged.length) return null
  const grace = data?.grace_minutes ?? 15

  return (
    <div className={`bg-white rounded-xl border border-amber-200 p-4 ${className}`} data-teachers-to-check>
      <h2 className="font-semibold text-neutral-900 mb-3">
        Teachers to check ({noRoll.length + flagged.length})
      </h2>

      {noRoll.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-neutral-500 mb-2">
            No roll {grace} minutes after the class started.{' '}
            <GraceSetting minutes={grace} orgId={orgId} onSaved={onChanged} />
          </p>
          <ul className="divide-y divide-gray-100">
            {noRoll.map((m) => (
              <li key={`${m.class_id}-${m.start_time}`} data-no-roll className="py-2 flex items-center gap-3">
                <span className="text-sm font-medium text-neutral-500 w-28 shrink-0">
                  {range12h(m.start_time, m.end_time)}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-neutral-900 truncate">{m.class_name}</span>
                  <span className="block text-xs text-neutral-500">
                    {[m.substitute_name ? `Substitute: ${m.substitute_name}` : m.teacher_name,
                      m.location, `started ${m.minutes_late} min ago`].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {flagged.length > 0 && (
        <>
          <p className="text-xs text-neutral-500 mb-2">
            Roll taken by someone other than the teacher of the class. Say who taught it.
          </p>
          <ul className="space-y-2">
            {flagged.map((s) => (
              <FlaggedRow key={s.id} session={s} orgId={orgId} onResolved={onChanged} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export default TeachersToCheck
