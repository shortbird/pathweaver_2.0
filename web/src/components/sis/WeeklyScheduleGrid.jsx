import React, { useMemo } from 'react'

/**
 * Compact weekly block-schedule grid for one student: rows are the time slots
 * their classes actually meet in (which mirror the school's blocks), columns
 * are the days. Built purely from the classes' meetings — no extra fetch.
 *
 * Rows key on the START time only. Keying on the full `start–end` range put a
 * Tuesday 9:30–10:30 class on a different row from a Monday 9:30–3:00 one, so
 * the 9:30 column read as empty on the day it was actually busiest (iCreate,
 * 2026-08-25: "the schedule on Tuesday doesn't show the 9:30 class on the same
 * row is very annoying and confusing"). At iCreate a 9:30 start has four
 * different end times, so this is the common case, not an edge one. When a row
 * holds more than one end time the row header shows the start alone and each
 * block says when it actually finishes.
 */

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] // school weeks start Monday

const fmt = (hhmm) => {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${ampm}`
}

// onDrop(classId, className) — when provided, each class block gets a small ×
// control so an admin can unenroll the student straight from the block grid.
const WeeklyScheduleGrid = ({ classes, onDrop, droppingId }) => {
  const { days, slots, cell, endsBySlot } = useMemo(() => {
    const daySet = new Set()
    const slotSet = new Set()
    const ends = {}
    const map = {}
    for (const c of classes || []) {
      for (const m of c.meetings || []) {
        const slot = m.start_time
        if (!slot) continue
        daySet.add(m.day_of_week)
        slotSet.add(slot)
        ;(ends[slot] = ends[slot] || new Set()).add(m.end_time || '')
        ;(map[`${m.day_of_week}|${slot}`] = map[`${m.day_of_week}|${slot}`] || []).push({
          class_id: c.class_id ?? c.id, name: c.name, location: m.location,
          end_time: m.end_time,
        })
      }
    }
    return {
      days: DAY_ORDER.filter((d) => daySet.has(d)),
      slots: [...slotSet].sort(),
      cell: map,
      endsBySlot: ends,
    }
  }, [classes])

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
                  {uniformEnd ? `${fmt(slot)}–${fmt(uniformEnd)}` : fmt(slot)}
                </td>
                {days.map((d) => (
                  <td key={d} className="p-1 align-top">
                    {(cell[`${d}|${slot}`] || []).map((c, i) => (
                      <div key={i} className="rounded bg-optio-purple/10 text-optio-purple px-1.5 py-1 mb-1">
                        <div className="flex items-start justify-between gap-1">
                          <div className="font-semibold leading-tight">{c.name}</div>
                          {onDrop && c.class_id && (
                            <button
                              type="button"
                              title={`Drop ${c.name}`}
                              aria-label={`Drop ${c.name}`}
                              disabled={droppingId === c.class_id}
                              onClick={() => onDrop(c.class_id, c.name)}
                              className="text-optio-purple/60 hover:text-red-600 leading-none text-sm font-bold px-0.5 disabled:opacity-40"
                            >
                              {droppingId === c.class_id ? '·' : '×'}
                            </button>
                          )}
                        </div>
                        {!uniformEnd && c.end_time && (
                          <div className="text-[10px] opacity-75">until {fmt(c.end_time)}</div>
                        )}
                        {c.location && <div className="text-[10px] opacity-75">{c.location}</div>}
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
