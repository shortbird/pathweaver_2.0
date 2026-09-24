import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import { useSisOrg, withOrg } from '../useSisOrg'
import { getPreviewTeacher, withPreview } from '../teacherPreview'
import { fmtTime, DAY_LABELS } from '../../../utils/schedule'

/**
 * My classes -- the teacher's classes with meeting times and roster counts,
 * the first tab of the one Classes page (2026-09-17; it was /my-classes).
 * Cards, one per class. The week itself is the next tab, My schedule, as a
 * list or a grid with duties on it; this tab drew its own week grid until E4
 * (2026-09-18), a second rendering of the same week without the duties.
 * Data comes pre-scoped from /api/sis/teacher/classes.
 */

const meetingLabel = (m) => {
  const when = m.specific_date ? m.specific_date : DAY_LABELS[m.day_of_week] || ''
  return `${when} ${fmtTime(m.start_time)}–${fmtTime(m.end_time)}`
}

export default function MyClassesPanel() {
  const { orgId } = useSisOrg()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withPreview(withOrg('/api/sis/teacher/classes', orgId), getPreviewTeacher()))
      .then((r) => setClasses(r.data?.classes || []))
      .catch(() => toast.error('Failed to load your classes'))
      .finally(() => setLoading(false))
  }, [orgId])

  const todayDow = new Date().getDay() // 0=Sun … 6=Sat, matches day_of_week

  return (
    <div>
      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !classes.length && (
        <p className="text-neutral-500">No classes assigned to you yet — talk to your administrator.</p>
      )}

      {!loading && classes.length > 0 && (
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
                {/* The office marked this person to cover the class today; it
                    leaves the list tomorrow (P7). */}
                {c.my_role === 'substitute' && (
                  <span className="mt-0.5 flex-shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5 bg-amber-100 text-amber-800">
                    Substitute today
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
    </div>
  )
}

