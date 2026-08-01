import React from 'react'
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
    const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    if (e.all_day) return `${day} · all day`
    return `${day} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  } catch { return '' }
}

const Section = ({ title, count, children }) => (
  <section className="mb-8">
    <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
      {title}{count ? ` (${count})` : ''}
    </h2>
    {children}
  </section>
)

export default function SchoolCommunity({ feed, orgName }) {
  const { announcements = [], lost_found: lostFound = [], recognition = [], events = [] } = feed || {}

  return (
    <div>
      {announcements.length > 0 && (
        <Section title={orgName ? `Noticeboard · ${orgName}` : 'Noticeboard'}>
          <div className="space-y-3">
            {announcements.map((a) => (
              <article
                key={a.id}
                className={`bg-white border rounded-xl p-4 ${
                  a.priority === 'urgent' ? 'border-red-200' : 'border-gray-200'}`}
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
                    <h3 className="font-semibold text-gray-900">{a.title}</h3>
                  </div>
                  <time className="text-xs text-gray-400 whitespace-nowrap mt-0.5">
                    {fmtDate(a.created_at)}
                  </time>
                </div>
                {a.body && <AnnouncementBody text={a.body} className="text-sm text-gray-700 mt-2" />}
              </article>
            ))}
          </div>
        </Section>
      )}

      {events.length > 0 && (
        <Section title="What's on">
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {events.map((e) => (
              <div key={e.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium text-gray-900">{e.title}</h3>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{fmtWhen(e)}</span>
                </div>
                {e.location && <p className="text-xs text-gray-500 mt-0.5">{e.location}</p>}
                {e.description && <p className="text-sm text-gray-600 mt-1">{e.description}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {lostFound.length > 0 && (
        <Section title="Lost &amp; found" count={lostFound.length}>
          <p className="text-sm text-gray-500 -mt-1 mb-3">
            Recognize something? Collect it from the office.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {lostFound.map((item) => (
              <div key={item.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {item.image_url && (
                  <img src={item.image_url} alt="" loading="lazy"
                    className="w-full h-36 object-cover bg-gray-50" />
                )}
                <div className="p-4">
                  <p className="font-medium text-gray-900">{item.description}</p>
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
        </Section>
      )}

      {recognition.length > 0 && (
        <Section title="Shout-outs">
          <div className="space-y-3">
            {recognition.map((r) => (
              <article key={r.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-optio-pink/10 text-optio-pink">
                    {RECOGNITION_LABEL[r.type] || 'Shout-out'}
                  </span>
                  {r.recipient_name && (
                    <h3 className="font-semibold text-gray-900">{r.recipient_name}</h3>
                  )}
                  <time className="text-xs text-gray-400 ml-auto">{fmtDate(r.created_at)}</time>
                </div>
                {r.message && <p className="text-sm text-gray-700 mt-2">{r.message}</p>}
              </article>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

/** True when the school has posted anything a family can see. */
export const hasCommunityContent = (feed) => Boolean(
  feed && ['announcements', 'lost_found', 'recognition', 'events']
    .some((k) => (feed[k] || []).length > 0),
)
