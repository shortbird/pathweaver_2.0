import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import ModalOverlay from '../components/ui/ModalOverlay'
import useSchoolContext from '../hooks/useSchoolContext'
import { familyModuleKnownOff } from '../modules/moduleEnabled'
import AnnouncementBody from '../components/announcements/AnnouncementBody'
import EventRsvp from '../components/school/EventRsvp'
import { XMarkIcon, ClockIcon, MapPinIcon } from '@heroicons/react/24/outline'
import { splitEventStamp, compact12h, fmtDateOnly } from '../utils/timeFormat'
import { rsvpStatus } from '@shared/eventRsvp'

/**
 * School Calendar — the school's events (field trips, showcases, closures).
 * Read-only; staff manage events in the SIS. Shown as a month grid (families
 * asked for a calendar, not a list); tap a day or event for details.
 *
 * And as a List (Apogee NoCo, 2026-10-16): every upcoming event in date order,
 * with when, where and the family's sign-up state on each row, filtered by
 * category. "SPARK" on that list is the semester's excursions, and
 * ?view=list&category=SPARK is a link the school can send as "the SPARK page".
 *
 * Reached from a card on /school, and open to everyone in the school —
 * students most of all, since these are the days that change their week.
 *
 * Times are wall-clock: stored verbatim ("Z" suffixed) and displayed verbatim,
 * so the date never shifts by the viewer's timezone.
 */

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (dateStr, n) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return ymd(new Date(y, m - 1, d + n))
}
// The stamp parts, the compact time and the day headings come from
// utils/timeFormat.js, the one place an event stamp becomes text (M12).
const splitStamp = splitEventStamp
const fmtDayLong = (dateStr) => fmtDateOnly(dateStr, 'long')
const fmtDayShort = (dateStr) => fmtDateOnly(dateStr, 'short').replace(/, \d{4}$/, '')

/**
 * When an event is, as one line: "7:30pm – 9:30pm", "All day", or for an
 * event that spans days "Sep 14 – Sep 26 · 7:30pm – 9:30pm". The end time is
 * shown whenever the office set one; before this the modal printed the start
 * alone, and a day inside a multi-day span said only "Continues".
 */
export const fmtWhen = (e) => {
  const start = splitStamp(e.start_at)
  const end = e.end_at ? splitStamp(e.end_at) : null
  const span = end && end.date !== start.date ? `${fmtDayShort(start.date)} – ${fmtDayShort(end.date)}` : ''
  if (e.all_day) return span ? `${span} · All day` : 'All day'
  const times = end && end.time && end.time !== start.time
    ? `${compact12h(start.time)} – ${compact12h(end.time)}`
    : compact12h(start.time)
  return span ? `${span} · ${times}` : times
}

const eventCats = (e) => (e.categories && e.categories.length ? e.categories : [e.category]).filter(Boolean)

const STATUS_TONE = {
  in: 'bg-green-100 text-green-800',
  full: 'bg-amber-100 text-amber-800',
  closed: 'bg-gray-100 text-gray-500',
  out: 'bg-gray-100 text-gray-600',
  open: 'bg-optio-purple/10 text-optio-purple',
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const FamilyCalendarPage = () => {
  const { orgs: schoolOrgs } = useSchoolContext()
  // Only the schools that keep a calendar. The events read is gated on the
  // `calendar` module, and a school without it was asked anyway whenever this
  // page was opened from an old link or a notification (Sentry: ModuleGate
  // warnings from Optio Academy, calendar off). Not offered in the nav there
  // (school/schoolCards), so this is the typed-URL case.
  const orgs = useMemo(
    () => (schoolOrgs ? schoolOrgs.filter((o) => !familyModuleKnownOff(o, 'calendar')) : null),
    [schoolOrgs],
  )
  const [orgId, setOrgId] = useState(null)
  const [events, setEvents] = useState(null)
  const [upcoming, setUpcoming] = useState(null) // the List view's events, from today on
  const [openDay, setOpenDay] = useState(null) // 'YYYY-MM-DD' whose events are shown
  const [openEventId, setOpenEventId] = useState(null) // one event, opened from the List
  // The view and the category ride in the URL, so a filtered list is a link
  // the school can share. A link that names a category opens on the list.
  const [params, setParams] = useSearchParams()
  const category = params.get('category') || null
  const view = params.get('view') === 'list' || (category && params.get('view') !== 'month') ? 'list' : 'month'
  const setParam = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const [subscribeUrl, setSubscribeUrl] = useState(null) // the .ics feed; null = modal closed

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-11

  const monthStart = `${year}-${pad(month + 1)}-01`
  const nextMonth = month === 11 ? `${year + 1}-01-01` : `${year}-${pad(month + 2)}-01`

  useEffect(() => {
    if (orgs?.length && !orgId) setOrgId(orgs[0].organization_id)
  }, [orgs, orgId])

  // One read of the family events for both views: the month window, or from
  // today with no end.
  const getEvents = useCallback(
    (window) => api.get(`/api/sis/parent/events?organization_id=${orgId}${window}`),
    [orgId],
  )

  const loadMonth = useCallback(() => {
    if (!orgId) return
    getEvents(`&from=${monthStart}&to=${nextMonth}`)
      .then((r) => setEvents(r.data?.events || []))
      .catch(() => { toast.error('Could not load the calendar'); setEvents([]) })
  }, [orgId, getEvents, monthStart, nextMonth])

  useEffect(() => { setEvents(null); loadMonth() }, [loadMonth])

  // The List reads from today with no end: a semester of excursions is one
  // list, not a month at a time.
  const todayYmd = ymd(new Date())
  const loadUpcoming = useCallback(() => {
    if (!orgId) return
    getEvents(`&from=${todayYmd}`)
      .then((r) => setUpcoming(r.data?.events || []))
      .catch(() => { toast.error('Could not load the events'); setUpcoming([]) })
  }, [orgId, getEvents, todayYmd])

  useEffect(() => { if (view === 'list') { setUpcoming(null); loadUpcoming() } }, [view, loadUpcoming])

  // After a sign-up changes, the row's "Signed up" / "Full" must change too.
  const refreshAfterRsvp = () => { loadMonth(); if (view === 'list') loadUpcoming() }

  const shift = (delta) => {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear()); setMonth(d.getMonth()); setOpenDay(null)
  }

  // The subscribe URL is fetched on demand — it lazily mints the org's family
  // feed token, so there is no reason to do that for people who never ask.
  const openSubscribe = async () => {
    try {
      const { data } = await api.get(`/api/sis/parent/events/feed?organization_id=${orgId}`)
      if (data?.feed_url) setSubscribeUrl(data.feed_url)
      else toast.error('Could not get the calendar link')
    } catch {
      toast.error('Could not get the calendar link')
    }
  }

  // webcal:// is what makes Apple Calendar (and most others) open straight into
  // "Subscribe" instead of downloading a one-off .ics file.
  const webcalUrl = subscribeUrl ? subscribeUrl.replace(/^https?:\/\//, 'webcal://') : ''

  const copyFeedUrl = async () => {
    try {
      await navigator.clipboard.writeText(subscribeUrl)
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy — long-press the link to copy it')
    }
  }

  // The category chips: every category on the events loaded, in name order.
  const categories = useMemo(() => {
    const set = new Set()
    for (const e of [...(events || []), ...(upcoming || [])]) eventCats(e).forEach((c) => set.add(c))
    if (category) set.add(category)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [events, upcoming, category])
  const inCategory = useCallback((e) => !category || eventCats(e).includes(category), [category])

  // Multi-day events appear on every day they span.
  const byDate = useMemo(() => {
    const map = {}
    for (const e of (events || []).filter(inCategory)) {
      const start = splitStamp(e.start_at).date
      const end = e.end_at ? splitStamp(e.end_at).date : start
      let day = start
      for (let i = 0; i < 62 && day <= end; i += 1) {
        ;(map[day] = map[day] || []).push(e)
        day = addDays(day, 1)
      }
    }
    return map
  }, [events, inCategory])

  const listed = useMemo(() => (upcoming || []).filter(inCategory)
    .sort((a, b) => String(a.start_at).localeCompare(String(b.start_at))), [upcoming, inCategory])

  const weeks = useMemo(() => {
    const first = new Date(year, month, 1)
    const days = []
    for (let i = 0; i < first.getDay(); i += 1) days.push(null)
    const count = new Date(year, month + 1, 0).getDate()
    for (let d = 1; d <= count; d += 1) days.push(new Date(year, month, d))
    while (days.length % 7 !== 0) days.push(null)
    const out = []
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7))
    return out
  }, [year, month])

  const today = ymd(new Date())
  const org = orgs?.find((o) => o.organization_id === orgId)
  const openEvent = openEventId
    ? [...(upcoming || []), ...(events || [])].find((e) => e.id === openEventId) : null
  const modalEvents = openEvent ? [openEvent] : openDay ? (byDate[openDay] || []) : []
  const modalDay = openEvent ? splitStamp(openEvent.start_at).date : openDay
  const closeModal = () => { setOpenDay(null); setOpenEventId(null) }

  const copyListLink = async () => {
    const url = new URL(window.location.href)
    url.searchParams.set('view', 'list')
    try {
      await navigator.clipboard.writeText(url.toString())
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy the link')
    }
  }

  // A tab of the school page (pages/school/SchoolShell): the shell carries
  // the letterhead and the rail, this is the panel.
  return (
    <div className="max-w-3xl mx-auto">
      <p className="text-sm text-gray-500 mb-6">
        Events at {org?.organization_name || 'your school'} — field trips, showcases, closures, and more.
      </p>

      {orgs && orgs.length > 1 && (
        <select
          value={orgId || ''} onChange={(e) => { setEvents(null); setOrgId(e.target.value) }}
          className="mb-5 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
        >
          {orgs.map((o) => <option key={o.organization_id} value={o.organization_id}>{o.organization_name}</option>)}
        </select>
      )}

      {orgs === null && <p className="text-gray-500">Loading…</p>}
      {orgs?.length === 0 && (schoolOrgs?.length
        ? <p className="text-gray-500">{schoolOrgs[0].organization_name || 'Your school'} doesn&apos;t keep a calendar here.</p>
        : <p className="text-gray-500">Your account isn&apos;t linked to a school yet.</p>)}

      {orgId && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div role="tablist" aria-label="Calendar view" className="inline-flex rounded-lg border border-gray-300 p-0.5">
              {[['month', 'Month'], ['list', 'List']].map(([key, label]) => (
                <button key={key} role="tab" aria-selected={view === key}
                  onClick={() => { closeModal(); setParam('view', key === 'month' ? (category ? 'month' : null) : 'list') }}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${view === key
                    ? 'bg-optio-purple text-white' : 'text-gray-600 hover:text-optio-purple'}`}>
                  {label}
                </button>
              ))}
            </div>
            {categories.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" aria-label="Filter by category">
                <button onClick={() => setParam('category', null)} aria-pressed={!category}
                  className={`text-xs font-medium rounded-full px-2.5 py-1 transition-colors ${!category
                    ? 'bg-optio-purple text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
                  All
                </button>
                {categories.map((c) => (
                  <button key={c} onClick={() => setParam('category', category === c ? null : c)}
                    aria-pressed={category === c}
                    className={`text-xs font-medium rounded-full px-2.5 py-1 transition-colors ${category === c
                      ? 'bg-optio-purple text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {view === 'list' ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-lg font-semibold text-gray-900">
                  {category ? `Upcoming: ${category}` : 'Upcoming events'}
                </span>
                {upcoming === null && <span className="text-sm text-gray-400">Loading…</span>}
                {category && (
                  <button onClick={copyListLink} className="text-sm text-optio-purple hover:underline">
                    Copy link to this list
                  </button>
                )}
                <button onClick={openSubscribe}
                  className="ml-auto px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:border-optio-purple hover:text-optio-purple transition-colors">
                  Add to my calendar
                </button>
              </div>
              <EventList events={listed} onOpen={(e) => setOpenEventId(e.id)} />
              {upcoming && listed.length === 0 && (
                <p className="mt-3 text-sm text-gray-400">
                  {category ? `No upcoming ${category} events.` : 'No upcoming events.'}
                </p>
              )}
            </>
          ) : (
          <>
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => shift(-1)} aria-label="Previous month"
              className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:border-optio-purple hover:text-optio-purple text-sm">←</button>
            <span className="text-lg font-semibold text-gray-900 min-w-[170px] text-center">{MONTHS[month]} {year}</span>
            <button onClick={() => shift(1)} aria-label="Next month"
              className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:border-optio-purple hover:text-optio-purple text-sm">→</button>
            <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setOpenDay(null) }}
              className="text-sm text-optio-purple hover:underline">Today</button>
            {events === null && <span className="text-sm text-gray-400">Loading…</span>}
            <button onClick={openSubscribe}
              className="ml-auto px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:border-optio-purple hover:text-optio-purple transition-colors">
              Add to my calendar
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-100">
              {DOW.map((d) => (
                <div key={d} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <span className="hidden sm:inline">{d}</span><span className="sm:hidden">{d[0]}</span>
                </div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
                {week.map((day, di) => {
                  if (!day) return <div key={di} className="min-h-[72px] sm:min-h-[96px] bg-neutral-50/50" />
                  const key = ymd(day)
                  const dayEvents = byDate[key] || []
                  return (
                    <div key={di}
                      className={`min-h-[72px] sm:min-h-[96px] border-l border-gray-100 first:border-l-0 p-1.5 ${dayEvents.length ? 'cursor-pointer hover:bg-optio-purple/5' : ''} transition-colors`}
                      onClick={() => dayEvents.length && setOpenDay(key)}>
                      <div className={`text-xs font-medium mb-1 ${key === today
                        ? 'inline-flex w-5 h-5 items-center justify-center rounded-full bg-optio-purple text-white'
                        : 'text-gray-400'}`}>
                        {day.getDate()}
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map((e) => {
                          const { time, date: startDate } = splitStamp(e.start_at)
                          return (
                            <div key={e.id}
                              className="rounded px-1.5 py-0.5 bg-optio-purple/10 text-optio-purple">
                              <span className="text-[11px] font-semibold leading-tight block truncate">{e.title}</span>
                              {!e.all_day && startDate === key && <span className="text-[10px] opacity-80">{compact12h(time)}</span>}
                            </div>
                          )
                        })}
                        {dayEvents.length > 3 && (
                          <span className="text-[10px] text-gray-400">+{dayEvents.length - 3} more</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {events?.length === 0 && (
            <p className="mt-3 text-sm text-gray-400">No events on the calendar this month.</p>
          )}
          </>
          )}
        </>
      )}

      {subscribeUrl && (
        <ModalOverlay onClose={() => setSubscribeUrl(null)} className="items-end sm:items-center">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-4">
              <h2 className="text-base font-semibold text-gray-900">Add to my calendar</h2>
              <button onClick={() => setSubscribeUrl(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-sm text-gray-500 mb-3">
                Subscribe once and new school events show up in your own calendar automatically.
              </p>
              <a
                href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`}
                target="_blank" rel="noopener noreferrer"
                className="btn-primary w-full"
              >
                Google Calendar
              </a>
              <a
                href={webcalUrl}
                className="block w-full text-center px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:border-optio-purple hover:text-optio-purple transition-colors"
              >
                Apple Calendar (iPhone, iPad, Mac)
              </a>
              <button
                onClick={copyFeedUrl}
                className="block w-full text-center px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:border-optio-purple hover:text-optio-purple transition-colors"
              >
                Copy link for another calendar app
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {modalDay && modalEvents.length > 0 && (
        <ModalOverlay onClose={closeModal} className="items-end sm:items-center">
          <div
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col"
            role="dialog" aria-modal="true" aria-labelledby="calendar-day-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 id="calendar-day-title" className="text-base font-semibold text-gray-900">{fmtDayLong(modalDay)}</h2>
              <button type="button" onClick={closeModal} aria-label="Close"
                className="-mr-1 p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              {modalEvents.map((e) => {
                const categories = eventCats(e)
                return (
                  <article key={e.id} className="rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-semibold text-gray-900 leading-snug">{e.title}</h3>
                      {/* An event can carry several categories — show them all. */}
                      {categories.length > 0 && (
                        <div className="flex flex-wrap justify-end gap-1 flex-shrink-0">
                          {categories.map((c) => (
                            <span key={c} className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-optio-purple/10 text-optio-purple">{c}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <ul className="mt-2 space-y-1 text-sm text-gray-600">
                      <li className="flex items-center gap-2">
                        <ClockIcon className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
                        <span>{fmtWhen(e)}</span>
                      </li>
                      {e.location && (
                        <li className="flex items-center gap-2">
                          <MapPinIcon className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
                          <span>{e.location}</span>
                        </li>
                      )}
                    </ul>
                    {/* A URL in an event's notes is a live link. Schools put a
                        sign-up form or a ticket page in here and families had to
                        select and paste it (iCreate, 2026-09-04: "we need the
                        ability to make live links on events on the calendar so
                        families can go directly to a form"). AnnouncementBody is
                        what already does this for announcements — same rules,
                        one implementation. */}
                    {e.description && (
                      <AnnouncementBody
                        text={e.description}
                        className="mt-3 pt-3 border-t border-gray-100 text-sm leading-relaxed text-gray-700"
                      />
                    )}
                    {/* "The ability to add a form for collecting RSVPs and
                        payments to the calendar events would be good"
                        (iCreate, 2026-08-28 — 9cf78e9a). Renders nothing on an
                        event the office did not open for replies. */}
                    <EventRsvp event={e} orgId={orgId} onChange={refreshAfterRsvp} />
                  </article>
                )
              })}
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

/**
 * Upcoming events in date order, one row each: the date, the title, when,
 * where, and this family's sign-up state. A row opens the event, where the
 * sign-up button is.
 */
export function EventList({ events, onOpen }) {
  if (!events?.length) return null
  return (
    <ul className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100" aria-label="Upcoming events">
      {events.map((e) => {
        const day = splitStamp(e.start_at).date
        const [, m, d] = day.split('-').map(Number)
        const status = rsvpStatus(e)
        return (
          <li key={e.id}>
            <button type="button" onClick={() => onOpen(e)}
              className="w-full text-left flex items-start gap-4 px-4 py-3 hover:bg-optio-purple/5 transition-colors">
              <span className="flex-shrink-0 w-12 text-center">
                <span className="block text-[11px] font-semibold uppercase text-optio-purple">{MONTHS[m - 1].slice(0, 3)}</span>
                <span className="block text-xl font-bold leading-tight text-gray-900">{d}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-900">{e.title}</span>
                <span className="block text-xs text-gray-500">{fmtDayLong(day)} · {fmtWhen(e)}</span>
                {e.location && (
                  <span className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                    <MapPinIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" aria-hidden="true" />
                    <span className="truncate">{e.location}</span>
                  </span>
                )}
              </span>
              {status && (
                <span className={`flex-shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5 ${STATUS_TONE[status.tone]}`}>
                  {status.label}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export default FamilyCalendarPage
