/**
 * The class-schedule toolkit: minutes, clashes, ages, and the week's rows.
 *
 * Twenty-five private copies of these lived across the parent builder, the
 * CLP, the SIS calendar, the class pages and the embeds -- seven toMin, twelve
 * time formatters, three overlap tests, four age calculators -- and the
 * builder and the CLP judged a child's age against different dates, so a
 * 9-year-old was offered different classes on different screens
 * (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, E5; M11 in
 * docs/sis/CONSOLIDATION_PLAN.md). One module.
 *
 * Times are the "HH:MM[:SS]" strings class_meetings store; the 12-hour label
 * is timeFormat's compact form ("9:30am", "1pm"), re-exported here as
 * fmtTime because that is the name every schedule surface used.
 */

import { compact12h } from './timeFormat'
import { ageFromDob } from './age'

export { ageFromDob }
export const fmtTime = compact12h

/** "09:30" -> 570; null for nothing or garbage. */
export const toMin = (t) => {
  if (!t) return null
  const [h, m] = String(t).split(':').map(Number)
  return Number.isNaN(h) ? null : h * 60 + (m || 0)
}

/** Two weekly meetings collide when they share a weekday and their time
 *  ranges intersect. A meeting with no weekday (a one-off date) never
 *  collides here; the calendar handles those. */
export const overlaps = (a, b) => {
  if (a?.day_of_week == null || b?.day_of_week == null || a.day_of_week !== b.day_of_week) return false
  const as = toMin(a.start_time); const ae = toMin(a.end_time)
  const bs = toMin(b.start_time); const be = toMin(b.end_time)
  if (as == null || ae == null || bs == null || be == null) return false
  return as < be && bs < ae
}

/** The name of the current class a candidate clashes with, or null. */
export const conflictsWith = (candidate, current) => {
  for (const cm of candidate?.meetings || []) {
    for (const cls of current || []) {
      if ((cls.meetings || []).some((m) => overlaps(cm, m))) return cls.name
    }
  }
  return null
}

/** Whether a class's age band admits this age. An unknown age admits
 *  everything: the screens that call this ask for the birthday elsewhere. */
export const fitsAge = (cls, age) => {
  if (age == null) return true
  if (cls.min_age != null && age < cls.min_age) return false
  if (cls.max_age != null && age > cls.max_age) return false
  return true
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** School weeks start on Monday. */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

/**
 * The week's rows, from a list of classes and their meetings.
 *
 * Rows key on the START time only, shared across the whole week. Keying on
 * the full start-end range put a Tuesday 9:30-10:30 class on a different
 * row from a Monday 9:30-3:00 one, so the 9:30 row read as empty on the day
 * it was busiest (iCreate, 2026-08-25: "the schedule on Tuesday doesn't show
 * the 9:30 class on the same row is very annoying and confusing"); per-day
 * stacks had the same defect. At iCreate a 9:30 start has four different end
 * times, so this is the common case. A class that spans several rows starts
 * in one and is reported by `covering` for the rows it is still running
 * through, so a reader crossing the 1:00 row sees Monday is not free
 * (iCreate 32b2beb3).
 *
 * Every grid renders this one model with its own cells: the student modal's
 * blocks, the CLP's interactive cards, the teacher's clickable week. Three
 * copies of the model is how the bug shipped twice.
 *
 * Returns { days, slots, cell, endsBySlot, covering, unscheduled } where
 * `cell["d|slot"]` is the list of { cls, m } meeting at that day and start,
 * `endsBySlot[slot]` is the set of end times seen in that row, and
 * `unscheduled` is the classes with no weekly meeting at all. Meetings on a
 * specific date are left out when `recurringOnly` (the teacher's week).
 */
export const weekGrid = (classes, { recurringOnly = false } = {}) => {
  const daySet = new Set()
  const slotSet = new Set()
  const cell = {}
  const endsBySlot = {}
  for (const cls of classes || []) {
    for (const m of cls.meetings || []) {
      if (m.day_of_week == null) continue
      if (recurringOnly && m.specific_date) continue
      const slot = m.start_time || ''
      daySet.add(m.day_of_week)
      slotSet.add(slot)
      ;(endsBySlot[slot] = endsBySlot[slot] || new Set()).add(m.end_time || '')
      ;(cell[`${m.day_of_week}|${slot}`] = cell[`${m.day_of_week}|${slot}`] || []).push({ cls, m })
    }
  }
  const slots = [...slotSet].sort((a, b) => (toMin(a) ?? -1) - (toMin(b) ?? -1))
  const days = DAY_ORDER.filter((d) => daySet.has(d))
  const covering = (d, slot) => {
    const at = toMin(slot)
    if (at == null) return []
    return (classes || []).flatMap((cls) => (cls.meetings || [])
      .filter((m) => m.day_of_week === d && !(recurringOnly && m.specific_date))
      .filter((m) => {
        const s = toMin(m.start_time); const e = toMin(m.end_time)
        return s != null && e != null && s < at && at < e
      })
      .map(() => cls))
  }
  const unscheduled = (classes || []).filter((cls) => !(cls.meetings || []).some(
    (m) => m.day_of_week != null && !(recurringOnly && m.specific_date)))
  return { days, slots, cell, endsBySlot, covering, unscheduled }
}
