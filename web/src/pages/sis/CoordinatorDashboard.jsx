import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import AttendanceAlerts from '../../components/sis/AttendanceAlerts'
import { range12h } from '../../utils/timeFormat'

/**
 * The campus coordinator's dashboard (iCreate requirements, 2026-08-09) — the
 * operational morning view: what is happening on campus today, who is not
 * accounted for, my own duties, my assigned tasks, and quick links. Backed by
 * GET /api/sis/coordinator/dashboard; org admins opening it see the same
 * campus (the endpoint is ADMIN_ROLES).
 */

const Card = ({ title, children, className = '' }) => (
  <div className={`bg-white rounded-xl border border-gray-200 p-4 ${className}`}>
    {title && <h2 className="font-semibold text-neutral-900 mb-3">{title}</h2>}
    {children}
  </div>
)

const CoordinatorDashboard = ({ userName }) => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    if (!orgId) return
    api.get(withOrg('/api/sis/coordinator/dashboard', orgId))
      .then((r) => { setData(r.data); setError(null) })
      .catch((e) => setError(e.response?.data?.error || 'Failed to load the dashboard'))
  }, [orgId])

  useEffect(() => { load() }, [load])

  if (error) return <p className="text-red-600">{error}</p>
  if (!data) return <p className="text-neutral-500">Loading…</p>

  const att = data.attendance || {}
  const recorded = att.recorded || {}

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            {userName ? `Good morning, ${userName}` : 'Campus Dashboard'}
          </h1>
          {data.organization?.name && (
            <p className="text-neutral-500 mt-1">{data.organization.name} · {data.date}</p>
          )}
        </div>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      {(data.quick_links || []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.quick_links.map((l) => (
            <Link key={l.url + l.label} to={l.url}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-optio-purple hover:border-optio-purple/50">
              {l.label}
            </Link>
          ))}
        </div>
      )}

      {/* The school's pinned links — the same section the teacher dashboard
          leads with. Only teachers had one, so a link the office pinned and
          ticked "Coordinators" on was saved and then shown to nobody (iCreate,
          2026-09-01). These are external URLs, not routes: an anchor, not a
          Link. */}
      {(data.pinned_links || []).length > 0 && (
        <Card title="Links">
          <div className="flex flex-wrap gap-2">
            {data.pinned_links.map((l) => (
              <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer"
                title={l.description || undefined}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-optio-purple hover:border-optio-purple/50 hover:bg-optio-purple/5 transition-colors">
                {l.title}
              </a>
            ))}
          </div>
        </Card>
      )}

      <AttendanceAlerts alerts={att.open_alerts} resolutions={att.resolutions}
        orgId={orgId} onResolved={load} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Today's schedule" className="lg:col-span-2">
          {!(data.today_schedule || []).length && (
            <p className="text-sm text-neutral-500">No classes meet today.</p>
          )}
          <ul className="divide-y divide-gray-100">
            {(data.today_schedule || []).map((m, i) => (
              <li key={`${m.class_id}-${i}`} className="py-2.5 flex items-center gap-3">
                <span className="text-sm font-medium text-neutral-500 w-28 shrink-0">
                  {range12h(m.start_time, m.end_time)}
                </span>
                <span className="min-w-0">
                  <Link to="/classes" className="block text-sm font-semibold text-neutral-900 hover:text-optio-purple truncate">
                    {m.class_name}
                  </Link>
                  <span className="block text-xs text-neutral-500">
                    {[m.teacher_name, m.location, `${m.enrolled_count} students`]
                      .filter(Boolean).join(' · ')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card title="Today's attendance">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div><div className="text-2xl font-bold text-green-600">{recorded.present || 0}</div><div className="text-xs text-neutral-500">Present</div></div>
              <div><div className="text-2xl font-bold text-red-600">{recorded.absent || 0}</div><div className="text-xs text-neutral-500">Absent</div></div>
              <div><div className="text-2xl font-bold text-amber-600">{recorded.late || 0}</div><div className="text-xs text-neutral-500">Late</div></div>
              <div><div className="text-2xl font-bold text-blue-600">{(recorded.excused || 0) + (att.reported_out || 0)}</div><div className="text-xs text-neutral-500">Excused / reported out</div></div>
            </div>
            <Link to="/attendance" className="block mt-3 text-sm font-semibold text-optio-purple hover:underline">
              Open attendance →
            </Link>
          </Card>

          <Card title="My schedule">
            {!(data.my_schedule?.today || []).length && (
              <p className="text-sm text-neutral-500">Nothing scheduled today.</p>
            )}
            <ul className="space-y-1.5">
              {(data.my_schedule?.today || []).map((d) => (
                <li key={d.id} className="text-sm text-neutral-800">
                  <span className="text-neutral-400 mr-2">{range12h(d.start_time, d.end_time)}</span>
                  {d.title}
                </li>
              ))}
            </ul>
            {(data.my_schedule?.upcoming || []).length > 0 && (
              <>
                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mt-3 mb-1">Upcoming</div>
                <ul className="space-y-1">
                  {data.my_schedule.upcoming.map((d) => (
                    <li key={d.id} className="text-sm text-neutral-600">
                      <span className="text-neutral-400 mr-2">{d.specific_date}</span>{d.title}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={`My tasks (${(data.my_tasks || []).length})`}>
          {!(data.my_tasks || []).length && (
            <p className="text-sm text-neutral-500">Nothing assigned to you. </p>
          )}
          <ul className="divide-y divide-gray-100">
            {(data.my_tasks || []).map((t) => (
              <li key={t.id} className="py-2 flex items-center gap-2">
                <span className="text-sm text-neutral-800 truncate">{t.title}</span>
                {['high', 'urgent'].includes(t.priority) && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 capitalize shrink-0">{t.priority}</span>
                )}
                {t.due_date && <span className="text-xs text-neutral-400 shrink-0">Due {t.due_date}</span>}
                <span className="text-xs text-neutral-400 ml-auto capitalize shrink-0">{String(t.status || '').replace('_', ' ')}</span>
              </li>
            ))}
          </ul>
          <Link to="/my-tasks" className="block mt-2 text-sm font-semibold text-optio-purple hover:underline">
            Open my tasks →
          </Link>
        </Card>

        <Card title="Resources">
          {!(data.staff_resources || []).length && (
            <p className="text-sm text-neutral-500">No staff resources yet.</p>
          )}
          <ul className="space-y-1.5">
            {(data.staff_resources || []).map((r) => (
              <li key={r.id}>
                <a href={r.url} target="_blank" rel="noreferrer"
                  className="text-sm text-optio-purple hover:underline">{r.title}</a>
                {r.category && <span className="text-xs text-neutral-400 ml-2">{r.category}</span>}
              </li>
            ))}
          </ul>
          <Link to="/resources" className="block mt-2 text-sm font-semibold text-optio-purple hover:underline">
            All resources →
          </Link>
        </Card>
      </div>
    </div>
  )
}

export default CoordinatorDashboard
