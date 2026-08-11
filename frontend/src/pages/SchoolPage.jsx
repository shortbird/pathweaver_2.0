import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Navigate, Link } from 'react-router-dom'
import {
  BuildingLibraryIcon, MagnifyingGlassIcon, ChevronDownIcon, CalendarDaysIcon,
  BookOpenIcon, UsersIcon, CreditCardIcon, ClipboardDocumentListIcon,
  DocumentTextIcon, CheckCircleIcon, CalendarIcon, TableCellsIcon, EnvelopeIcon,
} from '@heroicons/react/24/outline'
import api from '../services/api'
import { useOrganization } from '../contexts/OrganizationContext'
import { useAuth } from '../contexts/AuthContext'
import { roleHomePath } from '../utils/postLoginPath'
import { useSisOrg } from './sis/useSisOrg'
import AnnouncementBody from '../components/announcements/AnnouncementBody'
import SchoolCommunity, { FeedSection, hasCommunityContent } from '../components/announcements/SchoolCommunity'
import CarpoolBoard from '../components/announcements/CarpoolBoard'
import { GlassTabBar } from '../components/ui'
import { htmlToText } from '../utils/richText'

const PAGE_SIZE = 20

/**
 * SchoolPage — everything a member gets from their school, in one place, titled
 * with the school's name (/school; /announcements still lands here so older
 * emails and notifications keep working).
 *
 * The page is a hub over three things:
 * - Cards for the school's other surfaces (calendar, resources, directory, and
 *   the family ones). These lived loose in the sidebar until 2026-08-06, where
 *   a parent at a SIS school saw fourteen nav items, eight of them the same
 *   school. The cards link to the same routes, which did not move, so every
 *   emailed link and bookmark still works.
 * - The community sections — noticeboard, what's on, lost & found, shout-outs
 *   (GET /api/sis/community/feed; iCreate, 2026-08-01: "I can't see the
 *   shoutouts or lost and found or other things from the non-admin side.") —
 *   plus the searchable archive of what the school has sent
 *   (GET /api/announcements/archive), newest first with a "Load more" pager.
 *   Behind a glass tab bar, one tab per section (2026-08-10): the stacked
 *   single feed of 2026-08-06 meant finding a lower section was an exercise
 *   in scrolling, so a tab now swaps the panel to that section instead. With
 *   fewer than two sections there is no bar and everything just stacks. The
 *   archive is still ON the page rather than behind a card: it is the
 *   most-read thing here and a route away would be a downgrade.
 *
 * Only for people who are in a school. Someone with no school has nothing this
 * page could show, so they are sent home rather than shown an empty shell — and
 * the nav item is hidden for them too.
 */

/**
 * The cards, and who each is for.
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
const SCHOOL_CARDS = [
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
  {
    name: 'Billing', path: '/family/billing', Icon: CreditCardIcon,
    description: 'Your balance, invoices and receipts.', guardianOnly: true,
  },
  {
    name: 'Absences', path: '/absences', Icon: CalendarIcon,
    description: 'Let us know when your child will be out.', guardianOnly: true,
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
      name: 'Schedule Builder', path: '/schedule-builder', Icon: TableCellsIcon,
      description: 'Build and change your children’s class schedules.',
      guardianOnly: true,
    }
)

export function cardsFor(org) {
  if (!org) return []
  const cards = [flowCard(org.post_registration_flow), ...SCHOOL_CARDS]
  return org.is_guardian ? cards : cards.filter((c) => !c.guardianOnly)
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
  const [expanded, setExpanded] = useState(() => new Set())
  const { school, loading: orgLoading } = useOrganization()
  const { effectiveRole } = useAuth()
  // Superadmins belong to no school, so membership answers nothing for them.
  // They preview one org at a time instead, through the same shared selection
  // the SIS console uses (sisOrgStore — persisted, defaults to iCreate), and
  // every read on this page carries that org explicitly.
  const isSuperadmin = effectiveRole === 'superadmin'
  const { orgId: selectedOrgId, setOrgId, orgs: previewOrgs, loading: previewLoading } = useSisOrg()
  const previewOrgId = isSuperadmin ? selectedOrgId : null
  // Which role's view of the school page the preview renders (guardian cards,
  // message audience filtering, carpool affordances). Parent is the fuller view.
  const [viewAs, setViewAs] = useState('parent')
  const previewParams = previewOrgId ? { organization_id: previewOrgId, view_as: viewAs } : null
  const [feed, setFeed] = useState(null)
  const [carpoolPerms, setCarpoolPerms] = useState({ canPost: false, canModerate: false })
  const [schoolOrg, setSchoolOrg] = useState(null)
  const debounceRef = useRef(null)
  // The tab the viewer chose, if any — see `showing` for what actually renders.
  const [activeTab, setActiveTab] = useState(null)
  const panelRef = useRef(null)

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

  // Which of the school's surfaces to offer, and whether this viewer is a
  // guardian here. A school that isn't on the SIS resolves to no org and so to
  // no cards, which is correct — it has nothing behind those links. Failing
  // silently degrades to the announcements page rather than an error.
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
  // the page, the board is the extra. Re-fetched after a carpool post/removal
  // (refreshFeed) so the board reflects the change without a reload.
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

  const toggleExpanded = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const formatDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    } catch {
      return ''
    }
  }

  const hasMore = announcements.length < total
  const schoolName = school?.name || orgName
  const cards = cardsFor(schoolOrg)

  // The Messages section renders unless the school has literally never sent
  // one AND the board has content (then the board is the page and an empty
  // "Messages" block would be dead weight). Named because the jump bar below
  // and the JSX both need the same answer.
  const showMessages = loading || Boolean(error) || announcements.length > 0
    || Boolean(query) || !hasCommunityContent(feed)

  // The section tabs: "All" (the whole feed, the default) plus one tab per
  // section that actually exists. The sections are stacked cards and a busy
  // board pushes the lower ones viewports down — a tab swaps the panel to
  // just that section rather than scrolling to it. Tabs mirror the render
  // conditions of their sections exactly, so no tab ever shows nothing.
  const sectionTabs = [
    (feed?.announcements || []).length > 0 && { id: 'board-announcements', label: 'Announcements' },
    (feed?.events || []).length > 0 && { id: 'board-events', label: 'Events' },
    (feed?.lost_found || []).length > 0 && { id: 'board-lost-found', label: 'Lost & found' },
    (feed?.recognition || []).length > 0 && { id: 'board-shout-outs', label: 'Shout-outs' },
    feed !== null && ((feed?.carpool || []).length > 0 || carpoolPerms.canPost)
      && { id: 'board-carpool', label: 'Carpool' },
    showMessages && { id: 'school-messages', label: 'Messages' },
  ].filter(Boolean)
  const tabs = sectionTabs.length >= 2 ? sectionTabs : []

  // What the panel shows. With no bar (fewer than two sections) everything
  // renders stacked, which the rest of the file spells 'all'. With a bar, the
  // remembered selection — or the first tab when there is no valid selection
  // yet (first load, or the section vanished on a feed reload / preview org
  // switch). Derived, not an effect, so there is never a blank-panel render.
  const showing = tabs.length === 0
    ? 'all'
    : (tabs.some((t) => t.id === activeTab) ? activeTab : tabs[0].id)

  const selectTab = (id) => {
    setActiveTab(id)
    // Deep in the page, switching tabs would land the viewer mid-section;
    // bring them back to the top of the panel. Near the top, don't move.
    const el = panelRef.current
    if (!el) return
    const navH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--navbar-height'), 10) || 64
    const target = Math.max(el.getBoundingClientRect().top + window.scrollY - navH - 60, 0)
    if (window.scrollY > target) window.scrollTo({ top: target, behavior: 'smooth' })
  }

  // One section with the rest emptied out — SchoolCommunity already hides a
  // section with no items, so filtering the feed IS the tab switch.
  const shownFeed = showing === 'all' ? feed : feed && {
    ...feed,
    announcements: showing === 'board-announcements' ? feed.announcements : [],
    events: showing === 'board-events' ? feed.events : [],
    lost_found: showing === 'board-lost-found' ? feed.lost_found : [],
    recognition: showing === 'board-shout-outs' ? feed.recognition : [],
  }

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

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
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
          without one gets a neutral tile, never a broken image. The subtitle
          is static (it used to flip with the active tab, two viewports away
          from the tabs themselves). */}
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

      {/* The school's other surfaces. These are doors, not content — kept to a
          quiet row height so the feed below stays the page. (Bare h2/h3 inherit
          text-3xl from index.css base styles; every size here is explicit.) */}
      {cards.length > 0 && (
        <nav
          aria-label="School surfaces"
          className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-6"
        >
          {cards.map(({ name, path, description, Icon }) => (
            <Link
              key={path}
              to={path}
              className="group flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-3.5 py-3 hover:border-optio-purple/60 hover:shadow-sm transition-all"
            >
              <span className="w-9 h-9 rounded-lg bg-optio-purple/10 flex items-center justify-center flex-shrink-0 group-hover:bg-gradient-to-br group-hover:from-optio-purple group-hover:to-optio-pink transition-colors">
                <Icon className="w-5 h-5 text-optio-purple group-hover:text-white transition-colors" />
              </span>
              <span className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-900 group-hover:text-optio-purple truncate">
                  {name}
                </h2>
                <span className="block text-xs text-gray-500 truncate">{description}</span>
              </span>
            </Link>
          ))}
        </nav>
      )}

      {/* The section tab bar — the shared glass pill rail (GlassTabBar was
          extracted from this page's inline version, 2026-08-10). Sticks just
          below the fixed navbar; tapping a tab swaps the panel below to that
          section; hidden when there's only one section to choose from. */}
      <GlassTabBar
        tabs={tabs}
        active={showing}
        onSelect={selectTab}
        sticky
        className="mt-6"
        aria-label="Sections on this page"
      />

      {/* One feed, no tabs (2026-08-06). The community sections lead — they
          are short and timely — and each renders only when the school has used
          it. Every section is a block with an icon header, echoing the card
          grid above (iCreate: "the 8 blocks is easy to see all the things
          clearly. Could we do that same thing for the community section?"). */}
      <div className="mt-8" ref={panelRef}>
        {/* A section that is the whole panel shows every item; the stacked
            no-bar layout keeps sections capped. */}
        <SchoolCommunity feed={shownFeed} expanded={showing !== 'all'} />
        {/* Carpool renders even when empty (someone has to post first) — but
            only once the feed has loaded, and never a bare board to students,
            who cannot post (feed === null means no board for this user). */}
        {feed !== null && (showing === 'all' || showing === 'board-carpool') && (
          <CarpoolBoard
            posts={feed?.carpool || []}
            canPost={carpoolPerms.canPost}
            canModerate={carpoolPerms.canModerate}
            onChanged={refreshFeed}
          />
        )}
      </div>

      {/* The archive of SENT messages (email / notification fan-outs) closes
          the feed — it paginates, so anywhere higher it buries the sections
          below. Titled "Messages", NOT "Announcements": staff post
          announcements on the board above, and titling this section that way
          had a parent reporting the page broken because her two board posts
          "didn't appear on the announcements tab" (iCreate, 2026-08-06). A
          school that has never sent one shows nothing here at all — unless the
          whole feed is empty, in which case the empty state explains itself. */}
      {showMessages && (showing === 'all' || showing === 'school-messages') && (
      <FeedSection
        id="school-messages"
        title={schoolName ? `Messages from ${schoolName}` : 'Messages'}
        Icon={EnvelopeIcon}
      >
      {/* Search */}
      <div className="relative mb-4">
        <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search messages…"
          aria-label="Search messages"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 font-medium">
            {query ? 'No messages match your search.' : 'No messages yet.'}
          </p>
          {!query && (
            <p className="text-sm text-gray-400 mt-1">
              When {schoolName || 'your school'} sends you a message, it will appear here.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const isExpanded = expanded.has(a.id)
            const body = a.content || a.message || ''
            // Length is judged on the words, not the markup, so a formatted
            // announcement doesn't collapse itself for two lines of tags.
            const isLong = htmlToText(body).length > 280
            return (
              <article key={a.id} className="border border-gray-100 bg-gray-50/60 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  {/* Explicit size — a bare h3 inherits from the base styles. */}
                  <h3 className="text-sm font-semibold text-gray-900">{a.title}</h3>
                  <time className="text-xs text-gray-400 whitespace-nowrap mt-0.5">
                    {formatDate(a.created_at)}
                  </time>
                </div>
                <AnnouncementBody
                  text={body}
                  className={`text-sm text-gray-700 mt-2 leading-relaxed ${
                    !isExpanded && isLong ? 'line-clamp-4' : ''
                  }`}
                />
                {isLong && (
                  <button
                    onClick={() => toggleExpanded(a.id)}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-optio-purple hover:underline"
                  >
                    {isExpanded ? 'Show less' : 'Read more'}
                    <ChevronDownIcon
                      className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                )}
              </article>
            )
          })}

          {hasMore && (
            <div className="text-center pt-2">
              {/* A quiet pager, not a call to action — the gradient belongs to
                  the header, not to "show me older posts". */}
              <button
                onClick={() => fetchPage(announcements.length, query, true)}
                disabled={loadingMore}
                className="px-6 py-2 text-sm font-medium text-gray-700 rounded-lg border border-gray-300 bg-white hover:border-optio-purple hover:text-optio-purple transition-colors disabled:opacity-40"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
      </FeedSection>
      )}
    </div>
  )
}
