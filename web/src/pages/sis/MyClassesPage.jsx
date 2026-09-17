import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { Squares2X2Icon, CalendarDaysIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import { getPreviewTeacher, withPreview } from './teacherPreview'
import BackToDashboard from '../../components/sis/BackToDashboard'
import usePersistedChoice from '../../hooks/usePersistedChoice'
import { weekGrid, fmtTime, DAY_LABELS } from '../../utils/schedule'

/**
 * MyClassesPage — the teacher's classes with meeting times and roster counts.
 * Two views: cards, and a weekly schedule grid so they can see at a glance when
 * they teach. Data comes pre-scoped from /api/sis/teacher/classes.
 */

const WEEKDAYS = [1, 2, 3, 4, 5] // Mon-Fri, always shown

const meetingLabel = (m) => {
  const when = m.specific_date ? m.specific_date : DAY_LABELS[m.day_of_week] || ''
  return `${when} ${fmtTime(m.start_time)}–${fmtTime(m.end_time)}`
}

const MyClassesPage = () => {
  const { orgId } = useSisOrg()
  const navigate = useNavigate()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setViewPersist] = usePersistedChoice('sis_my_classes_view', 'cards', {
    validate: (v) => (v === 'cards' || v === 'schedule' ? v : null),
  })

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withPreview(withOrg('/api/sis/teacher/classes', orgId), getPreviewTeacher()))
      .then((r) => setClasses(r.data?.classes || []))
      .catch(() => toast.error('Failed to load your classes'))
      .finally(() => setLoading(false))
  }, [orgId])

  // The teacher's week on the shared row model: one row per start time across
  // the whole week, so a 9:30 class sits on the 9:30 row every day it meets.
  // Per-day stacks put the same class at different heights on different days.
  const week = useMemo(() => weekGrid(classes, { recurringOnly: true }), [classes])
  const days = useMemo(() => [...WEEKDAYS, ...week.days.filter((d) => !WEEKDAYS.includes(d))], [week])

  const todayDow = new Date().getDay() // 0=Sun … 6=Sat, matches day_of_week

  return (
    <div>
      <BackToDashboard className="mb-1" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">My Classes</h1>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white">
            <button onClick={() => setViewPersist('cards')} title="Card view" aria-pressed={view === 'cards'}
              className={`px-2.5 py-1.5 rounded-md transition-colors ${view === 'cards' ? 'bg-optio-purple text-white' : 'text-neutral-500 hover:bg-neutral-50'}`}>
              <Squares2X2Icon className="w-4 h-4" />
            </button>
            <button onClick={() => setViewPersist('schedule')} title="Weekly schedule" aria-pressed={view === 'schedule'}
              className={`px-2.5 py-1.5 rounded-md transition-colors ${view === 'schedule' ? 'bg-optio-purple text-white' : 'text-neutral-500 hover:bg-neutral-50'}`}>
              <CalendarDaysIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !classes.length && (
        <p className="text-neutral-500">No classes assigned to you yet — talk to your administrator.</p>
      )}

      {!loading && classes.length > 0 && view === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {classes.map((c) => (
            <Link key={c.id} to={`/my-classes/${c.id}`}
              className="bg-white rounded-xl border border-gray-200 p-4 hover:border-optio-purple/50 transition-colors flex flex-col">
              <div className="flex items-start gap-2 min-w-0">
                <h3 className="font-semibold text-neutral-900 truncate">{c.name}</h3>
                {c.my_role === 'assistant' && (
                  <span className="mt-0.5 flex-shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5 bg-optio-purple/10 text-optio-purple">
                    Assistant
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-500 mb-2">
                {c.enrolled_count} student{c.enrolled_count === 1 ? '' : 's'}
                {c.location ? ` · ${c.location}` : ''}
              </p>
              <div className="mt-auto space-y-0.5">
                {(c.meetings || []).slice(0, 4).map((m) => {
                  const isToday = !m.specific_date && m.day_of_week === todayDow
                  return (
                    <p key={m.id}
                      className={`text-xs ${isToday ? 'text-optio-purple font-semibold' : 'text-neutral-500'}`}>
                      {meetingLabel(m)}{isToday ? ' · today' : ''}
                    </p>
                  )
                })}
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && classes.length > 0 && view === 'schedule' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs border-collapse">
            <thead>
              <tr>
                <th className="p-1.5 w-20"></th>
                {days.map((d) => (
                  <th key={d} className={`p-1.5 text-center font-semibold uppercase tracking-wide ${d === todayDow ? 'text-optio-purple' : 'text-neutral-400'}`}>
                    {DAY_LABELS[d]}{d === todayDow ? ' · Today' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {week.slots.map((slot) => {
                const ends = [...(week.endsBySlot[slot] || [])]
                const uniformEnd = ends.length === 1 ? ends[0] : null
                return (
                  <tr key={slot} className="border-t border-gray-100">
                    <td className="p-1.5 text-neutral-400 whitespace-nowrap align-top">
                      {uniformEnd ? `${fmtTime(slot)}–${fmtTime(uniformEnd)}` : fmtTime(slot)}
                    </td>
                    {days.map((d) => (
                      <td key={d} className={`p-1 align-top ${d === todayDow ? 'bg-optio-purple/5' : ''}`}>
                        {(week.cell[`${d}|${slot}`] || []).map(({ cls, m }, i) => (
                          <button
                            key={`${cls.id}-${i}`}
                            type="button"
                            onClick={() => navigate(`/my-classes/${cls.id}`)}
                            className="w-full text-left rounded-lg p-2 mb-1 border border-gray-200 bg-gradient-to-br from-[#F3EFF4] to-white hover:border-optio-purple transition-colors"
                          >
                            <div className="text-sm font-semibold text-neutral-900 leading-tight truncate">{cls.name}</div>
                            {!uniformEnd && m.end_time && (
                              <div className="text-xs text-neutral-500 mt-0.5">until {fmtTime(m.end_time)}</div>
                            )}
                            {(m.location || cls.location) && (
                              <div className="text-[11px] text-neutral-400 mt-0.5 truncate">{m.location || cls.location}</div>
                            )}
                          </button>
                        ))}
                        {!(week.cell[`${d}|${slot}`] || []).length && week.covering(d, slot).map((cls, i) => (
                          <div key={`cont-${i}`} className="rounded-lg border border-dashed border-gray-200 text-neutral-400 px-2 py-1 mb-1 text-[11px]">
                            {cls.name} (continues)
                          </div>
                        ))}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {week.unscheduled.length > 0 && (
            <p className="text-xs text-neutral-400 mt-3">
              Not on the weekly grid: {week.unscheduled.map((c) => c.name).join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default MyClassesPage
