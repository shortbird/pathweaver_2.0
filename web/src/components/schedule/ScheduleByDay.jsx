import React from 'react'
import PropTypes from 'prop-types'
import { meetingsByDay, formatTime } from './WeeklySchedule'

/**
 * One student's classes listed day by day, each day in time order.
 *
 * Replaces the flat class-per-row table that used to sit under the weekly grid
 * on both family surfaces. That table answered "when does Pottery meet?" — but
 * families read a schedule the other way round, asking where their kid is at a
 * given hour, and the old shape made them scan every row and re-sort in their
 * head (iCreate parent, 2026-08-25: "super clunky to find out where they are at
 * certain times... at least separated by days and ideally in schedule order").
 *
 * The grid above still gives the shape of the week; this gives the detail the
 * grid has no room for (teacher, room) without making anyone hunt for it.
 *
 * Prints: each day is break-inside-avoid, so a day never splits across pages.
 */
const ScheduleByDay = ({ classes = [] }) => {
  const days = meetingsByDay(classes)
  if (!days.length) return null

  return (
    <div className="space-y-4">
      {days.map((day) => (
        <div key={day.key} className="break-inside-avoid">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-optio-purple mb-1.5">
            {day.label}
          </h3>
          <ul className="divide-y divide-gray-50 border-t border-gray-100">
            {day.rows.map(({ cls, meeting }, i) => {
              const time = meeting
                ? [formatTime(meeting.start_time), formatTime(meeting.end_time)]
                  .filter(Boolean).join('–')
                : ''
              // The meeting's own room wins over the class's default: a class
              // that moves rooms on one day would otherwise send families to
              // the wrong door.
              const room = meeting?.location || cls.location || ''
              const teacher = cls.primary_instructor?.name || cls.teacher_name || ''
              return (
                <li key={`${cls.id}-${i}`} className="py-2 flex items-baseline gap-3">
                  <span className="text-sm tabular-nums text-gray-500 w-32 flex-shrink-0">
                    {time || '—'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-sm text-gray-900">{cls.name}</span>
                    {(teacher || room) && (
                      <span className="block text-xs text-gray-500">
                        {[teacher, room].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

ScheduleByDay.propTypes = {
  classes: PropTypes.arrayOf(PropTypes.object),
}

export default ScheduleByDay
