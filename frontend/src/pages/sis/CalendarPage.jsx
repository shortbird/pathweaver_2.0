import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import WeeklySchedule, { SCHEDULE_PALETTE } from '../../components/schedule/WeeklySchedule'

const field = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

/**
 * SIS Calendar — the org's whole week at a glance: every scheduled class on the
 * M-F grid, filterable by teacher, with a color legend keyed to the grid.
 */
const CalendarPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [teacherId, setTeacherId] = useState('')

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withOrg('/api/sis/classes', orgId))
      .then((r) => setClasses(r.data?.classes || []))
      .catch(() => toast.error('Failed to load classes'))
      .finally(() => setLoading(false))
  }, [orgId])

  const teachers = useMemo(() => {
    const map = new Map()
    classes.forEach((c) => {
      if (c.primary_instructor_id && c.primary_instructor) {
        map.set(c.primary_instructor_id, c.primary_instructor.name || c.primary_instructor.display_name || 'Teacher')
      }
    })
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [classes])

  // Only scheduled classes render; the filter keeps original palette indexes so
  // a class stays the same color whether or not the view is filtered.
  const scheduled = useMemo(
    () => classes.filter((c) => (c.meetings || []).length > 0),
    [classes],
  )
  const shown = useMemo(
    () => (teacherId ? scheduled.filter((c) => c.primary_instructor_id === teacherId) : scheduled),
    [scheduled, teacherId],
  )
  const unscheduled = classes.length - scheduled.length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Calendar</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      {teachers.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={`${field} min-w-[220px]`} aria-label="Filter by teacher">
            <option value="">All teachers</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {teacherId && (
            <button onClick={() => setTeacherId('')} className="text-sm text-optio-purple hover:underline">Clear filter</button>
          )}
        </div>
      )}

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !scheduled.length && (
        <p className="text-neutral-500">
          No scheduled classes yet. Add meeting times to classes on the Classes page and they'll appear here.
        </p>
      )}

      {!loading && scheduled.length > 0 && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 mb-4">
            <WeeklySchedule classes={shown} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Classes</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5">
              {shown.map((c, i) => (
                <div key={c.id} className="flex items-center gap-2 text-sm min-w-0">
                  <span className={`w-3 h-3 rounded flex-shrink-0 ${SCHEDULE_PALETTE[i % SCHEDULE_PALETTE.length].split(' ')[0]}`} />
                  <span className="text-neutral-800 truncate">{c.name}</span>
                  {c.primary_instructor && (
                    <span className="text-xs text-neutral-400 truncate">· {c.primary_instructor.name || c.primary_instructor.display_name}</span>
                  )}
                </div>
              ))}
            </div>
            {unscheduled > 0 && !teacherId && (
              <p className="mt-3 text-xs text-neutral-400">{unscheduled} class{unscheduled === 1 ? ' has' : 'es have'} no meeting times and {unscheduled === 1 ? "isn't" : "aren't"} shown.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default CalendarPage
