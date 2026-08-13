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
  { id: 'name', label: 'Class name', on: true, value: (c) => c.name || '' },
  { id: 'teacher', label: 'Teacher', on: true, value: teacherOf },
  { id: 'days', label: 'Days', on: true, value: (c) => daysOf(c.meetings) },
  { id: 'time', label: 'Time', on: true, value: (c) => timeOf(c.meetings) },
  { id: 'start_time', label: 'Start time', on: false, value: (c) => startOf(c.meetings) },
  { id: 'length', label: 'Length', on: false, value: (c) => lengthOf(c.meetings) },
  { id: 'ages', label: 'Ages', on: true, value: agesOf },
  { id: 'description', label: 'Description', on: true, value: (c) => c.description || '' },
  { id: 'supply_fee', label: 'Supply fee', on: true, value: (c) => c.supply_fee != null ? `$${c.supply_fee}` : '' },
  { id: 'tuition', label: 'Tuition', on: true, value: (c) => c.price_cents != null ? `$${(c.price_cents / 100).toFixed(2)}` : '' },
  { id: 'classroom', label: 'Classroom', on: true, value: (c) => c.location || '' },
  { id: 'enrolled', label: 'Enrolled', on: true, value: (c) => c.enrolled_count ?? 0 },
  { id: 'capacity', label: 'Capacity', on: true, value: (c) => c.capacity ?? '' },
  { id: 'waitlist', label: 'Waitlist', on: true, value: (c) => c.waitlist_count ?? 0 },
  { id: 'registration', label: 'Registration', on: false,
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
export const buildGridRows = (classes, axis) => {
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

const loadPrefs = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY))
    return {
      format: FORMATS.some((f) => f.key === saved?.format) ? saved.format : 'list',
      cols: Array.isArray(saved?.cols) && saved.cols.length
        ? saved.cols.filter((id) => LIST_COLUMNS.some((c) => c.id === id))
        : DEFAULT_COLS,
    }
  } catch { return { format: 'list', cols: DEFAULT_COLS } }
}

const ClassesExportModal = ({ classes, orgName, onClose }) => {
  const [prefs, setPrefs] = useState(loadPrefs)
  const { format, cols } = prefs

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
    if (format === 'list') downloadCsv(buildListRows(classes, cols), `${slug}-classes.csv`)
    else downloadCsv(buildGridRows(classes, format), `${slug}-schedule-by-${format}.csv`)
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

          {format === 'list' && (
            <fieldset>
              <legend className="text-sm font-medium text-gray-700 mb-2">
                Columns
                <button type="button" onClick={() => save({ ...prefs, cols: DEFAULT_COLS })}
                  className="ml-2 text-xs font-normal text-optio-purple hover:underline">
                  Reset to default
                </button>
              </legend>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {LIST_COLUMNS.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input type="checkbox" className="accent-optio-purple"
                      checked={cols.includes(c.id)} onChange={() => toggleCol(c.id)} />
                    {c.label}
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
          <Button size="sm" onClick={exportNow} disabled={format === 'list' && !cols.length}>
            Export
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}

export default ClassesExportModal
