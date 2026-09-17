import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  MegaphoneIcon, MagnifyingGlassIcon, ChevronDownIcon, CalendarDaysIcon,
} from '@heroicons/react/24/outline'
import AnnouncementBody from './AnnouncementBody'
import { AttachmentList } from '../communication/MessageParts'
import { fmtDate, fmtWhen, RECOGNITION_LABEL } from './SchoolCommunity'
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
 *
 * Shape (2026-09-16 redesign): the feed IS the column. Each post is a white
 * card on the page, not a gray card inside a white "From iCreate" box with an
 * icon tile and a collapse chevron -- boxes in boxes read as a widget, not a
 * feed. Pinned and urgent posts carry a colored left edge. The search is a
 * small field in the heading row, not a full-width bar above the first post.
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

const Badge = ({ tone, children }) => (
  <span className={`text-[11px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${tone}`}>
    {children}
  </span>
)
const KIND_BADGE = {
  shoutout: (d) => <Badge tone="bg-optio-pink/10 text-optio-pink">{RECOGNITION_LABEL[d.type] || 'Shout-out'}</Badge>,
  lostfound: () => <Badge tone="bg-amber-100 text-amber-700">Lost &amp; found</Badge>,
}

// One card, three tones: plain, pinned (purple edge), urgent (red edge).
const CARD = 'bg-white border border-gray-200 rounded-xl p-5'
const cardTone = ({ pinned, urgent }) => (
  urgent ? `${CARD} border-l-4 border-l-red-500`
    : pinned ? `${CARD} border-l-4 border-l-optio-purple`
      : CARD
)

function FeedItem({ item, expanded, onToggleExpand }) {
  const d = item.data
  if (item.kind === 'lostfound') {
    return (
      <article className={`${CARD} flex gap-4`}>
        {d.image_url && (
          <img src={d.image_url} alt="" loading="lazy"
            className="w-20 h-20 rounded-lg object-cover bg-gray-100 flex-shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {KIND_BADGE.lostfound()}
            <time className="text-xs text-gray-400">{fmtDate(item.date)}</time>
          </div>
          <h3 className="text-base font-semibold text-gray-900 mt-1.5">{d.description}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {[d.category, d.location_found && `found at ${d.location_found}`,
              d.date_found && `on ${fmtDate(d.date_found)}`, 'collect it from the office']
              .filter(Boolean).join(' · ')}
          </p>
          {/* Unclaimed items are donated after a fortnight — the deadline is
              the useful part for a parent, not the log date. */}
          {typeof d.days_until_donation === 'number' && d.days_until_donation >= 0 && (
            <p className="text-sm font-medium text-amber-700 mt-1">
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
      <article className={`${CARD} border-l-4 border-l-optio-pink`}>
        <div className="flex items-center gap-2 flex-wrap">
          {KIND_BADGE.shoutout(d)}
          <time className="text-xs text-gray-400">{fmtDate(item.date)}</time>
        </div>
        {d.recipient_name && <h3 className="text-base font-semibold text-gray-900 mt-1.5">{d.recipient_name}</h3>}
        {d.message && <p className="text-sm text-gray-700 mt-1.5 leading-relaxed">{d.message}</p>}
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
    <article className={cardTone({ pinned: item.pinned, urgent: isUrgent })}>
      <div className="flex items-center gap-2 flex-wrap">
        {item.pinned && <Badge tone="bg-optio-purple/10 text-optio-purple">Pinned</Badge>}
        {isUrgent && <Badge tone="bg-red-100 text-red-700">Urgent</Badge>}
        <time className="text-xs text-gray-400">{fmtDate(item.date)}</time>
      </div>
      <h3 className="text-base font-semibold text-gray-900 mt-1.5">{d.title}</h3>
      {body && (
        <AnnouncementBody
          text={body}
          className={`text-sm text-gray-700 mt-2 leading-relaxed ${!expanded && isLong ? 'line-clamp-4' : ''}`}
        />
      )}
      {/* Archive sends can carry files (signed per read by the backend). */}
      {d.attachments?.length > 0 && <AttachmentList attachments={d.attachments} />}
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
    <section id="school-feed" aria-labelledby="school-feed-heading" className="scroll-mt-14">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 id="school-feed-heading" className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <MegaphoneIcon className="w-5 h-5 text-optio-purple" />
          {schoolName ? `Latest from ${schoolName}` : 'Latest from your school'}
        </h2>
        {/* Search — the archive filters server-side (?q); board items client-side. */}
        <div className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search"
            aria-label="Search messages"
            className="w-36 sm:w-52 pl-9 pr-3 py-1.5 text-sm bg-white border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent"
          />
        </div>
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
          <div className={`${CARD} text-center py-12`}>
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
    </section>
  )
}

/**
 * The next few dates, as a slim card for the rail — not a section a parent
 * has to open. The full calendar is one tab away; this is the "don't get
 * surprised Tuesday" glance.
 */
export function ComingUp({ events }) {
  const upcoming = (events || []).slice(0, 5)
  if (upcoming.length === 0) return null
  return (
    <section id="coming-up" aria-labelledby="coming-up-heading" className={CARD}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 id="coming-up-heading" className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
          <CalendarDaysIcon className="w-4 h-4" />
          Coming up
        </h2>
        <Link to="/school-calendar" className="text-xs font-medium text-optio-purple hover:underline">
          Full calendar &rarr;
        </Link>
      </div>
      <ul className="divide-y divide-gray-100">
        {upcoming.map((e) => (
          <li key={e.id} className="py-2.5 first:pt-0 last:pb-0">
            <div className="text-sm font-medium text-gray-900">{e.title}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {fmtWhen(e)}{e.location ? ` · ${e.location}` : ''}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
