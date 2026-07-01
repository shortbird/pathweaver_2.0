import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../services/api'

/**
 * Parent/guardian absence reporting (Learning app).
 *
 * A guardian tells the school ahead of time that a child will be out — for a whole
 * day or just one scheduled class — on today or any future date. Distinct from the
 * teacher's attendance roster; the school admin team is notified when one is added.
 * Backed by /api/sis/parent/absences (authorized by family relationship).
 */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const today = () => new Date().toISOString().slice(0, 10)

const meetingText = (meetings = []) => meetings
  .map((m) => `${m.day_of_week != null ? DAYS[m.day_of_week] : m.specific_date} ${m.start_time}–${m.end_time}`)
  .join(', ')

const AbsenceReportingPage = () => {
  const [loading, setLoading] = useState(true)
  const [orgs, setOrgs] = useState([])
  const [orgId, setOrgId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [absences, setAbsences] = useState([])
  const [classes, setClasses] = useState([])
  const [form, setForm] = useState({ absence_date: today(), class_id: '', reason: '' })
  const [busy, setBusy] = useState(false)

  const org = useMemo(() => orgs.find((o) => o.organization_id === orgId), [orgs, orgId])
  const students = org?.students || []

  useEffect(() => {
    api.get('/api/sis/parent/context')
      .then((r) => {
        const list = r.data?.orgs || []
        setOrgs(list)
        if (list.length) {
          setOrgId(list[0].organization_id)
          if (list[0].students?.length) setStudentId(list[0].students[0].student_id)
        }
      })
      .catch(() => toast.error('Could not load absences'))
      .finally(() => setLoading(false))
  }, [])

  // Keep the selected child valid when the org changes.
  useEffect(() => {
    if (students.length && !students.some((s) => s.student_id === studentId)) {
      setStudentId(students[0].student_id)
    }
  }, [students, studentId])

  const loadAbsences = useCallback(() => {
    if (!orgId || !studentId) { setAbsences([]); setClasses([]); return }
    api.get(`/api/sis/parent/absences?organization_id=${orgId}&student_user_id=${studentId}`)
      .then((r) => {
        setAbsences(r.data?.absences || [])
        setClasses(r.data?.classes || [])
      })
      .catch(() => toast.error('Could not load absences'))
  }, [orgId, studentId])

  useEffect(() => { loadAbsences() }, [loadAbsences])

  const report = async () => {
    if (!form.absence_date) { toast.error('Pick a date'); return }
    setBusy(true)
    try {
      await api.post('/api/sis/parent/absences', {
        organization_id: orgId,
        student_user_id: studentId,
        absence_date: form.absence_date,
        class_id: form.class_id || null,
        reason: form.reason || null,
      })
      toast.success('Absence reported — the school has been notified')
      setForm({ absence_date: today(), class_id: '', reason: '' })
      loadAbsences()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not report absence')
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (id) => {
    try {
      await api.delete(`/api/sis/parent/absences/${id}`)
      toast.success('Absence cancelled')
      loadAbsences()
    } catch {
      toast.error('Could not cancel absence')
    }
  }

  const classNameById = useMemo(
    () => Object.fromEntries(classes.map((c) => [c.class_id, c.name])),
    [classes],
  )

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 py-10 text-neutral-500">Loading…</div>
  }

  if (!orgs.length) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-neutral-900 mb-2">Report an absence</h1>
        <p className="text-neutral-500">
          Absence reporting isn’t available for your family yet. If your school uses Optio to
          manage attendance, ask them to add your family.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900 mb-1">Report an absence</h1>
      <p className="text-neutral-500 mb-6">Let your school know ahead of time when your child will be out.</p>

      {/* Child / org pickers */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap items-end gap-3">
        {orgs.length > 1 && (
          <label className="text-sm">
            <span className="block text-neutral-500 mb-1">School</span>
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple">
              {orgs.map((o) => <option key={o.organization_id} value={o.organization_id}>{o.organization_name || 'School'}</option>)}
            </select>
          </label>
        )}
        <label className="text-sm">
          <span className="block text-neutral-500 mb-1">Child</span>
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple">
            {students.map((s) => <option key={s.student_id} value={s.student_id}>{s.name}</option>)}
          </select>
        </label>
      </div>

      {/* New absence */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <h2 className="font-semibold text-neutral-900 mb-3">New absence</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-neutral-500 mb-1">Date</span>
            <input type="date" min={today()} value={form.absence_date}
              onChange={(e) => setForm({ ...form, absence_date: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple" />
          </label>
          <label className="text-sm">
            <span className="block text-neutral-500 mb-1">What are they missing?</span>
            <select value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple">
              <option value="">The whole day</option>
              {classes.map((c) => <option key={c.class_id} value={c.class_id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-sm flex-1 min-w-[180px]">
            <span className="block text-neutral-500 mb-1">Reason (optional)</span>
            <input type="text" value={form.reason} maxLength={200}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="e.g. doctor appointment"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple" />
          </label>
          <button onClick={report} disabled={busy || !studentId}
            className="rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            Report absence
          </button>
        </div>
      </div>

      {/* Upcoming */}
      <h2 className="font-semibold text-neutral-900 mb-3">Upcoming reported absences</h2>
      {!absences.length && <p className="text-sm text-neutral-400">None reported.</p>}
      <div className="space-y-2">
        {absences.map((a) => (
          <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between text-sm">
            <div>
              <span className="font-medium text-neutral-900">{a.absence_date}</span>
              <span className="text-neutral-500"> · {a.class_id ? (a.class_name || classNameById[a.class_id] || 'A class') : 'Whole day'}</span>
              {a.reason && <span className="text-neutral-400"> — {a.reason}</span>}
            </div>
            <button onClick={() => cancel(a.id)} className="text-red-500 hover:underline">Cancel</button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default AbsenceReportingPage
