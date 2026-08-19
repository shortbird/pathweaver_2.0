import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

const money = (cents) => `$${((cents || 0) / 100).toFixed(2)}`
const pct = (rate) => (rate == null ? '—' : `${Math.round(rate * 100)}%`)

const Stat = ({ label, value, hint }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-4">
    <div className="text-sm text-neutral-500">{label}</div>
    <div className="text-2xl font-bold text-neutral-900 mt-1">{value}</div>
    {hint && <div className="text-[11px] text-neutral-400 mt-1 leading-tight">{hint}</div>}
  </div>
)

// Hide everything except the results table when printing.
const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  .sis-report-print, .sis-report-print * { visibility: visible; }
  .sis-report-print { position: absolute; left: 0; top: 0; width: 100%; }
  .sis-report-print .no-print { display: none; }
}
`

const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

// Turn each report's JSON payload into a generic {title, columns, rows} table.
const shapeReport = (type, data, questionLabel) => {
  const report = data?.report || {}
  if (type === 'medications') {
    return {
      title: 'Medications',
      columns: ['Student', 'Medications', 'Schedule / Notes', 'Parent', 'Parent phone', 'Emergency contact 1'],
      rows: (report.rows || []).map((r) => [
        r.student, r.medications, r.notes, r.parent, r.parent_phone, r.emergency_contact,
      ]),
    }
  }
  if (type === 'allergies') {
    return {
      title: 'Allergies',
      columns: ['Student', 'Allergies', 'Notes', 'Parent', 'Parent phone', 'Emergency contact 1'],
      rows: (report.rows || []).map((r) => [
        r.student, r.allergies, r.notes, r.parent, r.parent_phone, r.emergency_contact,
      ]),
    }
  }
  if (type === 'daily-attendance') {
    return {
      title: `Daily attendance${report.date ? ` — ${report.date}` : ''}`,
      columns: ['Student', 'Class', 'Status', 'Excused?', 'Reason'],
      rows: (report.rows || []).map((r) => [r.student, r.class, r.status, r.excused, r.reason]),
    }
  }
  if (type === 'media-release') {
    const questions = report.questions || []
    return {
      title: 'Media release',
      columns: ['Student', 'Family', ...questions.map((q) => q.label), 'Parent'],
      rows: (report.rows || []).map((r) => [
        r.student, r.family, ...questions.map((q) => r.answers?.[q.key] ?? ''), r.parent,
      ]),
    }
  }
  return {
    title: report.question?.label || questionLabel || 'Question report',
    columns: ['Student', 'Family', 'Parent', 'Parent email', 'Answer', 'Status'],
    rows: (report.rows || []).map((r) => [
      r.student, r.family, r.parent, r.parent_email, r.answer, r.status,
    ]),
  }
}

// The class report's column choice, remembered per browser like the Classes
// page export chooser. Field definitions come from the API with the report, so
// the picker can never list a column the CSV doesn't know how to write.
const CLASS_COLS_KEY = 'sis_class_report_cols'
const ROSTER_COLS_KEY = 'sis_roster_report_cols'

const loadClassCols = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(CLASS_COLS_KEY))
    return Array.isArray(saved) && saved.length ? saved : null
  } catch { return null }
}

const saveCols = (key, cols) => {
  try { localStorage.setItem(key, JSON.stringify(cols)) } catch { /* ignore */ }
}
const saveClassCols = (cols) => saveCols(CLASS_COLS_KEY, cols)

const loadRosterCols = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(ROSTER_COLS_KEY))
    return Array.isArray(saved) && saved.length ? saved : null
  } catch { return null }
}

// Shape a field-picker report (classes, rosters) for the shared table, using
// the caller's column choice.
export const shapeClassReport = (data, selected, title = 'Class report') => {
  const report = data?.report || {}
  const fields = report.fields || []
  const keys = fields.map((f) => f.key).filter((k) => (selected || report.selected || []).includes(k))
  return {
    title,
    columns: keys.map((k) => fields.find((f) => f.key === k)?.label || k),
    rows: (report.rows || []).map((r) => keys.map((k) => r[k])),
    fields,
    selected: keys,
    raw: report.rows || [],
  }
}

const ReportCard = ({ title, description, children }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col">
    <div className="font-semibold text-neutral-900">{title}</div>
    <p className="text-sm text-neutral-500 mt-1 flex-1">{description}</p>
    <div className="mt-3">{children}</div>
  </div>
)

const RunButton = ({ onClick, disabled, ariaLabel, children = 'View report' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={ariaLabel}
    className="px-4 py-2 rounded-lg text-white text-sm font-medium bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 disabled:opacity-50"
  >
    {children}
  </button>
)

const ReportsPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [enrollment, setEnrollment] = useState(null)
  const [revenue, setRevenue] = useState(null)
  const [attendance, setAttendance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState([])
  const [questionKey, setQuestionKey] = useState('')
  const [report, setReport] = useState(null)          // {title, columns, rows, csvUrl, csvName}
  const [reportLoading, setReportLoading] = useState(false)
  const [sort, setSort] = useState({ col: 0, dir: 'asc' })  // report table sort
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [classCols, setClassCols] = useState(loadClassCols)      // null until first run
  const [includeArchived, setIncludeArchived] = useState(false)
  // Roster report: which classes, and whether waitlisted students come too.
  const [classList, setClassList] = useState([])
  const [rosterClassIds, setRosterClassIds] = useState([])
  const [includeWaitlist, setIncludeWaitlist] = useState(false)
  const [rosterCols, setRosterCols] = useState(loadRosterCols)

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      api.get(withOrg('/api/sis/reports/enrollment', orgId)),
      api.get(withOrg('/api/sis/reports/revenue', orgId)),
      api.get(withOrg('/api/sis/reports/attendance', orgId)),
    ])
      .then(([e, r, a]) => {
        setEnrollment(e.data?.report || null)
        setRevenue(r.data?.report || null)
        setAttendance(a.data?.report || null)
      })
      .catch(() => toast.error('Failed to load reports'))
      .finally(() => setLoading(false))
    api.get(withOrg('/api/sis/reports/registration-questions', orgId))
      .then((res) => setQuestions(res.data?.questions || []))
      .catch(() => setQuestions([]))
    api.get(withOrg('/api/sis/classes', orgId))
      .then((res) => setClassList(res.data?.classes || []))
      .catch(() => setClassList([]))
  }, [orgId])

  useEffect(() => { load() }, [load])
  useEffect(() => { setReport(null); setQuestionKey(''); setRosterClassIds([]) }, [orgId])
  // Reset the table sort whenever a different report is shown.
  useEffect(() => { setSort({ col: 0, dir: 'asc' }) }, [report?.title])

  const toggleSort = (col) => setSort((s) => (
    s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }
  ))

  // Rows to render, sorted by the active column.
  const displayRows = React.useMemo(() => {
    if (!report) return []
    const { col, dir } = sort
    return [...report.rows].sort((a, b) => {
      const av = String(a[col] ?? '').toLowerCase()
      const bv = String(b[col] ?? '').toLowerCase()
      const n = av.localeCompare(bv, undefined, { numeric: true })
      return dir === 'asc' ? n : -n
    })
  }, [report, sort])

  // The class report's CSV must download exactly the columns on screen.
  const classPath = useCallback((cols) => (
    `/api/sis/reports/classes?include_archived=${includeArchived}`
    + (cols?.length ? `&fields=${cols.join(',')}` : '')
  ), [includeArchived])

  const rosterPath = useCallback((cols) => (
    `/api/sis/reports/rosters?class_ids=${rosterClassIds.join(',')}`
    + `&include_waitlist=${includeWaitlist}`
    + (cols?.length ? `&fields=${cols.join(',')}` : '')
  ), [rosterClassIds, includeWaitlist])

  const runReport = useCallback(async (type, key) => {
    let path = `/api/sis/reports/${type}`
    if (type === 'question') path = `/api/sis/reports/registration-answers?question_key=${encodeURIComponent(key)}`
    else if (type === 'daily-attendance') path = `/api/sis/reports/daily-attendance?date=${attendanceDate}`
    else if (type === 'classes') path = classPath(classCols)
    else if (type === 'rosters') path = rosterPath(rosterCols)
    setReportLoading(true)
    try {
      const res = await api.get(withOrg(path, orgId))
      if (type === 'classes') {
        // No saved choice yet: adopt whatever the API says the defaults are.
        const shaped = shapeClassReport(res.data, classCols)
        setClassCols(shaped.selected)
        setReport({ ...shaped, kind: 'classes', csvPath: classPath(shaped.selected), csvName: 'classes.csv' })
        return
      }
      if (type === 'rosters') {
        const shaped = shapeClassReport(res.data, rosterCols, 'Class rosters')
        setRosterCols(shaped.selected)
        setReport({ ...shaped, kind: 'rosters', csvPath: rosterPath(shaped.selected), csvName: 'rosters.csv' })
        return
      }
      const label = questions.find((q) => q.key === key)?.label
      const shaped = shapeReport(type, res.data, label)
      setReport({
        ...shaped,
        csvPath: path,
        csvName: type === 'question' ? `registration-answers-${key}.csv`
          : type === 'daily-attendance' ? `daily-attendance-${attendanceDate}.csv` : `${type}.csv`,
      })
    } catch {
      toast.error('Failed to load report')
    } finally {
      setReportLoading(false)
    }
  }, [orgId, questions, attendanceDate, classCols, classPath, rosterCols, rosterPath])

  // Toggling a column re-shapes the rows already loaded — every field comes
  // back with the report, so changing the view never refetches.
  const toggleClassCol = useCallback((fieldKey) => {
    if (!report?.fields) return
    // Keep the API's field order regardless of the order columns were ticked.
    const next = report.fields.map((f) => f.key)
      .filter((k) => (k === fieldKey ? !report.selected.includes(k) : report.selected.includes(k)))
    if (!next.length) return   // never leave the table with no columns
    const isRoster = report.kind === 'rosters'
    if (isRoster) { setRosterCols(next); saveCols(ROSTER_COLS_KEY, next) }
    else { setClassCols(next); saveClassCols(next) }
    setSort({ col: 0, dir: 'asc' })
    setReport({
      ...report,
      columns: next.map((k) => report.fields.find((f) => f.key === k)?.label || k),
      rows: report.raw.map((r) => next.map((k) => r[k])),
      selected: next,
      csvPath: isRoster ? rosterPath(next) : classPath(next),
    })
  }, [report, classPath, rosterPath])

  const downloadCsv = useCallback(async () => {
    if (!report) return
    try {
      const sep = report.csvPath.includes('?') ? '&' : '?'
      const res = await api.get(withOrg(`${report.csvPath}${sep}format=csv`, orgId), { responseType: 'blob' })
      downloadBlob(res.data, report.csvName)
    } catch {
      toast.error('Failed to download CSV')
    }
  }, [report, orgId])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Reports</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      {loading && <p className="text-neutral-500">Loading…</p>}

      {!loading && (
        <div className="space-y-8">
          <section>
            <style>{PRINT_CSS}</style>
            <h2 className="font-semibold text-neutral-900 mb-3">Information reports</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ReportCard
                title="Medications"
                description="Every student who needs a medication, with schedule notes, parent contact, and emergency contact."
              >
                <RunButton disabled={reportLoading || !orgId} onClick={() => runReport('medications')} />
              </ReportCard>
              <ReportCard
                title="Allergies"
                description="Every student with a recorded allergy, with notes, parent contact, and emergency contact. Only students who have an allergy are listed."
              >
                <RunButton disabled={reportLoading || !orgId} onClick={() => runReport('allergies')} />
              </ReportCard>
              <ReportCard
                title="Daily attendance"
                description="For one day, every student who was absent, late, or reported out — flagged excused vs. unexcused, across all classes."
              >
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    aria-label="Attendance date"
                    value={attendanceDate}
                    onChange={(e) => setAttendanceDate(e.target.value)}
                    className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <RunButton disabled={reportLoading || !orgId} onClick={() => runReport('daily-attendance')} />
                </div>
              </ReportCard>
              <ReportCard
                title="Media release"
                description="Who has and hasn't approved the photo and media release, per student. Unanswered families show as Not answered."
              >
                <RunButton disabled={reportLoading || !orgId} onClick={() => runReport('media-release')} />
              </ReportCard>
              <ReportCard
                title="Class report"
                description="One row per class — teacher, days and time, room, tuition, supply fee, curriculum, and more. Pick the columns after you run it."
              >
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-sm text-neutral-600">
                    <input
                      type="checkbox"
                      aria-label="Include archived classes"
                      className="accent-optio-purple"
                      checked={includeArchived}
                      onChange={(e) => setIncludeArchived(e.target.checked)}
                    />
                    Include archived
                  </label>
                  <RunButton ariaLabel="View class report" disabled={reportLoading || !orgId}
                    onClick={() => runReport('classes')} />
                </div>
              </ReportCard>
              {/* iCreate asked for this four times (Perch ff701e99, 0334366b,
                  90b91553, 00877fea). Printing one class shipped on the Classes
                  page; this is "multiple class rosters/waitlists into one
                  spreadsheet", with the field picker they asked for. */}
              <ReportCard
                title="Class rosters"
                description="Students across as many classes as you like, in one sheet — guardians, contacts, ages. Pick the columns after you run it."
              >
                <div className="space-y-2">
                  <select
                    multiple
                    aria-label="Classes"
                    size={Math.min(6, Math.max(3, classList.length))}
                    value={rosterClassIds}
                    onChange={(e) => setRosterClassIds(
                      Array.from(e.target.selectedOptions, (o) => o.value))}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                  >
                    {classList.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <button type="button"
                        onClick={() => setRosterClassIds(
                          rosterClassIds.length === classList.length ? [] : classList.map((c) => c.id))}
                        className="text-xs text-optio-purple hover:underline">
                        {rosterClassIds.length === classList.length ? 'Clear' : 'Select all'}
                      </button>
                      <label className="flex items-center gap-1.5 text-sm text-neutral-600">
                        <input type="checkbox" aria-label="Include waitlisted students"
                          className="accent-optio-purple"
                          checked={includeWaitlist}
                          onChange={(e) => setIncludeWaitlist(e.target.checked)} />
                        Include waitlist
                      </label>
                    </div>
                    <RunButton ariaLabel="View roster report"
                      disabled={reportLoading || !orgId || !rosterClassIds.length}
                      onClick={() => runReport('rosters')} />
                  </div>
                  {!rosterClassIds.length && (
                    <p className="text-xs text-neutral-400">Choose one or more classes.</p>
                  )}
                </div>
              </ReportCard>
              <ReportCard
                title="Question report"
                description="Every family's (or student's) answer to one registration question."
              >
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Registration question"
                    value={questionKey}
                    onChange={(e) => setQuestionKey(e.target.value)}
                    className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Choose a question…</option>
                    {questions.map((q) => (
                      <option key={q.key} value={q.key}>{q.label}</option>
                    ))}
                  </select>
                  <RunButton
                    disabled={reportLoading || !orgId || !questionKey}
                    onClick={() => runReport('question', questionKey)}
                  />
                </div>
              </ReportCard>
            </div>

            {reportLoading && <p className="text-neutral-500 mt-4">Loading report…</p>}

            {!reportLoading && report && (
              <div className="sis-report-print bg-white rounded-xl border border-gray-200 p-4 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-neutral-900">{report.title}</h3>
                  <div className="no-print flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50"
                    >
                      Print
                    </button>
                    <button
                      type="button"
                      onClick={downloadCsv}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50"
                    >
                      Download CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => setReport(null)}
                      className="px-3 py-1.5 rounded-lg text-sm text-neutral-500 hover:bg-gray-50"
                    >
                      Close
                    </button>
                  </div>
                </div>
                {report.fields && (
                  <fieldset className="no-print mb-4 border-t border-gray-100 pt-3">
                    <legend className="sr-only">Columns</legend>
                    <div className="text-sm font-medium text-neutral-700 mb-2">Columns</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
                      {report.fields.map((f) => (
                        <label key={f.key} className="flex items-start gap-2 text-sm text-neutral-700 cursor-pointer">
                          <input
                            type="checkbox"
                            aria-label={f.label}
                            className="mt-0.5 accent-optio-purple shrink-0"
                            checked={report.selected.includes(f.key)}
                            onChange={() => toggleClassCol(f.key)}
                          />
                          <span className="leading-tight">
                            <span className="block font-medium text-neutral-800">{f.label}</span>
                            {f.hint && <span className="block text-[11px] text-neutral-500">{f.hint}</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                {displayRows.length === 0 ? (
                  <p className="text-neutral-500">No matching records.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left border-b border-gray-200">
                          {report.columns.map((c, j) => (
                            <th key={c} className="py-2 pr-4 font-semibold text-neutral-700">
                              <button type="button" onClick={() => toggleSort(j)}
                                className="inline-flex items-center gap-1 hover:text-optio-purple">
                                {c}
                                <span className="text-[10px] text-neutral-400">
                                  {sort.col === j ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                                </span>
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {displayRows.map((row, i) => (
                          <tr key={i} className="border-b border-gray-100 align-top">
                            {row.map((cell, j) => (
                              <td key={j} className="py-2 pr-4 text-neutral-800">{cell || ''}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* iCreate, 2026-08-18: "it says we have 7 students and 1 enrolled.
              What does enrolled vs students mean? And also this is incorrect."
              Both came off school_enrollments — the diploma/school-of-record
              record, which most schools barely use — so "Students" was counting
              withdrawn and graduated rows and "Enrolled" was counting one
              diploma student, while 188 children sat in their classes. Every
              number now says what it counts, and the first one is the number
              people mean by "how many students do we have". */}
          <section>
            <h2 className="font-semibold text-neutral-900 mb-3">Enrollment</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Students in classes" value={enrollment?.students_in_classes ?? 0}
                hint="Distinct students holding a seat in a class" />
              <Stat label="Active classes" value={enrollment?.active_classes ?? 0}
                hint="Not counting archived" />
              <Stat label="School records — enrolled" value={enrollment?.by_status?.enrolled ?? 0}
                hint="Enrolled with this school as school of record" />
              <Stat label="School records — applicants" value={enrollment?.by_status?.applicant ?? 0}
                hint="Applied, not yet enrolled" />
            </div>
            {(enrollment?.by_status?.withdrawn || enrollment?.by_status?.graduated) ? (
              <p className="mt-2 text-xs text-neutral-500">
                School records also hold{' '}
                {enrollment?.by_status?.withdrawn ? `${enrollment.by_status.withdrawn} withdrawn` : ''}
                {enrollment?.by_status?.withdrawn && enrollment?.by_status?.graduated ? ' and ' : ''}
                {enrollment?.by_status?.graduated ? `${enrollment.by_status.graduated} graduated` : ''}
                {' '}({enrollment?.school_records ?? 0} in total). Those are past students, so they
                are not counted above.
              </p>
            ) : null}
          </section>

          <section>
            <h2 className="font-semibold text-neutral-900 mb-3">Revenue (recorded)</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Invoices" value={revenue?.invoice_count ?? 0} />
              <Stat label="Billed" value={money(revenue?.billed_cents)} />
              <Stat label="Collected" value={money(revenue?.collected_cents)} />
              <Stat label="Outstanding" value={money(revenue?.outstanding_cents)} />
            </div>
          </section>

          <section>
            <h2 className="font-semibold text-neutral-900 mb-3">Attendance</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Attendance rate" value={pct(attendance?.overall?.attendance_rate)} />
              <Stat label="Present" value={attendance?.overall?.counts?.present ?? 0} />
              <Stat label="Absent" value={attendance?.overall?.counts?.absent ?? 0} />
              <Stat label="Sessions" value={attendance?.overall?.total ?? 0} />
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default ReportsPage
