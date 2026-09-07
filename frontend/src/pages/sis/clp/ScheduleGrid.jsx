// The student's week as one CSS grid: a header row of days, then a row per
// start time, so a parent reads across a row and sees what happens at 9am.
import React from 'react'

import { DAY_LABELS, Pill, fmtTime, toMinutes, dollars } from './clpHelpers'

const ScheduleGrid = ({ busyId, confirm, drop, schedule, scheduleDays, setTimeFocus, timeFocus }) => {
  // Rows are keyed on START time, shared across the whole week — the row
  // model WeeklyScheduleGrid proved out. Independent per-day stacks put
  // Tuesday's 9:30 class at a different height than Monday's 9:30, so the
  // grid read as "empty at 9:30" on the day it was busiest (iCreate,
  // 2026-08-25). Each card carries its own end time, so rows only need the
  // shared start.
  const cell = {}
  const slotSet = new Set()
  const dayHasClass = {}
  for (const c of schedule) {
    for (const m of c.meetings) {
      if (m.day_of_week == null) continue
      const slot = m.start_time || ''
      slotSet.add(slot)
      dayHasClass[m.day_of_week] = true
      ;(cell[`${m.day_of_week}|${slot}`] = cell[`${m.day_of_week}|${slot}`] || []).push({ cls: c, m })
    }
  }
  const slots = [...slotSet].sort((a, b) => (toMinutes(a) || 0) - (toMinutes(b) || 0))
  if (!slots.length) slots.push('') // one row of day placeholders for an empty week
  const unscheduled = schedule.filter((c) => !c.meetings.some((m) => m.day_of_week != null))

  // Per-day supply-fee totals — each class counted once per day it meets.
  const supplyByDay = {}
  for (const c of schedule) {
    if (!Number(c.supply_fee)) continue
    const days = new Set(c.meetings.filter((m) => m.day_of_week != null).map((m) => m.day_of_week))
    for (const d of days) supplyByDay[d] = (supplyByDay[d] || 0) + Number(c.supply_fee)
  }
  const anySupply = scheduleDays.some((d) => supplyByDay[d] > 0)

  const renderCard = ({ cls, m }, i, d) => {
    const focused = timeFocus && timeFocus.classId === cls.class_id && timeFocus.day === d
    return (
      <div key={`${cls.class_id}-${i}`} className="relative">
        <button
          type="button"
          onClick={() => setTimeFocus(focused ? null : { label: cls.name, day: d, classId: cls.class_id, meetings: cls.meetings })}
          className={`w-full text-left rounded-lg p-2.5 pr-7 border transition-colors ${
            focused
              ? 'border-optio-purple bg-optio-purple/10 ring-1 ring-optio-purple'
              : 'border-gray-200 bg-gradient-to-br from-[#F3EFF4] to-white hover:border-optio-purple'
          }`}
        >
          <div className="text-sm font-semibold text-neutral-900 leading-tight">{cls.name}</div>
          <div className="text-xs text-neutral-500 mt-0.5">{fmtTime(m.start_time)}–{fmtTime(m.end_time)}</div>
          {cls.primary_instructor?.name && <div className="text-[11px] text-neutral-400 mt-0.5 truncate">{cls.primary_instructor.name}</div>}
        </button>
        <button
          type="button"
          title={`Drop ${cls.name}`}
          aria-label={`Drop ${cls.name}`}
          disabled={busyId === cls.class_id}
          onClick={async () => { if (await confirm(`Drop ${cls.name} from this student's schedule?`)) drop(cls) }}
          className="absolute top-1 right-1 text-neutral-300 hover:text-red-600 leading-none text-base font-bold px-1 disabled:opacity-40"
        >
          {busyId === cls.class_id ? '·' : '×'}
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* One CSS grid: a header row, then one row per start time (cells fill
          left to right, one per day, so same-time classes align), then the
          per-day supply footers. */}
      <div className="grid gap-x-3 gap-y-2" style={{ gridTemplateColumns: `repeat(${scheduleDays.length}, minmax(0, 1fr))` }}>
        {scheduleDays.map((d) => (
          <div key={`head-${d}`} className="min-w-0 text-xs font-semibold uppercase tracking-wide text-neutral-400 text-center">
            {DAY_LABELS[d]}
          </div>
        ))}
        {slots.map((slot, si) => scheduleDays.map((d) => (
          <div key={`${slot}|${d}`} data-slot={slot} className="min-w-0 space-y-2">
            {(cell[`${d}|${slot}`] || []).map((entry, i) => renderCard(entry, i, d))}
            {si === 0 && !dayHasClass[d] && <div className="text-xs text-neutral-300 text-center py-4">—</div>}
          </div>
        )))}
        {anySupply && scheduleDays.map((d) => (
          <div key={`supply-${d}`} className="min-w-0">
            {supplyByDay[d] > 0 && (
              <div className="text-[11px] text-neutral-500 text-center border-t border-gray-100 pt-1.5">
                Supplies: <span className="font-semibold text-neutral-700">{dollars(supplyByDay[d])}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {unscheduled.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">No set meeting time</div>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((c) => <Pill key={c.class_id} className="bg-[#F3EFF4] text-neutral-700">{c.name}</Pill>)}
          </div>
        </div>
      )}

      {!schedule.length && (
        <p className="text-sm text-neutral-400">Not registered for any classes yet. Add classes from the catalog below.</p>
      )}
    </div>
  )
}

export default ScheduleGrid
