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
//   onSlotClick  optional (day, startMinutes, endMinutes) — fires when an empty
//                spot in a day column is clicked; snapped to the containing
//                time block when blocks are configured, else to the hour
//   onClassClick optional (cls) — fires when a class's colored block is clicked
//   selectedSlot optional {day, min, end?} — highlights that slot in the grid
//   timeBlocks   optional [{start:'HH:MM', end:'HH:MM', label}] — the school's
//                standard periods. Empty (day, block) slots render as gray
//                "open" boxes prompting families to pick a class for that time;
//                labeled blocks (e.g. Lunch) render as a shaded band instead.
//   flaggedSlots optional [{day, min, end}] — open slots to render as amber
//                warnings (e.g. an empty block BETWEEN two classes — on-campus
//                students must be in a class every block)
//   dayFooters   optional {day: node} — a footer row under each day column
//                (e.g. the day's supply-fee total, matching the CLP grid)

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

const WeeklySchedule = ({ classes = [], ghost = null, compact = false, onSlotClick = null, onClassClick = null, selectedSlot = null, timeBlocks = [], flaggedSlots = [], dayFooters = null }) => {
  // Time range: default school hours, expanded to fit every meeting shown.
  // With time blocks configured, the grid hugs the school day instead.
  const blocks = (timeBlocks || []).filter((b) => toMin(b.start) != null && toMin(b.end) != null)
  let startMin = 8 * 60
  let endMin = 16 * 60
  if (blocks.length) {
    startMin = Math.min(...blocks.map((b) => Math.floor(toMin(b.start) / 60) * 60))
    endMin = Math.max(...blocks.map((b) => Math.ceil(toMin(b.end) / 60) * 60))
  }
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
  const busyByDay = {} // day -> [{s, e}] class-meeting intervals (ghost excluded)
  all.forEach((c, i) => {
    const isGhost = ghost && c === ghost
    for (const m of c.meetings || []) {
      const d = m.day_of_week
      if (!DAYS.includes(d)) continue
      const s = toMin(m.start_time); const e = toMin(m.end_time)
      if (s == null || e == null) continue
      if (!isGhost) (busyByDay[d] = busyByDay[d] || []).push({ s, e })
      blocksByDay[d] = blocksByDay[d] || []
      blocksByDay[d].push({
        name: c.name, cls: isGhost ? null : c, top: (s - startMin) * pxPerMin,
        height: Math.max((e - s) * pxPerMin, compact ? 14 : 22),
        label: `${fmt(m.start_time)}–${fmt(m.end_time)}`,
        day: d, startAt: s, endAt: e,
        color: isGhost ? 'bg-neutral-400/50 text-white border border-dashed border-neutral-500' : colorFor(i),
      })
    }
  })

  // Pickable periods (unlabeled blocks) and the block containing a click.
  const pickable = blocks.filter((b) => !b.label)
  const blockAt = (min) => blocks.find((b) => toMin(b.start) <= min && min < toMin(b.end))
  const slotIsOpen = (d, b) => {
    const s = toMin(b.start); const e = toMin(b.end)
    return !(busyByDay[d] || []).some((iv) => iv.s < e && s < iv.e)
  }

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
              // snap the click to the containing time block (or hour without blocks)
              const rect = e.currentTarget.getBoundingClientRect()
              const min = startMin + (e.clientY - rect.top) / pxPerMin
              const blk = blocks.length ? blockAt(min) : null
              if (blocks.length && (!blk || blk.label)) return // between blocks / lunch — nothing to pick
              if (blk) onSlotClick(d, toMin(blk.start), toMin(blk.end))
              else {
                const h = Math.min(endMin - 60, Math.max(startMin, Math.floor(min / 60) * 60))
                onSlotClick(d, h, h + 60)
              }
            } : undefined}>
            {hourRows.map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-gray-100"
                style={{ top: (t - startMin) * pxPerMin }} />
            ))}
            {/* labeled blocks (Lunch) render as a shaded band */}
            {blocks.filter((b) => b.label).map((b, i) => {
              const s = toMin(b.start); const e = toMin(b.end)
              return (
                <div key={`lbl-${i}`}
                  className="absolute inset-x-0 bg-neutral-100/70 pointer-events-none flex items-center justify-center"
                  style={{ top: (s - startMin) * pxPerMin, height: (e - s) * pxPerMin }}>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">{b.label}</span>
                </div>
              )
            })}
            {/* open slots: a gray box per empty (day, period) — pick a class here.
                Flagged slots (an empty block between two classes) go amber. */}
            {pickable.filter((b) => slotIsOpen(d, b)).map((b, i) => {
              const s = toMin(b.start); const e = toMin(b.end)
              const flagged = (flaggedSlots || []).some((f) => f.day === d && f.min === s)
              return (
                <div key={`open-${i}`}
                  className={`absolute inset-x-0.5 rounded-md border border-dashed flex items-center justify-center ${
                    flagged
                      ? 'bg-amber-50 border-amber-400 ring-1 ring-amber-300'
                      : 'bg-neutral-100 border-neutral-300'
                  } ${onSlotClick ? (flagged ? 'hover:bg-amber-100 transition-colors' : 'hover:bg-neutral-200/70 transition-colors') : ''}`}
                  style={{ top: (s - startMin) * pxPerMin + 1, height: (e - s) * pxPerMin - 2 }}
                  title={flagged
                    ? 'Open block between classes — on-campus students must be in a class every block'
                    : onSlotClick ? 'Open — click to see classes at this time' : 'Open'}>
                  {!compact && (
                    <span className={`text-[10px] font-medium ${flagged ? 'text-amber-600' : 'text-neutral-400'}`}>
                      {flagged ? 'Open between classes' : onSlotClick ? '+ Pick a class' : 'Open'}
                    </span>
                  )}
                </div>
              )
            })}
            {selectedSlot && selectedSlot.day === d && (
              <div className="absolute inset-x-0 bg-optio-purple/10 ring-1 ring-inset ring-optio-purple/40 rounded-sm pointer-events-none"
                style={{ top: (selectedSlot.min - startMin) * pxPerMin,
                         height: ((selectedSlot.end || selectedSlot.min + 60) - selectedSlot.min) * pxPerMin }} />
            )}
            {(blocksByDay[d] || []).map((b, i) => (
              <div key={i}
                className={`absolute inset-x-0.5 rounded-md px-1.5 py-0.5 overflow-hidden ${b.color} ${onClassClick && b.cls ? 'cursor-pointer hover:opacity-90' : ''}`}
                style={{ top: b.top, height: b.height }}
                onClick={(onSlotClick || onClassClick) ? (e) => {
                  e.stopPropagation()
                  if (!b.cls) return
                  // In a block-based schedule, clicking an enrolled block opens the
                  // picker for the block under the pointer, so a multi-block class can't
                  // hide the other classes offered in the blocks it covers. Without time
                  // blocks (or outside the builder), it just opens the class details.
                  const rect = e.currentTarget.getBoundingClientRect()
                  const min = b.startAt + (e.clientY - rect.top) / pxPerMin
                  const blk = (onSlotClick && blocks.length) ? (blockAt(min) || blockAt(b.startAt)) : null
                  if (blk && !blk.label) onSlotClick(b.day, toMin(blk.start), toMin(blk.end))
                  else if (onClassClick) onClassClick(b.cls, { day: b.day, min: b.startAt, end: b.endAt })
                  else if (onSlotClick) onSlotClick(b.day, b.startAt, b.endAt)
                } : undefined}
                title={`${b.name} · ${b.label}`}>
                <div className={`font-semibold leading-tight truncate ${compact ? 'text-[10px]' : 'text-xs'}`}>{b.name}</div>
                {!compact && <div className="text-[10px] opacity-90 truncate">{b.label}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>
      {dayFooters && (
        <div className="grid" style={{ gridTemplateColumns: '3rem repeat(5, 1fr)' }}>
          <div />
          {DAYS.map((d) => (
            <div key={d} className="border-l border-gray-100 px-1 pt-1.5">
              {dayFooters[d] || null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default WeeklySchedule
