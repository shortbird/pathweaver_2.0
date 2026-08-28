import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  MegaphoneIcon, MagnifyingGlassIcon, ChevronDownIcon, CalendarDaysIcon,
} from '@heroicons/react/24/outline'
import AnnouncementBody from './AnnouncementBody'
import { FeedSection, fmtDate, fmtWhen, RECOGNITION_LABEL } from './SchoolCommunity'
import { htmlToText } from '../../utils/richText'

/**
 * The unified school feed — ONE stream for everything the school has said.
 *
 * Board announcements (sis_announcements) and sent messages (the announcements
 * archive) are two backend systems doing one job from a family's point of
 * view; splitting them across an "Announcements" tab and a "Messages" tab had
 * a parent reporting the page broken because her posts were "on the wrong tab"
 * (iCreate, 2026-08-06). Merged here instead, with shout-outs and lost & found
 * folded in as typed items — pinned posts first, then everything newest-first.
 *
 * The one seam the merge has to hide: a board post created with "notify" also
 * writes an archive row (announcement_service.publish via notify_audiences), so
 * the same words arrive twice. The archive row carries the board post's id in
 * source_announcement_id; that copy is dropped and the board copy wins — it
 * carries pinned/urgent.
 *
 * Title + calendar day used to stand in for that link, which held right up
 * until someone edited the post: the titles stopped matching and one notice
 * became two on the family portal (iCreate, 2026-08-27). Sends that predate
 * the link column have no source id, so the old match is kept as a fallback.
 */

const FEED_CAP = 6

const norm = (s) => (s || '').trim().toLowerCase()
const dayOf = (iso) => (iso || '').slice(0, 10)

/** Everything merged into one dated list. Exported for tests. */
export function mergeFeedItems(feed, messages) {
  const board = (feed?.announcements || []).map((a) => ({
    key: `announcement-${a.id}`, kind: 'announcement',
    date: a.created_at, pinned: Boolean(a.pinned), data: a,
  }))
  const boardIds = new Set(board.map((i) => i.data.id))
  const boardKeys = new Set(board.map((i) => `${norm(i.data.title)}|${dayOf(i.date)}`))
  const isBoardCopy = (m) => (
    m.source_announcement_id
      ? boardIds.has(m.source_announcement_id)
      : boardKeys.has(`${norm(m.title)}|${dayOf(m.created_at)}`)
  )
  const msgs = (messages || [])
    .filter((m) => !isBoardCopy(m))
    .map((m) => ({ key: `message-${m.id}`, kind: 'message', date: m.created_at, pinned: false, data: m }))
  const shouts = (feed?.recognition || []).map((r) => ({
    key: `shoutout-${r.id}`, kind: 'shoutout', date: r.created_at, pinned: false, data: r,
  }))
  const lost = (feed?.lost_found || []).map((l) => ({
    key: `lostfound-${l.id}`, kind: 'lostfound', date: l.created_at, pinned: false, data: l,
  }))
  return [...board, ...msgs, ...shouts, ...lost].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return (b.date || '').localeCompare(a.date || '')
  })
}

/** Client-side query match for the board-sourced kinds (the archive is
 * filtered server-side by ?q; these kinds only exist client-side). */
const matchesQuery = (item, q) => {
  if (!q) return true
  if (item.kind === 'message') return true
  const d = item.data
  const hay = [d.title, d.body, d.message, d.description, d.recipient_name]
    .filter(Boolean).join(' ').toLowerCase()
  return hay.includes(q.toLowerCase())
}

const KIND_BADGE = {
  shoutout: (d) => (
    <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-optio-pink/10 text-optio-pink">
      {RECOGNITION_LABEL[d.type] || 'Shout-out'}
    </span>
  ),
  lostfound: () => (
    <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">
      Lost &amp; found
    </span>
  ),
}

function FeedItem({ item, expanded, onToggleExpand }) {
  const d = item.data
  if (item.kind === 'lostfound') {
    return (
      <article className="border border-gray-100 bg-gray-50/60 rounded-lg p-4 flex gap-3">
        {d.image_url && (
          <img src={d.image_url} alt="" loading="lazy"
            className="w-16 h-16 rounded-lg object-cover bg-gray-100 flex-shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {KIND_BADGE.lostfound()}
              <h3 className="text-sm font-medium text-gray-900">{d.description}</h3>
            </div>
            <time className="text-xs text-gray-400 whitespace-nowrap mt-0.5">{fmtDate(item.date)}</time>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {[d.category, d.location_found && `found at ${d.location_found}`,
              d.date_found && `on ${fmtDate(d.date_found)}`, 'collect it from the office']
              .filter(Boolean).join(' · ')}
          </p>
          {/* Unclaimed items are donated after a fortnight — the deadline is
              the useful part for a parent, not the log date. */}
          {typeof d.days_until_donation === 'number' && d.days_until_donation >= 0 && (
            <p className="text-xs text-amber-700 mt-1">
              {d.days_until_donation === 0
                ? 'Being donated today'
                : `Donated in ${d.days_until_donation} day${d.days_until_donation === 1 ? '' : 's'}`}
            </p>
          )}
        </div>
      </article>
    )
  }

  if (item.kind === 'shoutout') {
    return (
      <article className="border border-gray-100 bg-gray-50/60 rounded-lg p-4">
        <div className="flex items-center gap-2 flex-wrap">
          {KIND_BADGE.shoutout(d)}
          {d.recipient_name && <h3 className="text-sm font-semibold text-gray-900">{d.recipient_name}</h3>}
          <time className="text-xs text-gray-400 ml-auto">{fmtDate(item.date)}</time>
        </div>
        {d.message && <p className="text-sm text-gray-700 mt-2">{d.message}</p>}
      </article>
    )
  }

  // 'announcement' (board) and 'message' (archive) render the same card; the
  // board copy carries pinned/urgent, the archive copy clamps long bodies.
  const body = d.body || d.content || d.message || ''
  // Length is judged on the words, not the markup, so a formatted message
  // doesn't collapse itself for two lines of tags.
  const isLong = item.kind === 'message' && htmlToText(body).length > 280
  const isUrgent = d.priority === 'urgent'
  return (
    <article className={`border rounded-lg p-4 ${
      isUrgent ? 'border-red-200 bg-red-50/30' : 'border-gray-100 bg-gray-50/60'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {item.pinned && (
            <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-optio-purple/10 text-optio-purple">
              Pinned
            </span>
          )}
          {isUrgent && (
            <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-red-100 text-red-700">
              Urgent
            </span>
          )}
          <h3 className="text-sm font-semibold text-gray-900">{d.title}</h3>
        </div>
        <time className="text-xs text-gray-400 whitespace-nowrap mt-0.5">{fmtDate(item.date)}</time>
      </div>
      {body && (
        <AnnouncementBody
          text={body}
          className={`text-sm text-gray-700 mt-2 leading-relaxed ${!expanded && isLong ? 'line-clamp-4' : ''}`}
        />
      )}
      {isLong && (
        <button
          onClick={onToggleExpand}
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-optio-purple hover:underline"
        >
          {expanded ? 'Show less' : 'Read more'}
          <ChevronDownIcon className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </article>
  )
}

export default function UnifiedFeed({
  schoolName, feed, messages, loading, loadingMore, hasMore, error,
  search, onSearchChange, query, onLoadMore,
}) {
  const [showAll, setShowAll] = useState(false)
  const [expanded, setExpanded] = useState(() => new Set())

  const items = useMemo(
    () => mergeFeedItems(feed, messages).filter((i) => matchesQuery(i, query)),
    [feed, messages, query],
  )
  const overflows = items.length > FEED_CAP
  const visible = showAll || !overflows ? items : items.slice(0, FEED_CAP)

  const toggleExpanded = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <FeedSection
      id="school-feed"
      title={schoolName ? `From ${schoolName}` : 'From your school'}
      Icon={MegaphoneIcon}
      defaultOpen
    >
      {/* Search — the archive filters server-side (?q); board items client-side. */}
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

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
        </div>
      ) : items.length === 0 ? (
        error ? (
          <div className="text-center py-16">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 font-medium">
              {query ? 'No messages match your search.' : 'No messages yet.'}
            </p>
            {!query && (
              <p className="text-sm text-gray-400 mt-1">
                When {schoolName || 'your school'} posts an announcement or sends you a
                message, it will appear here.
              </p>
            )}
          </div>
        )
      ) : (
        <div className="space-y-3">
          {visible.map((item) => (
            <FeedItem
              key={item.key}
              item={item}
              expanded={expanded.has(item.key)}
              onToggleExpand={() => toggleExpanded(item.key)}
            />
          ))}

          {overflows && !showAll && (
            <div className="text-center pt-2">
              <button
                onClick={() => setShowAll(true)}
                className="px-6 py-2 text-sm font-medium text-gray-700 rounded-lg border border-gray-300 bg-white hover:border-optio-purple hover:text-optio-purple transition-colors"
              >
                Show all {items.length}{hasMore ? '+' : ''}
              </button>
            </div>
          )}
          {(showAll || !overflows) && hasMore && (
            <div className="text-center pt-2">
              {/* A quiet pager, not a call to action. */}
              <button
                onClick={onLoadMore}
                disabled={loadingMore}
                className="px-6 py-2 text-sm font-medium text-gray-700 rounded-lg border border-gray-300 bg-white hover:border-optio-purple hover:text-optio-purple transition-colors disabled:opacity-40"
              >
                {loadingMore ? 'Loading…' : 'Load older messages'}
              </button>
            </div>
          )}
        </div>
      )}
    </FeedSection>
  )
}

/**
 * The next few dates, as a slim strip — not a section a parent has to open.
 * The full calendar is one link away; this is the "don't get surprised
 * Tuesday" glance.
 */
export function ComingUp({ events }) {
  const upcoming = (events || []).slice(0, 5)
  if (upcoming.length === 0) return null
  return (
    <FeedSection
      id="coming-up"
      title="Coming up"
      Icon={CalendarDaysIcon}
      collapsible={false}
      defaultOpen
      action={
        <Link
          to="/school-calendar"
          className="text-xs font-medium text-optio-purple hover:underline flex items-center gap-1"
        >
          View full calendar &rarr;
        </Link>
      }
    >
      <div className="divide-y divide-gray-100">
        {upcoming.map((e) => (
          <div key={e.id} className="py-2.5 first:pt-0 last:pb-0 flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <span className="text-sm font-medium text-gray-900">{e.title}</span>
              {e.location && <span className="text-xs text-gray-500 ml-2">{e.location}</span>}
            </div>
            <span className="text-xs text-gray-500 whitespace-nowrap">{fmtWhen(e)}</span>
          </div>
        ))}
      </div>
    </FeedSection>
  )
}
