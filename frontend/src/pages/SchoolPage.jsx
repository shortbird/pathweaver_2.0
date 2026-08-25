import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Navigate, Link } from 'react-router-dom'
import {
  BuildingLibraryIcon, CalendarDaysIcon,
  BookOpenIcon, UsersIcon, CreditCardIcon, ClipboardDocumentListIcon,
  DocumentTextIcon, CheckCircleIcon, CalendarIcon, TableCellsIcon,
  AcademicCapIcon, TruckIcon,
} from '@heroicons/react/24/outline'
import api from '../services/api'
import { useOrganization } from '../contexts/OrganizationContext'
import { useAuth } from '../contexts/AuthContext'
import { roleHomePath } from '../utils/postLoginPath'
import { useSisOrg } from './sis/useSisOrg'
import { isOptioAcademyOrg } from '../config/optioAcademy'
import WeeklySchedule from '../components/schedule/WeeklySchedule'
import ScheduleByDay from '../components/schedule/ScheduleByDay'
import UnifiedFeed, { ComingUp } from '../components/announcements/UnifiedFeed'
import CarpoolBoard from '../components/announcements/CarpoolBoard'

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
 * - The RAIL holds the doors to the school's other surfaces, grouped: "My
 *   family" (the guardian surfaces — billing, absences, portal, requests,
 *   schedule/goals) and "School life" (calendar, resources, directory). The
 *   links did not move, so every emailed link and bookmark still works. On
 *   small screens the rail follows the feed — the feed is what a parent came
 *   for; the doors are one scroll away.
 *
 * Only for people who are in a school. Someone with no school has nothing this
 * page could show, so they are sent home rather than shown an empty shell — and
 * the nav item is hidden for them too.
 */

/**
 * The rail cards, and who each is for.
 *
 * `guardianOnly` is the whole safety property of this file. Calendar, Resources
 * and Directory are the school's own content and belong to everyone in the
 * school. The rest act on a FAMILY — a household's invoices, a child's absence,
 * the checklists assigned to a guardian — and a student is a member of the
 * school without being a guardian in it. The backend enforces this too
 * (sis_parent_service authorizes those by family relationship); this list only
 * decides what to offer.
 */
// Copy note (iCreate, 2026-08-06): the word "school" is unwelcome here — "iCreate
// is an education center". Card copy stays neutral ("Calendar", "Let us know…");
// where a sentence needs a subject the page uses the org's own name instead.
const SCHOOL_LIFE_CARDS = [
  {
    name: 'Calendar', path: '/school-calendar', Icon: CalendarDaysIcon,
    description: 'Field trips, showcases and closures.',
  },
  {
    name: 'Resources', path: '/resources', Icon: BookOpenIcon,
    description: 'Guidebooks, contracts and forms to refer back to.',
  },
  {
    name: 'Directory', path: '/family-directory', Icon: UsersIcon,
    description: 'Contact details for families who opted in.',
  },
  // Everyone's card, not guardian-only: students see the board too (it may
  // explain their own ride) — the backend keeps posting adults-only.
  {
    name: 'Carpool', path: '/carpool', Icon: TruckIcon,
    description: 'Offer or find rides with other families.',
  },
]

const FAMILY_CARDS = [
  {
    name: 'Absences', path: '/absences', Icon: CalendarIcon,
    description: 'Let us know when your child will be out.', guardianOnly: true,
  },
  {
    name: 'Billing', path: '/family/billing', Icon: CreditCardIcon,
    description: 'Your balance, invoices and receipts.', guardianOnly: true,
  },
  {
    name: 'Portal', path: '/family/portal', Icon: ClipboardDocumentListIcon,
    description: 'Checklists assigned to your family.', guardianOnly: true,
  },
  {
    name: 'Requests', path: '/family/forms', Icon: DocumentTextIcon,
    description: 'Ask for records, a meeting or an at-home day.', guardianOnly: true,
  },
]

/** The post-registration card, which differs by how the school runs. */
const flowCard = (postRegistrationFlow) => (
  postRegistrationFlow === 'goals'
    ? {
      name: 'Goal Setting', path: '/family/goals', Icon: CheckCircleIcon,
      description: 'Set a direction and per-subject goals for each child.',
      guardianOnly: true,
    }
    : {
      name: 'Schedule', path: '/schedule-builder', Icon: TableCellsIcon,
      description: 'Build and change your children’s class schedules.',
      guardianOnly: true,
    }
)

/** Opt-in per org (feature_flags.sis_settings.prior_learning_enabled), so a
 *  school that doesn't take prior-learning submissions never shows the door. */
const priorLearningCard = {
  name: 'Prior Learning', path: '/family/prior-learning', Icon: AcademicCapIcon,
  description: 'Submit learning done before Optio for high-school credit.',
  guardianOnly: true,
}

/** The rail, grouped. A student gets only the School life group. */
export function cardGroupsFor(org) {
  if (!org) return []
  // Optio Academy runs almost none of the school-community surfaces (its
  // hidden_modules turns off calendar, resources, classes, attendance and the
  // rest), so the full card set was a row of doors onto empty rooms — which is
  // why its parents had this page taken out of the nav entirely. It's back for
  // Prior Learning, and that is ALL it carries for this school.
  if (isOptioAcademyOrg(org.organization_id)) {
    return org.is_guardian && org.prior_learning_enabled
      ? [{ id: 'family', title: 'My family', cards: [priorLearningCard] }]
      : []
  }
  const family = [flowCard(org.post_registration_flow), ...FAMILY_CARDS]
  if (org.prior_learning_enabled) family.push(priorLearningCard)
  const groups = []
  if (org.is_guardian) groups.push({ id: 'family', title: 'My family', cards: family })
  groups.push({ id: 'school-life', title: 'School life', cards: SCHOOL_LIFE_CARDS })
  return groups
}

/** Flat list — kept for callers that only care about which doors exist. */
export function cardsFor(org) {
  return cardGroupsFor(org).flatMap((g) => g.cards)
}

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
  const [carpoolPerms, setCarpoolPerms] = useState({ canPost: false, canModerate: false })
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
  // still the feed, the board items are the extra. Re-fetched after a carpool
  // post/removal (refreshFeed) so the board reflects the change without a
  // reload.
  const [feedNonce, setFeedNonce] = useState(0)
  const refreshFeed = useCallback(() => setFeedNonce((n) => n + 1), [])
  useEffect(() => {
    let active = true
    api.get('/api/sis/community/feed', previewParams ? { params: previewParams } : undefined)
      .then(({ data }) => {
        if (!active || !data?.success) return
        setFeed(data.feed)
        setCarpoolPerms({
          canPost: Boolean(data.can_post_carpool),
          canModerate: Boolean(data.can_moderate),
        })
        if (data.organization_name) setOrgName(data.organization_name)
      })
      .catch(() => { /* no board for this user */ })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- previewParams derives from these
  }, [feedNonce, previewOrgId, viewAs])

  const onSearchChange = (value) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setQuery(value.trim()), 300)
  }

  const hasMore = announcements.length < total
  const schoolName = school?.name || orgName
  const cardGroups = cardGroupsFor(schoolOrg)
  // Optio Academy gets the rail and nothing beside it. The feed is the page
  // for a school that talks to its families here; this school doesn't, so
  // rendering it would put an empty shell next to the one card the page
  // exists to carry.
  const cardsOnly = isOptioAcademyOrg(schoolOrg?.organization_id)

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

  const rail = cardGroups.length > 0 && (
    <nav aria-label="School surfaces" className="lg:sticky lg:top-24 space-y-5">
      {cardGroups.map((group) => (
        <div key={group.id}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2 px-0.5">
            {group.title}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
            {group.cards.map(({ name, path, description, Icon }) => (
              <Link
                key={path}
                to={path}
                className="group flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 hover:border-optio-purple/60 hover:shadow-sm transition-all"
              >
                <span className="w-8 h-8 rounded-lg bg-optio-purple/10 flex items-center justify-center flex-shrink-0 group-hover:bg-gradient-to-br group-hover:from-optio-purple group-hover:to-optio-pink transition-colors">
                  <Icon className="w-[18px] h-[18px] text-optio-purple group-hover:text-white transition-colors" />
                </span>
                <span className="min-w-0">
                  <h2 className="text-sm font-semibold text-gray-900 group-hover:text-optio-purple truncate">
                    {name}
                  </h2>
                  <span className="block text-xs text-gray-500 truncate">{description}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Superadmin preview controls: which school, seen as which role. Kept
          to two small dropdowns — the page below should look like the page,
          not like an admin console. */}
      {isSuperadmin && (
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
      )}
      {/* Header — the school's own page opens with the school's own mark,
          centered like a letterhead. The logo comes from the org's branding
          (branding_config.logo_url via /api/sis/school/context); a school
          without one gets a neutral tile, never a broken image. */}
      <header className="flex flex-col items-center text-center">
        {schoolOrg?.logo_url ? (
          <>
            {/* The logo IS the title here — the name rides along for screen
                readers and the page's accessible heading, not on screen. */}
            <img
              src={schoolOrg.logo_url}
              alt={schoolName || 'School logo'}
              className="h-[120px] max-w-full object-contain"
            />
            {/* Optional sub-brand word under the mark (branding_config.
                logo_subtitle) — e.g. the Optio wordmark with "academy" below. */}
            {schoolOrg.logo_subtitle && (
              <p aria-hidden="true" className="mt-1 text-lg font-semibold uppercase tracking-[0.45em] text-optio-purple">
                {schoolOrg.logo_subtitle}
              </p>
            )}
            <h1 className="sr-only">{schoolName || 'My school'}</h1>
          </>
        ) : (
          <>
            <div
              aria-hidden="true"
              className="w-14 h-14 rounded-2xl bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center"
            >
              <BuildingLibraryIcon className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mt-3">{schoolName || 'My school'}</h1>
          </>
        )}
        <p className="text-sm text-gray-500 mt-1">
          Everything from {schoolName || 'your school'}, in one place.
        </p>
      </header>

      {/* The feed leads, the rail follows — side by side on a wide screen,
          stacked feed-first on a narrow one. Optio Academy is rail-only. */}
      <div className={`mt-8 ${cardsOnly ? '' : 'lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-8'}`}>
        <div className="min-w-0">
          {/* The student's own week — renders nothing for guardians, staff, and
              the superadmin preview (no real student behind view_as=student). */}
          {!previewOrgId && <MyScheduleSection />}

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

          {!cardsOnly && <ComingUp events={feed?.events || []} />}

          {/* Carpool renders even when empty (someone has to post first) — but
              only once the feed has loaded, and never a bare board to students,
              who cannot post (feed === null means no board for this user). */}
          {!cardsOnly && feed !== null && (
            <CarpoolBoard
              posts={feed?.carpool || []}
              canPost={carpoolPerms.canPost}
              canModerate={carpoolPerms.canModerate}
              onChanged={refreshFeed}
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
