import React from 'react'
import { useStudentAttendance } from '../../hooks/api/useStudentAttendance'

/**
 * What the school has recorded for a student, on the family dashboard.
 *
 * Families had no way to see this. A parent could report an absence — there is
 * a whole page for it — and never find out what came of it, including whether
 * the absence they phoned in had been marked excused, which is why they phoned.
 * Every attendance route was staff-only, so the answer existed and the family
 * it was about could not read it.
 *
 * Renders nothing when there is nothing recorded, including for a school with
 * the attendance module off (the request 404s). A card saying "no attendance
 * yet" would sit on every family dashboard in every school that does not take
 * a roll — same reasoning as StudentClassMaterials beside it.
 */
const RECENT = 10

const STATUS_STYLE = {
  present: 'bg-green-100 text-green-700',
  late: 'bg-amber-100 text-amber-800',
  absent: 'bg-red-100 text-red-700',
  excused: 'bg-blue-100 text-blue-700',
}

const STATUS_LABEL = {
  present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused',
}

const formatDate = (iso) => {
  try {
    return new Date(`${String(iso).slice(0, 10)}T12:00:00`)
      .toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return String(iso || '')
  }
}

const StudentAttendanceCard = ({ studentId, classId, title = 'Attendance' }) => {
  const { data } = useStudentAttendance(studentId, { classId })
  const records = data?.records || []
  const counts = data?.summary?.counts || {}
  const rate = data?.summary?.attendance_rate

  if (!records.length) return null

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
        {typeof rate === 'number' && (
          <span className="text-sm text-neutral-500">
            {Math.round(rate * 100)}% present
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {['present', 'late', 'absent', 'excused'].map((status) => (
          counts[status] ? (
            <span key={status}
              className={`text-xs px-2.5 py-1 rounded-full ${STATUS_STYLE[status]}`}>
              {counts[status]} {STATUS_LABEL[status].toLowerCase()}
            </span>
          ) : null
        ))}
      </div>

      <ul className="divide-y divide-gray-100 border-t border-gray-100">
        {records.slice(0, RECENT).map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-2">
            <span className="text-sm text-neutral-700">{formatDate(r.date)}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status] || 'bg-gray-100 text-neutral-600'}`}>
              {STATUS_LABEL[r.status] || r.status}
            </span>
          </li>
        ))}
      </ul>
      {records.length > RECENT && (
        <p className="text-xs text-neutral-400 mt-2">
          Showing the last {RECENT} of {records.length} records.
        </p>
      )}
    </section>
  )
}

export default StudentAttendanceCard
