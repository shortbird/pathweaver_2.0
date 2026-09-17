/**
 * Narrowing the class list in the Class rosters report picker.
 *
 * iCreate, 2026-09-14 (73963487, c8affdb2): the picker was every class the
 * school runs, alphabetical -- 150-odd rows -- and the office was working out
 * "all the Tuesday morning classes for 10-year-olds" on paper first, then
 * scrolling for each name. The Classes page already sorts by day, time and
 * age; this is the same three facts as filters, plus a name search.
 *
 * Filters narrow what is SHOWN, never what is TICKED: a class picked before a
 * filter hid it stays in the report. `rosterSelectionSummary` is how the
 * picker says so.
 */

import { hhmm } from '../../../components/sis/classFields'
import { fitsAge } from '../../../utils/schedule'

export const EMPTY_FILTER = Object.freeze({ search: '', days: [], time: '', age: '' })

export const isFilterEmpty = (f) => (
  !f.search.trim() && !f.days.length && !f.time && f.age === ''
)

const teacherName = (c) => c.primary_instructor?.name || c.primary_instructor?.display_name || ''

// Every distinct start time in the list, as "HH:MM", earliest first -- the
// options for the Time filter. A school on blocks has a handful.
export const startTimesOf = (classes = []) => [...new Set(
  classes.flatMap((c) => (c.meetings || []).map((m) => hhmm(m.start_time)).filter(Boolean)),
)].sort()

export const classMatchesRosterFilter = (c, f) => {
  const q = f.search.trim().toLowerCase()
  if (q && !(c.name || '').toLowerCase().includes(q)
    && !teacherName(c).toLowerCase().includes(q)) return false
  const meetings = c.meetings || []
  if (f.days.length && !meetings.some((m) => f.days.includes(m.day_of_week))) return false
  if (f.time && !meetings.some((m) => hhmm(m.start_time) === f.time)) return false
  if (f.age !== '') {
    const age = Number(f.age)
    if (!Number.isNaN(age) && !fitsAge(c, age)) return false
  }
  return true
}

// "3 selected · 1 not shown by the filters" -- the second half only when a
// ticked class is hidden, because that is the one that would surprise you in
// the report.
export const rosterSelectionSummary = (selectedIds, shownIds) => {
  if (!selectedIds.length) return ''
  const shown = new Set(shownIds)
  const hidden = selectedIds.filter((id) => !shown.has(id)).length
  const head = `${selectedIds.length} selected`
  return hidden ? `${head} · ${hidden} not shown by the filters` : head
}
