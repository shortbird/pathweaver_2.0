import React, { useMemo } from 'react'

/**
 * Compact weekly block-schedule grid for one student: rows are the time slots
 * their classes actually meet in (which mirror the school's blocks), columns
 * are the days. Built purely from the classes' meetings — no extra fetch.
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
  const { days, slots, cell } = useMemo(() => {
    const daySet = new Set()
    const slotSet = new Set()
    const map = {}
    for (const c of classes || []) {
      for (const m of c.meetings || []) {
        const slot = `${m.start_time}–${m.end_time}`
        daySet.add(m.day_of_week)
        slotSet.add(slot)
        ;(map[`${m.day_of_week}|${slot}`] = map[`${m.day_of_week}|${slot}`] || []).push({
          class_id: c.class_id ?? c.id, name: c.name, location: m.location,
        })
      }
    }
    return {
      days: DAY_ORDER.filter((d) => daySet.has(d)),
      slots: [...slotSet].sort(),
      cell: map,
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
            const [start, end] = slot.split('–')
            return (
              <tr key={slot} className="border-t border-gray-100">
                <td className="p-1.5 text-neutral-400 whitespace-nowrap align-top">
                  {fmt(start)}–{fmt(end)}
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
