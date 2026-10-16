import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { ModalOverlay } from '../../components/ui'
import { useSisOrg, withOrg } from './useSisOrg'
import { useConfirm } from '../../contexts/ConfirmContext'
import useSisEventRsvps from '../../hooks/api/useSisEventRsvps'
import { toCsv, downloadCsv, dateStamp } from '../../utils/csv'
import { splitEventStamp, compact12h, fmtEventWhen } from '../../utils/timeFormat'
import { INPUT_CLASS } from '../../components/ui/Input'
import { useAuth } from '../../contexts/AuthContext'
import { isSisAdmin } from './sisRole'
import { spotsLeftText } from '@shared/eventRsvp'

const field = INPUT_CLASS
/**
 * SIS Calendar — the org's EVENTS (field trips, showcases, closures, deadlines),
 * not class meetings. The weekly class grid lives with the classes themselves
 * (Classes page / Schedule Builder). Staff add events on a month grid.
 *
 * Times use wall-clock semantics: they're stored verbatim ("Z" suffixed) and
 * displayed verbatim, so a 9am event reads 9am for everyone — right for a
 * single-campus school, and immune to viewer-timezone date shifts.
 *
 * Events may span multiple days (end date), carry an org-defined category
 * (colored chips + filter; the list is edited on Settings), and the calendar is
 * subscribable from Google/Outlook/Apple via a tokenized ICS feed.
 *
 * Only the office writes events (the API is ADMIN_ROLES). Teachers read the
 * calendar: no Add button, no click-a-day, and an event opens read-only.
 */

// "2026-08-24T09:00:00+00:00" -> { date: '2026-08-24', time: '09:00' } — no Date()
// parsing, from utils/timeFormat.js, the one place an event stamp becomes text.
const splitStamp = splitEventStamp
const joinStamp = (date, time) => (date ? `${date}T${time || '00:00'}:00Z` : null)

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (dateStr, n) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return ymd(new Date(y, m - 1, d + n))
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Chip palette per category (index into the org's category list). Uncategorized
// events keep the classic purple.
const CATEGORY_COLORS = [
  'bg-blue-100 text-blue-800 hover:bg-blue-200',
  'bg-green-100 text-green-800 hover:bg-green-200',
  'bg-amber-100 text-amber-800 hover:bg-amber-200',
  'bg-rose-100 text-rose-800 hover:bg-rose-200',
  'bg-teal-100 text-teal-800 hover:bg-teal-200',
  'bg-indigo-100 text-indigo-800 hover:bg-indigo-200',
]
const DEFAULT_COLOR = 'bg-optio-purple/10 text-optio-purple hover:bg-optio-purple/20'
const colorFor = (category, categories) => {
  const i = categories.indexOf(category)
  return i >= 0 ? CATEGORY_COLORS[i % CATEGORY_COLORS.length] : DEFAULT_COLOR
}

// An event can carry several categories ("Field trip" AND "No school"). The
// first is primary — it colours the chip; the rest show as dots after the title
// so a shared event is still visible as belonging to both.
const eventCategories = (e) => (
  (e.categories && e.categories.length) ? e.categories : (e.category ? [e.category] : [])
)
const DOT_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-amber-500',
  'bg-rose-500', 'bg-teal-500', 'bg-indigo-500',
]
const dotFor = (category, categories) => {
  const i = categories.indexOf(category)
  return i >= 0 ? DOT_COLORS[i % DOT_COLORS.length] : 'bg-optio-purple'
}

const CalendarPage = () => {
  const { orgId } = useSisOrg()
  const { user } = useAuth()
  const canEdit = isSisAdmin(user)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-11
  const [events, setEvents] = useState([])
  const [categories, setCategories] = useState([])
  const [filter, setFilter] = useState(null) // category label or null = all
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { event } edit | { date } create | { copy } duplicate
  const [showSubscribe, setShowSubscribe] = useState(false)
  const [view, setView] = useState('month') // 'month' grid | 'list' of the month's events

  const monthStart = `${year}-${pad(month + 1)}-01`
  const nextMonth = month === 11 ? `${year + 1}-01-01` : `${year}-${pad(month + 2)}-01`

  const reload = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withOrg(`/api/sis/events?from=${monthStart}&to=${nextMonth}`, orgId))
      .then((r) => {
        setEvents(r.data?.events || [])
        setCategories(r.data?.categories || [])
      })
      .catch(() => toast.error('Failed to load events'))
      .finally(() => setLoading(false))
  }, [orgId, monthStart, nextMonth])

  useEffect(() => { reload() }, [reload])

  const shift = (delta) => {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear()); setMonth(d.getMonth())
  }

  const visible = useMemo(() => (
    filter ? events.filter((e) => eventCategories(e).includes(filter)) : events
  ), [events, filter])

  // Multi-day events appear on every day they span (capped defensively).
  const byDate = useMemo(() => {
    const map = {}
    for (const e of visible) {
      const start = splitStamp(e.start_at).date
      const end = e.end_at ? splitStamp(e.end_at).date : start
      let day = start
      for (let i = 0; i < 62 && day <= end; i += 1) {
        ;(map[day] = map[day] || []).push(e)
        day = addDays(day, 1)
      }
    }
    return map
  }, [visible])

  // Month grid: weeks of 7 days, padded with nulls outside the month.
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Calendar</h1>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setShowSubscribe(true)} disabled={!orgId}>Subscribe</Button>
          {canEdit && (
            <Button size="sm" onClick={() => setModal({ date: today })} disabled={!orgId}>Add event</Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button onClick={() => shift(-1)} aria-label="Previous month"
          className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-neutral-600 hover:border-optio-purple hover:text-optio-purple text-sm">←</button>
        <span className="text-lg font-semibold text-neutral-900 min-w-[180px] text-center">{MONTHS[month]} {year}</span>
        <button onClick={() => shift(1)} aria-label="Next month"
          className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-neutral-600 hover:border-optio-purple hover:text-optio-purple text-sm">→</button>
        <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}
          className="text-sm text-optio-purple hover:underline">Today</button>
        <span role="tablist" aria-label="Calendar view" className="inline-flex rounded-lg border border-gray-300 p-0.5">
          {[['month', 'Month'], ['list', 'List']].map(([key, label]) => (
            <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)}
              className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${view === key
                ? 'bg-optio-purple text-white' : 'text-neutral-600 hover:text-optio-purple'}`}>
              {label}
            </button>
          ))}
        </span>
        {categories.length > 0 && (
          <span className="flex items-center gap-1.5 ml-2 flex-wrap">
            <FilterChip label="All" active={!filter} onClick={() => setFilter(null)} />
            {categories.map((c) => (
              <FilterChip key={c} label={c} active={filter === c}
                colorClass={colorFor(c, categories)} onClick={() => setFilter(filter === c ? null : c)} />
            ))}
          </span>
        )}
        {loading && <span className="text-sm text-neutral-400">Loading…</span>}
      </div>

      {view === 'list' ? (
        <StaffEventList events={visible} categories={categories} onOpen={(e) => setModal({ event: e })} />
      ) : (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-100">
          {DOW.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-neutral-400">{d}</div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
            {week.map((day, di) => {
              if (!day) return <div key={di} className="min-h-[96px] bg-neutral-50/50" />
              const key = ymd(day)
              const dayEvents = byDate[key] || []
              return (
                <div key={di}
                  className={`min-h-[96px] border-l border-gray-100 first:border-l-0 p-1.5 ${canEdit
                    ? 'cursor-pointer hover:bg-optio-purple/5 transition-colors' : ''}`}
                  onClick={canEdit ? () => setModal({ date: key }) : undefined}>
                  <div className={`text-xs font-medium mb-1 ${key === today
                    ? 'inline-flex w-5 h-5 items-center justify-center rounded-full bg-optio-purple text-white'
                    : 'text-neutral-400'}`}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.map((e) => {
                      const { time, date: startDate } = splitStamp(e.start_at)
                      const cats = eventCategories(e)
                      // Time, and the headcount so far. Both belong to the day
                      // the event STARTS — repeating "11 going" on every day of
                      // a week-long trip reads as a different number each time.
                      const going = startDate === key && e.rsvp_enabled
                        ? (e.rsvp_summary?.people || 0) : 0
                      const meta = [
                        !e.all_day && startDate === key ? compact12h(time) : null,
                        going ? `${going} going` : null,
                      ].filter(Boolean)
                      return (
                        <button key={e.id} type="button"
                          title={cats.length > 1 ? cats.join(' · ') : undefined}
                          onClick={(ev) => { ev.stopPropagation(); setModal({ event: e }) }}
                          className={`block w-full text-left rounded px-1.5 py-0.5 transition-colors ${colorFor(cats[0], categories)}`}>
                          <span className="text-[11px] font-semibold leading-tight block truncate">
                            {e.audience && e.audience !== 'school' && (
                              <span className="text-[9px] font-bold uppercase opacity-70 mr-0.5"
                                title={e.audience === 'admins' ? 'Admins only' : 'Teachers only'}>
                                {e.audience === 'admins' ? 'Admin' : 'Staff'}
                              </span>
                            )}
                            {e.title}
                            {cats.slice(1).map((c) => (
                              <span key={c} className={`inline-block w-1.5 h-1.5 rounded-full ml-1 align-middle ${dotFor(c, categories)}`} />
                            ))}
                          </span>
                          {meta.length > 0 && (
                            <span className="text-[10px] opacity-80 block truncate">{meta.join(' · ')}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      )}

      {!loading && !events.length && (
        <p className="mt-3 text-sm text-neutral-400">
          {canEdit
            ? 'No events this month. Click a day (or "Add event") to create one — field trips, showcases, closures, deadlines.'
            : 'No events this month.'}
        </p>
      )}

      {modal?.event && !canEdit && (
        <EventDetailsModal orgId={orgId} event={modal.event} categories={categories}
          onClose={() => setModal(null)} />
      )}

      {modal && canEdit && (
        <EventModal
          orgId={orgId}
          event={modal.event || null}
          copyFrom={modal.copy || null}
          defaultDate={modal.date}
          categories={categories}
          onDuplicate={(e) => setModal({ copy: e })}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); reload() }}
        />
      )}

      {showSubscribe && <SubscribeModal orgId={orgId} onClose={() => setShowSubscribe(false)} />}
    </div>
  )
}

/**
 * The month's events as a list, soonest first: date, title, when, where, and
 * the sign-ups so far against the spots. The office reads "who signed up this
 * week" from here without opening each event.
 */
export const StaffEventList = ({ events, categories, onOpen }) => {
  const sorted = [...events].sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)))
  if (!sorted.length) return null
  return (
    <ul className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100" aria-label="Events this month">
      {sorted.map((e) => {
        const cats = eventCategories(e)
        const going = e.rsvp_summary?.people || 0
        const unit = e.rsvp_mode === 'children' ? (going === 1 ? 'child' : 'children') : 'going'
        return (
          <li key={e.id}>
            <button type="button" onClick={() => onOpen(e)}
              className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-optio-purple/5 transition-colors">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-neutral-900">{e.title}</span>
                <span className="block text-xs text-neutral-500">{fmtEventWhen(e)}</span>
                {e.location && <span className="block text-xs text-neutral-500 truncate">{e.location}</span>}
                {cats.length > 0 && (
                  <span className="flex flex-wrap gap-1 mt-1">
                    {cats.map((c) => (
                      <span key={c} className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${colorFor(c, categories)}`}>{c}</span>
                    ))}
                  </span>
                )}
              </span>
              {e.rsvp_enabled && (
                <span className="flex-shrink-0 text-xs text-neutral-600 text-right">
                  {e.rsvp_mode === 'children' ? `${going} ${unit}` : `${going} going`}
                  {e.rsvp_capacity ? ` / ${e.rsvp_capacity}` : ''}
                  {e.rsvp_capacity && going >= e.rsvp_capacity && (
                    <span className="block font-semibold text-amber-700">
                      {spotsLeftText({ rsvp_spots_left: 0 })}
                    </span>
                  )}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

const FilterChip = ({ label, active, colorClass, onClick }) => (
  <button onClick={onClick}
    className={`text-xs font-medium rounded-full px-2.5 py-1 transition-colors ${
      active
        ? (colorClass ? `${colorClass} ring-1 ring-current` : 'bg-optio-purple text-white')
        : (colorClass || 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200')
    } ${active ? '' : 'opacity-80'}`}>
    {label}
  </button>
)

// A teacher's view of an event: what, when, where, and who is coming.
const EventDetailsModal = ({ orgId, event, categories, onClose }) => {
  const cats = eventCategories(event)
  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <h2 className="text-lg font-semibold text-gray-900">{event.title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto text-sm text-neutral-700">
          <p>{fmtEventWhen(event)}</p>
          {event.location && <p><span className="text-neutral-500">Where:</span> {event.location}</p>}
          {cats.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {cats.map((c) => (
                <span key={c} className={`text-xs font-semibold rounded-full px-2.5 py-1 ${colorFor(c, categories)}`}>{c}</span>
              ))}
            </div>
          )}
          {event.description && <p className="whitespace-pre-wrap">{event.description}</p>}
          {event.rsvp_enabled && <EventRsvpList orgId={orgId} event={event} />}
        </div>
        <div className="flex justify-end p-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm">Close</button>
        </div>
      </div>
    </ModalOverlay>
  )
}

const EventModal = ({ orgId, event, copyFrom, defaultDate, categories, onDuplicate, onClose, onSaved }) => {
  const confirm = useConfirm()
  const seed = event || copyFrom
  const start = seed ? splitStamp(seed.start_at) : { date: defaultDate, time: '' }
  const end = seed?.end_at ? splitStamp(seed.end_at) : { date: '', time: '' }
  const [form, setForm] = useState({
    title: seed?.title ? (copyFrom ? `${seed.title} (copy)` : seed.title) : '',
    description: seed?.description || '',
    location: seed?.location || '',
    categories: seed ? eventCategories(seed) : [],
    audience: seed?.audience || 'school',
    all_day: seed ? !!seed.all_day : false,
    date: start.date || defaultDate,
    end_date: end.date && end.date !== start.date ? end.date : '',
    start_time: seed && !seed.all_day ? start.time : '',
    end_time: seed && !seed.all_day && end.time ? end.time : '',
    // Ask families to reply, and optionally charge for it (9cf78e9a).
    rsvp_enabled: seed ? !!seed.rsvp_enabled : false,
    rsvp_fee: seed?.rsvp_fee_cents ? String(seed.rsvp_fee_cents / 100) : '',
    rsvp_closes_at: seed?.rsvp_closes_at ? String(seed.rsvp_closes_at).slice(0, 10) : '',
    // How families reply, and how many spots (Apogee NoCo, SPARK excursions).
    rsvp_mode: seed?.rsvp_mode === 'children' ? 'children' : 'count',
    rsvp_capacity: seed?.rsvp_capacity ? String(seed.rsvp_capacity) : '',
    // Repeats: only when adding. Each occurrence is saved as its own event, so
    // an existing one is edited alone.
    repeat: 'none',
    repeat_until: '',
    repeat_count: '',
    repeat_dates: [''],
  })
  const [busy, setBusy] = useState(false)

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const save = async () => {
    if (!form.title.trim()) return toast.error('Give the event a title')
    if (!form.date) return toast.error('Pick a date')
    if (form.end_date && form.end_date < form.date) {
      return toast.error("The event can't end before it starts")
    }
    const sameDay = !form.end_date || form.end_date === form.date
    if (!form.all_day && sameDay && form.end_time && form.start_time && form.end_time < form.start_time) {
      return toast.error("The event can't end before it starts")
    }
    // Multi-day all-day events end late on the LAST day so the span is
    // inclusive; timed events use the end time when one is given.
    const endDate = form.end_date || form.date
    let end_at = null
    if (form.all_day) {
      end_at = form.end_date ? joinStamp(endDate, '23:59') : null
    } else if (form.end_time) {
      end_at = joinStamp(endDate, form.end_time)
    } else if (form.end_date) {
      end_at = joinStamp(endDate, '23:59')
    }
    const payload = {
      organization_id: orgId,
      title: form.title.trim(),
      description: form.description.trim(),
      location: form.location.trim(),
      categories: form.categories,
      audience: form.audience || 'school',
      all_day: form.all_day,
      start_at: joinStamp(form.date, form.all_day ? '00:00' : (form.start_time || '00:00')),
      end_at,
      rsvp_enabled: form.rsvp_enabled,
      // Dollars on the form, cents on the wire. Empty means free, which is not
      // zero — a zero would render a payment line for nothing.
      rsvp_fee_cents: form.rsvp_enabled && form.rsvp_fee
        ? Math.round(Number(form.rsvp_fee) * 100) : null,
      rsvp_closes_at: form.rsvp_enabled && form.rsvp_closes_at
        ? joinStamp(form.rsvp_closes_at, '23:59') : null,
      rsvp_mode: form.rsvp_mode,
      rsvp_capacity: form.rsvp_enabled && form.rsvp_capacity ? Number(form.rsvp_capacity) : null,
    }
    if (!event && form.repeat !== 'none') {
      if (form.repeat === 'dates') {
        const dates = form.repeat_dates.filter(Boolean)
        if (!dates.length) return toast.error('Pick at least one more date')
        payload.repeat = { every: 'dates', dates }
      } else {
        if (!form.repeat_until && !form.repeat_count) {
          return toast.error('Say when it stops repeating: an end date or how many times')
        }
        payload.repeat = {
          every: form.repeat,
          until: form.repeat_until || null,
          count: form.repeat_count ? Number(form.repeat_count) : null,
        }
      }
    }
    setBusy(true)
    try {
      let res
      if (event) res = await api.patch(`/api/sis/events/${event.id}`, payload)
      else res = await api.post('/api/sis/events', payload)
      const n = res?.data?.count
      toast.success(event ? 'Event updated' : n > 1 ? `${n} events added` : 'Event added')
      onSaved()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not save the event')
    } finally { setBusy(false) }
  }

  const remove = async (following = false) => {
    const ask = following
      ? `Delete "${event.title}" on this date and every later date in the series? Earlier dates stay.`
      : `Delete "${event.title}"?`
    if (!(await confirm(ask))) return
    setBusy(true)
    try {
      const { data } = await api.delete(
        `/api/sis/events/${event.id}?organization_id=${orgId}${following ? '&scope=following' : ''}`)
      toast.success(data?.deleted > 1 ? `${data.deleted} events deleted` : 'Event deleted')
      onSaved()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not delete the event')
    } finally { setBusy(false) }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {event ? 'Edit event' : copyFrom ? 'Duplicate event' : 'New event'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Title</label>
            <input className={field} value={form.title} onChange={(e) => set({ title: e.target.value })}
              placeholder="e.g., Fall Showcase" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Date</label>
              <input type="date" className={field} value={form.date} onChange={(e) => set({ date: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">End date (optional)</label>
              <input type="date" className={field} min={form.date} value={form.end_date}
                onChange={(e) => set({ end_date: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <input type="checkbox" checked={form.all_day} onChange={(e) => set({ all_day: e.target.checked })}
              className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
            All day
          </label>
          {!form.all_day && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Starts</label>
                <input type="time" className={field} value={form.start_time} onChange={(e) => set({ start_time: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Ends (optional)</label>
                <input type="time" className={field} value={form.end_time} onChange={(e) => set({ end_time: e.target.value })} />
              </div>
            </div>
          )}
          {!event && <RepeatFields form={form} set={set} />}
          {event?.series_id && (
            <p className="text-[11px] text-neutral-400">
              Part of a repeating series. Changes here apply to this date only.
            </p>
          )}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Who can see this</label>
            <select className={field} value={form.audience} onChange={(e) => set({ audience: e.target.value })}>
              <option value="school">Whole school — families, teachers, and admins</option>
              <option value="teachers">Teachers only — staff (not families)</option>
              <option value="admins">Admins only</option>
            </select>
          </div>
          {/* Ask families to say whether they are coming, and charge for it
              where there is a charge. "The ability to add a form for collecting
              RSVPs and payments to the calendar events would be good" (iCreate,
              2026-08-28 — 9cf78e9a). Only meaningful on an event families can
              see, so it hides on a staff-only one. */}
          {form.audience === 'school' && (
            <div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={form.rsvp_enabled}
                  onChange={(e) => set({ rsvp_enabled: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                <span>
                  <span className="block text-sm font-medium text-neutral-700">Ask families to RSVP</span>
                  <span className="block text-xs text-neutral-500">
                    {form.rsvp_mode === 'children'
                      ? 'They pick which of their children are coming.'
                      : 'They say whether they are coming and how many of them.'}
                  </span>
                </span>
              </label>
              {form.rsvp_enabled && (
                <div className="mt-2 ml-6 space-y-1">
                  <span className="block text-xs font-medium text-neutral-500">How families reply</span>
                  {[['count', 'Count people', 'How many are coming (parents and children).'],
                    ['children', 'Pick which children are coming', 'Each child is listed by name in the replies.']].map(([value, label, hint]) => (
                    <label key={value} className="flex items-start gap-2 cursor-pointer">
                      <input type="radio" name="rsvp_mode" value={value} checked={form.rsvp_mode === value}
                        onChange={() => set({ rsvp_mode: value })}
                        className="mt-0.5 h-4 w-4 border-gray-300 text-optio-purple focus:ring-optio-purple" />
                      <span>
                        <span className="block text-sm text-neutral-700">{label}</span>
                        <span className="block text-[11px] text-neutral-500">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {form.rsvp_enabled && (
                <div className="grid grid-cols-2 gap-3 mt-2 ml-6">
                  <label className="block text-xs font-medium text-neutral-500">
                    Spots available (optional)
                    <input type="number" min="1" step="1" value={form.rsvp_capacity}
                      onChange={(e) => set({ rsvp_capacity: e.target.value })}
                      aria-label="Spots available" placeholder="No limit"
                      className={`${field} mt-1`} />
                    <span className="block mt-0.5 text-[11px] font-normal text-neutral-400">
                      {form.rsvp_mode === 'children' ? 'Counts children.' : 'Counts people.'} When full, new sign-ups are turned away.
                    </span>
                  </label>
                  <span />
                  <label className="block text-xs font-medium text-neutral-500">
                    Cost per family (optional)
                    <input type="number" min="0" step="0.01" value={form.rsvp_fee}
                      onChange={(e) => set({ rsvp_fee: e.target.value })}
                      aria-label="Cost per family" placeholder="Free"
                      className={`${field} mt-1`} />
                  </label>
                  <label className="block text-xs font-medium text-neutral-500">
                    Replies close (optional)
                    <input type="date" value={form.rsvp_closes_at}
                      onChange={(e) => set({ rsvp_closes_at: e.target.value })}
                      aria-label="Replies close" className={`${field} mt-1`} />
                  </label>
                </div>
              )}
            </div>
          )}
          {/* The replies themselves, on the event they answer. Reads the SAVED
              event, not the form: a checkbox the user has just ticked has no
              replies yet, and one they have just unticked still has the ones
              that already came in. */}
          {event?.rsvp_enabled && <EventRsvpList orgId={orgId} event={event} />}
          {categories.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">
                Categories (optional)
              </label>
              {/* Multi-select: some events genuinely belong in two places (a
                  field trip that is also a no-school day). The first one picked
                  colours the event on the grid. */}
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => {
                  const on = form.categories.includes(c)
                  return (
                    <button key={c} type="button"
                      onClick={() => set({
                        categories: on
                          ? form.categories.filter((x) => x !== c)
                          : [...form.categories, c],
                      })}
                      className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${on
                        ? `${colorFor(c, categories)} border-transparent font-semibold`
                        : 'border-gray-300 text-neutral-500 hover:bg-gray-50'}`}>
                      {on && '✓ '}{c}
                    </button>
                  )
                })}
              </div>
              {form.categories.length > 1 && (
                <p className="mt-1 text-[11px] text-neutral-400">
                  Shown in {form.categories[0]}'s colour, with a dot for the others.
                </p>
              )}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Location (optional)</label>
            <input className={field} value={form.location} onChange={(e) => set({ location: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Description (optional)</label>
            <textarea rows={3} className={field} value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 p-4 border-t border-gray-100">
          {event ? (
            <span className="flex items-center gap-3">
              <button onClick={() => remove(false)} disabled={busy} className="text-sm text-red-500 hover:underline disabled:opacity-50">
                {event.series_id ? 'Delete this date' : 'Delete'}
              </button>
              {event.series_id && (
                <button onClick={() => remove(true)} disabled={busy}
                  className="text-sm text-red-500 hover:underline disabled:opacity-50">This and following</button>
              )}
              <button onClick={() => onDuplicate(event)} disabled={busy}
                className="text-sm text-optio-purple hover:underline disabled:opacity-50">Duplicate</button>
            </span>
          ) : <span />}
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm">Cancel</button>
            <Button size="sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', 'last']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "3rd Friday" for a 'YYYY-MM-DD'. A 5th weekday is called "last", which is
 *  what the backend repeats it as (sis_events_service.occurrence_dates). */
export const nthWeekdayLabel = (dateStr) => {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()]
  return `${ORDINALS[Math.min(Math.ceil(d / 7), 5) - 1]} ${weekday}`
}

/**
 * "Repeats" on Add event. Every occurrence becomes its own event, with its own
 * replies, so one date can be moved, filled or cancelled alone.
 *
 * "On dates I pick" is the answer to "two chosen Fridays a month" (Apogee
 * NoCo's SPARK excursions): the 1st and 3rd Friday drift away from every two
 * weeks in a month with five Fridays, and a holiday moves them anyway, so the
 * office lists the days. Capped at 60 events by the backend.
 */
export const RepeatFields = ({ form, set }) => {
  const dates = form.repeat_dates
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="event-repeat">Repeats</label>
      <select id="event-repeat" className={field} value={form.repeat}
        onChange={(e) => set({ repeat: e.target.value })}>
        <option value="none">Does not repeat</option>
        <option value="weekly">Every week</option>
        <option value="2weeks">Every 2 weeks</option>
        <option value="monthly">Every month on the {nthWeekdayLabel(form.date) || 'same weekday'}</option>
        <option value="dates">On dates I pick</option>
      </select>
      {['weekly', '2weeks', 'monthly'].includes(form.repeat) && (
        <div className="grid grid-cols-2 gap-3 mt-2">
          <label className="block text-xs font-medium text-neutral-500">
            Until
            <input type="date" min={form.date} value={form.repeat_until}
              onChange={(e) => set({ repeat_until: e.target.value })}
              aria-label="Repeat until" className={`${field} mt-1`} />
          </label>
          <label className="block text-xs font-medium text-neutral-500">
            Or how many times
            <input type="number" min="1" max="60" value={form.repeat_count}
              onChange={(e) => set({ repeat_count: e.target.value })}
              aria-label="How many times" placeholder="e.g. 8" className={`${field} mt-1`} />
          </label>
        </div>
      )}
      {form.repeat === 'dates' && (
        <div className="mt-2 space-y-1.5">
          <p className="text-[11px] text-neutral-500">
            The date above is the first one. Add the others; each gets its own sign-up list.
          </p>
          {dates.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="date" value={d} aria-label={`Date ${i + 2}`}
                onChange={(e) => set({ repeat_dates: dates.map((x, j) => (j === i ? e.target.value : x)) })}
                className={field} />
              {dates.length > 1 && (
                <button type="button" aria-label={`Remove date ${i + 2}`}
                  onClick={() => set({ repeat_dates: dates.filter((_, j) => j !== i) })}
                  className="text-neutral-400 hover:text-red-500 text-lg leading-none">×</button>
              )}
            </div>
          ))}
          {dates.length < 59 && (
            <button type="button" onClick={() => set({ repeat_dates: [...dates, ''] })}
              className="text-xs font-medium text-optio-purple hover:underline">+ Add another date</button>
          )}
        </div>
      )}
    </div>
  )
}

const slug = (s) => (s || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// What the fee did for one family. No invoice on a yes to a paid event means the
// charge never raised — the reply is kept when billing fails, deliberately.
const payLabel = (r, fee) => {
  if (!fee || !r.attending) return ''
  if (!r.invoice_id) return 'Not billed'
  return r.invoice_status === 'paid' ? 'Paid' : 'Unpaid'
}

/**
 * Who has replied to this event — the office's headcount, on the event itself.
 *
 * iCreate, 2026-08-28 (9cf78e9a) asked for RSVPs and payments on calendar
 * events. The collecting shipped and the reading did not: replies went into
 * sis_event_rsvps and the only way to see one was a database query, which is
 * not a feature. The list lives in the event a person already clicked, because
 * that is where they are standing when they ask how many chairs to put out.
 *
 * A paid event shows what the fee did, per family. "Coming, no invoice" is a
 * real state — a charge that failed to raise still keeps the reply (the
 * headcount matters more than the money), so it must be visible rather than
 * read as free.
 */
const EventRsvpList = ({ orgId, event }) => {
  const { data: state, isError: failed } = useSisEventRsvps(event.id, orgId)

  const rows = state?.rsvps || []
  const fee = event.rsvp_fee_cents
  const closes = event.rsvp_closes_at ? String(event.rsvp_closes_at).slice(0, 10) : null

  const childMode = event.rsvp_mode === 'children'
  const childNames = (r) => (r.children || []).map((c) => c.name).join(', ')

  const download = () => {
    const header = ['Family', 'Coming', childMode ? 'Children' : 'People']
    if (childMode) header.push('Names')
    header.push('Note')
    if (fee) header.push('Payment')
    const csv = toCsv(header, rows.map((r) => {
      const line = [
        r.household_name || 'Unnamed family',
        r.attending ? 'Yes' : 'No',
        r.attending ? (r.party_size || 1) : 0,
      ]
      if (childMode) line.push(r.attending ? childNames(r) : '')
      line.push(r.note || '')
      if (fee) line.push(payLabel(r, fee))
      return line
    }))
    downloadCsv(csv, `rsvps-${slug(event.title)}-${dateStamp()}.csv`)
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-neutral-50/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-neutral-700">Replies</h3>
        {rows.length > 0 && (
          <button type="button" onClick={download}
            className="text-xs font-medium text-optio-purple hover:underline">Download CSV</button>
        )}
      </div>

      {failed ? (
        <p className="mt-1 text-xs text-red-500">Could not load the replies.</p>
      ) : !state ? (
        <p className="mt-1 text-xs text-neutral-400">Loading…</p>
      ) : !rows.length ? (
        <p className="mt-1 text-xs text-neutral-500">
          Nobody has replied yet. Families answer on their calendar.
        </p>
      ) : (
        <>
          <p className="mt-0.5 text-xs text-neutral-500">
            {state.families} {state.families === 1 ? 'family' : 'families'} coming
            {' · '}{state.people} {childMode
              ? (state.people === 1 ? 'child' : 'children')
              : (state.people === 1 ? 'person' : 'people')}
            {state.capacity ? ` of ${state.capacity} spots` : ''}
            {state.capacity && state.spots_left === 0 ? ' · Full' : ''}
            {rows.length > state.families && ` · ${rows.length - state.families} said no`}
          </p>
          <ul className="mt-2 divide-y divide-gray-200 max-h-56 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.id} className="py-1.5 flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className={`block text-sm truncate ${r.attending
                    ? 'text-neutral-800' : 'text-neutral-400 line-through'}`}>
                    {r.household_name || 'Unnamed family'}
                  </span>
                  {childMode && r.attending && r.children?.length > 0 && (
                    <span className="block text-xs text-neutral-700">{childNames(r)}</span>
                  )}
                  {r.note && <span className="block text-xs text-neutral-500">{r.note}</span>}
                </span>
                <span className="flex-shrink-0 text-xs text-right">
                  <span className="text-neutral-600">
                    {r.attending
                      ? `${r.party_size || 1} ${childMode
                        ? ((r.party_size || 1) === 1 ? 'child' : 'children')
                        : ((r.party_size || 1) === 1 ? 'person' : 'people')}`
                      : 'Not coming'}
                  </span>
                  {fee > 0 && r.attending && (
                    <span className={`block ${r.invoice_status === 'paid'
                      ? 'text-green-600' : 'text-amber-600'}`}>
                      {payLabel(r, fee)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {closes && (
        <p className="mt-2 text-[11px] text-neutral-400">
          Replies {closes < ymd(new Date()) ? 'closed' : 'close'} {closes}.
        </p>
      )}
    </div>
  )
}

// Copyable ICS subscribe links (all events + one per category).
const SubscribeModal = ({ orgId, onClose }) => {
  const [feed, setFeed] = useState(null)

  useEffect(() => {
    api.get(withOrg('/api/sis/events/feed', orgId))
      .then((r) => setFeed(r.data))
      .catch(() => { toast.error('Could not load the calendar feed'); onClose() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  const copy = (url) => {
    navigator.clipboard.writeText(url)
    toast.success('Link copied — paste it into your calendar app')
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900">Subscribe to this calendar</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <p className="text-xs text-neutral-500 mb-3">
          Copy a link and add it in Google Calendar ("From URL"), Outlook, or iPhone
          ("Add Subscribed Calendar"). Events stay in sync automatically.
        </p>
        {!feed ? <p className="text-sm text-neutral-400">Loading…</p> : (
          <div className="space-y-2">
            <FeedRow label="All events" url={feed.feed_url} onCopy={copy} />
            {(feed.category_feeds || []).map((f) => (
              <FeedRow key={f.category} label={`${f.category} only`} url={f.url} onCopy={copy} />
            ))}
          </div>
        )}
      </div>
    </ModalOverlay>
  )
}

const FeedRow = ({ label, url, onCopy }) => (
  <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">
    <div className="min-w-0">
      <div className="text-sm font-medium text-neutral-800">{label}</div>
      <div className="text-xs text-neutral-400 truncate">{url}</div>
    </div>
    <button onClick={() => onCopy(url)}
      className="text-sm font-medium text-optio-purple hover:underline flex-shrink-0">Copy</button>
  </div>
)

export default CalendarPage
