import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import ModalOverlay from '../ui/ModalOverlay'
import Button from '../ui/Button'
import { withOrg } from '../../pages/sis/useSisOrg'

/**
 * Download people from the People page as a CSV, choosing the columns.
 *
 * The old export was a fixed fourteen columns, which meant the office got a
 * spreadsheet with everything on it and deleted two thirds by hand for every
 * actual use — a mailing list, a contact sheet, a medical list. Same picker
 * idea as ClassesExportModal, and for the same reason.
 *
 * It exports the rows the table is SHOWING: same search, same filters, same
 * sort. That property is load-bearing (the server-side export it replaced
 * dumped the whole org, so filtering to students still exported parents), so
 * the rows arrive as a prop and this component never re-fetches them.
 *
 * Guardians, family phone and emergency contacts are not on the roster payload
 * — they cost three org-wide reads that the People page has no use for. They
 * are fetched here, once, when the dialog opens, and merged onto the rows by
 * user id. Tick none of those columns and the request still happens but nothing
 * waits on it; tick one and the export waits for it rather than silently
 * writing blanks.
 *
 * Column choices persist per browser.
 */

const STORE_KEY = 'sis_people_export'

const joinContacts = (list, fmt) => (list || []).map(fmt).filter(Boolean).join('; ')

// `needsDetails` marks a column that comes from /roster/export-details rather
// than from the roster row itself.
const COLUMNS = [
  // Order matters: `chosen` filters this list, so this IS the column order of
  // the file. The default selection below is the old fixed export, in the old
  // order, under the old headings — an office with a spreadsheet built on last
  // term's download gets the same file until they change something.
  { key: 'name', label: 'Name', get: (p) => p.name, always: true },
  { key: 'first_name', label: 'First Name', get: (p) => p.first_name || '' },
  { key: 'last_name', label: 'Last Name', get: (p) => p.last_name || '' },
  { key: 'preferred_name', label: 'Goes By', get: (p) => p.preferred_name || '' },
  { key: 'age', label: 'Age', get: (p) => (p.age == null ? '' : String(p.age)) },
  { key: 'date_of_birth', label: 'Date of Birth', get: (p) => p.date_of_birth || '' },
  { key: 'gender', label: 'Gender', get: (p) => p.gender || '' },
  {
    key: 'role',
    label: 'Role',
    get: (p) => (p.roles?.length ? p.roles : [p.role]).filter(Boolean).join(' / '),
  },
  { key: 'email', label: 'Email', get: (p) => p.email || '' },
  { key: 'phone_number', label: 'Phone', get: (p) => p.phone_number || '' },
  { key: 'username', label: 'Username', get: (p) => p.username || '' },
  { key: 'enrollment_status', label: 'Enrollment Status', get: (p) => p.enrollment_status || '' },
  { key: 'grade_level', label: 'Grade Level', get: (p) => p.grade_level || '' },
  { key: 'household_name', label: 'Family', get: (p) => p.household_name || '' },
  {
    key: 'household_phone',
    label: 'Family Phone',
    needsDetails: true,
    get: (p, d) => d?.household_phone || '',
  },
  {
    key: 'guardians',
    label: 'Guardians',
    needsDetails: true,
    get: (p, d) => joinContacts(d?.guardians, (g) => g.name),
  },
  {
    key: 'guardian_emails',
    label: 'Guardian Emails',
    needsDetails: true,
    get: (p, d) => joinContacts(d?.guardians, (g) => g.email),
  },
  {
    key: 'emergency_contacts',
    label: 'Emergency Contacts',
    needsDetails: true,
    get: (p, d) => joinContacts(d?.emergency_contacts, (c) => (
      [c.name, c.relationship, c.phone].filter(Boolean).join(' — ')
    )),
  },
  {
    key: 'pickup_authorized',
    label: 'Authorized for Pickup',
    needsDetails: true,
    get: (p, d) => joinContacts(
      (d?.emergency_contacts || []).filter((c) => c.can_pickup), (c) => c.name),
  },
  { key: 'allergies', label: 'Allergies', get: (p) => p.allergies || '' },
  { key: 'medications', label: 'Medical', get: (p) => p.medications || '' },
  { key: 'start_date', label: 'Start Date', get: (p) => p.start_date || '' },
  { key: 'total_xp', label: 'Total XP', get: (p) => String(p.total_xp ?? 0) },
  { key: 'last_active', label: 'Last Active', get: (p) => p.last_active || '' },
]

// The columns the fixed export used to write, so "just export it" is unchanged.
const DEFAULT_KEYS = ['name', 'first_name', 'last_name', 'age', 'date_of_birth', 'role',
                      'email', 'phone_number', 'username', 'enrollment_status',
                      'grade_level', 'household_name', 'total_xp', 'last_active']

const GROUPS = [
  { title: 'Identity', keys: ['name', 'first_name', 'last_name', 'preferred_name', 'age', 'date_of_birth', 'gender', 'role'] },
  { title: 'Contact', keys: ['email', 'phone_number', 'username', 'household_name', 'household_phone'] },
  { title: 'Family & emergency', keys: ['guardians', 'guardian_emails', 'emergency_contacts', 'pickup_authorized'] },
  { title: 'Health', keys: ['allergies', 'medications'] },
  { title: 'Enrollment', keys: ['enrollment_status', 'grade_level', 'start_date', 'total_xp', 'last_active'] },
]

const cell = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function PeopleExportModal({ rows = [], orgId, studentsOnly = false, onClose }) {
  const [keys, setKeys] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
      if (Array.isArray(saved) && saved.length) return saved
    } catch { /* first run, or a browser that refuses storage */ }
    return DEFAULT_KEYS
  })
  const [details, setDetails] = useState(null)   // null = still loading

  useEffect(() => {
    if (!orgId) { setDetails({}); return }
    api.get(withOrg('/api/sis/roster/export-details', orgId))
      .then((r) => setDetails(r.data?.details || {}))
      // An empty object, not a failure: the columns that need it come out blank
      // and everything else still exports. Losing a phone column is a smaller
      // problem than losing the export.
      .catch(() => setDetails({}))
  }, [orgId])

  const chosen = useMemo(
    () => COLUMNS.filter((c) => c.always || keys.includes(c.key)), [keys])
  const needsDetails = chosen.some((c) => c.needsDetails)

  const toggle = (key) => setKeys((prev) => {
    const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })

  const setGroup = (group, on) => setKeys((prev) => {
    const optional = group.keys.filter((k) => !COLUMNS.find((c) => c.key === k)?.always)
    const next = on
      ? [...new Set([...prev, ...optional])]
      : prev.filter((k) => !optional.includes(k))
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })

  // Waiting only matters when a chosen column actually comes from the lookup;
  // an export of plain roster columns never blocks on it.
  const waiting = needsDetails && details === null

  const download = () => {
    if (!rows.length) { toast.error('Nothing to export'); return }
    const byUser = details || {}
    const csv = [
      chosen.map((c) => cell(c.label)).join(','),
      ...rows.map((p) => chosen
        .map((c) => cell(c.get(p, byUser[p.student_id]))).join(',')),
    ].join('\r\n')
    // The BOM keeps Excel from mangling accented names in a UTF-8 CSV.
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `people${studentsOnly ? '-students' : ''}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} ${rows.length === 1 ? 'person' : 'people'}`)
    onClose()
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4"
        role="dialog" aria-modal="true" aria-label="Export people as a CSV">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Export people</h2>
          <button onClick={onClose} className="text-sm text-neutral-500 hover:text-neutral-800">Close</button>
        </div>

        <p className="text-sm text-neutral-600">
          Exports the {rows.length} {rows.length === 1 ? 'person' : 'people'} the table is
          showing, with your filters and sort applied.
        </p>

        <div className="space-y-3">
          {GROUPS.map((g) => {
            const cols = g.keys.map((k) => COLUMNS.find((c) => c.key === k)).filter(Boolean)
            const allOn = cols.every((c) => c.always || keys.includes(c.key))
            return (
              <div key={g.title} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                    {g.title}
                  </span>
                  <button onClick={() => setGroup(g, !allOn)}
                    className="text-xs text-optio-purple hover:underline">
                    {allOn ? 'Clear' : 'Select all'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {cols.map((c) => (
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
            )
          })}
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-neutral-500">{chosen.length} columns</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={download} disabled={waiting || !rows.length}>
              {waiting ? 'Loading contacts…' : 'Download CSV'}
            </Button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}
