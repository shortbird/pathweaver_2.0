import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

const field = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'
const STATUSES = ['present', 'late', 'absent', 'excused']
const STATUS_STYLE = {
  present: 'bg-green-100 text-green-700', late: 'bg-amber-100 text-amber-700',
  absent: 'bg-red-100 text-red-700', excused: 'bg-blue-100 text-blue-700',
}
const today = () => new Date().toISOString().slice(0, 10)

const AttendancePage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [date, setDate] = useState(today())
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!orgId) return
    api.get(withOrg('/api/sis/classes', orgId))
      .then((r) => setClasses(r.data?.classes || []))
      .catch(() => toast.error('Failed to load classes'))
  }, [orgId])

  const loadRoster = useCallback(() => {
    if (!orgId || !classId || !date) { setRoster([]); return }
    setLoading(true)
    api.get(`/api/sis/classes/${classId}/attendance?date=${date}&organization_id=${orgId}`)
      .then((r) => setRoster(r.data?.roster || []))
      .catch(() => toast.error('Failed to load roster'))
      .finally(() => setLoading(false))
  }, [orgId, classId, date])

  useEffect(() => { loadRoster() }, [loadRoster])

  const setStatus = (studentId, status) => {
    setRoster((rs) => rs.map((s) => (s.student_user_id === studentId ? { ...s, status } : s)))
  }

  const save = async () => {
    const entries = roster.filter((s) => s.status).map((s) => ({ student_user_id: s.student_user_id, status: s.status }))
    if (!entries.length) { toast.error('Mark at least one student'); return }
    try {
      await api.post(`/api/sis/classes/${classId}/attendance`, { date, entries, organization_id: orgId })
      toast.success('Attendance saved')
    } catch { toast.error('Could not save attendance') }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Attendance</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap gap-3">
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className={`${field} flex-1 min-w-[200px]`}>
          <option value="">Select a class…</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
      </div>

      {!classId && <p className="text-neutral-500">Pick a class and date to take attendance.</p>}
      {loading && <p className="text-neutral-500">Loading…</p>}
      {classId && !loading && !roster.length && <p className="text-neutral-500">No enrolled students in this class.</p>}

      {roster.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="space-y-2 mb-4">
            {roster.map((s) => (
              <div key={s.student_user_id} className="flex items-center justify-between">
                <span className="font-medium text-neutral-800">
                  {s.name}
                  {s.planned_absence && (
                    <span
                      className="ml-2 text-[11px] rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 align-middle"
                      title={s.planned_absence.reason || 'Reported by a guardian'}
                    >
                      Parent reported out{s.planned_absence.scope === 'day' ? ' (all day)' : ''}
                    </span>
                  )}
                </span>
                <div className="flex gap-1">
                  {STATUSES.map((st) => (
                    <button
                      key={st}
                      onClick={() => setStatus(s.student_user_id, st)}
                      className={`text-xs rounded-full px-3 py-1 capitalize ${s.status === st ? STATUS_STYLE[st] : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Button size="sm" onClick={save}>Save attendance</Button>
        </div>
      )}
    </div>
  )
}

export default AttendancePage
