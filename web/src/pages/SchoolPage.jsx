import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { TableCellsIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import { useOrganization } from '../contexts/OrganizationContext'
import { useAuth } from '../contexts/AuthContext'
import { roleHomePath } from '../utils/postLoginPath'
import { useSisOrg } from './sis/useSisOrg'
import { isFamilyFirstHubOrg } from '../config/optioAcademy'
import { cardGroupsFor, cardsFor } from './school/schoolCards'
import MySchoolTraining from '../components/school/MySchoolTraining'
import MySchoolTodo from '../components/school/MySchoolTodo'

// The card catalog lives in ./school/schoolCards (shared with the sidebar).
export { cardGroupsFor, cardsFor }
import WeeklySchedule from '../components/schedule/WeeklySchedule'
import ScheduleByDay from '../components/schedule/ScheduleByDay'
import UnifiedFeed, { ComingUp } from '../components/announcements/UnifiedFeed'
import MyClassMaterials from '../components/school/MyClassMaterials'
import SchoolLetterhead from '../components/school/SchoolLetterhead'

const PAGE_SIZE = 20

/**
 * SchoolPage — everything a member gets from their school, in one place, titled
 * with the school's name (/school; /announcements still lands here so older
 * emails and notifications keep working).
 *
 * Two zones (2026-08-23 redesign — the tabbed six-section layout before it had
 * "Announcements" and "Messages" as adjacent tabs meaning different things,
 * and no tab showed the whole page):
 *
 * - The FEED is the page: one unified stream (UnifiedFeed) merging the board
 *   announcements and the sent-message archive, with shout-outs and lost &
 *   found folded in as typed items. Under it, the "Coming up" strip and the
 *   carpool board.
 * - The RAIL holds the doors to the school's other surfaces ("School life":
 *   calendar, resources, directory, carpool). The guardian surfaces (billing,
 *   absences, checklists, requests, schedule/goals) were a "My family" group
 *   here until 2026-09-15; they are items in the sidebar under the school's
 *   name now (./school/schoolCards.familyNavItemsFor), where a parent looks
 *   first. The links did not move, so every emailed link and bookmark still
 *   works. On small screens the rail follows the feed — the feed is what a
 *   parent came for; the doors are one scroll away.
 *
 * Only for people who are in a school. Someone with no school has nothing this
 * page could show, so they are sent home rather than shown an empty shell — and
 * the nav item is hidden for them too.
 */

/**
 * The viewer's own week — for the students, who otherwise had no schedule
 * anywhere (every schedule card in the rail is guardianOnly, and the guardian
 * endpoints 403 a student asking about themselves). Reads the self-scoped
 * /api/sis/school/my-schedule, which returns classes only for the caller's own
 * active enrollments — so guardians, teachers and staff get no rows and the
 * section renders nothing for them, same pattern as the parent dashboard's
 * StudentSchedulePreview. Not rendered in the superadmin preview: there is no
 * real student behind view_as=student.
 */
export function MyScheduleSection() {
  const [schedule, setSchedule] = useState(null)
  useEffect(() => {
    let active = true
    api.get('/api/sis/school/my-schedule')
      .then(({ data }) => { if (active && data?.success) setSchedule(data) })
      .catch(() => { /* no schedule for this user */ })
    return () => { active = false }
  }, [])

  const classes = schedule?.classes || []
  if (classes.length === 0) return null

  return (
    <section aria-label="My schedule" className="mb-4 bg-white border border-gray-200 rounded-xl px-3.5 py-3 sm:px-5 sm:py-4">
      <div className="flex items-center gap-3 mb-3">
        <span className="w-9 h-9 rounded-lg bg-optio-purple/10 flex items-center justify-center flex-shrink-0">
          <TableCellsIcon className="w-5 h-5 text-optio-purple" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">My schedule</h2>
          <p className="text-xs text-gray-500">Your classes this week.</p>
        </div>
      </div>
      <WeeklySchedule classes={classes} timeBlocks={schedule.time_blocks || []} compact />
      {/* Same meetings under the grid, day by day in time order. The
          class-per-row table here before answered "when does Pottery meet?",
          but families ask the inverse — "where are they at 10:30 Tuesday?" —
          and had to scan every row to work it out. */}
      <div className="mt-4">
        <ScheduleByDay classes={classes} />
      </div>
    </section>
  )
}

export default function SchoolPage() {
  const [announcements, setAnnouncements] = useState([])
  const [orgName, setOrgName] = useState(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const { school, loading: orgLoading } = useOrganization()
  const { effectiveRole } = useAuth()
  // Superadmins belong to no school, so membership answers nothing for them.
  // They preview one org at a time instead, through the same shared selection
  // the SIS console uses (sisOrgStore — persisted, defaults to iCreate), and
  // every read on this page carries that org explicitly.
  const isSuperadmin = effectiveRole === 'superadmin'
  const { orgId: selectedOrgId, setOrgId, orgs: previewOrgs, loading: previewLoading } = useSisOrg()
  const previewOrgId = isSuperadmin ? selectedOrgId : null
  // Which role's view of the school page the preview renders (guardian rail,
  // message audience filtering, carpool affordances). Parent is the fuller view.
  const [viewAs, setViewAs] = useState('parent')
  const previewParams = previewOrgId ? { organization_id: previewOrgId, view_as: viewAs } : null
  const [feed, setFeed] = useState(null)
  const [schoolOrg, setSchoolOrg] = useState(null)
  const debounceRef = useRef(null)
  // Archive ids already reported as read this session — read receipts are
  // per-person facts, so nothing is reported from the superadmin preview.
  const markedRef = useRef(new Set())

  const fetchPage = useCallback(async (offset, q, append) => {
    try {
      if (append) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      const { data } = await api.get('/api/announcements/archive', {
        params: { limit: PAGE_SIZE, offset, ...(q ? { q } : {}),
                  ...(previewOrgId ? { organization_id: previewOrgId, view_as: viewAs } : {}) },
      })
      if (data.success) {
        setAnnouncements((prev) => (append ? [...prev, ...(data.announcements || [])] : (data.announcements || [])))
        setTotal(data.total || 0)
        if (data.organization_name) setOrgName(data.organization_name)
      } else {
        setError(data.error || 'Failed to load announcements')
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load announcements')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [previewOrgId, viewAs])

  // Initial load + reload on (debounced) search
  useEffect(() => {
    fetchPage(0, query, false)
  }, [query, fetchPage])

  // Read receipts: every archive message that has reached this member's screen
  // is reported once, so the office's "Seen by 34 of 50 families" is real.
  // Fire-and-forget — the feed never waits on it, and a school without the
  // endpoint yet just logs nothing.
  useEffect(() => {
    if (previewOrgId) return
    const ids = announcements.map((a) => a.id).filter((id) => !markedRef.current.has(id))
    if (ids.length === 0) return
    ids.forEach((id) => markedRef.current.add(id))
    api.post('/api/announcements/mark-read', { announcement_ids: ids.slice(0, 50) })
      .catch(() => { /* receipts are best-effort */ })
  }, [announcements, previewOrgId])

  // Which of the school's surfaces to offer, and whether this viewer is a
  // guardian here. A school that isn't on the SIS resolves to no org and so to
  // no rail, which is correct — it has nothing behind those links. Failing
  // silently degrades to the feed rather than an error.
  useEffect(() => {
    let active = true
    api.get('/api/sis/school/context', previewParams ? { params: previewParams } : undefined)
      .then(({ data }) => {
        if (!active || !data?.success) return
        setSchoolOrg((data.orgs || [])[0] || null)
      })
      .catch(() => { /* not a SIS school, or the lookup is down */ })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- previewParams derives from these
  }, [previewOrgId, viewAs])

  // The community board, loaded once. A failure here is silent: the archive is
  // still the feed, the board items are the extra. Nothing on this page writes
  // to the board any more — the carpool board lives on /carpool, which the rail
  // links to — so there is no refetch to arrange.
  useEffect(() => {
    let active = true
    api.get('/api/sis/community/feed', previewParams ? { params: previewParams } : undefined)
      .then(({ data }) => {
        if (!active || !data?.success) return
        setFeed(data.feed)
        if (data.organization_name) setOrgName(data.organization_name)
      })
      .catch(() => { /* no board for this user */ })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- previewParams derives from these
  }, [previewOrgId, viewAs])

  const onSearchChange = (value) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setQuery(value.trim()), 300)
  }

  const hasMore = announcements.length < total
  const schoolName = school?.name || orgName
  // The guardian doors ("My family": billing, absences, checklists, requests,
  // schedule) are sidebar items under the school's name since 2026-09-15
  // (components/navigation/Sidebar, from the same catalog), so the rail here
  // keeps only the school-life cards. The superadmin preview has no such
  // sidebar and keeps the full rail; a family-first school's page exists for
  // its one family card and keeps it too.
  // Since 2026-09-16 the page is a tab of the school shell, and a guardian
  // has a Calendar tab -- so the rail does not offer the calendar to them a
  // second time. A student or a teacher has no tabs and keeps the door.
  // viewerRole decides the Directory card: guardians and staff, not students
  // (82485501). A superadmin preview shows the role being previewed.
  const cardGroups = cardGroupsFor(schoolOrg, {
    viewerRole: isSuperadmin ? (viewAs === 'admin' ? 'org_admin' : viewAs) : effectiveRole,
  })
    .filter((g) => g.id !== 'family' || isSuperadmin || isFamilyFirstHubOrg(schoolOrg))
    .map((g) => (g.id === 'school-life' && schoolOrg?.is_guardian && !isSuperadmin
      ? { ...g, cards: g.cards.filter((c) => c.path !== '/school-calendar') }
      : g))
    .filter((g) => g.cards.length > 0)
  // A family-first school gets the rail and nothing beside it. The feed is the
  // page for a school that talks to its families here; this school doesn't, so
  // rendering it would put an empty shell next to the one card the page
  // exists to carry.
  const cardsOnly = isFamilyFirstHubOrg(schoolOrg)

  // Wait for /me before deciding — redirecting on a not-yet-loaded context
  // would bounce every member of a school on a hard refresh. When the school
  // context is missing (fetch failed) or this school hasn't opted into the
  // page (feature_flags.sis_settings.school_homepage — a school that front-
  // doors its families elsewhere), send the signed-in member to their own
  // home: bouncing to "/" put them on the marketing homepage seconds after
  // logging in. The sidebar hides the item on the same flag; this covers a
  // typed URL or stale bookmark. Superadmins have no school and stay: they
  // preview one via the org sidebar below.
  if (!isSuperadmin && !orgLoading && !school?.homepage) {
    return <Navigate to={roleHomePath(effectiveRole)} replace />
  }

  // Superadmin with no org resolved yet: the org list is still loading (or,
  // pathologically, empty). The page can't fetch anything meaningful without
  // an org, so hold here rather than flashing an empty school.
  if (isSuperadmin && !previewOrgId) {
    return (
      <div role="status" aria-label="Loading" className="flex justify-center items-center py-24">
        {previewLoading ? (
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
        ) : (
          <p className="text-sm text-gray-500">No organizations to preview.</p>
        )}
      </div>
    )
  }

  // The rail: what is coming up, then the doors to the school's other pages
  // as one list, not a card per door. A card per door with an icon tile and a
  // description read as four widgets beside the feed (2026-09-16 redesign).
  const doors = cardGroups.length > 0 && (
    <nav aria-label="School surfaces" className="space-y-4">
      {cardGroups.map((group) => (
        <div key={group.id} className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
            {group.title}
          </p>
          <div className="divide-y divide-gray-100">
            {group.cards.map(({ name, path, description, Icon }) => (
              <Link
                key={path}
                to={path}
                className="group flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <Icon className="w-5 h-5 text-optio-purple flex-shrink-0" />
                <span className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900 group-hover:text-optio-purple">
                    {name}
                  </h3>
                  <span className="block text-xs text-gray-500 truncate">{description}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
  const rail = (!cardsOnly && feed?.events?.length > 0) || doors ? (
    <div className="space-y-4">
      {!cardsOnly && <ComingUp events={feed?.events || []} />}
      {doors}
    </div>
  ) : null

  return (
    <div>
      {/* Superadmin preview controls: which school, seen as which role. Kept
          to two small dropdowns — the page below should look like the page,
          not like an admin console. The superadmin belongs to no school, so
          the school shell (pages/school/SchoolShell) renders no letterhead
          for them; this page renders one for the org being previewed. */}
      {isSuperadmin && (
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex flex-wrap justify-end gap-2 mb-4">
            <select
              aria-label="Previewing organization"
              value={previewOrgId || ''}
              onChange={(e) => setOrgId(e.target.value)}
              className="text-sm text-gray-700 bg-white border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            >
              {previewOrgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <select
              aria-label="Viewing as"
              value={viewAs}
              onChange={(e) => setViewAs(e.target.value)}
              className="text-sm text-gray-700 bg-white border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            >
              <option value="parent">View as parent</option>
              <option value="student">View as student</option>
              <option value="admin">View as admin</option>
            </select>
          </div>
          <SchoolLetterhead
            name={schoolName}
            logoUrl={schoolOrg?.logo_url}
            logoSubtitle={schoolOrg?.logo_subtitle}
          />
        </div>
      )}

      {/* The feed leads, the rail follows — side by side on a wide screen,
          stacked feed-first on a narrow one. Optio Academy is rail-only. */}
      <div className={`${isSuperadmin ? 'max-w-5xl mx-auto px-4' : ''} ${cardsOnly ? '' : 'lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-8'}`}>
        <div className="min-w-0">
          {/* The student's own week — renders nothing for guardians, staff, and
              the superadmin preview (no real student behind view_as=student). */}
          {!previewOrgId && <MyScheduleSection />}
          {/* Under the schedule, for the same audience and for the same reason:
              a student's own classes, and what those classes have shared. Both
              render nothing for anyone who is not a student, and neither is
              shown in the superadmin preview -- there is no real student behind
              view_as=student to read enrollments for. (A guardian's children's
              classes were here too, 2026-09-10 to 2026-09-16; they are on the
              Schedule tab now, under the week, where a parent looks for a
              class.) */}
          {!previewOrgId && <MyClassMaterials />}
          {/* Videos and documents the school set for its students, with a Done
              button (ae16c5da). Empty -- so nothing -- for anyone who is not a
              student, and hidden in the preview for the same reason as above. */}
          {!previewOrgId && <MySchoolTraining />}
          {/* The student's own tasks from the school, done in place. Empty --
              so nothing -- for anyone who is not a student, and hidden in the
              preview for the same reason as above. */}
          {!previewOrgId && <MySchoolTodo />}

          {!cardsOnly && (
            <UnifiedFeed
              schoolName={schoolName}
              feed={feed}
              messages={announcements}
              loading={loading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              error={error}
              search={search}
              onSearchChange={onSearchChange}
              query={query}
              onLoadMore={() => fetchPage(announcements.length, query, true)}
            />
          )}

        </div>

        {rail && (
          <aside className={cardsOnly ? 'mt-2 max-w-md mx-auto w-full' : 'mt-6 lg:mt-0'}>
            {rail}
          </aside>
        )}
      </div>
    </div>
  )
}
