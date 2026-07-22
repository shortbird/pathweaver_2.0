import React, { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ExclamationTriangleIcon, PrinterIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'

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

const initials = (name) => (name || '?').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('')

const TeacherClassPage = () => {
  const { classId } = useParams()
  const { orgId } = useSisOrg()
  const [cls, setCls] = useState(null)
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(today())
  const [marks, setMarks] = useState({})
  const [saving, setSaving] = useState(false)

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

  const saveAttendance = async () => {
    const entries = Object.entries(marks).map(([student_user_id, status]) => ({ student_user_id, status }))
    if (!entries.length) {
      toast.error('Mark at least one student first')
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

  const markAllPresent = () => {
    const all = {}
    for (const s of students) all[s.student_id] = marks[s.student_id] || 'present'
    setMarks(all)
  }

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

      {/* Attendance quick entry */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 sis-no-print">
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <h2 className="font-semibold text-neutral-900">Attendance</h2>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
          <button onClick={markAllPresent} className="text-sm text-optio-purple hover:underline">
            Mark all present
          </button>
          <button onClick={saveAttendance} disabled={saving}
            className="ml-auto px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : 'Save attendance'}
          </button>
        </div>
      </div>

      {!students.length && <p className="text-neutral-500">No students enrolled yet.</p>}

      <div className="space-y-3">
        {students.map((s) => (
          <div key={s.student_id} className="bg-white rounded-xl border border-gray-200 p-4 print:border-0 print:border-b print:rounded-none">
            <div className="flex items-start gap-4">
              {s.avatar_url ? (
                <img src={s.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover sis-no-print" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-optio-purple/20 to-optio-pink/20 flex items-center justify-center text-sm font-semibold text-optio-purple sis-no-print">
                  {initials(s.name)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-neutral-900">
                    {s.name}
                    {s.preferred_name && s.preferred_name !== s.name && (
                      <span className="font-normal text-neutral-500"> “{s.preferred_name}”</span>
                    )}
                  </p>
                  {s.age != null && <span className="text-sm text-neutral-500">Age {s.age}</span>}
                  {s.has_alert && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700"
                      title={[s.allergies && `Allergies: ${s.allergies}`, s.medications && `Medical: ${s.medications}`].filter(Boolean).join(' | ')}>
                      <ExclamationTriangleIcon className="w-3.5 h-3.5" /> Alert
                    </span>
                  )}
                </div>
                {s.has_alert && (
                  <p className="text-sm text-red-700 mt-0.5">
                    {s.allergies && <span className="mr-3"><span className="font-medium">Allergies:</span> {s.allergies}</span>}
                    {s.medications && <span><span className="font-medium">Medical:</span> {s.medications}</span>}
                  </p>
                )}
                <p className="text-sm text-neutral-500 mt-0.5">
                  {(s.guardians || []).map((g) => `${g.name}${g.email ? ` (${g.email})` : ''}`).join(' · ') || 'No guardian on file'}
                  {s.household_phone && ` · ${s.household_phone}`}
                </p>
                {s.attendance && (
                  <p className="text-xs text-neutral-400 mt-0.5 sis-no-print">
                    Attendance: {s.attendance.present + s.attendance.late} present · {s.attendance.absent} absent · {s.attendance.excused} excused
                  </p>
                )}
              </div>
              <div className="flex gap-1 shrink-0 sis-no-print">
                {ATT_STATUSES.map((st) => (
                  <button key={st}
                    onClick={() => setMarks((prev) => ({ ...prev, [s.student_id]: st }))}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                      marks[s.student_id] === st ? ATT_COLORS[st] : 'bg-gray-100 text-neutral-600 hover:bg-gray-200'}`}>
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default TeacherClassPage
