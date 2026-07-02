import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { useAuth } from '../../contexts/AuthContext'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

/**
 * Attendance — optimized for a teacher taking roll. Their assigned classes are
 * one tap away; every student defaults to PRESENT and the teacher only taps the
 * absent ones, then saves once. Saving records the entire roster (present +
 * absent) in one request, so "attendance was taken" is explicit and any student
 * can be toggled and re-saved later.
 */

const field = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'
const today = () => new Date().toISOString().slice(0, 10)

const meetingText = (meetings = []) => {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  if (!meetings.length) return ''
  const m = meetings[0]
  const t = (v) => (v ? String(v).slice(0, 5) : '')
  return `${DAYS[m.day_of_week] ?? ''} ${t(m.start_time)}${m.end_time ? `–${t(m.end_time)}` : ''}`.trim()
}

const AttendancePage = () => {
  const { user } = useAuth()
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [date, setDate] = useState(today())
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [alreadyTaken, setAlreadyTaken] = useState(false)
  const [dirty, setDirty] = useState(false)

  const myClasses = useMemo(
    () => classes.filter((c) => c.primary_instructor_id && c.primary_instructor_id === user?.id),
    [classes, user?.id],
  )

  useEffect(() => {
    if (!orgId) return
    setClassId('')
    api.get(withOrg('/api/sis/classes', orgId))
      .then((r) => {
        const list = r.data?.classes || []
        setClasses(list)
        // A teacher lands ready to go: their first assigned class pre-selected.
        const mine = list.filter((c) => c.primary_instructor_id === user?.id)
        if (mine.length === 1) setClassId(mine[0].id)
      })
      .catch(() => toast.error('Failed to load classes'))
  }, [orgId, user?.id])

  const loadRoster = useCallback(() => {
    if (!orgId || !classId || !date) { setRoster([]); setAlreadyTaken(false); setDirty(false); return }
    setLoading(true)
    api.get(`/api/sis/classes/${classId}/attendance?date=${date}&organization_id=${orgId}`)
      .then((r) => {
        const rows = r.data?.roster || []
        setRoster(rows.map((s) => ({ ...s, absent: s.status === 'absent' })))
        setAlreadyTaken(rows.some((s) => s.status != null))
        setDirty(false)
      })
      .catch(() => toast.error('Failed to load roster'))
      .finally(() => setLoading(false))
  }, [orgId, classId, date])

  useEffect(() => { loadRoster() }, [loadRoster])

  const toggleAbsent = (studentId) => {
    setRoster((rs) => rs.map((s) => (s.student_user_id === studentId ? { ...s, absent: !s.absent } : s)))
    setDirty(true)
  }

  const absentCount = roster.filter((s) => s.absent).length

  const save = async () => {
    // The whole roster is recorded: untouched students are saved as present.
    const entries = roster.map((s) => ({
      student_user_id: s.student_user_id,
      status: s.absent ? 'absent' : 'present',
    }))
    if (!entries.length) return
    setSaving(true)
    try {
      await api.post(`/api/sis/classes/${classId}/attendance`, { date, entries, organization_id: orgId })
      toast.success(absentCount
        ? `Saved — ${absentCount} absent, ${entries.length - absentCount} present`
        : `Saved — all ${entries.length} present`)
      setAlreadyTaken(true)
      setDirty(false)
    } catch { toast.error('Could not save attendance') }
    finally { setSaving(false) }
  }

  const selectedClass = classes.find((c) => c.id === classId)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Attendance</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      {myClasses.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">My classes</div>
          <div className="flex flex-wrap gap-2">
            {myClasses.map((c) => (
              <button
                key={c.id}
                onClick={() => setClassId(c.id)}
                className={`rounded-xl border px-4 py-2.5 text-left transition-colors ${
                  classId === c.id
                    ? 'border-optio-purple bg-optio-purple/5 text-optio-purple'
                    : 'border-gray-200 bg-white text-neutral-700 hover:border-optio-purple/50'
                }`}
              >
                <div className="text-sm font-semibold">{c.name}</div>
                <div className="text-xs opacity-70">
                  {[meetingText(c.meetings), `${c.enrolled_count ?? 0} students`].filter(Boolean).join(' · ')}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap gap-3">
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className={`${field} flex-1 min-w-[200px]`}>
          <option value="">{myClasses.length ? 'All classes…' : 'Select a class…'}</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} aria-label="Attendance date" />
      </div>

      {!classId && <p className="text-neutral-500">Pick a class to take attendance — tap the students who are absent, then save.</p>}
      {loading && <p className="text-neutral-500">Loading…</p>}
      {classId && !loading && !roster.length && <p className="text-neutral-500">No enrolled students in this class.</p>}

      {!loading && roster.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
            <div className="text-sm text-neutral-600">
              <span className="font-semibold text-neutral-900">{selectedClass?.name}</span>
              {' · '}{roster.length - absentCount} present · <span className={absentCount ? 'text-red-600 font-medium' : ''}>{absentCount} absent</span>
            </div>
            {alreadyTaken && !dirty && (
              <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-green-100 text-green-700">Attendance taken</span>
            )}
            {dirty && (
              <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">Unsaved changes</span>
            )}
          </div>

          <p className="px-4 pt-3 text-xs text-neutral-400">
            Everyone is counted present — tap only the students who are absent.
          </p>

          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {roster.map((s) => (
              <button
                key={s.student_user_id}
                onClick={() => toggleAbsent(s.student_user_id)}
                aria-pressed={s.absent}
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-3 text-left transition-colors ${
                  s.absent
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-200 bg-white hover:border-neutral-300'
                }`}
              >
                <span className="min-w-0">
                  <span className={`block text-sm font-medium truncate ${s.absent ? 'text-red-700' : 'text-neutral-800'}`}>{s.name}</span>
                  {s.planned_absence && (
                    <span
                      className="text-[11px] text-amber-700"
                      title={s.planned_absence.reason || 'Reported by a guardian'}
                    >
                      Parent reported out{s.planned_absence.scope === 'day' ? ' (all day)' : ''}
                    </span>
                  )}
                </span>
                <span className={`shrink-0 text-xs font-semibold rounded-full px-2.5 py-1 ${
                  s.absent ? 'bg-red-100 text-red-700' : 'bg-green-50 text-green-600'
                }`}>
                  {s.absent ? 'Absent' : 'Present'}
                </span>
              </button>
            ))}
          </div>

          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
            <span className="text-xs text-neutral-400">Untouched students are saved as present. You can edit and re-save anytime.</span>
            <Button size="sm" onClick={save} loading={saving}>
              {absentCount ? `Save (${absentCount} absent)` : 'Save — all present'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AttendancePage
