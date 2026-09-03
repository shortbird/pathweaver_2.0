import React, { useState, useEffect } from 'react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'

/**
 * Shared building blocks of the school feed.
 *
 * This module used to render the community board as four separate sections
 * (announcements / events / lost & found / shout-outs). Those are now folded
 * into the single unified feed (UnifiedFeed.jsx) — board announcements and
 * sent messages are two backend systems doing one job from a family's point
 * of view, and splitting them across tabs had parents reporting the page
 * broken (iCreate, 2026-08-06). What remains here is the section chrome and
 * the formatting helpers both the feed and the strip reuse.
 */

export const RECOGNITION_LABEL = {
  shout_out: 'Shout-out',
  student_spotlight: 'Student spotlight',
  volunteer: 'Volunteer thanks',
  weekly_win: 'Win of the week',
  thank_you: 'Thank you',
}

export const fmtDate = (iso) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch { return '' }
}

export const fmtWhen = (e) => {
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

/** A feed block: white card, icon-tile header — the rail cards' language,
 * reused. `id` is the jump anchor; scroll-mt keeps the navbar off the title. */
export const FeedSection = ({
  id, title, Icon, count, intro, action, children,
  collapsible = true, defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  useEffect(() => {
    setIsOpen(defaultOpen)
  }, [defaultOpen])

  return (
    <section id={id} className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 mb-4 scroll-mt-14 transition-all">
      <div className="flex items-center justify-between gap-2.5">
        <button
          type="button"
          onClick={() => collapsible && setIsOpen((prev) => !prev)}
          className={`flex items-center gap-2.5 flex-1 text-left py-1 ${
            collapsible ? 'cursor-pointer select-none group' : ''
          }`}
          aria-expanded={collapsible ? isOpen : undefined}
          aria-label={collapsible ? `${isOpen ? 'Collapse' : 'Expand'} ${title}` : title}
        >
          <span className="w-8 h-8 rounded-lg bg-optio-purple/10 flex items-center justify-center flex-shrink-0 group-hover:bg-optio-purple/20 transition-colors">
            <Icon className="w-[18px] h-[18px] text-optio-purple" />
          </span>
          <h2 className="text-sm font-semibold text-gray-900 group-hover:text-optio-purple transition-colors">
            {title}{count ? ` (${count})` : ''}
          </h2>
          {collapsible && (
            <ChevronDownIcon
              className={`w-4 h-4 text-gray-400 group-hover:text-optio-purple ml-1 transition-transform duration-200 ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          )}
        </button>

        {action && (
          <div className="flex-shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
            {action}
          </div>
        )}
      </div>

      {isOpen && (
        <div className="mt-3">
          {intro && <p className="text-sm text-gray-500 mb-3">{intro}</p>}
          {children}
        </div>
      )}
    </section>
  )
}

/** True when the board holds anything a family can see. */
export const hasCommunityContent = (feed) => Boolean(
  feed && ['announcements', 'lost_found', 'recognition', 'events', 'carpool']
    .some((k) => (feed[k] || []).length > 0),
)
