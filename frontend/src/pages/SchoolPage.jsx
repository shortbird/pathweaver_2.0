import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Navigate, Link } from 'react-router-dom'
import {
  BuildingLibraryIcon, MagnifyingGlassIcon, ChevronDownIcon, CalendarDaysIcon,
  BookOpenIcon, UsersIcon, CreditCardIcon, ClipboardDocumentListIcon,
  DocumentTextIcon, CheckCircleIcon, CalendarIcon, TableCellsIcon,
} from '@heroicons/react/24/outline'
import api from '../services/api'
import { useOrganization } from '../contexts/OrganizationContext'
import AnnouncementBody from '../components/announcements/AnnouncementBody'
import SchoolCommunity, { hasCommunityContent } from '../components/announcements/SchoolCommunity'
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
 * - Announcements — the searchable archive of what the school has sent
 *   (GET /api/announcements/archive), newest first, with a "Load more" pager.
 *   Deliberately still ON the page rather than behind a card: it is the
 *   most-read thing here and putting it a click away would be a downgrade.
 * - Community — the school's board: noticeboard posts, what's on, lost & found,
 *   shout-outs (GET /api/sis/community/feed). iCreate, 2026-08-01: "I can't see
 *   the shoutouts or lost and found or other things from the non-admin side."
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
const SCHOOL_CARDS = [
  {
    name: 'School Calendar', path: '/school-calendar', Icon: CalendarDaysIcon,
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
    description: 'Tell the school a child will be out.', guardianOnly: true,
  },
  {
    name: 'Portal', path: '/family/portal', Icon: ClipboardDocumentListIcon,
    description: 'Checklists the school has assigned to you.', guardianOnly: true,
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
  const [feed, setFeed] = useState(null)
  const [tab, setTab] = useState('sent')
  const [schoolOrg, setSchoolOrg] = useState(null)
  const debounceRef = useRef(null)

  const fetchPage = useCallback(async (offset, q, append) => {
    try {
      if (append) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      const { data } = await api.get('/api/announcements/archive', {
        params: { limit: PAGE_SIZE, offset, ...(q ? { q } : {}) },
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
  }, [])

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
    api.get('/api/sis/school/context')
      .then(({ data }) => {
        if (!active || !data?.success) return
        setSchoolOrg((data.orgs || [])[0] || null)
      })
      .catch(() => { /* not a SIS school, or the lookup is down */ })
    return () => { active = false }
  }, [])

  // The community board, loaded once. A failure here is silent: the archive is
  // the page, the board is the extra.
  useEffect(() => {
    let active = true
    api.get('/api/sis/community/feed')
      .then(({ data }) => {
        if (!active || !data?.success) return
        setFeed(data.feed)
        if (data.organization_name) setOrgName(data.organization_name)
      })
      .catch(() => { /* no board for this user */ })
    return () => { active = false }
  }, [])

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

  // Wait for /me before deciding — redirecting on a not-yet-loaded context
  // would bounce every member of a school on a hard refresh.
  if (!orgLoading && !school) return <Navigate to="/" replace />

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header — the school's own page, so it opens with the school, not with
          any one tab. The monogram stands in for a crest; the subtitle is
          static (it used to flip with the active tab, two viewports away from
          the tabs themselves). */}
      <div className="flex items-center gap-3.5">
        <div
          aria-hidden="true"
          className="w-12 h-12 rounded-2xl bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center flex-shrink-0"
        >
          {schoolName
            ? <span className="text-xl font-bold text-white">{schoolName.trim().charAt(0).toUpperCase()}</span>
            : <BuildingLibraryIcon className="w-6 h-6 text-white" />}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{schoolName || 'My school'}</h1>
          <p className="text-sm text-gray-500">Everything from your school, in one place.</p>
        </div>
      </div>

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

      {/* The feed. Underline tabs anchor it as its own section; with no
          community content there is nothing to switch, so a plain heading
          holds the same place in the layout. */}
      {hasCommunityContent(feed) ? (
        <div className="flex gap-6 border-b border-gray-200 mt-8 mb-6">
          {[['sent', 'Announcements'], ['community', 'Community']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={`pb-2.5 -mb-px border-b-2 text-sm font-semibold transition-colors ${
                tab === key
                  ? 'border-optio-purple text-optio-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
        <h2 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2.5 mt-8 mb-6">
          Announcements
        </h2>
      )}

      {tab === 'community' && <SchoolCommunity feed={feed} orgName={schoolName} />}

      {tab === 'sent' && (<>
      {/* Search */}
      <div className="relative mb-6">
        <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search announcements…"
          aria-label="Search announcements"
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
        <div className="text-center py-16">
          <p className="text-gray-500 font-medium">
            {query ? 'No announcements match your search.' : 'No announcements yet.'}
          </p>
          {!query && (
            <p className="text-sm text-gray-400 mt-1">
              When your school sends an announcement, it will appear here.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((a) => {
            const isExpanded = expanded.has(a.id)
            const body = a.content || a.message || ''
            // Length is judged on the words, not the markup, so a formatted
            // announcement doesn't collapse itself for two lines of tags.
            const isLong = htmlToText(body).length > 280
            return (
              <article key={a.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-start justify-between gap-3">
                  {/* Explicit size — a bare h2 inherits text-3xl from the base styles. */}
                  <h2 className="text-base font-semibold text-gray-900">{a.title}</h2>
                  <time className="text-xs text-gray-400 whitespace-nowrap mt-1">
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
      </>)}
    </div>
  )
}
