import React, { useEffect, useState, useCallback, useRef } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import { useAuth } from '../../contexts/AuthContext'
import { canSeeFinance } from './sisRole'
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
/* Printing ONE day: the office wants a sheet per day on a clipboard, not a
   seven-day booklet, so a day being printed hides its siblings. */
@media print {
  body.printing-one-day * { visibility: hidden; }
  body.printing-one-day .sis-day-printing,
  body.printing-one-day .sis-day-printing * { visibility: visible; }
  body.printing-one-day .sis-day-printing { position: absolute; left: 0; top: 0; width: 100%; }
  body.printing-one-day .no-print { display: none; }
}
`


/**
 * Day rosters: day -> block -> class -> who is in it. Not a table like the
 * other reports — the person reading it is standing in a corridor at 10:30
 * looking for one child, so the shape on the page is the shape of the question.
 */
export const DayRosters = ({ days }) => {
  const printDay = (key) => {
    const el = document.getElementById(`sis-day-${key}`)
    if (!el) return
    el.classList.add('sis-day-printing')
    document.body.classList.add('printing-one-day')
    const cleanup = () => {
      el.classList.remove('sis-day-printing')
      document.body.classList.remove('printing-one-day')
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    window.print()
  }

  if (!days?.length) return <p className="text-neutral-500">No classes are scheduled yet.</p>

  return (
    <div className="space-y-6">
      {days.map((d) => (
        <section key={d.key} id={`sis-day-${d.key}`} className="break-inside-avoid">
          <div className="flex items-center justify-between gap-2 border-b border-gray-200 pb-1 mb-3">
            <h4 className="font-semibold text-neutral-900">
              {d.label} <span className="text-sm font-normal text-neutral-500">
                · {d.student_count} student{d.student_count === 1 ? '' : 's'}
              </span>
            </h4>
            <button type="button" onClick={() => printDay(d.key)}
              className="no-print px-2.5 py-1 rounded-lg border border-gray-300 text-xs text-neutral-700 hover:bg-gray-50">
              Print {d.label}
            </button>
          </div>
          {d.slots.map((sl) => (
            <div key={sl.slot} className="mb-4">
              <div className="text-sm font-semibold text-optio-purple mb-1">{sl.slot}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sl.classes.map((c) => (
                  <div key={c.class_id} className="border border-gray-200 rounded-lg p-3 break-inside-avoid">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <span className="font-medium text-neutral-900">{c.name}</span>
                      <span className="text-xs text-neutral-500">{c.time}</span>
                    </div>
                    <div className="text-xs text-neutral-500 mb-1.5">
                      {[c.room || 'No room set', c.teacher].filter(Boolean).join(' · ')}
                      {' · '}{c.student_count} student{c.student_count === 1 ? '' : 's'}
                    </div>
                    {c.students.length === 0 ? (
                      <p className="text-xs text-neutral-400">Nobody enrolled.</p>
                    ) : (
                      <ol className="text-sm text-neutral-800 columns-2 gap-4">
                        {c.students.map((st) => (
                          <li key={st.name} className="break-inside-avoid">{st.name}</li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

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
  if (type === 'payments') {
    const totals = report.totals || []
    return {
      title: 'Payments',
      // The split by method is the question; the rows are the working.
      summary: totals.length
        ? totals.map((t) => `${t.method}: ${t.amount} (${t.count})`).join(' · ')
        : 'No payments recorded yet.',
      columns: ['Date', 'Family', 'Student', 'Invoice', 'Method', 'Amount', 'Reference', 'Note', 'Recorded by'],
      rows: (report.rows || []).map((r) => [
        r.recorded_at, r.family, r.student, r.invoice, r.method, r.amount,
        r.reference, r.note, r.recorded_by,
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
  if (type === 'student-schedule') {
    const days = report.days || []
    const unscheduled = report.has_unscheduled
    return {
      title: 'Student schedule',
      columns: ['Student', 'Family', 'Days', ...days.map((d) => d.label),
        ...(unscheduled ? ['Unscheduled classes'] : [])],
      rows: (report.rows || []).map((r) => [
        r.student, r.family, r.days,
        ...days.map((d) => r.by_day?.[d.key] ?? ''),
        ...(unscheduled ? [r.unscheduled] : []),
      ]),
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
  const { user } = useAuth()
  // Money is not the campus coordinator's — the same subtraction the backend
  // makes on /reports/revenue. Asking for it as a coordinator would 403, so
  // this decides whether to ask at all, not just whether to render.
  const seesMoney = canSeeFinance(user)
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
  // The roster picker's own archived switch. iCreate runs 47 archived classes
  // against 152 active ones, and the Class report next door already had this,
  // so its absence here read as an inconsistency (2026-08-20).
  const [rosterArchived, setRosterArchived] = useState(false)
  const [rosterCols, setRosterCols] = useState(loadRosterCols)
  // What the roster report on screen was actually run with, so changing the
  // inputs afterwards can say so rather than silently disagreeing with it.
  const [rosterRunWith, setRosterRunWith] = useState(null)
  // The results table renders below the whole grid of cards, and the grid is
  // eleven cards tall — taller still with a school's worth of classes in the
  // roster picker. Running a report therefore drew the answer somewhere off
  // screen, which reads exactly like the button doing nothing. Counting runs
  // rather than watching `report`: toggling a column rebuilds that object, and
  // re-scrolling the page under someone ticking columns is its own bug.
  const [runSeq, setRunSeq] = useState(0)
  const resultRef = useRef(null)

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      api.get(withOrg('/api/sis/reports/enrollment', orgId)),
      seesMoney ? api.get(withOrg('/api/sis/reports/revenue', orgId)) : Promise.resolve(null),
      api.get(withOrg('/api/sis/reports/attendance', orgId)),
    ])
      .then(([e, r, a]) => {
        setEnrollment(e.data?.report || null)
        setRevenue(r?.data?.report || null)
        setAttendance(a.data?.report || null)
      })
      .catch(() => toast.error('Failed to load reports'))
      .finally(() => setLoading(false))
    api.get(withOrg('/api/sis/reports/registration-questions', orgId))
      .then((res) => setQuestions(res.data?.questions || []))
      .catch(() => setQuestions([]))
    api.get(withOrg(`/api/sis/classes?include_archived=${rosterArchived}`, orgId))
      .then((res) => setClassList(res.data?.classes || []))
      .catch(() => setClassList([]))
  }, [orgId, seesMoney, rosterArchived])

  useEffect(() => { load() }, [load])
  useEffect(() => { setReport(null); setQuestionKey(''); setRosterClassIds([]) }, [orgId])
  // Unticking "include archived" must not leave an archived class selected and
  // invisible — the report would still include it and nothing on screen would
  // say why.
  useEffect(() => {
    if (!classList.length) return
    setRosterClassIds((ids) => {
      const live = new Set(classList.map((c) => c.id))
      const next = ids.filter((id) => live.has(id))
      return next.length === ids.length ? ids : next
    })
  }, [classList])
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
    setRunSeq((n) => n + 1)
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
        setRosterRunWith({ classIds: [...rosterClassIds].sort().join(','), waitlist: includeWaitlist })
        setReport({ ...shaped, kind: 'rosters', csvPath: rosterPath(shaped.selected), csvName: 'rosters.csv' })
        return
      }
      if (type === 'day-rosters') {
        setReport({ title: 'Day rosters', kind: 'day-rosters',
                    days: res.data?.report?.days || [],
                    columns: [], rows: [],
                    csvPath: path, csvName: 'day-rosters.csv' })
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
  }, [orgId, questions, attendanceDate, classCols, classPath, rosterCols, rosterPath,
      rosterClassIds, includeWaitlist])

  // Which column says Enrolled / Waiting / Offered, when there is one.
  const statusCol = report?.kind === 'rosters' ? (report.selected || []).indexOf('status') : -1
  const lockedCol = (key) => report?.kind === 'rosters' && includeWaitlist && key === 'status'

  useEffect(() => {
    if (!runSeq) return
    // Optional-call: jsdom has no scrollIntoView, and a missing scroll must
    // never break the page it was meant to help.
    resultRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [runSeq, reportLoading])

  const rosterStale = Boolean(
    report?.kind === 'rosters' && rosterRunWith
    && (rosterRunWith.classIds !== [...rosterClassIds].sort().join(',')
        || rosterRunWith.waitlist !== includeWaitlist))

  // Toggling a column re-shapes the rows already loaded — every field comes
  // back with the report, so changing the view never refetches.
  const toggleClassCol = useCallback((fieldKey) => {
    if (!report?.fields) return
    // Status is what tells an enrolled student from a waiting one, so while the
    // waitlist is included it cannot be turned off (the server forces it into
    // the sheet either way — this keeps the picker honest about that).
    if (report.kind === 'rosters' && includeWaitlist && fieldKey === 'status') return
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
  }, [report, classPath, rosterPath, includeWaitlist])

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
                  {/* Tickboxes, not a multi-select: picking eight classes out
                      of 152 by ctrl-click is a trap, and one stray click
                      cleared the lot (iCreate, 2026-08-19). */}
                  <div role="group" aria-label="Classes"
                    className="max-h-44 overflow-y-auto border border-gray-300 rounded-lg p-2 space-y-1">
                    {!classList.length && (
                      <p className="text-xs text-neutral-400">No classes to choose from.</p>
                    )}
                    {classList.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm text-neutral-700">
                        <input type="checkbox" className="accent-optio-purple"
                          checked={rosterClassIds.includes(c.id)}
                          onChange={(e) => setRosterClassIds((ids) => (
                            e.target.checked ? [...ids, c.id] : ids.filter((id) => id !== c.id)))} />
                        <span className="truncate">{c.name}</span>
                        {c.status === 'archived' && (
                          <span className="text-xs text-neutral-400 shrink-0">archived</span>
                        )}
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 flex-wrap">
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
                      <label className="flex items-center gap-1.5 text-sm text-neutral-600">
                        <input type="checkbox" aria-label="Include archived classes in the list"
                          className="accent-optio-purple"
                          checked={rosterArchived}
                          onChange={(e) => setRosterArchived(e.target.checked)} />
                        Include archived
                      </label>
                    </div>
                    <RunButton ariaLabel="View roster report"
                      disabled={reportLoading || !orgId || !rosterClassIds.length}
                      onClick={() => runReport('rosters')} />
                  </div>
                  {!rosterClassIds.length && (
                    <p className="text-xs text-neutral-400">Choose one or more classes.</p>
                  )}
                  {/* Changing what goes IN the sheet after running it left the
                      old sheet on screen, which is how "include waitlist" could
                      look like it had done nothing. */}
                  {rosterStale && (
                    <p className="text-xs text-amber-600">
                      Settings changed — run the report again to see them.
                    </p>
                  )}
                </div>
              </ReportCard>
              <ReportCard
                title="Day rosters"
                description="One sheet per day: each block, the classes running in it, the room, and who should be in each. For the person who has to tell a child where to go."
              >
                <RunButton ariaLabel="View day rosters report" disabled={reportLoading || !orgId}
                  onClick={() => runReport('day-rosters')} />
              </ReportCard>
              <ReportCard
                title="Student schedule"
                description="A master list of every student showing which days they come, and which class blocks they're in each day."
              >
                <RunButton ariaLabel="View student schedule report" disabled={reportLoading || !orgId}
                  onClick={() => runReport('student-schedule')} />
              </ReportCard>
              {seesMoney && (
                <ReportCard
                  title="Payments"
                  description="Every payment you have recorded, with the split by method — card, check, cash, scholarship. Downloads as a spreadsheet."
                >
                  <RunButton ariaLabel="View payments report" disabled={reportLoading || !orgId}
                    onClick={() => runReport('payments')} />
                </ReportCard>
              )}
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

            <div ref={resultRef} className="scroll-mt-4" />

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
                {report.summary && (
                  <p className="text-sm text-neutral-600 mb-3">{report.summary}</p>
                )}
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
                            disabled={lockedCol(f.key)}
                            title={lockedCol(f.key)
                              ? 'Needed while waitlisted students are included'
                              : undefined}
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
                {report.kind === 'day-rosters' ? (
                  <DayRosters days={report.days} />
                ) : displayRows.length === 0 ? (
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
                        {displayRows.map((row, i) => {
                          const waiting = statusCol >= 0 && row[statusCol] && row[statusCol] !== 'Enrolled'
                          return (
                            <tr key={i}
                              className={`border-b border-gray-100 align-top ${waiting ? 'bg-amber-50' : ''}`}>
                              {row.map((cell, j) => (
                                <td key={j} className="py-2 pr-4 text-neutral-800">
                                  {j === statusCol && waiting ? (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                      {cell}
                                    </span>
                                  ) : (cell || '')}
                                </td>
                              ))}
                            </tr>
                          )
                        })}
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

          {seesMoney && (
            <section>
              <h2 className="font-semibold text-neutral-900 mb-3">Revenue (recorded)</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Invoices" value={revenue?.invoice_count ?? 0} />
                <Stat label="Billed" value={money(revenue?.billed_cents)} />
                <Stat label="Collected" value={money(revenue?.collected_cents)} />
                <Stat label="Outstanding" value={money(revenue?.outstanding_cents)} />
              </div>
            </section>
          )}

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
