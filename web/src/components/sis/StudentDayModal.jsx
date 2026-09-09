import React, { useEffect, useState } from 'react'
import api from '../../services/api'
import ModalOverlay from '../../components/ui/ModalOverlay'
import { range12h } from '../../utils/timeFormat'

/**
 * One student's whole day: every class they meet on a date and the status the
 * roll recorded for each.
 *
 * The question a coordinator asks the moment an alert says a student is not
 * accounted for is "were they in their other classes?" (iCreate, 2026-09-01).
 * Present in the next three periods means they were on campus and the absence
 * is likely a mismark; absent all day is a phone call home. Before this, the
 * only way to answer was to open each class's roster in turn.
 *
 * Backed by GET /api/sis/students/:id/attendance/day?date= (ADMIN_ROLES).
 */

const STATUS_PILL = {
  present: 'bg-green-100 text-green-700',
  absent: 'bg-red-100 text-red-700',
  late: 'bg-amber-100 text-amber-700',
  excused: 'bg-blue-100 text-blue-700',
}

// "Roll not taken" is deliberately not styled as a status: nobody has looked
// yet, which is a different fact from any of the four statuses.
const NOT_TAKEN = 'bg-gray-100 text-neutral-500'

const StudentDayModal = ({ studentId, studentName, date, orgId, onClose, onOpenRoster }) => {
  const [day, setDay] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!studentId || !date || !orgId) return
    setDay(null)
    setError(null)
    api.get(`/api/sis/students/${studentId}/attendance/day?date=${date}&organization_id=${orgId}`)
      .then((r) => setDay(r.data))
      .catch((e) => setError(e?.response?.data?.error || 'Could not load the day'))
  }, [studentId, date, orgId])

  const classes = day?.classes || []
  const counts = day?.counts || {}
  const elsewhere = (counts.present || 0) + (counts.late || 0)

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">
              {day?.student_name || studentName}
            </h2>
            <p className="text-sm text-neutral-500">Schedule and attendance for {date}</p>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
        </div>

        <div className="p-5">
          {error && <p className="text-red-600 text-sm">{error}</p>}
          {!day && !error && <p className="text-neutral-500 text-sm">Loading…</p>}

          {day && !classes.length && (
            <p className="text-neutral-500 text-sm">
              No classes on this student's schedule for {date}.
            </p>
          )}

          {day && classes.length > 0 && (
            <>
              {/* The headline answer, before the detail: was this student seen
                  anywhere else on campus that day? */}
              <p className="text-sm text-neutral-700 mb-3">
                {elsewhere > 0 ? (
                  <>
                    Marked <span className="font-semibold text-green-700">present or late in {elsewhere}</span>
                    {' '}of {classes.length} classes that day.
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-red-700">Not marked present in any class</span>
                    {' '}that day.
                  </>
                )}
                {day.not_taken > 0 && (
                  <span className="text-neutral-500">
                    {' '}Roll was not taken in {day.not_taken}.
                  </span>
                )}
              </p>

              <ul className="divide-y divide-gray-100">
                {classes.map((c) => (
                  <li key={c.class_id} data-day-class className="py-2.5 flex items-center gap-3">
                    <span className="text-xs font-medium text-neutral-500 w-28 shrink-0">
                      {range12h(c.start_time, c.end_time) || 'No set time'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-neutral-900 truncate">
                        {c.class_name}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        {[c.teacher_name, c.location].filter(Boolean).join(' · ')}
                        {c.planned_absence && (
                          <span className="text-amber-700">
                            {[c.teacher_name, c.location].filter(Boolean).length ? ' · ' : ''}
                            Parent reported out{c.planned_absence.scope === 'day' ? ' (all day)' : ''}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className={`text-[11px] font-semibold capitalize rounded-full px-2 py-0.5 shrink-0 ${
                      STATUS_PILL[c.status] || NOT_TAKEN
                    }`}>
                      {c.status || 'Roll not taken'}
                    </span>
                    {onOpenRoster && (
                      <button type="button"
                        onClick={() => { onOpenRoster(c.class_id, day.date); onClose() }}
                        className="text-xs font-semibold text-optio-purple hover:underline shrink-0">
                        Open roster
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </ModalOverlay>
  )
}

export default StudentDayModal
