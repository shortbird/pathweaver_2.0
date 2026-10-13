import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { useSisOrg, withOrg } from './useSisOrg'
import { isSisAdmin } from './sisRole'
import BackToDashboard from '../../components/sis/BackToDashboard'
import AttendanceAlerts from '../../components/sis/AttendanceAlerts'
import StatusPill from '../../components/sis/ui/StatusPill'
import { statusLabel, statusTone } from '../../components/sis/ui/statusMaps'
import { Spinner } from '../../components/ui/Spinner'
import { INLINE_INPUT_CLASS } from '../../components/ui/Input'
import {
  attendanceSettingsFor, isSchoolDay, localIso, nearestSchoolDay, stepSchoolDay,
} from './attendanceSettings'

/**
 * The daily roll: one whole-school attendance mark per student per day.
 *
 * Ticket 0680d03c (Apogee Cache Valley): "schoolwide daily attendance for
 * teachers" -- Present when they arrive in the morning, Absent with a reason
 * (no "Sick"), Picked up when they leave with the time recorded
 * automatically, school days Mon-Thu. The coaches take it on their phones, so
 * every row is one line of big buttons and every tap saves at once: there is
 * no Save button to forget at pickup time.
 *
 * Shown at /attendance when the school's daily roll setting is on
 * (sis_settings.attendance.daily_roll); off, /attendance still opens the
 * class roll. Gated on the attendance module only, so a school with classes
 * hidden reaches it. The backend (GET/POST /api/sis/attendance/daily) is the
 * gate; the statuses and school days come back with the roster.
 */

const ROW_TONE = {
  present: 'border-green-200 bg-green-50/60',
  late: 'border-amber-200 bg-amber-50/60',
  absent: 'border-red-200 bg-red-50/60',
  excused: 'border-blue-200 bg-blue-50/60',
}

export const timeOf = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function DailyRollPage() {
  const { user } = useAuth()
  const { orgId, activeOrg } = useSisOrg()
  const admin = isSisAdmin(user)
  const orgSettings = attendanceSettingsFor(activeOrg)
  const [settings, setSettings] = useState(orgSettings)
  const [date, setDate] = useState(() => nearestSchoolDay(localIso(new Date()), orgSettings.school_days, -1))
  const [today, setToday] = useState(localIso(new Date()))
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(null)
  const [search, setSearch] = useState('')
  const [notes, setNotes] = useState({})
  const [alerts, setAlerts] = useState([])
  const [resolutions, setResolutions] = useState([])

  const load = useCallback(() => {
    if (!orgId || !date) return
    setLoading(true)
    api.get(withOrg(`/api/sis/attendance/daily?date=${date}`, orgId))
      .then((r) => {
        const rows = r.data?.roster || []
        setRoster(rows)
        setNotes(Object.fromEntries(rows.map((s) => [s.student_user_id, s.note || ''])))
        if (r.data?.settings) setSettings(r.data.settings)
        if (r.data?.today) setToday(r.data.today)
      })
      .catch(() => toast.error('Could not load the daily roll'))
      .finally(() => setLoading(false))
  }, [orgId, date])

  useEffect(() => { load() }, [load])

  const loadAlerts = useCallback(() => {
    if (!orgId || !admin) { setAlerts([]); return }
    api.get(withOrg('/api/sis/attendance/alerts', orgId))
      .then((r) => { setAlerts(r.data?.alerts || []); setResolutions(r.data?.resolutions || []) })
      .catch(() => setAlerts([]))
  }, [orgId, admin])

  useEffect(() => { loadAlerts() }, [loadAlerts])

  const merge = (studentId, fields) => {
    setRoster((rs) => rs.map((s) => (s.student_user_id === studentId ? { ...s, ...fields } : s)))
  }

  const pick = (fields) => ({
    status: fields.status ?? null,
    note: fields.note ?? null,
    arrived_at: fields.arrived_at ?? null,
    departed_at: fields.departed_at ?? null,
  })

  const mark = async (student, status) => {
    const id = student.student_user_id
    const note = status === 'absent' ? (notes[id] || '').trim() : ''
    setBusy(id)
    try {
      const { data } = await api.post('/api/sis/attendance/daily', {
        date, organization_id: orgId,
        entries: [{ student_user_id: id, status, note: note || null }],
      })
      const saved = (data?.saved || []).find((r) => r.student_user_id === id)
      if (saved) merge(id, pick(saved))
      if (status !== 'absent') setNotes((n) => ({ ...n, [id]: '' }))
      if (data?.absences_flagged || data?.alerts_auto_resolved) loadAlerts()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save the mark')
    } finally {
      setBusy(null)
    }
  }

  const checkout = async (student, undo = false) => {
    const id = student.student_user_id
    setBusy(id)
    try {
      const url = withOrg(`/api/sis/attendance/daily/${id}/checkout?date=${date}`, orgId)
      const { data } = undo ? await api.delete(url) : await api.post(url, { date })
      if (data?.record) merge(id, { departed_at: data.record.departed_at ?? null })
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not record the pickup')
    } finally {
      setBusy(null)
    }
  }

  const counts = useMemo(() => {
    const c = { here: 0, absent: 0, excused: 0, picked_up: 0, unmarked: 0 }
    for (const s of roster) {
      if (!s.status) c.unmarked += 1
      else if (s.status === 'absent') c.absent += 1
      else if (s.status === 'excused') c.excused += 1
      else if (s.departed_at) c.picked_up += 1
      else c.here += 1
    }
    return c
  }, [roster])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? roster.filter((s) => (s.name || '').toLowerCase().includes(q)) : roster
  }, [roster, search])

  const canCheckout = settings.checkout && date === today
  const offDay = !isSchoolDay(date, settings.school_days)

  return (
    <div>
      <BackToDashboard className="mb-1" />
      <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        Tap a status for each student. Every tap saves.
      </p>

      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-quiet px-3" aria-label="Previous school day"
          onClick={() => setDate((d) => stepSchoolDay(d, settings.school_days, -1))}>‹</button>
        <input type="date" value={date} aria-label="Attendance date" className={INLINE_INPUT_CLASS}
          onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button type="button" className="btn-quiet px-3" aria-label="Next school day"
          onClick={() => setDate((d) => stepSchoolDay(d, settings.school_days, 1))}>›</button>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
          className={`${INLINE_INPUT_CLASS} flex-1 min-w-[10rem]`}
          placeholder="Search students…" aria-label="Search students" />
      </div>

      {offDay && (
        <p className="text-sm text-amber-700 mb-3">This is not one of the school&apos;s days.</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4" data-roll-counts>
        <Count label="Here" value={counts.here} />
        <Count label="Absent" value={counts.absent} />
        {settings.checkout && <Count label="Picked up" value={counts.picked_up} />}
        {settings.statuses.includes('excused') && <Count label="Excused" value={counts.excused} />}
        <Count label="Not marked" value={counts.unmarked} />
      </div>

      {admin && (
        <AttendanceAlerts alerts={alerts} resolutions={resolutions} orgId={orgId}
          onResolved={loadAlerts} className="mb-4" />
      )}

      {loading && <div className="py-8 flex justify-center"><Spinner size="md" /></div>}
      {!loading && !roster.length && <p className="text-gray-500">No students in this school yet.</p>}

      {!loading && roster.length > 0 && (
        <ul className="space-y-2">
          {visible.map((s) => {
            const id = s.student_user_id
            const here = s.status === 'present' || s.status === 'late'
            const saving = busy === id
            return (
              <li key={id} data-student-row
                className={`rounded-xl border px-3 py-3 ${ROW_TONE[s.status] || 'border-gray-200 bg-white'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-[8rem] flex-1">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {s.name}
                      {s.age != null && <span className="ml-1.5 text-xs font-normal text-gray-400">age {s.age}</span>}
                    </div>
                    <div className="text-xs text-gray-500 flex flex-wrap gap-x-2">
                      {here && s.arrived_at && <span>Arrived {timeOf(s.arrived_at)}</span>}
                      {here && s.departed_at && <span data-picked-up>Picked up {timeOf(s.departed_at)}</span>}
                      {s.planned_absence && (
                        <span className="text-amber-700" title={s.planned_absence.reason || 'Reported by a guardian'}>
                          Parent reported out{s.planned_absence.reason ? `: ${s.planned_absence.reason}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {settings.statuses.map((st) => (
                      <button key={st} type="button" disabled={saving}
                        aria-pressed={s.status === st}
                        onClick={() => s.status !== st && mark(s, st)}
                        className={`min-h-[44px] min-w-[4.5rem] px-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 ${
                          s.status === st ? statusTone('attendance', st, 'solid') : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                        {statusLabel('attendance', st)}
                      </button>
                    ))}
                    {settings.checkout && here && !s.departed_at && canCheckout && (
                      <button type="button" disabled={saving} onClick={() => checkout(s)}
                        className="min-h-[44px] px-3 rounded-lg text-sm font-semibold bg-white border border-optio-purple text-optio-purple hover:bg-optio-purple/5 disabled:opacity-60">
                        Picked up
                      </button>
                    )}
                    {settings.checkout && here && s.departed_at && (
                      <>
                        <StatusPill domain="attendance" status="picked_up" className="self-center">
                          Picked up {timeOf(s.departed_at)}
                        </StatusPill>
                        <button type="button" disabled={saving} onClick={() => checkout(s, true)}
                          className="min-h-[44px] px-3 text-sm font-medium text-optio-purple hover:underline disabled:opacity-60">
                          Undo
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {s.status === 'absent' && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input type="text" value={notes[id] || ''} maxLength={500}
                      onChange={(e) => setNotes((n) => ({ ...n, [id]: e.target.value }))}
                      className={`${INLINE_INPUT_CLASS} flex-1 min-w-[12rem]`}
                      placeholder="Reason (optional)" aria-label={`Reason ${s.name} is absent`} />
                    <button type="button" disabled={saving || (notes[id] || '') === (s.note || '')}
                      onClick={() => mark(s, 'absent')} className="btn-quiet">
                      Save reason
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Count({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
    </div>
  )
}
