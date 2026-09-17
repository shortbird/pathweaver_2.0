import React, { useMemo } from 'react'
import { weekGrid, fmtTime, DAY_LABELS } from '../../utils/schedule'

/**
 * Compact weekly block-schedule grid for one student: rows are the time slots
 * their classes actually meet in (which mirror the school's blocks), columns
 * are the days. Built purely from the classes' meetings -- no extra fetch.
 *
 * The row model is utils/schedule.weekGrid, shared with the CLP's grid and the
 * teacher's week, and it carries the 2026-08-25 start-time-only rule and its
 * history. This component only draws the student modal's blocks. When a row
 * holds more than one end time the row header shows the start alone and each
 * block says when it actually finishes.
 */

// onDrop(classId, className) — when provided, each class block gets a small ×
// control so an admin can unenroll the student straight from the block grid.
const WeeklyScheduleGrid = ({ classes, onDrop, droppingId }) => {
  const { days, slots, cell, endsBySlot, covering } = useMemo(() => weekGrid(classes), [classes])

  if (!slots.length) {
    return <p className="text-sm text-neutral-400">No scheduled meeting times yet.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="p-1.5 text-left font-medium text-neutral-400 w-24"></th>
            {days.map((d) => (
              <th key={d} className="p-1.5 text-center font-semibold text-neutral-600">{DAY_LABELS[d]}</th>
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
                  <td key={d} className="p-1 align-top">
                    {(cell[`${d}|${slot}`] || []).map(({ cls, m }, i) => {
                      const classId = cls.class_id ?? cls.id
                      return (
                        <div key={i} className="rounded bg-optio-purple/10 text-optio-purple px-1.5 py-1 mb-1">
                          <div className="flex items-start justify-between gap-1">
                            <div className="font-semibold leading-tight">{cls.name}</div>
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
                          {m.location && <div className="text-[10px] opacity-75">{m.location}</div>}
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
