import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { useAuth } from '../../contexts/AuthContext'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import SearchSelect from '../../components/ui/SearchSelect'
import { classLabel, meetingText } from '../../components/sis/classLabel'
import AttendanceAlerts from '../../components/sis/AttendanceAlerts'
import { isSisAdmin } from './sisRole'

/**
 * Attendance — optimized for a teacher taking roll. Their assigned classes are
 * one tap away; every student defaults to PRESENT and the teacher only marks
 * the exceptions (absent, late, excused), then saves once. Saving records the
 * entire roster in one request, so "attendance was taken" is explicit and any
 * student can be changed and re-saved later. Status set mirrors
 * TeacherClassPage and the backend's ATTENDANCE_STATUSES.
 */

const ATT_STATUSES = ['present', 'absent', 'late', 'excused']
const ATT_COLORS = {
  present: 'bg-green-600 text-white',
  absent: 'bg-red-600 text-white',
  late: 'bg-amber-500 text-white',
  excused: 'bg-blue-600 text-white',
}
const CARD = {
  present: 'border-gray-200 bg-white hover:border-neutral-300',
  absent: 'border-red-300 bg-red-50',
  late: 'border-amber-300 bg-amber-50',
  excused: 'border-blue-300 bg-blue-50',
}

const field = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'
// Local date, not UTC: toISOString() rolls over at 6pm Mountain, so an evening
// visit opened TOMORROW's roster (iCreate, 2026-09-02).
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
  // "I would like to be able to search by student on the attendance page"
  // (iCreate, 2026-08-24). Filters the cards only — counts and Save always
  // work on the whole roster, so a filtered view still saves everyone.
  const [search, setSearch] = useState('')
  // Guardian-reported absences from today forward — the panel the "Absence
  // reported" notification lands on. Admin-only (the endpoint 403s teachers).
  const admin = isSisAdmin(user)
  const [absences, setAbsences] = useState([])
  // The student-accountability board, the same one the coordinator dashboard
  // shows (iCreate, 2026-09-01). The "Student not accounted for" notification
  // lands here, and this is where the front office chases it down — so the
  // alerts have to be resolvable here, not only on the dashboard. Org-wide and
  // date-independent on purpose: an alert stays open until somebody says what
  // happened, and yesterday's unresolved student is still unaccounted for.
  const [alerts, setAlerts] = useState([])
  const [resolutions, setResolutions] = useState([])

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
        // Default is present; a status already recorded (including an excusal
        // an admin set) loads in and wins over the default.
        setRoster(rows.map((s) => ({ ...s, mark: s.status || 'present' })))
        setAlreadyTaken(rows.some((s) => s.status != null))
        setDirty(false)
      })
      .catch(() => toast.error('Failed to load roster'))
      .finally(() => setLoading(false))
  }, [orgId, classId, date])

  useEffect(() => { loadRoster() }, [loadRoster])

  useEffect(() => {
    if (!orgId || !admin) { setAbsences([]); return }
    api.get(withOrg('/api/sis/attendance/absences', orgId))
      .then((r) => setAbsences(r.data?.absences || []))
      .catch(() => setAbsences([]))
  }, [orgId, admin])

  const loadAlerts = useCallback(() => {
    if (!orgId || !admin) { setAlerts([]); return }
    api.get(withOrg('/api/sis/attendance/alerts', orgId))
      .then((r) => { setAlerts(r.data?.alerts || []); setResolutions(r.data?.resolutions || []) })
      .catch(() => setAlerts([]))
  }, [orgId, admin])

  useEffect(() => { loadAlerts() }, [loadAlerts])

  const visibleRoster = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return roster
    return roster.filter((s) => (s.name || '').toLowerCase().includes(q))
  }, [roster, search])

  const setMark = (studentId, mark) => {
    setRoster((rs) => rs.map((s) => (s.student_user_id === studentId ? { ...s, mark } : s)))
    setDirty(true)
  }

  const countOf = (st) => roster.filter((s) => s.mark === st).length
  const absentCount = countOf('absent')
  const lateCount = countOf('late')
  const excusedCount = countOf('excused')

  const save = async () => {
    // The whole roster is recorded: untouched students are saved as present.
    const entries = roster.map((s) => ({
      student_user_id: s.student_user_id,
      status: s.mark || 'present',
    }))
    if (!entries.length) return
    setSaving(true)
    try {
      await api.post(`/api/sis/classes/${classId}/attendance`, { date, entries, organization_id: orgId })
      const exceptions = [
        absentCount && `${absentCount} absent`,
        lateCount && `${lateCount} late`,
        excusedCount && `${excusedCount} excused`,
      ].filter(Boolean).join(', ')
      toast.success(exceptions ? `Saved — ${exceptions}` : `Saved — all ${entries.length} present`)
      setAlreadyTaken(true)
      setDirty(false)
      // Saving an absence with no guardian report opens an alert — show it now,
      // rather than leaving the board stale until the next page load.
      loadAlerts()
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
        <SearchSelect
          className="flex-1 min-w-[200px]"
          value={classId}
          onChange={setClassId}
          options={classes}
          getId={(c) => c.id}
          getLabel={classLabel}
          placeholder="Search classes…"
        />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} aria-label="Attendance date" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${field} min-w-[180px]`}
          placeholder="Search students…"
          aria-label="Search students"
        />
      </div>

      {admin && (
        <AttendanceAlerts
          alerts={alerts}
          resolutions={resolutions}
          orgId={orgId}
          onResolved={loadAlerts}
          onOpenRoster={(cid, d) => { setDate(d); setClassId(cid) }}
          className="mb-6"
        />
      )}

      {admin && absences.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">
            Reported out — today and upcoming
          </div>
          <ul className="divide-y divide-gray-100">
            {absences.map((a) => (
              <li key={a.id}>
                {/* Jump the roster to the report: its date, and its class when
                    it names one — that's where the amber caption lives. */}
                <button
                  type="button"
                  className="w-full text-left py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 hover:bg-neutral-50 rounded-md px-1"
                  onClick={() => { setDate(a.absence_date); if (a.class_id) setClassId(a.class_id) }}
                  title="Show this date on the roster"
                >
                  <span className="text-sm font-medium text-neutral-900">{a.student_name}</span>
                  <span className="text-sm text-neutral-600">{a.absence_date}</span>
                  <span className="text-xs text-amber-700">
                    {a.class_name ? a.class_name : 'All day'}
                  </span>
                  {a.reason && <span className="text-xs text-neutral-400 truncate">{a.reason}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!classId && <p className="text-neutral-500">Pick a class to take attendance — tap the students who are absent, then save.</p>}
      {loading && <p className="text-neutral-500">Loading…</p>}
      {classId && !loading && !roster.length && <p className="text-neutral-500">No enrolled students in this class.</p>}

      {!loading && roster.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
            <div className="text-sm text-neutral-600">
              <span className="font-semibold text-neutral-900">{selectedClass?.name}</span>
              {selectedClass && meetingText(selectedClass.meetings) ? <span className="text-neutral-400"> · {meetingText(selectedClass.meetings)}</span> : null}
              {' · '}{countOf('present')} present
              {absentCount ? <> · <span className="text-red-600 font-medium">{absentCount} absent</span></> : null}
              {lateCount ? ` · ${lateCount} late` : ''}
              {excusedCount ? ` · ${excusedCount} excused` : ''}
            </div>
            {alreadyTaken && !dirty && (
              <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-green-100 text-green-700">Attendance taken</span>
            )}
            {dirty && (
              <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">Unsaved changes</span>
            )}
          </div>

          <p className="px-4 pt-3 text-xs text-neutral-400">
            Everyone is counted present — mark only the students who are absent, late, or excused.
          </p>

          {search.trim() && (
            <p className="px-4 pt-2 text-xs text-neutral-500">
              Showing {visibleRoster.length} of {roster.length} students matching "{search.trim()}"
              {' · '}
              <button type="button" className="text-optio-purple hover:underline" onClick={() => setSearch('')}>
                Clear
              </button>
            </p>
          )}

          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {visibleRoster.map((s) => (
              <div
                key={s.student_user_id}
                data-student-row
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-3 transition-colors ${CARD[s.mark] || CARD.present}`}
              >
                <span className="min-w-0">
                  <span className={`block text-sm font-medium truncate ${s.mark === 'absent' ? 'text-red-700' : 'text-neutral-800'}`}>
                    {s.name}
                    {s.age != null && <span className="ml-1.5 text-xs font-normal text-neutral-400">age {s.age}</span>}
                  </span>
                  {s.planned_absence && (
                    <span
                      className="text-[11px] text-amber-700"
                      title={s.planned_absence.reason || 'Reported by a guardian'}
                    >
                      Parent reported out{s.planned_absence.scope === 'day' ? ' (all day)' : ''}
                    </span>
                  )}
                </span>
                <span className="flex gap-1 shrink-0">
                  {ATT_STATUSES.map((st) => (
                    <button
                      key={st}
                      aria-label={st.charAt(0).toUpperCase() + st.slice(1)}
                      aria-pressed={s.mark === st}
                      onClick={() => setMark(s.student_user_id, st)}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold capitalize transition-colors ${
                        s.mark === st ? ATT_COLORS[st] : 'bg-gray-100 text-neutral-500 hover:bg-gray-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </span>
              </div>
            ))}
          </div>

          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
            <span className="text-xs text-neutral-400">Untouched students are saved as present. You can edit and re-save anytime.</span>
            <Button size="sm" onClick={save} loading={saving}>
              {absentCount ? `Save (${absentCount} absent)` : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AttendancePage
