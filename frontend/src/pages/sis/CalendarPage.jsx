import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { ModalOverlay } from '../../components/ui'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

/**
 * SIS Calendar — the org's EVENTS (field trips, showcases, closures, deadlines),
 * not class meetings. The weekly class grid lives with the classes themselves
 * (Classes page / Schedule Builder). Staff add events on a month grid.
 *
 * Times use wall-clock semantics: they're stored verbatim ("Z" suffixed) and
 * displayed verbatim, so an 9am event reads 9am for everyone — right for a
 * single-campus school, and immune to viewer-timezone date shifts.
 */

// "2026-08-24T09:00:00+00:00" -> { date: '2026-08-24', time: '09:00' } — no Date() parsing.
const splitStamp = (iso) => {
  const s = String(iso || '')
  return { date: s.slice(0, 10), time: s.slice(11, 16) }
}
const joinStamp = (date, time) => (date ? `${date}T${time || '00:00'}:00Z` : null)

const fmtTime = (hhmmStr) => {
  if (!hhmmStr) return ''
  const [h, m] = hhmmStr.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${ampm}`
}

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const CalendarPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-11
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { event } for edit, { date } for create

  const monthStart = `${year}-${pad(month + 1)}-01`
  const nextMonth = month === 11 ? `${year + 1}-01-01` : `${year}-${pad(month + 2)}-01`

  const reload = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withOrg(`/api/sis/events?from=${monthStart}&to=${nextMonth}`, orgId))
      .then((r) => setEvents(r.data?.events || []))
      .catch(() => toast.error('Failed to load events'))
      .finally(() => setLoading(false))
  }, [orgId, monthStart, nextMonth])

  useEffect(() => { reload() }, [reload])

  const shift = (delta) => {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear()); setMonth(d.getMonth())
  }

  const byDate = useMemo(() => {
    const map = {}
    for (const e of events) {
      const { date } = splitStamp(e.start_at)
      ;(map[date] = map[date] || []).push(e)
    }
    return map
  }, [events])

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
          <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
          <Button size="sm" onClick={() => setModal({ date: today })} disabled={!orgId}>Add event</Button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => shift(-1)} aria-label="Previous month"
          className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-neutral-600 hover:border-optio-purple hover:text-optio-purple text-sm">←</button>
        <span className="text-lg font-semibold text-neutral-900 min-w-[180px] text-center">{MONTHS[month]} {year}</span>
        <button onClick={() => shift(1)} aria-label="Next month"
          className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-neutral-600 hover:border-optio-purple hover:text-optio-purple text-sm">→</button>
        <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}
          className="text-sm text-optio-purple hover:underline">Today</button>
        {loading && <span className="text-sm text-neutral-400">Loading…</span>}
      </div>

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
                  className="min-h-[96px] border-l border-gray-100 first:border-l-0 p-1.5 cursor-pointer hover:bg-optio-purple/5 transition-colors"
                  onClick={() => setModal({ date: key })}>
                  <div className={`text-xs font-medium mb-1 ${key === today
                    ? 'inline-flex w-5 h-5 items-center justify-center rounded-full bg-optio-purple text-white'
                    : 'text-neutral-400'}`}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.map((e) => {
                      const { time } = splitStamp(e.start_at)
                      return (
                        <button key={e.id} type="button"
                          onClick={(ev) => { ev.stopPropagation(); setModal({ event: e }) }}
                          className="block w-full text-left rounded px-1.5 py-0.5 bg-optio-purple/10 text-optio-purple hover:bg-optio-purple/20 transition-colors">
                          <span className="text-[11px] font-semibold leading-tight block truncate">{e.title}</span>
                          {!e.all_day && <span className="text-[10px] opacity-80">{fmtTime(time)}</span>}
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

      {!loading && !events.length && (
        <p className="mt-3 text-sm text-neutral-400">
          No events this month. Click a day (or "Add event") to create one — field trips, showcases,
          closures, deadlines.
        </p>
      )}

      {modal && (
        <EventModal
          orgId={orgId}
          event={modal.event || null}
          defaultDate={modal.date}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); reload() }}
        />
      )}
    </div>
  )
}

const EventModal = ({ orgId, event, defaultDate, onClose, onSaved }) => {
  const start = event ? splitStamp(event.start_at) : { date: defaultDate, time: '' }
  const end = event?.end_at ? splitStamp(event.end_at) : { date: '', time: '' }
  const [form, setForm] = useState({
    title: event?.title || '',
    description: event?.description || '',
    location: event?.location || '',
    all_day: event ? !!event.all_day : false,
    date: start.date || defaultDate,
    start_time: event && !event.all_day ? start.time : '',
    end_time: event && !event.all_day && end.time ? end.time : '',
  })
  const [busy, setBusy] = useState(false)

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const save = async () => {
    if (!form.title.trim()) return toast.error('Give the event a title')
    if (!form.date) return toast.error('Pick a date')
    if (!form.all_day && form.end_time && form.start_time && form.end_time < form.start_time) {
      return toast.error("The event can't end before it starts")
    }
    const payload = {
      organization_id: orgId,
      title: form.title.trim(),
      description: form.description.trim(),
      location: form.location.trim(),
      all_day: form.all_day,
      start_at: joinStamp(form.date, form.all_day ? '00:00' : (form.start_time || '00:00')),
      end_at: !form.all_day && form.end_time ? joinStamp(form.date, form.end_time) : null,
    }
    setBusy(true)
    try {
      if (event) await api.patch(`/api/sis/events/${event.id}`, payload)
      else await api.post('/api/sis/events', payload)
      toast.success(event ? 'Event updated' : 'Event added')
      onSaved()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not save the event')
    } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!window.confirm(`Delete "${event.title}"?`)) return
    setBusy(true)
    try {
      await api.delete(`/api/sis/events/${event.id}?organization_id=${orgId}`)
      toast.success('Event deleted')
      onSaved()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not delete the event')
    } finally { setBusy(false) }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-lg font-semibold text-gray-900">{event ? 'Edit event' : 'New event'}</h2>
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
            <label className="flex items-end gap-2 pb-2 text-sm text-neutral-600">
              <input type="checkbox" checked={form.all_day} onChange={(e) => set({ all_day: e.target.checked })}
                className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
              All day
            </label>
          </div>
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
          {event
            ? <button onClick={remove} disabled={busy} className="text-sm text-red-500 hover:underline disabled:opacity-50">Delete</button>
            : <span />}
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm">Cancel</button>
            <Button size="sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}

export default CalendarPage
