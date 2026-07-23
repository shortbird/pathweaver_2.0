import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { withOrg, useSisOrg } from './useSisOrg'
import { withPreview } from './teacherPreview'
import { getHiddenModules } from './sisModules'

/**
 * TeacherDashboard — the advisor landing page for the SIS teacher portal.
 * One backend call (/api/sis/teacher/dashboard) feeds every card: today's
 * schedule, the time clock, onboarding progress, required reading, classes,
 * and recent form submissions.
 */

const fmtTime = (hhmm) => {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${ampm}`
}

const KIND_LABEL = { class: 'Class', duty: 'Duty', event: 'Event', meeting: 'Meeting', substitute: 'Substitute', other: 'Shift' }

const Card = ({ title, children, action }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5">
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-semibold text-neutral-900">{title}</h2>
      {action}
    </div>
    {children}
  </div>
)

const ALERT_LABEL = {
  unfinished_next_released: (a) =>
    `hasn't started "${a.quest_title || a.details?.quest_title || 'an earlier quest'}"` +
    (a.details?.later_quest_title ? ` but "${a.details.later_quest_title}" is already out` : ''),
  inactive_two_weeks: (a) =>
    `has had no quest activity for ${a.details?.days_threshold || 14}+ days` +
    (a.quest_title ? ` ("${a.quest_title}" unfinished)` : ''),
}

const alertMessage = (a) => (ALERT_LABEL[a.alert_type] ? ALERT_LABEL[a.alert_type](a) : 'needs attention')

const TeacherDashboard = ({ orgId, userName, preview = null }) => {
  const { activeOrg } = useSisOrg()
  const hidden = getHiddenModules(activeOrg)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [clockBusy, setClockBusy] = useState(false)
  const [alerts, setAlerts] = useState([])
  const [resolvingId, setResolvingId] = useState(null)

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    api.get(withPreview(withOrg('/api/sis/teacher/dashboard', orgId), preview))
      .then((r) => setData(r.data?.data))
      .catch(() => toast.error('Failed to load your dashboard'))
      .finally(() => setLoading(false))
    // Engagement alerts are non-critical — the card simply hides on failure.
    api.get(withOrg('/api/sis/engagement-alerts', orgId))
      .then((r) => setAlerts(r.data?.alerts || []))
      .catch(() => setAlerts([]))
    // preview?.id (not the object) so a re-created preview object can't loop the effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, preview?.id])

  useEffect(() => { load() }, [load])

  const resolveAlert = async (alertId) => {
    setResolvingId(alertId)
    try {
      await api.post(`/api/sis/engagement-alerts/${alertId}/resolve`, { organization_id: orgId })
      setAlerts((prev) => prev.filter((a) => a.id !== alertId))
      toast.success('Alert resolved')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not resolve the alert')
    } finally {
      setResolvingId(null)
    }
  }

  const clock = async (action) => {
    setClockBusy(true)
    try {
      await api.post(`/api/sis/teacher/time/${action}`, { organization_id: orgId })
      toast.success(action === 'clock-in' ? 'Clocked in' : 'Clocked out')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Time clock error')
    } finally {
      setClockBusy(false)
    }
  }

  if (loading) return <p className="text-neutral-500">Loading…</p>
  if (!data) return <p className="text-neutral-500">Nothing to show yet.</p>

  const { today = [], classes = [], profile = {}, open_time_entry: openEntry,
    onboarding, pending_acks: pendingAcks = [], recent_forms: recentForms = [] } = data

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">
          {userName ? `Welcome, ${userName}` : 'Your day'}
        </h1>
        {profile.position && <p className="text-neutral-500 mt-1">{profile.position}</p>}
      </div>

      {(onboarding && onboarding.status !== 'complete' && !hidden.has('onboarding')) && (
        <Link to="/onboarding" className="block rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Onboarding: {onboarding.done} of {onboarding.total} items complete
          </p>
          <p className="text-sm text-amber-700">Finish your {onboarding.template_name || 'onboarding'} checklist</p>
        </Link>
      )}

      {pendingAcks.length > 0 && (
        <Link to="/resources" className="block rounded-xl border border-optio-purple/30 bg-optio-purple/5 p-4">
          <p className="text-sm font-medium text-optio-purple">
            {pendingAcks.length} document{pendingAcks.length === 1 ? '' : 's'} to review and acknowledge
          </p>
          <p className="text-sm text-neutral-600 truncate">
            {pendingAcks.map((r) => r.title).join(' · ')}
          </p>
        </Link>
      )}

      {alerts.length > 0 && (
        <Card title={`Needs attention (${alerts.length})`}>
          <ul className="divide-y divide-gray-100">
            {alerts.map((a) => (
              <li key={a.id} className="py-2.5 flex items-start gap-3">
                <span className="mt-1.5 w-2 h-2 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-800">
                    <span className="font-medium">{a.student_name}</span>
                    {a.class_name && <span className="text-neutral-500"> · {a.class_name}</span>}
                  </p>
                  <p className="text-sm text-neutral-600">{alertMessage(a)}</p>
                  {a.created_at && (
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {new Date(a.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => resolveAlert(a.id)}
                  disabled={resolvingId === a.id}
                  className="shrink-0 px-3 py-1.5 text-sm font-medium text-optio-purple border border-optio-purple/30 rounded-lg hover:bg-optio-purple/5 transition-colors disabled:opacity-50"
                >
                  Resolve
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card title="Today">
            {data.school_starts && (
              <p className="text-sm text-neutral-500">
                School starts {new Date(`${data.school_starts}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} — no classes until then.
              </p>
            )}
            {!today.length && !data.school_starts && (
              <p className="text-sm text-neutral-500">Nothing scheduled today.</p>
            )}
            <ul className="divide-y divide-gray-100">
              {today.map((item, i) => (
                <li key={i} className="py-2.5 flex items-center gap-3">
                  <span className="text-sm font-medium text-neutral-500 w-28 shrink-0">
                    {item.start_time ? `${fmtTime(item.start_time)}–${fmtTime(item.end_time)}` : 'All day'}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-neutral-600 shrink-0">
                    {KIND_LABEL[item.kind] || item.kind}
                  </span>
                  {item.kind === 'class' && item.class_id ? (
                    <Link to={`/my-classes/${item.class_id}`} className="text-sm font-medium text-optio-purple hover:underline truncate">
                      {item.title}
                    </Link>
                  ) : (
                    <span className="text-sm text-neutral-800 truncate">{item.title}</span>
                  )}
                  {item.location && <span className="text-xs text-neutral-400 ml-auto shrink-0">{item.location}</span>}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          {profile.uses_time_clock && preview && (
            <Card title="Time clock">
              <p className="text-sm text-neutral-500">
                {openEntry
                  ? `Clocked in at ${new Date(openEntry.clock_in).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                  : 'Not clocked in.'} Clock actions are hidden in preview.
              </p>
            </Card>
          )}
          {profile.uses_time_clock && !preview && !hidden.has('timesheets') && (
            <Card title="Time clock">
              {openEntry ? (
                <div>
                  <p className="text-sm text-neutral-600 mb-3">
                    Clocked in at {new Date(openEntry.clock_in).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </p>
                  <button onClick={() => clock('clock-out')} disabled={clockBusy}
                    className="w-full px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-semibold disabled:opacity-50">
                    Clock out
                  </button>
                </div>
              ) : (
                <button onClick={() => clock('clock-in')} disabled={clockBusy}
                  className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
                  Clock in
                </button>
              )}
              <Link to="/time" className="block text-center text-sm text-optio-purple hover:underline mt-3">
                View my hours
              </Link>
            </Card>
          )}

          {!hidden.has('forms') && (
          <Card title="Recent forms" action={<Link to="/forms" className="text-sm text-optio-purple hover:underline">All forms</Link>}>
            {!recentForms.length && <p className="text-sm text-neutral-500">No submissions yet.</p>}
            <ul className="space-y-2">
              {recentForms.map((f) => (
                <li key={f.id} className="text-sm flex items-center justify-between gap-2">
                  <span className="truncate text-neutral-700">{f.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                    f.status === 'resolved' ? 'bg-green-100 text-green-700'
                      : f.status === 'under_review' ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-neutral-600'}`}>
                    {f.status.replace('_', ' ')}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          )}
        </div>
      </div>

      <Card title="My classes" action={<Link to="/my-classes" className="text-sm text-optio-purple hover:underline">See all</Link>}>
        {!classes.length && <p className="text-sm text-neutral-500">No classes assigned yet — talk to your administrator.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {classes.slice(0, 6).map((c) => (
            <Link key={c.id} to={`/my-classes/${c.id}`}
              className="rounded-lg border border-gray-200 p-3 hover:border-optio-purple/50 transition-colors">
              <p className="font-medium text-neutral-900 truncate">{c.name}</p>
              <p className="text-sm text-neutral-500">{c.enrolled_count} student{c.enrolled_count === 1 ? '' : 's'}</p>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  )
}

export default TeacherDashboard
