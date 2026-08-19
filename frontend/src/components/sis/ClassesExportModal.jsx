import React, { useState } from 'react'
import { ModalOverlay } from '../ui'
import Button from '../ui/Button'
import { hhmm } from './classFields'

/**
 * Export the org's classes as a CSV, in the shapes the front office actually
 * rebuilds by hand in Sheets (iCreate, 2026-08-12: "I would love it more if I
 * could select what I want that spreadsheet to look like! (Or have views in
 * these formats!)" — with a sheet of hand-made tabs attached):
 *
 * - Class list: one row per class, with a column picker. The default columns
 *   are exactly the old fixed export, so "just export it" is unchanged.
 * - Schedule grids: days/times down the side, one column per teacher (their
 *   "Teachers" tab) or per room (their "by Room" tabs); each time slot gets a
 *   Class / Ages / Room-or-Teacher row, mirroring how those tabs are laid out.
 *
 * Format and column choices persist per browser, like the cards/table toggle.
 */

const STORE_KEY = 'sis_classes_export'

const DOW_SHORT = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' }
const DOW_FULL = {
  0: 'SUNDAY', 1: 'MONDAY', 2: 'TUESDAY', 3: 'WEDNESDAY', 4: 'THURSDAY', 5: 'FRIDAY', 6: 'SATURDAY',
}

const t12 = (t) => {
  if (!t) return ''
  const [h, m] = hhmm(t).split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`
}

const daysOf = (mts = []) => [...new Set(mts.map((m) => m.day_of_week).filter((d) => d != null))].sort()
  .map((d) => DOW_SHORT[d]).join(' ')

const timeOf = (mts = []) => {
  const f = (mts || []).find((m) => m.start_time && m.end_time)
  return f ? `${t12(f.start_time)}-${t12(f.end_time)}` : ''
}

const startOf = (mts = []) => {
  const f = (mts || []).find((m) => m.start_time)
  return f ? t12(f.start_time) : ''
}

const lengthOf = (mts = []) => {
  const f = (mts || []).find((m) => m.start_time && m.end_time)
  if (!f) return ''
  const [sh, sm] = hhmm(f.start_time).split(':').map(Number)
  const [eh, em] = hhmm(f.end_time).split(':').map(Number)
  const mins = eh * 60 + em - (sh * 60 + sm)
  if (!(mins > 0)) return ''
  const h = Math.floor(mins / 60)
  const r = mins % 60
  return h === 0 ? `${r} min` : r === 0 ? `${h} hr` : `${h} hr ${r} min`
}

const agesOf = (c) => c.min_age != null && c.max_age != null ? `${c.min_age}-${c.max_age}`
  : c.min_age != null ? `${c.min_age}+` : c.max_age != null ? `up to ${c.max_age}` : ''

const teacherOf = (c) => c.primary_instructor?.name || c.primary_instructor?.display_name || ''

// `on` marks the default set — the old fixed export, unchanged.
export const LIST_COLUMNS = [
  { id: 'name', label: 'Class name', hint: 'Title of class', on: true, value: (c) => c.name || '' },
  { id: 'teacher', label: 'Teacher', hint: 'Primary instructor', on: true, value: teacherOf },
  { id: 'days', label: 'Days', hint: 'Meeting days (e.g. Mon Wed)', on: true, value: (c) => daysOf(c.meetings) },
  { id: 'time', label: 'Time', hint: 'Full time range (e.g. 9:00am–10:00am)', on: true, value: (c) => timeOf(c.meetings) },
  { id: 'start_time', label: 'Start time', hint: 'Start time only (e.g. 9:00am)', on: false, value: (c) => startOf(c.meetings) },
  { id: 'length', label: 'Length', hint: 'Class duration (e.g. 55 min)', on: false, value: (c) => lengthOf(c.meetings) },
  { id: 'ages', label: 'Ages', hint: 'Age range (e.g. 8–12)', on: true, value: agesOf },
  { id: 'description', label: 'Description', hint: 'Class description text', on: true, value: (c) => c.description || '' },
  { id: 'supply_fee', label: 'Supply fee', hint: 'Materials fee', on: true, value: (c) => c.supply_fee != null ? `$${c.supply_fee}` : '' },
  { id: 'tuition', label: 'Tuition', hint: 'Tuition price', on: true, value: (c) => c.price_cents != null ? `$${(c.price_cents / 100).toFixed(2)}` : '' },
  { id: 'classroom', label: 'Classroom', hint: 'Room location', on: true, value: (c) => c.location || '' },
  { id: 'enrolled', label: 'Enrolled', hint: 'Enrolled student count', on: true, value: (c) => c.enrolled_count ?? 0 },
  { id: 'capacity', label: 'Capacity', hint: 'Max student limit', on: true, value: (c) => c.capacity ?? '' },
  { id: 'waitlist', label: 'Waitlist', hint: 'Waitlisted student count', on: true, value: (c) => c.waitlist_count ?? 0 },
  { id: 'registration', label: 'Registration', hint: 'Status: Open, Closed, or Archived', on: false,
    value: (c) => c.status === 'archived' ? 'Archived' : c.registration_status === 'open' ? 'Open' : 'Closed' },
]

const DEFAULT_COLS = LIST_COLUMNS.filter((c) => c.on).map((c) => c.id)

export const buildListRows = (classes, colIds) => {
  const cols = LIST_COLUMNS.filter((c) => colIds.includes(c.id))
  return [cols.map((c) => c.label), ...classes.map((cls) => cols.map((c) => c.value(cls)))]
}

/**
 * Days/times down the side, one column per teacher or room. Every (day, start
 * time) a class meets becomes three rows — Class / Ages / Room-or-Teacher —
 * the same three-line blocks the hand-made sheet uses. Archived classes are
 * excluded: a schedule grid is what's actually running.
 */
export const buildGridRows = (classes, axis, dayFilter = 'all') => {
  const keyOf = axis === 'teacher'
    ? (c) => teacherOf(c) || 'No teacher'
    : (c) => c.location || 'No room'
  const third = axis === 'teacher'
    ? { label: 'Room', value: (c) => c.location || '' }
    : { label: 'Teacher', value: teacherOf }

  const occs = []
  for (const c of classes) {
    if (c.status === 'archived') continue
    for (const m of c.meetings || []) {
      if (m.day_of_week == null || !m.start_time) continue
      if (dayFilter !== 'all' && Number(dayFilter) !== m.day_of_week) continue
      occs.push({ day: m.day_of_week, start: hhmm(m.start_time), c })
    }
  }
  const cols = [...new Set(occs.map((o) => keyOf(o.c)))].sort((a, b) => a.localeCompare(b))
  // School-week order: Monday first, Sunday last.
  const days = [...new Set(occs.map((o) => o.day))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))

  const rows = [['', ...cols]]
  for (const day of days) {
    rows.push([DOW_FULL[day], ...cols.map(() => '')])
    const starts = [...new Set(occs.filter((o) => o.day === day).map((o) => o.start))].sort()
    for (const start of starts) {
      const here = occs.filter((o) => o.day === day && o.start === start)
      const at = (col) => here.filter((o) => keyOf(o.c) === col).map((o) => o.c)
      const cells = (fn) => cols.map((col) => at(col).map(fn).join('; '))
      rows.push([`${t12(start)} - Class`, ...cells((c) => c.name || '')])
      rows.push([`${t12(start)} - Ages`, ...cells(agesOf)])
      rows.push([`${t12(start)} - ${third.label}`, ...cells(third.value)])
    }
  }
  return rows
}

const esc = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const downloadCsv = (rows, filename) => {
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n')
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const FORMATS = [
  { key: 'list', label: 'Class list', hint: 'One row per class — pick the columns below' },
  { key: 'teacher', label: 'Schedule grid by teacher', hint: 'Days and times down the side, a column per teacher' },
  { key: 'room', label: 'Schedule grid by room', hint: 'Days and times down the side, a column per room' },
]

const DAY_OPTIONS = [
  { value: 'all', label: 'All days' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
]

const loadPrefs = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY))
    return {
      format: FORMATS.some((f) => f.key === saved?.format) ? saved.format : 'list',
      cols: Array.isArray(saved?.cols) && saved.cols.length
        ? saved.cols.filter((id) => LIST_COLUMNS.some((c) => c.id === id))
        : DEFAULT_COLS,
      // Default ON, and `!== false` so the browsers that already hold a saved
      // pref object without this key get the new default rather than archived
      // classes back.
      excludeArchived: saved?.excludeArchived !== false,
    }
  } catch { return { format: 'list', cols: DEFAULT_COLS, excludeArchived: true } }
}

const ClassesExportModal = ({ classes = [], orgName, onClose }) => {
  const [prefs, setPrefs] = useState(loadPrefs)
  const { format, cols, excludeArchived } = prefs
  const [selectedTeacher, setSelectedTeacher] = useState('all')
  const [selectedDay, setSelectedDay] = useState('all')

  const allTeachers = React.useMemo(() => {
    const set = new Set()
    for (const c of classes) {
      const primary = teacherOf(c)
      if (primary) set.add(primary)
      for (const a of (c.assistant_instructors || [])) {
        const name = a.name || a.display_name
        if (name) set.add(name)
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [classes])

  const archivedCount = React.useMemo(
    () => classes.filter((c) => c.status === 'archived').length, [classes])

  const filteredClasses = React.useMemo(() => {
    return classes.filter((c) => {
      // The page hands us whatever it is showing, so with "Show archived" on
      // its archived rows arrive here too. The schedule grids have always
      // dropped them; the class list was quietly keeping them.
      if (excludeArchived && c.status === 'archived') return false
      if (selectedTeacher !== 'all') {
        const primary = teacherOf(c)
        const assts = (c.assistant_instructors || []).map((a) => a.name || a.display_name).filter(Boolean)
        if (primary !== selectedTeacher && !assts.includes(selectedTeacher)) {
          return false
        }
      }
      if (selectedDay !== 'all') {
        const dayNum = Number(selectedDay)
        const meetsOnDay = (c.meetings || []).some((m) => m.day_of_week === dayNum)
        if (!meetsOnDay) return false
      }
      return true
    })
  }, [classes, selectedTeacher, selectedDay, excludeArchived])

  const save = (next) => {
    setPrefs(next)
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }
  const toggleCol = (id) => save({
    ...prefs,
    // Keep LIST_COLUMNS order regardless of click order.
    cols: LIST_COLUMNS.map((c) => c.id)
      .filter((cid) => (cid === id ? !cols.includes(id) : cols.includes(cid))),
  })

  const exportNow = () => {
    const slug = orgName.replace(/\s+/g, '-').toLowerCase()
    if (format === 'list') downloadCsv(buildListRows(filteredClasses, cols), `${slug}-classes.csv`)
    else downloadCsv(buildGridRows(filteredClasses, format, selectedDay), `${slug}-schedule-by-${format}.csv`)
    onClose()
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Export CSV</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          <fieldset>
            <legend className="text-sm font-medium text-gray-700 mb-2">Format</legend>
            <div className="space-y-1.5">
              {FORMATS.map((f) => (
                <label key={f.key} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                  format === f.key ? 'border-optio-purple bg-optio-purple/5' : 'border-gray-200 hover:bg-neutral-50'
                }`}>
                  <input type="radio" name="export-format" className="mt-0.5 accent-optio-purple"
                    checked={format === f.key} onChange={() => save({ ...prefs, format: f.key })} />
                  <span>
                    <span className="block text-sm font-medium text-neutral-800">{f.label}</span>
                    <span className="block text-xs text-neutral-500">{f.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-gray-700 mb-2">Filter export (optional)</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="export-filter-teacher" className="block text-xs font-medium text-neutral-600 mb-1">Filter by teacher</label>
                <select
                  id="export-filter-teacher"
                  aria-label="Filter by teacher"
                  value={selectedTeacher}
                  onChange={(e) => setSelectedTeacher(e.target.value)}
                  className="w-full text-xs rounded-lg border border-neutral-300 px-2.5 py-1.5 text-neutral-800 bg-white focus:outline-none focus:ring-1 focus:ring-optio-purple"
                >
                  <option value="all">All teachers</option>
                  {allTeachers.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="export-filter-day" className="block text-xs font-medium text-neutral-600 mb-1">Filter by day</label>
                <select
                  id="export-filter-day"
                  aria-label="Filter by day"
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                  className="w-full text-xs rounded-lg border border-neutral-300 px-2.5 py-1.5 text-neutral-800 bg-white focus:outline-none focus:ring-1 focus:ring-optio-purple"
                >
                  {DAY_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <label className="mt-2.5 flex items-start gap-2 text-sm text-neutral-700 cursor-pointer">
              <input type="checkbox" aria-label="Exclude archived classes"
                className="mt-0.5 accent-optio-purple shrink-0"
                checked={excludeArchived}
                onChange={() => save({ ...prefs, excludeArchived: !excludeArchived })} />
              <span className="leading-tight">
                <span className="block font-medium text-neutral-800">Exclude archived classes</span>
                <span className="block text-[11px] text-neutral-500">
                  {archivedCount === 0
                    ? 'No archived classes in view'
                    : `${archivedCount} archived class${archivedCount === 1 ? '' : 'es'} in view`}
                </span>
              </span>
            </label>
            {(selectedTeacher !== 'all' || selectedDay !== 'all' || archivedCount > 0) && (
              <p className="mt-1.5 text-xs text-neutral-500 font-medium">
                {filteredClasses.length === 0
                  ? 'No classes match the selected filter.'
                  : `Exporting ${filteredClasses.length} of ${classes.length} class${classes.length === 1 ? '' : 'es'}`}
              </p>
            )}
          </fieldset>

          {format === 'list' && (
            <fieldset>
              <legend className="text-sm font-medium text-gray-700 mb-2">
                Columns
                <button type="button" onClick={() => save({ ...prefs, cols: DEFAULT_COLS })}
                  className="ml-2 text-xs font-normal text-optio-purple hover:underline">
                  Reset to default
                </button>
              </legend>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {LIST_COLUMNS.map((c) => (
                  <label key={c.id} className="flex items-start gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input type="checkbox" aria-label={c.label} className="mt-0.5 accent-optio-purple shrink-0"
                      checked={cols.includes(c.id)} onChange={() => toggleCol(c.id)} />
                    <span className="leading-tight">
                      <span className="block font-medium text-neutral-800">{c.label}</span>
                      {c.hint && <span className="block text-[11px] text-neutral-500 font-normal">{c.hint}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm">
            Cancel
          </button>
          <Button size="sm" onClick={exportNow} disabled={(format === 'list' && !cols.length) || filteredClasses.length === 0}>
            Export
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}

export default ClassesExportModal
