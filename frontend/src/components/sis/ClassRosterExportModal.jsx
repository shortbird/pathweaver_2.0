import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import ModalOverlay from '../ui/ModalOverlay'
import Button from '../ui/Button'
import { withOrg } from '../../pages/sis/useSisOrg'

/**
 * Print a class roster, or download it as a CSV.
 *
 * The front office rebuilds these by hand: a sign-in sheet for the substitute,
 * a contact list for the field trip, an allergy list for the kitchen. All three
 * are the same roster with different columns, which is why this is a column
 * picker and a print button rather than three fixed reports.
 *
 * It reads the TEACHER roster endpoint (/api/sis/teacher/classes/:id/roster)
 * rather than the admin enrollments list, because that is the one that carries
 * guardians, phone numbers and health flags — the columns a printed roster is
 * printed FOR. That endpoint is STAFF_ROLES and writes a student_access_logs
 * row per student, so an admin printing a roster with health information on it
 * is audited exactly like a teacher opening the same screen. Reusing it is what
 * keeps that true; a second query for the same data would not be logged.
 *
 * Blank columns ("Signature", "Notes") are the paper half of the ask — a
 * printed sign-in sheet is only useful with somewhere to sign.
 *
 * Choices persist per browser, like the classes export.
 */

const STORE_KEY = 'sis_roster_export'

const fmtTime = (hhmm) => {
  if (!hhmm) return ''
  const [h, m] = String(hhmm).split(':').map(Number)
  if (Number.isNaN(h)) return ''
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${ampm}`
}

const COLUMNS = [
  { key: 'name', label: 'Student', get: (s) => s.name, always: true },
  { key: 'preferred_name', label: 'Goes by', get: (s) => s.preferred_name || '' },
  { key: 'age', label: 'Age', get: (s) => (s.age == null ? '' : String(s.age)) },
  {
    key: 'next_class',
    label: 'Next class',
    get: (s) => {
      const n = s.next_class
      if (!n) return ''
      const loc = n.location ? ` (${n.location})` : ''
      const time = n.start_time ? ` @ ${fmtTime(n.start_time)}` : ''
      return `${n.name}${loc}${time}`
    },
  },
  {
    key: 'guardians',
    label: 'Guardians',
    get: (s) => (s.guardians || []).map((g) => g.name).filter(Boolean).join('; '),
  },
  {
    key: 'guardian_emails',
    label: 'Guardian emails',
    get: (s) => (s.guardians || []).map((g) => g.email).filter(Boolean).join('; '),
  },
  { key: 'household_name', label: 'Family', get: (s) => s.household_name || '' },
  { key: 'household_phone', label: 'Phone', get: (s) => s.household_phone || '' },
  { key: 'allergies', label: 'Allergies', get: (s) => s.allergies || '' },
  { key: 'medications', label: 'Medical', get: (s) => s.medications || '' },
  {
    key: 'attendance',
    label: 'Attendance',
    get: (s) => {
      const a = s.attendance
      if (!a) return ''
      const absent = (a.absent || 0) + (a.excused || 0)
      return `${a.present || 0} present / ${absent} absent`
    },
  },
  { key: 'enrolled_at', label: 'Enrolled', get: (s) => (s.enrolled_at || '').slice(0, 10) },
  // Paper-only columns: deliberately empty, so there is somewhere to write.
  { key: 'blank_signature', label: 'Signature', get: () => '' },
  { key: 'blank_notes', label: 'Notes', get: () => '' },
]

const DEFAULT_KEYS = ['name', 'age', 'guardians', 'household_phone', 'allergies']

const cell = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const slug = (s) => (s || 'class').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export default function ClassRosterExportModal({ classId, className, orgId, onClose }) {
  const [students, setStudents] = useState(null)
  const [keys, setKeys] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
      if (Array.isArray(saved) && saved.length) return saved
    } catch { /* first run, or a browser that refuses storage */ }
    return DEFAULT_KEYS
  })

  useEffect(() => {
    api.get(withOrg(`/api/sis/teacher/classes/${classId}/roster`, orgId))
      .then((r) => setStudents(r.data?.students || []))
      .catch((e) => {
        toast.error(e?.response?.data?.error || 'Failed to load the roster')
        setStudents([])
      })
  }, [classId, orgId])

  // 'name' is not optional — a roster of ages with nobody's name on it is not a
  // roster — so it is filtered back in rather than being un-tickable and then
  // silently re-added somewhere else.
  const chosen = useMemo(
    () => COLUMNS.filter((c) => c.always || keys.includes(c.key)), [keys])

  const toggle = (key) => setKeys((prev) => {
    const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })

  const rows = students || []

  const downloadCsv = () => {
    if (!rows.length) { toast.error('Nothing to export'); return }
    const csv = [
      chosen.map((c) => cell(c.label)).join(','),
      ...rows.map((s) => chosen.map((c) => cell(c.get(s))).join(',')),
    ].join('\r\n')
    // The BOM is what makes Excel open a UTF-8 CSV without mangling accented
    // names — same as the people export.
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `roster-${slug(className)}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} student${rows.length === 1 ? '' : 's'}`)
  }

  const print = () => { try { window.print() } catch { /* jsdom */ } }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5 space-y-4 sis-roster-export"
        role="dialog" aria-modal="true" aria-label="Print or export the class roster">
        {/* Reduce the printed page to the roster table: no modal chrome, no
            app shell, no column picker. */}
        <style>{`
          @media print {
            body * { visibility: hidden; }
            .sis-roster-print, .sis-roster-print * { visibility: visible; }
            .sis-roster-print { position: absolute; left: 0; top: 0; width: 100%; }
            .sis-roster-noprint { display: none !important; }
          }
        `}</style>

        <div className="flex items-center justify-between sis-roster-noprint">
          <h2 className="text-lg font-semibold text-neutral-900">Roster — {className}</h2>
          <button onClick={onClose} className="text-sm text-neutral-500 hover:text-neutral-800">Close</button>
        </div>

        <div className="sis-roster-noprint">
          <span className="block text-xs font-medium text-neutral-500 mb-1.5">Columns</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {COLUMNS.map((c) => (
              <label key={c.key}
                className={`flex items-center gap-1.5 text-sm ${c.always ? 'text-neutral-400' : 'text-neutral-700 cursor-pointer'}`}>
                <input type="checkbox" checked={c.always || keys.includes(c.key)}
                  disabled={c.always} onChange={() => toggle(c.key)}
                  className="h-4 w-4 rounded border-gray-300 accent-purple-700" />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        {students === null && <p className="text-sm text-neutral-400">Loading…</p>}
        {students !== null && !rows.length && (
          <p className="text-sm text-neutral-400">No students enrolled yet.</p>
        )}

        {!!rows.length && (
          <div className="sis-roster-print">
            <h1 className="hidden print:block text-lg font-bold mb-1">{className} — roster</h1>
            <p className="hidden print:block text-xs text-neutral-500 mb-3">
              {rows.length} student{rows.length === 1 ? '' : 's'} · {new Date().toLocaleDateString()}
            </p>
            <div className="overflow-x-auto border border-gray-200 rounded-lg print:border-0">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left bg-gray-50 print:bg-white border-b border-gray-300">
                    {chosen.map((c) => (
                      <th key={c.key} className="py-1.5 px-2 font-semibold whitespace-nowrap">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.student_id} className="border-b border-gray-200 align-top">
                      {chosen.map((c) => (
                        <td key={c.key}
                          className={`py-1.5 px-2 ${c.key === 'name' ? 'font-medium' : ''} ${c.key.startsWith('blank_') ? 'min-w-[7rem]' : ''}`}>
                          {c.get(s)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-1 sis-roster-noprint">
          <span className="text-xs text-neutral-500">
            {rows.length} student{rows.length === 1 ? '' : 's'} · {chosen.length} columns
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={print} disabled={!rows.length}>Print</Button>
            <Button size="sm" onClick={downloadCsv} disabled={!rows.length}>Download CSV</Button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}
