import React, { useState } from 'react'
import {
  MegaphoneIcon, CalendarDaysIcon, ArchiveBoxIcon, SparklesIcon,
} from '@heroicons/react/24/outline'
import AnnouncementBody from './AnnouncementBody'

/**
 * The school's Community board, as a family sees it.
 *
 * iCreate, 2026-08-01: "I can't see the shoutouts or lost and found or other
 * things from the non-admin side of things." — answered the same day: the
 * Community Hub is meant for families too, and lost & found carries the item,
 * not the child ("just the item that was lost so parents can see it and know to
 * come pick it up").
 *
 * Naming (iCreate, 2026-08-06): what staff post here is what families call
 * "announcements" — the section is titled that way, and the SENT-message
 * archive on SchoolPage is titled "Messages" instead, so the two stop fighting
 * over one word. Each section is a block with an icon header, echoing the card
 * grid at the top of /school ("the 8 blocks is easy to see all the things
 * clearly. Could we do that same thing for the community section?").
 *
 * Read-only, and deliberately a projection: the feed endpoint sends only the
 * columns a family should see (no `claimed_by`, no author ids, no birthdays, no
 * scheduled-for-later posts). This component renders what it is given.
 */

const RECOGNITION_LABEL = {
  shout_out: 'Shout-out',
  student_spotlight: 'Student spotlight',
  volunteer: 'Volunteer thanks',
  weekly_win: 'Win of the week',
  thank_you: 'Thank you',
}

const fmtDate = (iso) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch { return '' }
}

const fmtWhen = (e) => {
  if (!e.start_at) return ''
  try {
    const d = new Date(e.start_at)
    const opts = { weekday: 'short', month: 'short', day: 'numeric' }
    // All-day events are stored date-only (00:00 UTC); format them in UTC or
    // the date renders as the previous evening anywhere west of Greenwich —
    // Labor Day on the 7th was showing as "Sun, Sep 6 · all day".
    if (e.all_day) opts.timeZone = 'UTC'
    // A school calendar runs across New Year. Without the year, "Mon, Jan 11"
    // under "Mon, Dec 14" reads as out of order instead of as next year.
    const year = e.all_day ? d.getUTCFullYear() : d.getFullYear()
    if (year !== new Date().getFullYear()) opts.year = 'numeric'
    const day = d.toLocaleDateString(undefined, opts)
    if (e.all_day) return `${day} · all day`
    return `${day} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  } catch { return '' }
}

/** A feed block: white card, icon-tile header — the cards' language, reused.
 * `id` is the jump-bar anchor; scroll-mt keeps the sticky bar off the title. */
export const FeedSection = ({ id, title, Icon, count, intro, children }) => (
  <section id={id} className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 mb-4 scroll-mt-14">
    <div className="flex items-center gap-2.5 mb-3">
      <span className="w-8 h-8 rounded-lg bg-optio-purple/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-[18px] h-[18px] text-optio-purple" />
      </span>
      <h2 className="text-sm font-semibold text-gray-900">
        {title}{count ? ` (${count})` : ''}
      </h2>
    </div>
    {intro && <p className="text-sm text-gray-500 -mt-1 mb-3">{intro}</p>}
    {children}
  </section>
)

/**
 * A section shows its first few items; the rest wait behind "Show all". The
 * page holds six sections stacked — uncapped, one busy noticeboard pushes
 * everything below it out of reach (the "scrolling way down" complaint,
 * 2026-08-10).
 */
const useCapped = (items, cap) => {
  const [showAll, setShowAll] = useState(false)
  const overflows = items.length > cap
  return {
    visible: showAll || !overflows ? items : items.slice(0, cap),
    overflows,
    showAll,
    toggle: () => setShowAll((v) => !v),
  }
}

const ShowAllToggle = ({ capped, total, noun }) => (
  capped.overflows ? (
    <button
      onClick={capped.toggle}
      className="mt-3 text-sm font-medium text-optio-purple hover:underline"
    >
      {capped.showAll ? 'Show fewer' : `Show all ${total} ${noun}`}
    </button>
  ) : null
)

/** `expanded` lifts every cap — the page passes it when a single section tab
 * is active, where that section IS the panel and capping it would be odd. */
export default function SchoolCommunity({ feed, expanded = false }) {
  const { announcements = [], lost_found: lostFound = [], recognition = [], events = [] } = feed || {}
  const ann = useCapped(announcements, expanded ? Infinity : 3)
  const evts = useCapped(events, expanded ? Infinity : 5)
  const lost = useCapped(lostFound, expanded ? Infinity : 4)
  const recog = useCapped(recognition, expanded ? Infinity : 3)

  return (
    <div>
      {announcements.length > 0 && (
        <FeedSection id="board-announcements" title="Announcements" Icon={MegaphoneIcon}>
          <div className="space-y-3">
            {ann.visible.map((a) => (
              <article
                key={a.id}
                className={`border rounded-lg p-4 ${
                  a.priority === 'urgent' ? 'border-red-200 bg-red-50/30' : 'border-gray-100 bg-gray-50/60'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.pinned && (
                      <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-optio-purple/10 text-optio-purple">
                        Pinned
                      </span>
                    )}
                    {a.priority === 'urgent' && (
                      <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-red-100 text-red-700">
                        Urgent
                      </span>
                    )}
                    <h3 className="text-sm font-semibold text-gray-900">{a.title}</h3>
                  </div>
                  <time className="text-xs text-gray-400 whitespace-nowrap mt-0.5">
                    {fmtDate(a.created_at)}
                  </time>
                </div>
                {a.body && <AnnouncementBody text={a.body} className="text-sm text-gray-700 mt-2" />}
              </article>
            ))}
          </div>
          <ShowAllToggle capped={ann} total={announcements.length} noun="announcements" />
        </FeedSection>
      )}

      {events.length > 0 && (
        <FeedSection id="board-events" title="Upcoming events" Icon={CalendarDaysIcon}>
          <div className="divide-y divide-gray-100">
            {evts.visible.map((e) => (
              <div key={e.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-medium text-gray-900">{e.title}</h3>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{fmtWhen(e)}</span>
                </div>
                {e.location && <p className="text-xs text-gray-500 mt-0.5">{e.location}</p>}
                {e.description && <p className="text-sm text-gray-600 mt-1">{e.description}</p>}
              </div>
            ))}
          </div>
          <ShowAllToggle capped={evts} total={events.length} noun="events" />
        </FeedSection>
      )}

      {lostFound.length > 0 && (
        <FeedSection
          id="board-lost-found"
          title="Lost &amp; found" Icon={ArchiveBoxIcon} count={lostFound.length}
          intro="Recognize something? Collect it from the office."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {lost.visible.map((item) => (
              <div key={item.id} className="border border-gray-100 bg-gray-50/60 rounded-lg overflow-hidden">
                {item.image_url && (
                  <img src={item.image_url} alt="" loading="lazy"
                    className="w-full h-36 object-cover bg-gray-50" />
                )}
                <div className="p-4">
                  <p className="text-sm font-medium text-gray-900">{item.description}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {[item.category, item.location_found && `found at ${item.location_found}`,
                      item.date_found && `on ${fmtDate(item.date_found)}`]
                      .filter(Boolean).join(' · ')}
                  </p>
                  {/* Unclaimed items are donated after a fortnight, so the
                      deadline is the useful part for a parent, not the log date. */}
                  {typeof item.days_until_donation === 'number' && item.days_until_donation >= 0 && (
                    <p className="text-xs text-amber-700 mt-1">
                      {item.days_until_donation === 0
                        ? 'Being donated today'
                        : `Donated in ${item.days_until_donation} day${item.days_until_donation === 1 ? '' : 's'}`}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <ShowAllToggle capped={lost} total={lostFound.length} noun="items" />
        </FeedSection>
      )}

      {recognition.length > 0 && (
        <FeedSection id="board-shout-outs" title="Shout-outs" Icon={SparklesIcon}>
          <div className="space-y-3">
            {recog.visible.map((r) => (
              <article key={r.id} className="border border-gray-100 bg-gray-50/60 rounded-lg p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-optio-pink/10 text-optio-pink">
                    {RECOGNITION_LABEL[r.type] || 'Shout-out'}
                  </span>
                  {r.recipient_name && (
                    <h3 className="text-sm font-semibold text-gray-900">{r.recipient_name}</h3>
                  )}
                  <time className="text-xs text-gray-400 ml-auto">{fmtDate(r.created_at)}</time>
                </div>
                {r.message && <p className="text-sm text-gray-700 mt-2">{r.message}</p>}
              </article>
            ))}
          </div>
          <ShowAllToggle capped={recog} total={recognition.length} noun="shout-outs" />
        </FeedSection>
      )}
    </div>
  )
}

/** True when the board holds anything a family can see. */
export const hasCommunityContent = (feed) => Boolean(
  feed && ['announcements', 'lost_found', 'recognition', 'events', 'carpool']
    .some((k) => (feed[k] || []).length > 0),
)
