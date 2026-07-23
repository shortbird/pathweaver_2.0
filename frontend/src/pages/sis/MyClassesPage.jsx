import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { Squares2X2Icon, CalendarDaysIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import { getPreviewTeacher, withPreview } from './teacherPreview'

/**
 * MyClassesPage — the teacher's classes with meeting times and roster counts.
 * Two views: cards, and a weekly schedule grid so they can see at a glance when
 * they teach. Data comes pre-scoped from /api/sis/teacher/classes.
 */

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS = [1, 2, 3, 4, 5] // Mon–Fri

const fmtTime = (hhmm) => {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${ampm}`
}

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number)
  return Number.isNaN(h) ? 0 : h * 60 + (m || 0)
}

const meetingLabel = (m) => {
  const when = m.specific_date ? m.specific_date : DAY_LABELS[m.day_of_week] || ''
  return `${when} ${fmtTime(m.start_time)}–${fmtTime(m.end_time)}`
}

const MyClassesPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const navigate = useNavigate()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('sis_my_classes_view') || 'cards' } catch { return 'cards' }
  })
  const setViewPersist = (v) => {
    setView(v)
    try { localStorage.setItem('sis_my_classes_view', v) } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withPreview(withOrg('/api/sis/teacher/classes', orgId), getPreviewTeacher()))
      .then((r) => setClasses(r.data?.classes || []))
      .catch(() => toast.error('Failed to load your classes'))
      .finally(() => setLoading(false))
  }, [orgId])

  // Weekly grid: recurring meetings grouped by weekday, sorted by start time.
  const byDay = useMemo(() => {
    const map = {}
    for (const c of classes) {
      for (const m of (c.meetings || [])) {
        if (m.day_of_week == null || m.specific_date) continue
        ;(map[m.day_of_week] = map[m.day_of_week] || []).push({ cls: c, m })
      }
    }
    for (const d of Object.keys(map)) map[d].sort((a, b) => toMinutes(a.m.start_time) - toMinutes(b.m.start_time))
    return map
  }, [classes])

  const daysWithMeetings = useMemo(() => {
    const extra = Object.keys(byDay).map(Number).filter((d) => !WEEKDAYS.includes(d))
    return [...WEEKDAYS, ...extra.sort((a, b) => a - b)]
  }, [byDay])

  return (
    <div>
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
          <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
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
              <h3 className="font-semibold text-neutral-900 truncate">{c.name}</h3>
              <p className="text-sm text-neutral-500 mb-2">
                {c.enrolled_count} student{c.enrolled_count === 1 ? '' : 's'}
                {c.location ? ` · ${c.location}` : ''}
              </p>
              <div className="mt-auto space-y-0.5">
                {(c.meetings || []).slice(0, 4).map((m) => (
                  <p key={m.id} className="text-xs text-neutral-500">{meetingLabel(m)}</p>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && classes.length > 0 && view === 'schedule' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 overflow-x-auto">
          <div className="grid gap-3 min-w-[560px]" style={{ gridTemplateColumns: `repeat(${daysWithMeetings.length}, minmax(0, 1fr))` }}>
            {daysWithMeetings.map((d) => (
              <div key={d} className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2 text-center">{DAY_LABELS[d]}</div>
                <div className="space-y-2">
                  {(byDay[d] || []).map(({ cls, m }, i) => (
                    <button
                      key={`${cls.id}-${i}`}
                      type="button"
                      onClick={() => navigate(`/my-classes/${cls.id}`)}
                      className="w-full text-left rounded-lg p-2.5 border border-gray-200 bg-gradient-to-br from-[#F3EFF4] to-white hover:border-optio-purple transition-colors"
                    >
                      <div className="text-sm font-semibold text-neutral-900 leading-tight truncate">{cls.name}</div>
                      <div className="text-xs text-neutral-500 mt-0.5">{fmtTime(m.start_time)}–{fmtTime(m.end_time)}</div>
                      {cls.location && <div className="text-[11px] text-neutral-400 mt-0.5 truncate">{cls.location}</div>}
                    </button>
                  ))}
                  {!(byDay[d] || []).length && <div className="text-xs text-neutral-300 text-center py-4">—</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default MyClassesPage
