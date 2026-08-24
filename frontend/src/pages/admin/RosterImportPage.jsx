import React, { useEffect, useMemo, useRef, useState } from 'react'
import api from '../../services/api'

// Schools that enroll offline send a finished roster instead of using the
// signup links. Pasting it here creates both accounts per row, links them, and
// emails each new account a set-your-password link.
//
// The roster is a grid rather than a paste box because the thing being edited
// is a spreadsheet: paste into any cell and the whole sheet lands, then fix the
// one typo in place instead of going back to Excel and re-pasting.
//
// Preview is not optional on the way to importing: this creates accounts for
// real families and emails all of them, so the superadmin reads what it is
// about to do first. Any edit drops the preview, because a plan built from
// different rows is not a plan for what's in the grid now.

// `header` is what we send back to the server; `label` is what fits in a column.
const COLUMNS = [
  { field: 'student_first', label: 'Student first', header: 'Student First Name' },
  { field: 'student_last', label: 'Student last', header: 'Student Last Name' },
  { field: 'student_email', label: 'Student email', header: 'Student Email', wide: true },
  { field: 'parent_first', label: 'Parent first', header: 'Parent First Name' },
  { field: 'parent_last', label: 'Parent last', header: 'Parent Last Name' },
  { field: 'parent_email', label: 'Parent email', header: 'Parent Email', wide: true },
]

// Header spellings we accept from a school's sheet. The backend does the same
// matching on the text we send it -- this copy only exists so a paste lands in
// the right columns before anyone sees it.
const HEADER_ALIASES = {
  'student first name': 'student_first', 'student first': 'student_first',
  'student last name': 'student_last', 'student last': 'student_last',
  'student email': 'student_email', 'student email address': 'student_email',
  'parent first name': 'parent_first', 'parent first': 'parent_first',
  'guardian first name': 'parent_first',
  'parent last name': 'parent_last', 'parent last': 'parent_last',
  'guardian last name': 'parent_last',
  'parent email': 'parent_email', 'parent email address': 'parent_email',
  'guardian email': 'parent_email',
}

let nextKey = 0
const blankRow = () => ({
  key: `r${nextKey++}`,
  student_first: '', student_last: '', student_email: '',
  parent_first: '', parent_last: '', parent_email: '',
})

const hasContent = row => COLUMNS.some(c => (row[c.field] || '').trim())

const normalizeHeader = value =>
  (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const splitLine = (line, delimiter) => {
  const cells = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i += 1 } else { quoted = !quoted }
    } else if (char === delimiter && !quoted) {
      cells.push(cell); cell = ''
    } else {
      cell += char
    }
  }
  cells.push(cell)
  return cells.map(c => c.trim())
}

// Pasted text -> rows. A header row tells us which column is which (and lets us
// ignore extras like User ID); without one we fall back to our own column order.
export const parseRoster = (text) => {
  const lines = (text || '').replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim())
  if (!lines.length) return []

  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const records = lines.map(line => splitLine(line, delimiter))

  const headerMap = {}
  records[0].forEach((cell, index) => {
    const field = HEADER_ALIASES[normalizeHeader(cell)]
    if (field && !Object.values(headerMap).includes(field)) headerMap[index] = field
  })
  const hasHeader = Object.keys(headerMap).length >= 2
  const body = hasHeader ? records.slice(1) : records

  return body.map(record => {
    const row = blankRow()
    record.forEach((cell, index) => {
      const field = hasHeader ? headerMap[index] : COLUMNS[index]?.field
      if (field) row[field] = cell
    })
    return row
  }).filter(hasContent)
}

// The grid goes back to the backend as the tab-separated sheet it came from, so
// there is exactly one parser and one validator of record -- the server's.
const toRosterText = (rows) => [
  COLUMNS.map(c => c.header).join('\t'),
  ...rows.map(row => COLUMNS.map(c => (row[c.field] || '').trim()).join('\t')),
].join('\n')

const StatusPill = ({ status }) => {
  const styles = {
    create: 'bg-green-100 text-green-800',
    created: 'bg-green-100 text-green-800',
    existing: 'bg-gray-100 text-gray-700',
    adopt: 'bg-blue-100 text-blue-800',
    adopted: 'bg-blue-100 text-blue-800',
    failed: 'bg-red-100 text-red-800',
  }
  const labels = {
    create: 'New', created: 'Created', existing: 'Exists',
    adopt: 'Joins org', adopted: 'Joined org', failed: 'Failed',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
      {labels[status] || status}
    </span>
  )
}

const Count = ({ label, value, tone = 'default' }) => (
  <div className="rounded-lg border border-gray-200 px-4 py-3">
    <div className={`text-2xl font-semibold ${tone === 'warn' ? 'text-red-600' : 'text-gray-900'}`}>{value}</div>
    <div className="text-xs text-gray-500 mt-0.5">{label}</div>
  </div>
)

export default function RosterImportPage() {
  const [organizations, setOrganizations] = useState([])
  const [orgId, setOrgId] = useState('')
  const [rows, setRows] = useState(() => [blankRow(), blankRow(), blankRow()])
  const [sendEmails, setSendEmails] = useState(true)
  const [preview, setPreview] = useState(null)
  const [outcome, setOutcome] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  // Which grid rows the preview was built from, so the server's row numbers
  // point back at the right cells.
  const previewedKeys = useRef([])

  useEffect(() => {
    api.get('/api/admin/organizations')
      .then(({ data }) => {
        const orgs = data?.organizations || []
        setOrganizations(orgs)
        const hearthwood = orgs.find(o => o.slug === 'hearthwood')
        if (hearthwood) setOrgId(hearthwood.id)
      })
      .catch(() => setError('Could not load the organization list'))
  }, [])

  const orgName = useMemo(
    () => organizations.find(o => o.id === orgId)?.name || 'this organization',
    [organizations, orgId]
  )

  const filledRows = useMemo(() => rows.filter(hasContent), [rows])
  const clearPlan = () => { setPreview(null); setOutcome(null); setError(null) }

  const setCell = (key, field, value) => {
    setRows(prev => prev.map(row => (row.key === key ? { ...row, [field]: value } : row)))
    clearPlan()
  }

  const handlePaste = (event, rowIndex) => {
    const text = event.clipboardData.getData('text/plain')
    if (!/[\t\n]/.test(text)) return  // a single value: let the browser paste it
    const parsed = parseRoster(text)
    if (!parsed.length) return
    event.preventDefault()
    setRows(prev => {
      const next = [...prev.slice(0, rowIndex), ...parsed, ...prev.slice(rowIndex + parsed.length)]
      return next.some(row => !hasContent(row)) ? next : [...next, blankRow()]
    })
    clearPlan()
  }

  const addRow = () => { setRows(prev => [...prev, blankRow()]); clearPlan() }
  const removeRow = (key) => {
    setRows(prev => (prev.length > 1 ? prev.filter(row => row.key !== key) : [blankRow()]))
    clearPlan()
  }
  const clearGrid = () => { setRows([blankRow(), blankRow(), blankRow()]); clearPlan() }

  const run = async (step) => {
    setBusy(step)
    setError(null)
    if (step === 'preview') previewedKeys.current = filledRows.map(row => row.key)
    try {
      const { data } = await api.post(`/api/admin/roster-import/${step}`, {
        csv: toRosterText(filledRows),
        organization_id: orgId,
        ...(step === 'commit' ? { send_emails: sendEmails } : {}),
      })
      if (step === 'preview') { setPreview(data); setOutcome(null) } else { setOutcome(data) }
    } catch (e) {
      const body = e?.response?.data
      setError(body?.error || 'Something went wrong')
      if (body?.row_errors) setPreview(p => (p ? { ...p, row_errors: body.row_errors } : p))
    } finally {
      setBusy(null)
    }
  }

  // Server row numbers count the header, so the Nth sent row is row N+2.
  const keyForServerRow = row => previewedKeys.current[row - 2]
  const rowErrorFor = key => preview?.row_errors?.find(e => keyForServerRow(e.row) === key)
  const studentFor = key => preview?.students?.find(s => keyForServerRow(s.row) === key)
  const parentFor = email =>
    preview?.parents?.find(p => p.email === (email || '').trim().toLowerCase())

  const counts = preview?.counts
  const totalAccounts = counts ? counts.students_new + counts.parents_new : 0

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      <h1 className="text-3xl font-bold">Roster Import</h1>
      <p className="text-gray-600 mt-2 mb-8">
        For schools that enroll families offline and send a roster instead of using the signup
        links. Each row creates a student account and a parent account, links them together, and
        emails each new account a link to set their own password. Anyone who already has an Optio
        account is linked, not recreated, and is not emailed. A student with no email of their own
        is created as a parent-managed profile instead: the parent signs in and manages them, and
        no invite is sent for the student.
      </p>

      <div>
        <label htmlFor="roster-org" className="block text-sm font-medium text-gray-700 mb-1">
          Organization
        </label>
        <select
          id="roster-org"
          value={orgId}
          onChange={e => { setOrgId(e.target.value); clearPlan() }}
          className="w-full max-w-md border border-gray-300 rounded-lg px-3 py-2"
        >
          <option value="">Select an organization</option>
          {organizations.map(org => (
            <option key={org.id} value={org.id}>{org.name}</option>
          ))}
        </select>
      </div>

      <div className="mt-6">
        <div className="flex items-end justify-between gap-3 mb-2">
          <div>
            <h2 className="text-sm font-medium text-gray-700">Roster</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Paste straight from the spreadsheet into any cell and the whole roster fills in.
              Header rows and extra columns such as User ID are handled. Cells stay editable, so a
              typo gets fixed here rather than back in the sheet. Student email may be left blank
              when the row has a parent email — that student becomes a parent-managed profile.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={addRow} className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg">
              Add row
            </button>
            <button onClick={clearGrid} className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg">
              Clear
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-600">
                <th className="w-10 py-2 px-2 font-medium text-xs">#</th>
                {COLUMNS.map(column => (
                  <th key={column.field} className="py-2 px-2 font-medium text-xs">{column.label}</th>
                ))}
                {preview && <th className="py-2 px-2 font-medium text-xs">Status</th>}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const rowError = rowErrorFor(row.key)
                const student = studentFor(row.key)
                const parent = parentFor(row.parent_email)
                return (
                  <React.Fragment key={row.key}>
                    <tr className={rowError ? 'bg-red-50' : ''}>
                      <td className="py-1 px-2 text-xs text-gray-400">{index + 1}</td>
                      {COLUMNS.map((column, columnIndex) => (
                        <td key={column.field} className="py-1 px-1">
                          <input
                            aria-label={`${column.label} row ${index + 1}`}
                            value={row[column.field]}
                            onChange={e => setCell(row.key, column.field, e.target.value)}
                            onPaste={columnIndex === 0 ? e => handlePaste(e, index) : undefined}
                            spellCheck={false}
                            className={`w-full px-2 py-1 rounded border ${
                              rowError ? 'border-red-300' : 'border-transparent hover:border-gray-200'
                            } focus:border-optio-purple focus:outline-none ${column.wide ? 'min-w-[15rem]' : 'min-w-[7rem]'}`}
                          />
                        </td>
                      ))}
                      {preview && (
                        <td className="py-1 px-2 whitespace-nowrap space-x-1">
                          {student && <StatusPill status={student.status} />}
                          {student?.dependent && (
                            <span className="text-xs text-gray-500">managed profile</span>
                          )}
                          {parent && student && (
                            <span className="text-xs text-gray-500">
                              parent: {{ create: 'new', adopt: 'joins org' }[parent.status] || 'exists'}
                            </span>
                          )}
                        </td>
                      )}
                      <td className="py-1 px-2">
                        <button
                          onClick={() => removeRow(row.key)}
                          aria-label={`Remove row ${index + 1}`}
                          className="text-gray-400 hover:text-red-600 px-1"
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                    {rowError && (
                      <tr className="bg-red-50">
                        <td />
                        <td colSpan={COLUMNS.length + (preview ? 2 : 1)}
                            className="pb-2 px-2 text-xs text-red-800">
                          {rowError.errors.join('; ')}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        <button
          onClick={() => run('preview')}
          disabled={!orgId || !filledRows.length || busy}
          className="btn-primary mt-4 disabled:opacity-50"
        >
          {busy === 'preview' ? 'Checking...' : 'Preview import'}
        </button>
      </div>

      {error && (
        <div className="mt-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-800">
          {error}
        </div>
      )}

      {preview && (
        <div className="mt-8 border-t pt-8">
          <h2 className="text-xl font-semibold mb-4">Preview</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Count label="New students" value={counts.students_new} />
            <Count label="New parents" value={counts.parents_new} />
            {counts.dependents_new > 0 && (
              <Count label="Managed profiles" value={counts.dependents_new} />
            )}
            <Count label="Already exist" value={counts.students_existing + counts.parents_existing} />
            <Count label="Joining this org" value={counts.adopted} />
            <Count label="Parent links" value={counts.links} />
            <Count label="Invalid rows" value={counts.invalid_rows} tone={counts.invalid_rows ? 'warn' : 'default'} />
          </div>

          {preview.warnings?.map(warning => (
            <div key={warning} className="mt-4 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-yellow-900 text-sm">
              {warning}
            </div>
          ))}

          {preview.row_errors?.length > 0 && (
            <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-800 text-sm">
              Fix the {preview.row_errors.length} highlighted row
              {preview.row_errors.length === 1 ? '' : 's'} above, then preview again.
            </div>
          )}

          {preview.can_import && !outcome && (
            <div className="mt-6 rounded-lg bg-gray-50 border border-gray-200 p-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sendEmails}
                  onChange={e => setSendEmails(e.target.checked)}
                />
                Email each new account a link to set their password
              </label>
              <button
                onClick={() => run('commit')}
                disabled={busy}
                className="btn-primary mt-4 disabled:opacity-50"
              >
                {busy === 'commit'
                  ? 'Importing...'
                  : `Create ${totalAccounts} account${totalAccounts === 1 ? '' : 's'} in ${orgName}`}
              </button>
            </div>
          )}
        </div>
      )}

      {outcome && (
        <div className="mt-8 border-t pt-8">
          {/* Naming the org here rather than just in the button: the accounts are
              only findable in that org's SIS People tab, and the org selector is
              easy to skip past on the way to pasting. */}
          <h2 className="text-xl font-semibold">
            Import complete &mdash; {outcome.organization?.name || orgName}
          </h2>
          <p className="text-sm text-gray-600 mt-1 mb-4">
            These accounts are in {outcome.organization?.name || orgName}. Switch the SIS
            console to that organization to see them under People.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Count label="Created" value={outcome.counts.created} />
            <Count label="Already existed" value={outcome.counts.existing} />
            <Count label="Joined this org" value={outcome.counts.adopted} />
            <Count label="Linked" value={outcome.counts.linked} />
            <Count label="Emails sent" value={outcome.counts.invited}
                   tone={sendEmails && outcome.counts.created > outcome.counts.invited ? 'warn' : 'default'} />
            <Count label="Failed" value={outcome.counts.failed} tone={outcome.counts.failed ? 'warn' : 'default'} />
          </div>

          {sendEmails && outcome.counts.invited < outcome.counts.created && (
            // A silent 0 here is what a missing BREVO_API_KEY looks like, and
            // "5 created" reads as success at a glance.
            <div className="mt-4 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-yellow-900 text-sm">
              {outcome.counts.created - outcome.counts.invited} of {outcome.counts.created} new
              accounts were not emailed. The accounts exist, but nobody has been told how to set a
              password. On localhost this is expected: no mail is sent without a Brevo API key.
            </div>
          )}

          <table className="w-full mt-6 text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 font-medium">Account</th>
                <th className="py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {outcome.results.map(result => (
                <tr key={`${result.kind}-${result.row}-${result.email || result.name}`}
                    className="border-b last:border-0">
                  <td className="py-2">
                    {result.name} <span className="text-xs text-gray-500">({result.kind})</span>
                    <div className="text-xs text-gray-500">
                      {result.email
                        || (result.dependent ? 'managed profile — no email, parent signs in' : '')}
                    </div>
                  </td>
                  <td className="py-2 space-x-2">
                    <StatusPill status={result.status} />
                    {result.invited && <span className="text-xs text-gray-600">emailed</span>}
                    {result.linked_to && <span className="text-xs text-gray-600">linked</span>}
                    {result.error && <span className="text-xs text-red-700">{result.error}</span>}
                    {result.link_error && (
                      <span className="text-xs text-red-700">account created, link failed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
