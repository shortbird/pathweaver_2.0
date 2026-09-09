import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import { useAuth } from '../../contexts/AuthContext'
import { isSisAdmin, isCampusCoordinator } from './sisRole'
import { isPathHidden } from './sisModules'
import { getPreviewTeacher } from './teacherPreview'
import { range12h } from '../../utils/timeFormat'
import TeacherDashboard from './TeacherDashboard'
import CoordinatorDashboard from './CoordinatorDashboard'

/**
 * The School Dashboard — what is waiting on the office, then what is happening
 * today, then the census.
 *
 * The order is the point. This page used to open with four enrollment totals,
 * which are true every morning and actionable on none of them; the queues an
 * admin actually works (unaccounted students, unassigned requests, unsigned
 * paperwork, the waitlist, overdue invoices) each lived behind their own page,
 * so the only way to find out whether anything needed doing was to visit all of
 * them. Now the counts come to the admin and each one is a door.
 *
 * A tile renders only when its count is above zero: the absence of tiles is
 * itself the report, and a wall of zeroes reads as work when it is the opposite.
 */

// A card in the masonry flow: keep it whole across the column break, and carry
// its own bottom gap (multi-column has no row-gap to space them with).
const MASONRY_CARD = 'mb-4 break-inside-avoid'

const Card = ({ title, action, children, className = '' }) => (
  <div className={`bg-white rounded-xl border border-gray-200 p-5 ${className}`}>
    {(title || action) && (
      <div className="flex items-center justify-between gap-3 mb-3">
        {title && <h2 className="font-semibold text-neutral-900">{title}</h2>}
        {action}
      </div>
    )}
    {children}
  </div>
)

const StatCard = ({ label, value, accent, note }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5">
    <div className="text-3xl font-bold text-neutral-900">{value ?? 0}</div>
    <div className={`text-sm mt-1 ${accent || 'text-neutral-500'}`}>{label}</div>
    {note && <div className="text-xs mt-1 text-neutral-400">{note}</div>}
  </div>
)

/**
 * The queues, in the order an admin should work them: people first (a student
 * nobody can find), then commitments made to families, then housekeeping.
 *
 * `module` is the nav path whose module key gates this tile — the backend omits
 * a hidden module's count already, and this filters it a second time so a stale
 * response can't render a tile that leads to a page the org turned off.
 */
const ATTENTION_TILES = [
  { key: 'attendance_alerts', label: 'Not accounted for', to: '/attendance',
    module: '/attendance', urgent: true },
  { key: 'requests_overdue', label: 'Overdue requests', to: '/tasks?tab=requests',
    module: '/tasks', urgent: true },
  { key: 'requests_unassigned', label: 'Unassigned requests', to: '/tasks?tab=requests',
    module: '/tasks' },
  { key: 'signatures_pending', label: 'Signatures pending', to: '/tasks?tab=paperwork',
    module: '/tasks' },
  { key: 'onboarding_incomplete', label: 'Checklists in progress', to: '/tasks?tab=checklists',
    module: '/tasks' },
  { key: 'age_exceptions', label: 'Age exception requests', to: '/registration?tab=queues' },
  { key: 'waitlist_waiting', label: 'Waiting for a place', to: '/registration?tab=queues' },
  { key: 'goals_pending', label: 'Goals to review', to: '/goals' },
  { key: 'prior_learning_pending', label: 'Prior learning to review', to: '/prior-learning',
    module: '/prior-learning' },
  { key: 'students_no_family', label: 'Students not in a family', to: '/people?tab=families' },
]

/** Quick actions — the handful of things an admin starts from a cold open,
 * in the order the front office reaches for them.
 *
 * Classes moved up past messaging: "Classes need to be above the messages,
 * otherwise they are too hard to find" (iCreate, 2026-08-31 — 9f9e4360). The
 * office opens a class many times a day and writes to families a few times a
 * week, and the list had it the other way round. */
const QUICK_ACTIONS = [
  { label: 'Take attendance', to: '/attendance', module: '/attendance' },
  { label: 'Classes', to: '/classes', module: '/classes' },
  { label: 'Add a family', to: '/people?tab=families' },
  { label: 'Message families', to: '/inbox?tab=announcements' },
  { label: 'Send for signature', to: '/tasks?tab=paperwork', module: '/tasks' },
  { label: 'Reports', to: '/reports', module: '/reports' },
]

const AttentionTile = ({ tile, count }) => (
  <Link
    to={tile.to}
    className={`block rounded-xl border p-4 transition-colors ${
      tile.urgent
        ? 'border-red-200 bg-red-50 hover:border-red-400'
        : 'border-gray-200 bg-white hover:border-optio-purple/50'
    }`}
  >
    <div className={`text-3xl font-bold ${tile.urgent ? 'text-red-700' : 'text-neutral-900'}`}>
      {count}
    </div>
    <div className={`text-sm mt-1 ${tile.urgent ? 'text-red-700' : 'text-neutral-600'}`}>
      {tile.label}
    </div>
  </Link>
)

const money = (cents) => `$${((cents || 0) / 100).toLocaleString(undefined, {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`

export const eventTime = (e) => {
  if (!e.start_at) return ''
  const d = new Date(e.start_at)
  if (Number.isNaN(d.getTime())) return ''
  const opts = { weekday: 'short', month: 'short', day: 'numeric' }
  // An all-day event is stored date-only, as 00:00 UTC. It names a calendar
  // date, not an instant, so it must be read back in UTC — converted to local
  // time it becomes the previous evening anywhere west of Greenwich, and
  // "NO CLASS - LABOR DAY" on the 7th read "Sun, Sep 6" (iCreate, 2026-08-31).
  // The family-facing SchoolCommunity.fmtWhen already does this.
  if (e.all_day) opts.timeZone = 'UTC'
  const day = d.toLocaleDateString(undefined, opts)
  if (e.all_day) return day
  return `${day}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

const SisDashboard = () => {
  const { user } = useAuth()
  const { orgId, setOrgId, orgs, isSuperadmin, loading: orgLoading, activeOrg } = useSisOrg()
  const admin = isSisAdmin(user)
  // A coordinator's morning is operational (today's campus, attendance,
  // tasks), not enrollment statistics — they get their own dashboard.
  const coordinator = isCampusCoordinator(user)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Read once per mount — exiting preview reloads the page.
  const [preview] = useState(() => (isSisAdmin(user) ? getPreviewTeacher() : null))

  useEffect(() => {
    if (!admin || coordinator || preview) return
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withOrg('/api/sis/dashboard', orgId))
      .then((r) => { setData(r.data?.data); setError(null) })
      .catch((e) => setError(e.response?.data?.error || 'Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [orgId])

  if (!admin || preview) {
    return (
      <TeacherDashboard
        orgId={orgId}
        userName={preview ? preview.name : (user?.first_name || user?.display_name)}
        preview={preview}
      />
    )
  }

  if (coordinator) {
    return <CoordinatorDashboard userName={user?.first_name || user?.display_name} />
  }

  const snapshot = data?.snapshot || {}
  const counts = snapshot.enrollment_status || {}
  const attention = data?.attention || {}
  const today = data?.today || {}
  const board = today.attendance
  const recorded = board?.recorded || {}
  const events = data?.events || []
  // The school's permanent links — the noticeboard the office asked for
  // (2bb829a6). Teachers and coordinators already had this card; the admins who
  // pin the links had nowhere that showed them back.
  const pinnedLinks = data?.pinned_links || []
  // Finance is present only for callers the BACKEND put it there for — a
  // campus coordinator reaching this endpoint gets no `finance` key at all.
  const finance = data?.finance
  const invoices = finance?.invoices

  const tiles = ATTENTION_TILES
    .filter((t) => (attention[t.key] || 0) > 0)
    .filter((t) => !t.module || !isPathHidden(t.module, activeOrg))
  const actions = QUICK_ACTIONS.filter((a) => !a.module || !isPathHidden(a.module, activeOrg))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">School Dashboard</h1>
          {data?.organization?.name && (
            <p className="text-neutral-500 mt-1">
              {data.organization.name}{today.date ? ` · ${today.date}` : ''}
            </p>
          )}
        </div>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      {(loading || orgLoading) && <p className="text-neutral-500">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!orgId && !orgLoading && (
        <p className="text-neutral-500">Select an organization to view its dashboard.</p>
      )}

      {data && (
        <>
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">
              Needs attention
            </h2>
            {tiles.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-5 text-sm text-neutral-600">
                All caught up — nothing is waiting on the office right now.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                {tiles.map((t) => (
                  <AttentionTile key={t.key} tile={t} count={attention[t.key]} />
                ))}
              </div>
            )}
          </section>

          {pinnedLinks.length > 0 && (
            <section className="mb-6">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
                  Noticeboard
                </h2>
                <Link to="/resources" className="text-sm text-optio-purple hover:underline">
                  Manage links
                </Link>
              </div>
              <div className="flex flex-wrap gap-2">
                {pinnedLinks.map((l) => (
                  <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer"
                    title={l.description || undefined}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-optio-purple hover:border-optio-purple/50 hover:bg-optio-purple/5 transition-colors">
                    {l.title}
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Masonry, via CSS multi-column rather than grid.
              A grid row stretches every card to the tallest one and pins each to
              its own cell, so a short class list left a tall empty box and the
              cards beside it couldn't move up into the gap. Multi-column lets the
              browser balance them: each card keeps its natural height and the
              column flow closes the space. `break-inside-avoid` is what stops a
              card being sliced in half across the column boundary. */}
          <div className="columns-1 lg:columns-2 2xl:columns-3 gap-4">
            {today.schedule && (
              <Card
                title="Today's classes"
                className={MASONRY_CARD}
                action={(
                  <Link to="/classes" className="text-sm font-semibold text-optio-purple hover:underline">
                    All classes →
                  </Link>
                )}
              >
                {!today.schedule.length ? (
                  <p className="text-sm text-neutral-500">No classes meet today.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {today.schedule.map((m, i) => (
                      <li key={`${m.class_id}-${i}`} className="py-2.5 flex items-center gap-3">
                        <span className="text-sm font-medium text-neutral-500 w-28 shrink-0">
                          {range12h(m.start_time, m.end_time)}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-neutral-900 truncate">
                            {m.class_name}
                          </span>
                          <span className="block text-xs text-neutral-500">
                            {[m.teacher_name, m.location, `${m.enrolled_count} students`]
                              .filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {board && (
              <Card title="Today's attendance" className={MASONRY_CARD}>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-600">{recorded.present || 0}</div>
                    <div className="text-xs text-neutral-500">Present</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-600">{recorded.absent || 0}</div>
                    <div className="text-xs text-neutral-500">Absent</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-amber-600">{recorded.late || 0}</div>
                    <div className="text-xs text-neutral-500">Late</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-600">
                      {(recorded.excused || 0) + (board.reported_out || 0)}
                    </div>
                    <div className="text-xs text-neutral-500">Excused / reported out</div>
                  </div>
                </div>
                <Link to="/attendance" className="block mt-3 text-sm font-semibold text-optio-purple hover:underline">
                  Open attendance →
                </Link>
              </Card>
            )}

            {finance && (
              <Card title="Money" className={MASONRY_CARD}>
                {!invoices ? (
                  <p className="text-sm text-neutral-500">Billing figures are unavailable.</p>
                ) : (
                  <dl className="space-y-2 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-neutral-500">Overdue invoices</dt>
                      <dd className={`font-semibold ${invoices.overdue_count ? 'text-red-600' : 'text-neutral-900'}`}>
                        {invoices.overdue_count || 0}
                        {invoices.overdue_count > 0 && ` · ${money(invoices.overdue_cents)}`}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-neutral-500">Outstanding</dt>
                      <dd className="font-semibold text-neutral-900">
                        {money(invoices.outstanding_cents)}
                      </dd>
                    </div>
                    {invoices.max_days_overdue > 0 && (
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-neutral-500">Oldest overdue</dt>
                        <dd className="font-semibold text-neutral-900">
                          {invoices.max_days_overdue} days
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
                <div className="flex gap-3 mt-3">
                  <Link to="/billing" className="text-sm font-semibold text-optio-purple hover:underline">
                    Billing →
                  </Link>
                  {finance.tuition_queue > 0 && (
                    <Link to="/tuition" className="text-sm font-semibold text-optio-purple hover:underline">
                      {finance.tuition_queue} awaiting tuition →
                    </Link>
                  )}
                </div>
              </Card>
            )}

            {events.length > 0 && (
              <Card title="Coming up" className={MASONRY_CARD}>
                <ul className="space-y-1.5">
                  {events.map((e) => (
                    <li key={e.id} className="text-sm text-neutral-800">
                      <span className="text-neutral-400 mr-2">{eventTime(e)}</span>
                      {e.title}
                    </li>
                  ))}
                </ul>
                <Link to="/calendar" className="block mt-2 text-sm font-semibold text-optio-purple hover:underline">
                  Open calendar →
                </Link>
              </Card>
            )}
          </div>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">
              School snapshot
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Counts the same students the People page lists. The two used
                  to disagree, because this card included withdrawn and
                  graduated students and that page hides them. */}
              <StatCard
                label="Current students"
                value={snapshot.total_students}
                note={snapshot.inactive_students
                  ? `${snapshot.all_students} incl. withdrawn and graduated`
                  : null}
              />
              <StatCard label="Active (last 7 days)" value={snapshot.active_last_7_days} accent="text-green-600" />
              <StatCard label="Families" value={snapshot.households} />
              <StatCard label="Enrolled" value={counts.enrolled || 0} accent="text-optio-purple" />
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <Link
                key={a.to}
                to={a.to}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-optio-purple hover:border-optio-purple/50"
              >
                {a.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default SisDashboard
