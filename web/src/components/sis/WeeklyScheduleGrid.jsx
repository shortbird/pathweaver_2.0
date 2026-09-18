import React, { useMemo } from 'react'
import { weekGrid, fmtTime, DAY_LABELS } from '../../utils/schedule'

/**
 * Compact weekly block-schedule grid: rows are the time slots the items
 * actually meet in (which mirror the school's blocks), columns are the days.
 * Built purely from the items' meetings -- no extra fetch.
 *
 * The row model is utils/schedule.weekGrid, shared with the CLP's grid, and
 * it carries the 2026-08-25 start-time-only rule and its history. This
 * component draws the blocks for one student's week (the student record) and
 * for one teacher's week (the Classes page's My schedule tab); the teacher's
 * week had its own table until E4 (2026-09-18), without the duties the list
 * beside it showed. When a row holds more than one end time the row header
 * shows the start alone and each block says when it actually finishes.
 *
 *   classes      [{id | class_id, name, tone?, meetings: [{day_of_week,
 *                start_time, end_time, location, specific_date?}]}]; `tone`
 *                colours a block ('class' by default; 'duty', 'event',
 *                'meeting', 'substitute', 'other' for a teacher's non-class
 *                items)
 *   onDrop       (classId, className) -- each class block gets a small x so an
 *                admin can unenroll the student straight from the grid
 *   onOpen       (cls) -- a block is a button that opens the class
 *   fixedDays    days always shown, in order (a teacher's week is Mon-Fri
 *                even when Tuesday is empty); other days with items follow
 *   markToday    tint today's column and say so in its header
 *   recurringOnly ignore dated one-offs (the list beside the grid carries them)
 */

const TONE = {
  class: 'bg-optio-purple/10 text-optio-purple',
  duty: 'bg-amber-100 text-amber-800',
  event: 'bg-blue-100 text-blue-800',
  meeting: 'bg-gray-100 text-neutral-700',
  substitute: 'bg-pink-100 text-pink-800',
  other: 'bg-gray-100 text-neutral-700',
}

const WeeklyScheduleGrid = ({
  classes, onDrop, droppingId, onOpen, fixedDays, markToday = false, recurringOnly = false,
}) => {
  const week = useMemo(() => weekGrid(classes, { recurringOnly }), [classes, recurringOnly])
  const { slots, cell, endsBySlot, covering } = week
  const days = fixedDays ? [...fixedDays, ...week.days.filter((d) => !fixedDays.includes(d))] : week.days
  const todayDow = markToday ? new Date().getDay() : null

  if (!slots.length) {
    return <p className="text-sm text-neutral-400">No scheduled meeting times yet.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-xs border-collapse ${fixedDays ? 'min-w-[560px]' : ''}`}>
        <thead>
          <tr>
            <th className="p-1.5 text-left font-medium text-neutral-400 w-24"></th>
            {days.map((d) => (
              <th key={d} className={`p-1.5 text-center font-semibold ${d === todayDow ? 'text-optio-purple' : 'text-neutral-600'}`}>
                {DAY_LABELS[d]}{d === todayDow ? ' · Today' : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => {
            const ends = [...(endsBySlot[slot] || [])]
            // One end time in the row: the header can carry the whole range and
            // the blocks stay uncluttered. More than one, and only the block
            // knows when it finishes.
            const uniformEnd = ends.length === 1 ? ends[0] : null
            return (
              <tr key={slot} className="border-t border-gray-100">
                <td className="p-1.5 text-neutral-400 whitespace-nowrap align-top">
                  {uniformEnd ? `${fmtTime(slot)}–${fmtTime(uniformEnd)}` : fmtTime(slot)}
                </td>
                {days.map((d) => (
                  <td key={d} className={`p-1 align-top ${d === todayDow ? 'bg-optio-purple/5' : ''}`}>
                    {(cell[`${d}|${slot}`] || []).map(({ cls, m }, i) => {
                      const classId = cls.class_id ?? cls.id
                      const tone = TONE[cls.tone] || TONE.class
                      const opens = onOpen && (cls.tone || 'class') === 'class'
                      return (
                        <div key={i} className={`rounded px-1.5 py-1 mb-1 ${tone}`}>
                          <div className="flex items-start justify-between gap-1">
                            {opens ? (
                              <button type="button" onClick={() => onOpen(cls)}
                                className="font-semibold leading-tight text-left hover:underline">
                                {cls.name}
                              </button>
                            ) : (
                              <div className="font-semibold leading-tight">{cls.name}</div>
                            )}
                            {onDrop && classId && (
                              <button
                                type="button"
                                title={`Drop ${cls.name}`}
                                aria-label={`Drop ${cls.name}`}
                                disabled={droppingId === classId}
                                onClick={() => onDrop(classId, cls.name)}
                                className="text-optio-purple/60 hover:text-red-600 leading-none text-sm font-bold px-0.5 disabled:opacity-40"
                              >
                                {droppingId === classId ? '·' : '×'}
                              </button>
                            )}
                          </div>
                          {!uniformEnd && m.end_time && (
                            <div className="text-[10px] opacity-75">until {fmtTime(m.end_time)}</div>
                          )}
                          {(m.location || cls.location) && (
                            <div className="text-[10px] opacity-75">{m.location || cls.location}</div>
                          )}
                        </div>
                      )
                    })}
                    {/* A class still running through this row from an earlier
                        start, so the row does not read as free (iCreate 32b2beb3). */}
                    {!(cell[`${d}|${slot}`] || []).length && covering(d, slot).map((cls, i) => (
                      <div key={`cont-${i}`} className="rounded border border-dashed border-optio-purple/30 text-optio-purple/70 px-1.5 py-0.5 mb-1 text-[10px]">
                        {cls.name} (continues)
                      </div>
                    ))}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default WeeklyScheduleGrid
