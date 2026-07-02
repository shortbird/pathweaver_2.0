import React from 'react'

// M-F weekly schedule grid. Renders each class's meeting blocks positioned by
// time so families can see when they have classes and what's still open.
// Used by the Schedule Builder and the family-dashboard student overview.
//
// Props:
//   classes      [{ id, name, meetings: [{day_of_week, start_time, end_time}] }]
//                day_of_week: 0=Sun … 6=Sat (only Mon-Fri rendered)
//   ghost        optional class shape rendered translucent (hover preview)
//   compact      smaller row height + type for the overview card
//   onSlotClick  optional (day, startMinutes) — fires when an empty spot in a
//                day column is clicked, snapped to the containing hour
//   selectedSlot optional {day, min} — highlights that hour in the grid

const DAYS = [1, 2, 3, 4, 5]
const DAY_LABELS = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri' }

// Brand-adjacent palette, assigned by class order (stable within a schedule).
// Exported so calendar legends can match block colors by the same index rule.
export const SCHEDULE_PALETTE = [
  'bg-optio-purple/85 text-white',
  'bg-optio-pink/85 text-white',
  'bg-sky-500/85 text-white',
  'bg-emerald-500/85 text-white',
  'bg-amber-500/90 text-white',
  'bg-rose-400/85 text-white',
  'bg-indigo-500/85 text-white',
  'bg-teal-500/85 text-white',
]

const toMin = (t) => {
  if (!t) return null
  const [h, m] = String(t).split(':').map(Number)
  return (Number.isNaN(h) ? null : h * 60 + (m || 0))
}

const fmt = (t) => {
  const m = toMin(t)
  if (m == null) return ''
  const h = Math.floor(m / 60)
  const mm = m % 60
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${ampm}`
}

const WeeklySchedule = ({ classes = [], ghost = null, compact = false, onSlotClick = null, selectedSlot = null }) => {
  // Time range: default school hours, expanded to fit every meeting shown.
  let startMin = 8 * 60
  let endMin = 16 * 60
  const all = ghost ? [...classes, ghost] : classes
  for (const c of all) {
    for (const m of c.meetings || []) {
      const s = toMin(m.start_time); const e = toMin(m.end_time)
      if (s != null) startMin = Math.min(startMin, Math.floor(s / 60) * 60)
      if (e != null) endMin = Math.max(endMin, Math.ceil(e / 60) * 60)
    }
  }
  const totalMin = Math.max(endMin - startMin, 60)
  const hourRows = []
  for (let t = startMin; t < endMin; t += 60) hourRows.push(t)
  const pxPerMin = compact ? 0.55 : 0.9
  const gridHeight = totalMin * pxPerMin

  const colorFor = (i) => SCHEDULE_PALETTE[i % SCHEDULE_PALETTE.length]

  const blocksByDay = {}
  all.forEach((c, i) => {
    const isGhost = ghost && c === ghost
    for (const m of c.meetings || []) {
      const d = m.day_of_week
      if (!DAYS.includes(d)) continue
      const s = toMin(m.start_time); const e = toMin(m.end_time)
      if (s == null || e == null) continue
      blocksByDay[d] = blocksByDay[d] || []
      blocksByDay[d].push({
        name: c.name, top: (s - startMin) * pxPerMin,
        height: Math.max((e - s) * pxPerMin, compact ? 14 : 22),
        label: `${fmt(m.start_time)}–${fmt(m.end_time)}`,
        color: isGhost ? 'bg-neutral-400/50 text-white border border-dashed border-neutral-500' : colorFor(i),
      })
    }
  })

  return (
    <div className="select-none">
      <div className="grid" style={{ gridTemplateColumns: '3rem repeat(5, 1fr)' }}>
        <div />
        {DAYS.map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-neutral-500 pb-2">{DAY_LABELS[d]}</div>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: '3rem repeat(5, 1fr)' }}>
        {/* time gutter */}
        <div className="relative" style={{ height: gridHeight }}>
          {hourRows.map((t) => (
            <div key={t} className="absolute right-2 -translate-y-1/2 text-[10px] text-neutral-400"
              style={{ top: (t - startMin) * pxPerMin }}>
              {fmt(`${Math.floor(t / 60)}:00`)}
            </div>
          ))}
        </div>
        {DAYS.map((d) => (
          <div key={d} data-testid={`schedule-day-${d}`}
            className={`relative border-l border-gray-100 ${onSlotClick ? 'cursor-pointer' : ''}`}
            style={{ height: gridHeight }}
            onClick={onSlotClick ? (e) => {
              // snap the click position to the containing hour
              const rect = e.currentTarget.getBoundingClientRect()
              const min = startMin + (e.clientY - rect.top) / pxPerMin
              onSlotClick(d, Math.min(endMin - 60, Math.max(startMin, Math.floor(min / 60) * 60)))
            } : undefined}>
            {hourRows.map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-gray-100"
                style={{ top: (t - startMin) * pxPerMin }} />
            ))}
            {selectedSlot && selectedSlot.day === d && (
              <div className="absolute inset-x-0 bg-optio-purple/10 ring-1 ring-inset ring-optio-purple/40 rounded-sm pointer-events-none"
                style={{ top: (selectedSlot.min - startMin) * pxPerMin, height: 60 * pxPerMin }} />
            )}
            {(blocksByDay[d] || []).map((b, i) => (
              <div key={i}
                className={`absolute inset-x-0.5 rounded-md px-1.5 py-0.5 overflow-hidden ${b.color}`}
                style={{ top: b.top, height: b.height }}
                onClick={onSlotClick ? (e) => e.stopPropagation() : undefined}
                title={`${b.name} · ${b.label}`}>
                <div className={`font-semibold leading-tight truncate ${compact ? 'text-[10px]' : 'text-xs'}`}>{b.name}</div>
                {!compact && <div className="text-[10px] opacity-90 truncate">{b.label}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default WeeklySchedule
