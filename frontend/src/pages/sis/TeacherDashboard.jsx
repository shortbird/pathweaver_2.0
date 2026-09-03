import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { ClipboardDocumentCheckIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import { withOrg, useSisOrg } from './useSisOrg'
import { withPreview } from './teacherPreview'
import { getHiddenModules } from './sisModules'

/**
 * TeacherDashboard — the advisor home for the SIS teacher portal.
 *
 * Class management first: pinned teacher links up top, then the teacher's
 * classes as the hero (the Today schedule card was removed by request —
 * iCreate 2026-08-31); operational items (time clock, onboarding, required
 * reading, forms) sit in a secondary rail; learning-app engagement alerts
 * drop to the bottom. One backend call (/api/sis/teacher/dashboard) feeds
 * every card.
 */

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
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [clockBusy, setClockBusy] = useState(false)
  const [alerts, setAlerts] = useState([])
  const [resolvingId, setResolvingId] = useState(null)

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    api.get(withPreview(withOrg('/api/sis/teacher/dashboard', orgId), preview))
      .then((r) => setData(r.data?.data))
      .catch(() => toast.error('Failed to load your home'))
      .finally(() => setLoading(false))
    // Engagement alerts are non-critical — the card simply hides on failure.
    // Same preview as the dashboard above: without it an admin viewing a
    // teacher's portal saw their own org-wide alerts in the teacher's card.
    // scope=mine because this is the TEACHER's home: at a microschool the
    // person teaching a class is often also an admin, and the ordinary role
    // scope would hand them every student in the school here while every other
    // card on the page stayed scoped to their classes.
    const alertsUrl = withPreview(withOrg('/api/sis/engagement-alerts', orgId), preview)
    api.get(`${alertsUrl}${alertsUrl.includes('?') ? '&' : '?'}scope=mine`)
      .then((r) => setAlerts(r.data?.alerts || []))
      .catch(() => setAlerts([]))
    // preview?.id (not the object) so a re-created preview object can't loop the effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, preview?.id])

  useEffect(() => { load() }, [load])

  // Unread counts per class chat, so a teacher can see which class is waiting
  // without opening all of them ("I don't think I see it unless I look at
  // specific students individually" — Gryffin, Perch d7300f59). /api/groups
  // already carries both source_class_id and unread_count, so this is the list
  // the messages page loads anyway, keyed by class. Non-critical: on failure
  // the cards simply render without badges, exactly as before.
  //
  // Not while previewing: /api/groups answers for whoever is signed in, so an
  // admin previewing a teacher's portal would otherwise see their OWN unread
  // counts pinned to that teacher's classes.
  useEffect(() => {
    if (preview) { setGroups([]); return }
    let cancelled = false
    api.get('/api/groups')
      .then((r) => {
        if (cancelled) return
        const payload = r.data?.data || r.data
        setGroups(payload?.groups || [])
      })
      .catch(() => { if (!cancelled) setGroups([]) })
    return () => { cancelled = true }
  }, [preview?.id])

  // A class has both a parent chat and a student chat, so sum rather than
  // overwrite — the badge counts everything waiting in that class.
  const unreadByClass = useMemo(() => {
    const map = {}
    for (const g of groups) {
      if (!g.source_class_id) continue
      map[g.source_class_id] = (map[g.source_class_id] || 0) + (g.unread_count || 0)
    }
    return map
  }, [groups])

  const resolveAlert = async (alertId) => {
    setResolvingId(alertId)
    try {
      // scope=mine here too: the list above is narrowed to this teacher's own
      // classes, and resolve re-derives the scope from the query string. Without
      // it the alerts on screen and the alerts that can be dismissed are two
      // different sets again.
      await api.post(`/api/sis/engagement-alerts/${alertId}/resolve?scope=mine`, { organization_id: orgId })
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

  const { classes = [], profile = {}, open_time_entry: openEntry,
    onboarding, pending_acks: pendingAcks = [], recent_forms: recentForms = [],
    staff_resources: staffResources = [], pinned_links: pinnedLinks = [] } = data

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">
          {userName ? `Welcome, ${userName}` : 'Your classes'}
        </h1>
        <p className="text-neutral-500 mt-1">
          {profile.position || 'Manage your classes, take attendance, and stay in touch with your families.'}
        </p>
      </div>

      {/* Setup / action banners — kept up top because they gate the teacher's readiness. */}
      {(onboarding && onboarding.status !== 'complete' && !hidden.has('onboarding')) && (
        // /my-tasks is deliberately blind to preview — its writes would land on
        // the admin — so an admin previewing a teacher followed this banner to
        // their OWN tasks. /onboarding reads the previewed teacher's checklist.
        <Link to={preview ? '/onboarding' : '/my-tasks'} className="block rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Onboarding: {onboarding.done} of {onboarding.total} items complete
          </p>
          <p className="text-sm text-amber-700">
            {preview
              ? `${preview.name || 'This teacher'} still has to finish their ${onboarding.template_name || 'onboarding'} checklist`
              : `Finish your ${onboarding.template_name || 'onboarding'} checklist`}
          </p>
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

      {/* Permanent links the school pins for its teachers (Resources page,
          "Pin to teacher home"). Moved above the class grid by request
          (iCreate 2026-08-31) — documents and forms teachers always need. */}
      {pinnedLinks.length > 0 && (
        <Card title="Links"
          action={<Link to="/resources" className="text-sm text-optio-purple hover:underline">All resources</Link>}>
          <div className="flex flex-wrap gap-2">
            {pinnedLinks.map((l) => (
              <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer"
                title={l.description || undefined}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-optio-purple hover:border-optio-purple/50 hover:bg-optio-purple/5 transition-colors">
                {l.title}
              </a>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Hero: the teacher's classes — the core of the portal. Replaced the
            Today schedule card in this slot (iCreate 2026-08-31). */}
        {/* Every class, not the first six. A teacher with seven classes had to
            click through to find the seventh, which is the opposite of a
            dashboard (iCreate, 2026-07-31: "it'd be nice just to show ALL the
            classes on the dashboard instead of having to click to see all"). */}
        <div className="lg:col-span-2">
          <Card title={`My classes${classes.length ? ` (${classes.length})` : ''}`}
            action={<Link to="/my-classes" className="text-sm text-optio-purple hover:underline">Weekly view</Link>}>
            {!classes.length && <p className="text-sm text-neutral-500">No classes assigned yet — talk to your administrator.</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {classes.map((c) => (
                <div key={c.id}
                  className="rounded-lg border border-gray-200 p-3 hover:border-optio-purple/50 transition-colors">
                  <Link to={`/my-classes/${c.id}`} className="block">
                    <p className="font-medium text-neutral-900 truncate">{c.name}</p>
                    <p className="text-sm text-neutral-500">{c.enrolled_count} student{c.enrolled_count === 1 ? '' : 's'}</p>
                  </Link>
                  <div className="mt-2 flex items-center gap-3 text-xs font-medium">
                    <Link to={`/my-classes/${c.id}`} className="inline-flex items-center gap-1 text-optio-purple hover:underline">
                      <ClipboardDocumentCheckIcon className="w-4 h-4" /> Attendance
                    </Link>
                    <Link to={`/my-classes/${c.id}?tab=messages`} className="inline-flex items-center gap-1 text-optio-purple hover:underline">
                      <ChatBubbleLeftRightIcon className="w-4 h-4" /> Message
                      {unreadByClass[c.id] > 0 && (
                        <span
                          className="ml-0.5 inline-flex items-center justify-center rounded-full bg-optio-pink px-1.5 min-w-[18px] h-[18px] text-[11px] font-bold leading-none text-white"
                          aria-label={`${unreadByClass[c.id]} unread`}
                        >
                          {unreadByClass[c.id] > 99 ? '99+' : unreadByClass[c.id]}
                        </span>
                      )}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Secondary rail: time clock + recent forms */}
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

          {/* The staff handbook and anything else the school keeps for teachers.
              Previously only reachable while an acknowledgment was outstanding. */}
          {staffResources.length > 0 && (
            <Card title="Teacher resources"
              action={<Link to="/resources" className="text-sm text-optio-purple hover:underline">All resources</Link>}>
              <ul className="space-y-2">
                {staffResources.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-neutral-700 hover:text-optio-purple truncate block">
                        {r.title}
                      </a>
                    ) : (
                      <span className="text-sm text-neutral-700 truncate block">{r.title}</span>
                    )}
                  </li>
                ))}
              </ul>
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

      {/* Learning-app engagement alerts — secondary, below class management. */}
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
    </div>
  )
}

export default TeacherDashboard
