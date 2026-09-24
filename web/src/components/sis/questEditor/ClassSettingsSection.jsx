import React from 'react'

/**
 * The class half of the quest editor: when the class's students see the quest,
 * when it is due, and which of them it is for.
 *
 * These are the class's settings, not the quest's, so a teacher keeps them on
 * every quest on their class -- including the office's, which they may not
 * otherwise change (owner, 2026-09-23). On a draft they are sent with Publish,
 * because publishing is what enrols the class and a date added a minute later
 * would find the quest already in every account (Gryffin, 2026-09-10).
 *
 * value: {due: 'YYYY-MM-DD', release: 'YYYY-MM-DD', studentIds: null | [ids]}
 * (null is everyone on the class, and anyone who joins).
 */

// A date input's day, as the END of that day where the teacher is: a due date
// typed as Sep 5 must not read as Sep 4 west of Greenwich (Gryffin, 2026-08-29).
export const dueInputToIso = (value) => {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59).toISOString()
}

// A release date is the START of the day, so students see it that morning.
export const releaseInputToIso = (value) => {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0).toISOString()
}

export const isoToDateInput = (iso) => {
  if (!iso) return ''
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

export const classSettingsFrom = (link) => ({
  due: isoToDateInput(link?.due_date),
  release: link?.publish_at && new Date(link.publish_at).getTime() > Date.now()
    ? isoToDateInput(link.publish_at) : '',
  studentIds: link?.student_ids ?? null,
})

export default function ClassSettingsSection({ value, onChange, students = [], scheduledEnabled = false }) {
  const everyone = value.studentIds === null || value.studentIds === undefined
  const picked = everyone ? students.map((s) => s.student_id) : value.studentIds
  const toggle = (id) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]
    const all = students.every((s) => next.includes(s.student_id))
    onChange({ studentIds: all ? null : next })
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          Due
          <input type="date" value={value.due} onChange={(e) => onChange({ due: e.target.value })}
            aria-label="Due date"
            title="Nothing locks after this date. It marks the quest overdue on your progress view and in reminders."
            className="rounded-lg border border-gray-300 px-2 py-1 text-sm" />
        </label>
        {scheduledEnabled && (
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            Release on
            <input type="date" value={value.release} onChange={(e) => onChange({ release: e.target.value })}
              aria-label="Release date"
              className="rounded-lg border border-gray-300 px-2 py-1 text-sm" />
          </label>
        )}
      </div>
      <p className="text-xs text-neutral-400">
        {value.release
          ? 'Students will not see the quest until the release date. You will.'
          : 'Both are optional. A due date marks the quest overdue; it does not lock it.'}
      </p>
      <div role="group" aria-label="Who gets this quest">
        <p className="text-xs font-medium text-neutral-600 mb-1">Who gets this quest</p>
        {students.length === 0 ? (
          <p className="text-xs text-neutral-400">Everyone on the class, and anyone who joins.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {students.map((s) => (
                <label key={s.student_id} className="inline-flex items-center gap-1.5 text-sm text-neutral-800">
                  <input type="checkbox" checked={picked.includes(s.student_id)}
                    onChange={() => toggle(s.student_id)}
                    className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                  {s.name}
                </label>
              ))}
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-xs">
              <button type="button" onClick={() => onChange({ studentIds: null })}
                className="text-optio-purple hover:underline">Everyone</button>
              <span className="text-neutral-400">
                {everyone ? `Everyone (${students.length}), and anyone who joins`
                  : `${picked.length} of ${students.length} students`}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
