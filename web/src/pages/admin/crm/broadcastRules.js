/**
 * Rules for the mail-merge composer (BroadcastComposer.jsx). The server
 * renders and sends (services/crm_broadcast_service.py); the page owns the
 * billing sheet's arithmetic, because whatever the sheet says when Send is
 * pressed is what each school is told.
 */

// Sheet fields every school row has; extra columns are added by the user.
export const SHEET_FIELDS = ['student_count', 'price_per_student', 'amount_due', 'billing_note']

const RESERVED = new Set([
  'first_name', 'last_name', 'full_name', 'email', 'roles', 'school', 'children',
  'children_first_names', 'child_count', 'classes', 'billing_month', 'student_count',
  'student_list', 'price_per_student', 'amount_due', 'billing_note', 'today',
])

/** "Late fee ($)" -> "late_fee". Empty when nothing usable is left. */
export const columnKey = (label) =>
  (label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+$/, '')
    .slice(0, 40)

export const isReservedKey = (key) => RESERVED.has(key)

const toNumber = (value) => {
  const text = String(value ?? '').replace(/[$,\s]/g, '')
  if (!text) return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

/** students x price, as a plain number string ("1000.00"), or '' when either is not a number. */
export const computeAmount = (studentCount, price) => {
  const count = toNumber(studentCount)
  const each = toNumber(price)
  if (count === null || each === null) return ''
  return (Math.round(count * each * 100) / 100).toFixed(2)
}

/** The amount a row shows: the typed one once the user has edited it, otherwise count x price. */
export const rowAmount = (row) => (row.amount_edited ? row.amount_due : computeAmount(row.student_count, row.price_per_student))

export const nextMonth = (now = new Date()) => {
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** The sheet as the server takes it. */
export const sheetPayload = ({ month, columns, rows }) => ({
  month,
  columns,
  schools: Object.fromEntries(
    Object.entries(rows).map(([orgId, row]) => [
      orgId,
      {
        student_count: row.student_count,
        price_per_student: row.price_per_student,
        amount_due: rowAmount(row),
        billing_note: row.billing_note,
        ...Object.fromEntries(columns.map((c) => [c.key, row[c.key] || ''])),
      },
    ])
  ),
})

/** Distinct schools of the people on the list, in name order. */
export const schoolsOf = (recipients, orgName) =>
  [...new Set(recipients.map((p) => p.organization_id).filter(Boolean))].sort((a, b) =>
    (orgName[a] || '').localeCompare(orgName[b] || '')
  )
