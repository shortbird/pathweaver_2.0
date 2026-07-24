import React, { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ExclamationTriangleIcon, PrinterIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import GradebookTab from '../../components/sis/GradebookTab'
import ClassDiscussion from '../../components/discussion/ClassDiscussion'

/**
 * TeacherClassPage — one class for its teacher: the roster (photos, ages,
 * guardian contacts, allergy/medical alerts) and quick-entry attendance.
 * The roster comes from the access-logged /teacher/classes/:id/roster
 * endpoint; attendance reuses the existing class attendance API.
 * Printing uses a print stylesheet that reduces the page to the roster table.
 */

const ATT_STATUSES = ['present', 'absent', 'late', 'excused']
const ATT_COLORS = {
  present: 'bg-green-600 text-white',
  absent: 'bg-red-600 text-white',
  late: 'bg-amber-500 text-white',
  excused: 'bg-blue-600 text-white',
}

const today = () => new Date().toISOString().slice(0, 10)

const TeacherClassPage = () => {
  const { classId } = useParams()
  const { orgId } = useSisOrg()
  const [cls, setCls] = useState(null)
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(today())
  const [marks, setMarks] = useState({})
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('roster')

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withOrg(`/api/sis/teacher/classes/${classId}/roster`, orgId))
      .then((r) => { setCls(r.data?.class); setStudents(r.data?.students || []) })
      .catch((e) => toast.error(e?.response?.data?.error || 'Failed to load the roster'))
      .finally(() => setLoading(false))
  }, [orgId, classId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!orgId || !date) return
    api.get(withOrg(`/api/sis/classes/${classId}/attendance?date=${date}`, orgId))
      .then((r) => {
        const existing = {}
        for (const row of r.data?.roster || []) {
          if (row.status) existing[row.student_user_id] = row.status
        }
        setMarks(existing)
      })
      .catch(() => setMarks({}))
  }, [orgId, classId, date])

  // Everyone is present by default — the teacher only taps the exceptions
  // (absent/late/excused). Any status an admin already set (e.g. an excusal)
  // loads into `marks` and wins over the default.
  const markOf = (id) => marks[id] || 'present'

  const saveAttendance = async () => {
    // Record the WHOLE roster so "attendance was taken" is explicit — untouched
    // students save as present.
    const entries = students.map((s) => ({ student_user_id: s.student_id, status: markOf(s.student_id) }))
    if (!entries.length) {
      toast.error('No students to record')
      return
    }
    setSaving(true)
    try {
      await api.post(`/api/sis/classes/${classId}/attendance`, {
        organization_id: orgId, date, entries,
      })
      toast.success('Attendance saved')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save attendance')
    } finally {
      setSaving(false)
    }
  }

  // Reset any exceptions back to all-present.
  const markAllPresent = () => setMarks({})

  if (loading) return <p className="text-neutral-500">Loading…</p>

  return (
    <div>
      <style>{`
        @media print {
          .sis-no-print { display: none !important; }
          aside, nav { display: none !important; }
          main { margin: 0 !important; padding: 0 !important; }
        }
      `}</style>

      <div className="flex items-center justify-between mb-6 sis-no-print">
        <div>
          <Link to="/my-classes" className="text-sm text-optio-purple hover:underline">← My Classes</Link>
          <h1 className="text-2xl font-bold text-neutral-900">{cls?.name || 'Class'}</h1>
        </div>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50">
          <PrinterIcon className="w-4 h-4" /> Print roster
        </button>
      </div>
      <h1 className="hidden print:block text-xl font-bold mb-4">{cls?.name} — roster</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 sis-no-print">
        {[['roster', 'Roster & Attendance'], ['gradebook', 'Gradebook'], ['discussion', 'Discussion']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-optio-purple text-optio-purple'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'gradebook' && (
        <GradebookTab classId={classId} orgId={orgId} className={cls?.name} />
      )}

      {tab === 'discussion' && (
        <ClassDiscussion classId={classId} />
      )}

      {tab === 'roster' && (() => {
        const count = (st) => students.filter((s) => markOf(s.student_id) === st).length
        const present = count('present'); const absent = count('absent')
        const late = count('late'); const excused = count('excused')
        // Card background by status — mirrors the admin /attendance page.
        const CARD = {
          present: 'border-gray-200 bg-white hover:border-neutral-300',
          absent: 'border-red-300 bg-red-50',
          late: 'border-amber-300 bg-amber-50',
          excused: 'border-blue-300 bg-blue-50',
        }
        return (<>
          {/* Controls — same shell as the admin attendance page */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap items-center gap-3 sis-no-print">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
              aria-label="Attendance date" />
            <button onClick={markAllPresent} className="text-sm text-optio-purple hover:underline">Reset to all present</button>
          </div>

          {!students.length && <p className="text-neutral-500 sis-no-print">No students enrolled yet.</p>}

          {students.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden sis-no-print">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
                <div className="text-sm text-neutral-600">
                  <span className="font-semibold text-neutral-900">{cls?.name}</span>
                  {' · '}{present} present
                  {absent ? <> · <span className="text-red-600 font-medium">{absent} absent</span></> : null}
                  {late ? ` · ${late} late` : ''}
                  {excused ? ` · ${excused} excused` : ''}
                </div>
              </div>

              <p className="px-4 pt-3 text-xs text-neutral-400">
                Everyone is present by default — tap only the students who are absent, late, or excused.
              </p>

              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {students.map((s) => (
                  <div key={s.student_id} className={`rounded-lg border px-3 py-3 transition-colors ${CARD[markOf(s.student_id)]}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-neutral-800 truncate">
                          {s.name}
                          {s.age != null && <span className="ml-1.5 text-xs font-normal text-neutral-400">age {s.age}</span>}
                        </span>
                        {s.has_alert && (
                          <span className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-semibold text-red-700"
                            title={[s.allergies && `Allergies: ${s.allergies}`, s.medications && `Medical: ${s.medications}`].filter(Boolean).join(' | ')}>
                            <ExclamationTriangleIcon className="w-3.5 h-3.5" /> Alert
                          </span>
                        )}
                      </span>
                      <div className="flex gap-1 shrink-0">
                        {ATT_STATUSES.map((st) => (
                          <button key={st}
                            onClick={() => setMarks((prev) => ({ ...prev, [s.student_id]: st }))}
                            className={`px-2 py-1 rounded-md text-[11px] font-semibold capitalize transition-colors ${
                              markOf(s.student_id) === st ? ATT_COLORS[st] : 'bg-gray-100 text-neutral-500 hover:bg-gray-200'}`}>
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
                <span className="text-xs text-neutral-400">Untouched students are saved as present. You can edit and re-save anytime.</span>
                <button onClick={saveAttendance} disabled={saving}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save attendance'}
                </button>
              </div>
            </div>
          )}

          {/* Printed roster — full contact + alert detail for a paper copy. */}
          <div className="hidden print:block">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-gray-300">
                  <th className="py-1 pr-3">Student</th><th className="py-1 pr-3">Age</th>
                  <th className="py-1 pr-3">Guardians</th><th className="py-1">Alerts</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.student_id} className="border-b border-gray-200 align-top">
                    <td className="py-1.5 pr-3 font-medium">{s.name}</td>
                    <td className="py-1.5 pr-3">{s.age ?? ''}</td>
                    <td className="py-1.5 pr-3">
                      {(s.guardians || []).map((g) => `${g.name}${g.email ? ` (${g.email})` : ''}`).join(' · ') || '—'}
                      {s.household_phone ? ` · ${s.household_phone}` : ''}
                    </td>
                    <td className="py-1.5">
                      {[s.allergies && `Allergies: ${s.allergies}`, s.medications && `Medical: ${s.medications}`].filter(Boolean).join(' | ') || ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)
      })()}
    </div>
  )
}

export default TeacherClassPage
