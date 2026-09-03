import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import BackToSchool from '../components/navigation/BackToSchool'

/**
 * Parent/guardian absence reporting (web platform).
 *
 * A guardian tells the school ahead of time that one or more children will be
 * out — for a whole day or just one scheduled class — on today or any future
 * date. Children are multi-selectable so "all three are out Friday" is one
 * report, not three. Distinct from the teacher's attendance roster; the school
 * admin team is notified when one is added.
 * Backed by /api/sis/parent/absences (authorized by family relationship).
 */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// The school's day, not UTC's. toISOString() rolls over at 6pm Mountain, so an
// evening report defaulted to TOMORROW and the date picker would not let a
// guardian choose the day that was actually missed — the office then got
// "will be absent" for the day AFTER the child was already out (iCreate,
// 2026-09-02).
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const today = () => iso(new Date())

const meetingText = (meetings = []) => meetings
  .map((m) => `${m.day_of_week != null ? DAYS[m.day_of_week] : m.specific_date} ${m.start_time}–${m.end_time}`)
  .join(', ')

// Timezone-safe day increment for YYYY-MM-DD strings (Date('YYYY-MM-DD') is UTC).
const nextDay = (day) => {
  const [y, m, d] = day.split('-').map(Number)
  return iso(new Date(y, m - 1, d + 1))
}

/**
 * A range report is stored one row per day; fold consecutive days with the
 * same child, class, and reason back into one display row so a two-week trip
 * is one line with one Cancel, not fourteen.
 */
const groupRuns = (list) => {
  const sorted = [...list].sort((a, b) => (
    (a.student_name || '').localeCompare(b.student_name || '')
    || a.absence_date.localeCompare(b.absence_date)
  ))
  const runs = []
  for (const a of sorted) {
    const prev = runs[runs.length - 1]
    if (prev && prev.student_name === a.student_name
        && (prev.class_id || null) === (a.class_id || null)
        && (prev.reason || null) === (a.reason || null)
        && nextDay(prev.end_date) === a.absence_date) {
      prev.end_date = a.absence_date
      prev.ids.push(a.id)
    } else {
      runs.push({ ...a, end_date: a.absence_date, ids: [a.id] })
    }
  }
  return runs.sort((x, y) => x.absence_date.localeCompare(y.absence_date))
}

const AbsenceReportingPage = () => {
  const [loading, setLoading] = useState(true)
  const [orgs, setOrgs] = useState([])
  const [orgId, setOrgId] = useState('')
  const [studentIds, setStudentIds] = useState([])
  // {student_id: {absences: [], classes: []}} for every child in the org, so
  // toggling children never waits on a fetch.
  const [byStudent, setByStudent] = useState({})
  const [form, setForm] = useState({ absence_date: today(), end_date: '', class_id: '', reason: '' })
  const [busy, setBusy] = useState(false)

  const org = useMemo(() => orgs.find((o) => o.organization_id === orgId), [orgs, orgId])
  // Memoized: loadAbsences depends on this, and a fresh [] every render would
  // re-run its effect (and setState) in a loop.
  const students = useMemo(() => org?.students || [], [org])
  const studentName = useCallback(
    (sid) => students.find((s) => s.student_id === sid)?.name || 'A student',
    [students],
  )

  useEffect(() => {
    api.get('/api/sis/parent/context')
      .then((r) => {
        const list = r.data?.orgs || []
        setOrgs(list)
        if (list.length) {
          setOrgId(list[0].organization_id)
          if (list[0].students?.length) setStudentIds([list[0].students[0].student_id])
        }
      })
      .catch(() => toast.error('Could not load absences'))
      .finally(() => setLoading(false))
  }, [])

  // Keep the selection valid when the org changes.
  useEffect(() => {
    if (!students.length) return
    setStudentIds((prev) => {
      const valid = prev.filter((sid) => students.some((s) => s.student_id === sid))
      return valid.length ? valid : [students[0].student_id]
    })
  }, [students])

  const loadAbsences = useCallback(() => {
    if (!orgId || !students.length) { setByStudent({}); return }
    Promise.all(students.map((s) =>
      api.get(`/api/sis/parent/absences?organization_id=${orgId}&student_user_id=${s.student_id}`)
        .then((r) => [s.student_id, {
          absences: r.data?.absences || [],
          classes: r.data?.classes || [],
        }]),
    ))
      .then((entries) => setByStudent(Object.fromEntries(entries)))
      .catch(() => toast.error('Could not load absences'))
  }, [orgId, students])

  useEffect(() => { loadAbsences() }, [loadAbsences])

  const toggleStudent = (sid) => {
    setStudentIds((prev) => (
      prev.includes(sid) ? prev.filter((id) => id !== sid) : [...prev, sid]
    ))
  }

  // A class is offerable only when every selected child is enrolled in it —
  // siblings in the same co-op class are the case this exists for.
  const classes = useMemo(() => {
    const lists = studentIds.map((sid) => byStudent[sid]?.classes || [])
    if (!lists.length) return []
    return lists[0].filter((c) => lists.every((l) => l.some((x) => x.class_id === c.class_id)))
  }, [studentIds, byStudent])

  // Deselect a class that stopped being shared by everyone selected.
  useEffect(() => {
    if (form.class_id && !classes.some((c) => c.class_id === form.class_id)) {
      setForm((f) => ({ ...f, class_id: '' }))
    }
  }, [classes, form.class_id])

  const report = async () => {
    if (!form.absence_date) { toast.error('Pick a date'); return }
    if (!studentIds.length) { toast.error('Select at least one child'); return }
    if (form.end_date && form.end_date < form.absence_date) {
      toast.error('The last day cannot be before the first day')
      return
    }
    setBusy(true)
    try {
      const r = await api.post('/api/sis/parent/absences', {
        organization_id: orgId,
        student_user_ids: studentIds,
        absence_date: form.absence_date,
        end_date: form.end_date && form.end_date !== form.absence_date ? form.end_date : null,
        class_id: form.class_id || null,
        reason: form.reason || null,
      })
      const errors = r.data?.errors || {}
      const created = r.data?.absences || []
      // A range writes one row per day, so count children, not rows.
      const reportedFor = [...new Set(created.map((a) => a.student_user_id))]
      if (reportedFor.length) {
        toast.success(`Absence reported for ${reportedFor.length === 1
          ? studentName(reportedFor[0])
          : `${reportedFor.length} children`} — ${org?.organization_name || 'the office'} has been notified`)
      }
      Object.entries(errors).forEach(([sid, msg]) => {
        toast.error(`${studentName(sid)}: ${msg}`)
      })
      setForm({ absence_date: today(), end_date: '', class_id: '', reason: '' })
      loadAbsences()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not report absence')
    } finally {
      setBusy(false)
    }
  }

  // One call for the whole run — a cancelled two-week trip is one office
  // notification, not fourteen.
  const cancel = async (ids) => {
    try {
      await api.post('/api/sis/parent/absences/cancel', { absence_ids: ids })
      toast.success('Absence cancelled')
      loadAbsences()
    } catch {
      toast.error('Could not cancel absence')
    }
  }

  const classNameById = useMemo(() => {
    const all = Object.values(byStudent).flatMap((d) => d.classes || [])
    return Object.fromEntries(all.map((c) => [c.class_id, c.name]))
  }, [byStudent])

  // Upcoming absences across every selected child, consecutive days folded
  // into one range row, soonest first.
  const absences = useMemo(() => groupRuns(
    studentIds.flatMap((sid) => (byStudent[sid]?.absences || []).map((a) => ({ ...a, student_name: studentName(sid) }))),
  ), [studentIds, byStudent, studentName])

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 py-10 text-gray-500">Loading…</div>
  }

  if (!orgs.length) {
    // The empty state still needs the way back — a superadmin previewing the
    // school page, or a member without a family here, lands on this branch.
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-left mb-6"><BackToSchool /></div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Report an absence</h1>
        <p className="text-gray-500">
          Absence reporting isn’t available for your family yet. If your school uses Optio to
          manage attendance, ask them to add your family.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <BackToSchool className="mb-3" />
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Report an absence</h1>
      <p className="text-gray-500 mb-6">Let {org?.organization_name || 'your school'} know ahead of time when your children will be out.</p>

      {/* Child / org pickers */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        {orgs.length > 1 && (
          <label className="text-sm block mb-3">
            <span className="block text-gray-500 mb-1">School</span>
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple">
              {orgs.map((o) => <option key={o.organization_id} value={o.organization_id}>{o.organization_name || 'School'}</option>)}
            </select>
          </label>
        )}
        <span className="block text-sm text-gray-500 mb-2">
          {students.length > 1 ? 'Children — select everyone who will be out' : 'Child'}
        </span>
        <div className="flex flex-wrap gap-2">
          {students.map((s) => {
            const selected = studentIds.includes(s.student_id)
            return (
              <button key={s.student_id} type="button" onClick={() => toggleStudent(s.student_id)}
                aria-pressed={selected}
                className={`px-3.5 py-2 rounded-full border text-sm transition-colors ${
                  selected
                    ? 'bg-optio-purple border-optio-purple text-white font-medium'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-optio-purple'
                }`}>
                {s.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* New absence */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">New absence</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">First day</span>
            <input type="date" min={today()} value={form.absence_date}
              onChange={(e) => setForm({ ...form, absence_date: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple" />
          </label>
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">Last day (optional)</span>
            <input type="date" min={form.absence_date || today()} value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple" />
          </label>
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">What are they missing?</span>
            <select value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple">
              <option value="">The whole day</option>
              {classes.map((c) => <option key={c.class_id} value={c.class_id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-sm flex-1 min-w-[180px]">
            <span className="block text-gray-500 mb-1">Reason (optional)</span>
            <input type="text" value={form.reason} maxLength={200}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="e.g. doctor appointment"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple" />
          </label>
          <button onClick={report} disabled={busy || !studentIds.length}
            className="btn-primary">
            Report absence
          </button>
        </div>
        {studentIds.length > 1 && (
          <p className="text-xs text-gray-400 mt-2">
            Reporting for {studentIds.map(studentName).join(', ')}.
            {classes.length === 0 && ' Only whole-day absences can be reported for multiple children unless they share a class.'}
          </p>
        )}
      </div>

      {/* Upcoming */}
      <h2 className="font-semibold text-gray-900 mb-3">Upcoming reported absences</h2>
      {!absences.length && <p className="text-sm text-gray-400">None reported.</p>}
      <div className="space-y-2">
        {absences.map((a) => (
          <div key={a.ids[0]} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between text-sm">
            <div>
              <span className="font-medium text-gray-900">
                {a.absence_date}{a.end_date !== a.absence_date && ` – ${a.end_date}`}
              </span>
              {students.length > 1 && <span className="text-gray-700"> · {a.student_name}</span>}
              <span className="text-gray-500"> · {a.class_id ? (a.class_name || classNameById[a.class_id] || 'A class') : 'Whole day'}</span>
              {a.reason && <span className="text-gray-400"> — {a.reason}</span>}
            </div>
            <button onClick={() => cancel(a.ids)} className="text-red-500 hover:underline">Cancel</button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default AbsenceReportingPage
