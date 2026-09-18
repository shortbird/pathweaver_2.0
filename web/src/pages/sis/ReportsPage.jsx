import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import { useAuth } from '../../contexts/AuthContext'
import { canSeeFinance } from './sisRole'
import shapeReport from './reportsPage/shapeReport'
import { printElement } from '../../utils/printView'
import usePersistedChoice from '../../hooks/usePersistedChoice'
import { downloadBlob } from '../../utils/csv'
import { BlockRosters } from './reportsPage/BlockRosters'
import { EMPTY_FILTER } from './reportsPage/rosterClassFilter'
import { reportByKey, visibleReports } from './reportsPage/catalog'
import ReportNav from './reportsPage/ReportNav'
import RosterClassPicker from './reportsPage/RosterClassPicker'
import ReportTable from './reportsPage/ReportTable'
import OverviewStats from './reportsPage/OverviewStats'

/**
 * ReportsPage -- every report the office runs, one at a time.
 *
 * Restructured 2026-09-14. The page was one grid of fourteen cards under
 * "Information reports", each with its own Run button and, for the class
 * rosters, a school's worth of tickboxes inside a card a third of the screen
 * wide; the answer rendered under the whole grid, and the enrollment and
 * attendance numbers under that. Now: a grouped list on the left (see
 * reportsPage/catalog.js), and on the right the report you picked -- what it
 * is, what it needs from you, and the sheet -- with `?report=` in the URL so a
 * report can be bookmarked. A report with nothing to choose runs when picked.
 */

/**
 * Day rosters: day -> block -> class -> who is in it. Not a table like the
 * other reports — the person reading it is standing in a corridor at 10:30
 * looking for one child, so the shape on the page is the shape of the question.
 */
export const DayRosters = ({ days }) => {
  const printDay = (key) => printElement(`sis-day-${key}`)

  if (!days?.length) return <p className="text-neutral-500">No classes are scheduled yet.</p>

  return (
    <div className="space-y-6">
      {days.map((d) => (
        <section key={d.key} id={`sis-day-${d.key}`} className="sis-day-section break-inside-avoid">
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
          {/* Who goes home when, and who goes early. "Can we get a way to know
              who is leaving halfdays, etc." (iCreate, 2026-08-26 — 1fc5012b).
              Derived from each child's last class of the day: nothing records a
              half day, and a second thing to type in would only go stale. */}
          {(d.departures || []).length > 0 && (
            <details className="mb-4 border border-gray-200 rounded-lg">
              <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-neutral-800">
                Going home{' '}
                <span className="font-normal text-neutral-500">
                  · {d.departures.filter((x) => x.early).length} before the end of the day
                </span>
              </summary>
              <ul className="px-3 pb-3 text-sm columns-1 sm:columns-2 gap-4">
                {d.departures.map((x) => (
                  <li key={x.name} className="break-inside-avoid flex items-baseline gap-2">
                    <span className={x.early ? 'font-medium text-amber-700' : 'text-neutral-800'}>
                      {x.name}
                    </span>
                    <span className="text-xs text-neutral-500">{x.leaves_at}</span>
                    {x.family && <span className="text-xs text-neutral-400">{x.family}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
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
// Re-exported so the page stays the one address for its reports: the suite and
// any caller import BlockRosters from here, not from the file it now lives in.
export { BlockRosters }


// Turn each report's JSON payload into a generic {title, columns, rows} table.
const CLASS_COLS_KEY = 'sis_class_report_cols'
const ROSTER_COLS_KEY = 'sis_roster_report_cols'

// A saved column choice, or null until the first run adopts the API's defaults.
const savedCols = (saved) => (Array.isArray(saved) && saved.length ? saved : null)

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

// ── Tiered report sort ───────────────────────────────────────────────────────
// "On class report, please make it sortable like Classes under academics …
// It's the tiered sort!" (iCreate, 2026-08-24). Cells arrive as pre-formatted
// display strings, so day and time columns must be parsed into something
// comparable — alphabetical "Fri < Mon < Wed" is nonsense, and "1:00pm" would
// sort before "9:00am".
const DOW_SORT = {
  sun: 0, sunday: 0, su: 0,
  mon: 1, monday: 1, m: 1,
  tue: 2, tues: 2, tuesday: 2, tu: 2,
  wed: 3, wednesday: 3, w: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, th: 4,
  fri: 5, friday: 5, f: 5,
  sat: 6, saturday: 6, sa: 6,
}

export const cellSortValue = (key, cell) => {
  const s = String(cell ?? '').trim()
  if (!s) return null // empties sort last
  const k = String(key ?? '').toLowerCase().trim()

  if (k === 'days' || k === 'day') {
    const idxs = s.toLowerCase().split(/[\s,/-]+/).map((d) => DOW_SORT[d]).filter((n) => n != null)
    return idxs.length ? Math.min(...idxs) : null
  }
  if (k === 'time' || k === 'times' || k === 'schedule') {
    const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
    if (m) {
      const hh = +m[1] % 12
      const mm = +(m[2] || 0)
      const pm = m[3].toLowerCase() === 'pm'
      return (hh + (pm ? 12 : 0)) * 60 + mm
    }
    const m24 = s.match(/^(\d{1,2}):(\d{2})/)
    if (m24) return +m24[1] * 60 + +m24[2]
    return null
  }
  if (/^\$/.test(s) || k.includes('tuition') || k.includes('fee') || k.includes('amount') || k.includes('price')) {
    const n = parseFloat(s.replace(/[^0-9.-]/g, ''))
    return Number.isNaN(n) ? null : n
  }
  if (k === 'ages' || k === 'age') {
    const m = s.match(/\d+/)
    return m ? +m[0] : null
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s)
  return s.toLowerCase()
}

export const compareCells = (key, a, b) => {
  const va = cellSortValue(key, a)
  const vb = cellSortValue(key, b)
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  if (typeof va === 'number' && typeof vb === 'number') return va - vb
  return String(va).localeCompare(String(vb), undefined, { numeric: true })
}

const RunButton = ({ onClick, disabled, ariaLabel, children = 'Run report' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={ariaLabel}
    className="px-4 py-2 rounded-lg text-white text-sm font-medium bg-gradient-primary hover:opacity-90 disabled:opacity-50"
  >
    {children}
  </button>
)

const ReportsPage = () => {
  const { orgId } = useSisOrg()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  // Money is not the campus coordinator's -- the same subtraction the backend
  // makes on /reports/revenue. Asking for it as a coordinator would 403, so
  // this decides whether to ask at all, not just whether to render.
  const seesMoney = canSeeFinance(user)
  const reports = useMemo(() => visibleReports(seesMoney), [seesMoney])
  const requested = searchParams.get('report')
  const active = reports.find((r) => r.key === requested) || reportByKey('overview')
  const pickReport = (key) => setSearchParams(key === 'overview' ? {} : { report: key }, { replace: true })

  const [enrollment, setEnrollment] = useState(null)
  const [revenue, setRevenue] = useState(null)
  const [attendance, setAttendance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState([])
  const [questionKey, setQuestionKey] = useState('')
  const [report, setReport] = useState(null)          // {title, columns, rows, csvPath, csvName}
  const [reportLoading, setReportLoading] = useState(false)
  // Report table sort: an ordered stack of [{col, dir}] -- index 0 is the
  // primary sort, each later entry a deeper tiebreaker (same model as
  // ClassesTable). Starts on the first column ascending, as it always has.
  const [sort, setSort] = useState([{ col: 0, dir: 'asc' }])
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [classCols, setClassCols] = usePersistedChoice(CLASS_COLS_KEY, null, { validate: savedCols })
  const [includeArchived, setIncludeArchived] = useState(false)
  // Roster report: which classes, and whether waitlisted students come too.
  const [classList, setClassList] = useState([])
  const [rosterClassIds, setRosterClassIds] = useState([])
  const [includeWaitlist, setIncludeWaitlist] = useState(false)
  // The roster picker's own archived switch. iCreate runs 47 archived classes
  // against 152 active ones, and the Class list already had this, so its
  // absence here read as an inconsistency (2026-08-20).
  const [rosterArchived, setRosterArchived] = useState(false)
  const [rosterFilter, setRosterFilter] = useState(EMPTY_FILTER)
  const [rosterCols, setRosterCols] = usePersistedChoice(ROSTER_COLS_KEY, null, { validate: savedCols })
  // What the roster report on screen was actually run with, so changing the
  // inputs afterwards can say so rather than silently disagreeing with it.
  const [rosterRunWith, setRosterRunWith] = useState(null)
  // On a phone the sheet renders under the options; bring it into view when a
  // run lands. Counting runs rather than watching `report`: toggling a column
  // rebuilds that object, and re-scrolling under someone ticking columns is
  // its own bug.
  const [runSeq, setRunSeq] = useState(0)
  // Which day the block rosters are showing. It drives the CSV too, so
  // downloading gives you the day on screen rather than the whole week.
  const [blockDay, setBlockDay] = useState('')
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
  // invisible -- the report would still include it and nothing on screen would
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
  useEffect(() => { setSort([{ col: 0, dir: 'asc' }]) }, [report?.title])

  // Click cycles a column asc -> desc -> off. A column not yet in the sort is
  // appended as the next-deeper tiebreaker, so clicking Days then Time sorts
  // by day and then by time within each day.
  const toggleSort = (col) => setSort((stack) => {
    const i = stack.findIndex((s) => s.col === col)
    if (i === -1) return [...stack, { col, dir: 'asc' }]
    if (stack[i].dir === 'asc') {
      const next = [...stack]
      next[i] = { col, dir: 'desc' }
      return next
    }
    return stack.filter((s) => s.col !== col)
  })

  // Rows to render, sorted by the active columns in stack order. The field key
  // (report.selected, present on the field-picker reports) is what tells the
  // comparator a column holds days or times rather than plain text.
  const displayRows = useMemo(() => {
    if (!report) return []
    if (!sort.length) return report.rows
    return [...report.rows].sort((a, b) => {
      for (const { col, dir } of sort) {
        const key = report.selected?.[col] || report.columns?.[col]
        const n = compareCells(key, a[col], b[col])
        if (n) return dir === 'asc' ? n : -n
      }
      return 0
    })
  }, [report, sort])

  // The class list's CSV must download exactly the columns on screen.
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
        const shaped = shapeClassReport(res.data, classCols, 'Class list')
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
      if (type === 'block-rosters') {
        const days = res.data?.report?.days || []
        // Land on the day with the most classes: at iCreate that is Tuesday or
        // Thursday, which is what these sheets are for.
        setBlockDay((prev) => (days.some((d) => d.key === prev) ? prev
          : (days.slice().sort((a, b) => b.blocks.length - a.blocks.length)[0]?.key || '')))
        setReport({ title: 'Block rosters', kind: 'block-rosters', days,
                    columns: [], rows: [],
                    csvPath: path, csvName: 'block-rosters.csv' })
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

  // Picking a report clears the last one's sheet; a report with nothing to
  // choose runs at once. `runReport` is deliberately not a dependency: it
  // changes whenever an option does, and options changing must not re-run a
  // report behind someone's back (that is what the Run button is for).
  useEffect(() => {
    setReport(null)
    if (!orgId || active.key === 'overview') return
    if (active.autoRun) runReport(active.key)
  }, [active.key, orgId])

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

  // Toggling a column re-shapes the rows already loaded -- every field comes
  // back with the report, so changing the view never refetches.
  const toggleClassCol = useCallback((fieldKey) => {
    if (!report?.fields) return
    // Status is what tells an enrolled student from a waiting one, so while the
    // waitlist is included it cannot be turned off (the server forces it into
    // the sheet either way -- this keeps the picker honest about that).
    if (report.kind === 'rosters' && includeWaitlist && fieldKey === 'status') return
    // Keep the API's field order regardless of the order columns were ticked.
    const next = report.fields.map((f) => f.key)
      .filter((k) => (k === fieldKey ? !report.selected.includes(k) : report.selected.includes(k)))
    if (!next.length) return   // never leave the table with no columns
    const isRoster = report.kind === 'rosters'
    if (isRoster) setRosterCols(next)
    else setClassCols(next)
    setSort([{ col: 0, dir: 'asc' }])
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
    // Block rosters download the day you are looking at -- a whole week of
    // grids in one file is not the sheet anyone asked for.
    const blockLabel = report.kind === 'block-rosters'
      ? report.days?.find((d) => d.key === blockDay)?.label : null
    const path = blockLabel ? `${report.csvPath}?day=${blockDay}` : report.csvPath
    const name = blockLabel ? `block-rosters-${blockLabel.toLowerCase()}.csv` : report.csvName
    try {
      const sep = path.includes('?') ? '&' : '?'
      const res = await api.get(withOrg(`${path}${sep}format=csv`, orgId), { responseType: 'blob' })
      downloadBlob(res.data, name)
    } catch {
      toast.error('Failed to download CSV')
    }
  }, [report, orgId, blockDay])

  // What the picked report needs from the office before (or after) it runs.
  const options = (() => {
    const busy = reportLoading || !orgId
    switch (active.key) {
      case 'rosters':
        return (
          <div className="space-y-3">
            <RosterClassPicker
              classList={classList} filter={rosterFilter} setFilter={setRosterFilter}
              selectedIds={rosterClassIds} setSelectedIds={setRosterClassIds}
              includeWaitlist={includeWaitlist} setIncludeWaitlist={setIncludeWaitlist}
              includeArchived={rosterArchived} setIncludeArchived={setRosterArchived} />
            <div className="flex items-center gap-3 flex-wrap">
              <RunButton ariaLabel="View roster report" disabled={busy || !rosterClassIds.length}
                onClick={() => runReport('rosters')} />
              {/* Changing what goes IN the sheet after running it left the
                  old sheet on screen, which is how "include waitlist" could
                  look like it had done nothing. */}
              {rosterStale && (
                <span className="text-xs text-amber-600">Settings changed — run the report again to see them.</span>
              )}
            </div>
          </div>
        )
      case 'classes':
        return (
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-sm text-neutral-600">
              <input type="checkbox" aria-label="Include archived classes"
                className="accent-optio-purple"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)} />
              Include archived
            </label>
            <RunButton ariaLabel="View class report" disabled={busy} onClick={() => runReport('classes')} />
          </div>
        )
      case 'daily-attendance':
        return (
          <div className="flex items-center gap-3 flex-wrap">
            <input type="date" value={attendanceDate} aria-label="Attendance date"
              onChange={(e) => setAttendanceDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <RunButton disabled={busy} onClick={() => runReport('daily-attendance')} />
          </div>
        )
      case 'question':
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              aria-label="Registration question"
              value={questionKey}
              onChange={(e) => setQuestionKey(e.target.value)}
              className="flex-1 min-w-[220px] border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Choose a question…</option>
              {questions.map((q) => (
                <option key={q.key} value={q.key}>{q.label}</option>
              ))}
            </select>
            <RunButton disabled={busy || !questionKey} onClick={() => runReport('question', questionKey)} />
          </div>
        )
      default:
        return null
    }
  })()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Reports</h1>
      </div>

      {loading && <p className="text-neutral-500">Loading…</p>}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] gap-6 items-start">
          <div className="md:sticky md:top-4">
            <ReportNav reports={reports} activeKey={active.key} onPick={pickReport} />
          </div>

          <div className="min-w-0 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">{active.title}</h2>
              <p className="text-sm text-neutral-500 mt-0.5">{active.description}</p>
            </div>

            {active.key === 'overview' ? (
              <OverviewStats enrollment={enrollment} revenue={revenue} attendance={attendance}
                seesMoney={seesMoney} />
            ) : (
              <>
                {options && (
                  <div className="no-print bg-white rounded-xl border border-gray-200 p-4">{options}</div>
                )}

                <div ref={resultRef} className="scroll-mt-4" />

                {reportLoading && <p className="text-neutral-500">Loading report…</p>}

                {!reportLoading && !report && !active.autoRun && (
                  <p className="text-sm text-neutral-400">
                    {active.key === 'rosters' ? 'Pick the classes above, then run the report.'
                      : 'Choose above, then run the report.'}
                  </p>
                )}

                {!reportLoading && report && (
                  <div className="sis-report-print bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                      <h3 className="font-semibold text-neutral-900">{report.title}</h3>
                      <div className="no-print flex items-center gap-2">
                        <button type="button" onClick={() => printElement('.sis-report-print')}
                          className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50">
                          Print
                        </button>
                        <button type="button" onClick={downloadCsv}
                          className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50">
                          Download CSV
                        </button>
                      </div>
                    </div>
                    {report.summary && (
                      <p className="text-sm text-neutral-600 mb-3">{report.summary}</p>
                    )}
                    {report.kind === 'day-rosters' ? (
                      <DayRosters days={report.days} />
                    ) : report.kind === 'block-rosters' ? (
                      <BlockRosters days={report.days} day={blockDay} onDayChange={setBlockDay} />
                    ) : (
                      <ReportTable report={report} rows={displayRows} sort={sort}
                        onSort={toggleSort} onClearSort={() => setSort([])}
                        onToggleColumn={toggleClassCol} lockedColumn={lockedCol} statusCol={statusCol} />
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ReportsPage
