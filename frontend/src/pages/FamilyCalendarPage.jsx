import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import ModalOverlay from '../components/ui/ModalOverlay'

/**
 * School Calendar — the school's events (field trips, showcases, closures) for
 * families. Read-only; staff manage events in the SIS. Shown as a month grid
 * (families asked for a calendar, not a list); tap a day or event for details.
 *
 * Times are wall-clock: stored verbatim ("Z" suffixed) and displayed verbatim,
 * so the date never shifts by the viewer's timezone.
 */

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const splitStamp = (iso) => ({ date: String(iso || '').slice(0, 10), time: String(iso || '').slice(11, 16) })
const addDays = (dateStr, n) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return ymd(new Date(y, m - 1, d + n))
}
const fmtTime = (hhmmStr) => {
  if (!hhmmStr) return ''
  const [h, m] = hhmmStr.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${ampm}`
}
const fmtDayLong = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const FamilyCalendarPage = () => {
  const [orgs, setOrgs] = useState(null)
  const [orgId, setOrgId] = useState(null)
  const [events, setEvents] = useState(null)
  const [openDay, setOpenDay] = useState(null) // 'YYYY-MM-DD' whose events are shown

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-11

  const monthStart = `${year}-${pad(month + 1)}-01`
  const nextMonth = month === 11 ? `${year + 1}-01-01` : `${year}-${pad(month + 2)}-01`

  useEffect(() => {
    api.get('/api/sis/parent/context')
      .then((r) => {
        const list = r.data?.orgs || []
        setOrgs(list)
        if (list.length) setOrgId(list[0].organization_id)
      })
      .catch(() => { toast.error('Could not load your school'); setOrgs([]) })
  }, [])

  useEffect(() => {
    if (!orgId) return
    setEvents(null)
    api.get(`/api/sis/parent/events?organization_id=${orgId}&from=${monthStart}&to=${nextMonth}`)
      .then((r) => setEvents(r.data?.events || []))
      .catch(() => { toast.error('Could not load the calendar'); setEvents([]) })
  }, [orgId, monthStart, nextMonth])

  const shift = (delta) => {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear()); setMonth(d.getMonth()); setOpenDay(null)
  }

  // Multi-day events appear on every day they span.
  const byDate = useMemo(() => {
    const map = {}
    for (const e of (events || [])) {
      const start = splitStamp(e.start_at).date
      const end = e.end_at ? splitStamp(e.end_at).date : start
      let day = start
      for (let i = 0; i < 62 && day <= end; i += 1) {
        ;(map[day] = map[day] || []).push(e)
        day = addDays(day, 1)
      }
    }
    return map
  }, [events])

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
  const openDayEvents = openDay ? (byDate[openDay] || []) : []

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900 mb-1">School Calendar</h1>
      <p className="text-sm text-neutral-500 mb-6">
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

      {orgs === null && <p className="text-neutral-500">Loading…</p>}
      {orgs?.length === 0 && <p className="text-neutral-500">Your account isn&apos;t linked to a school yet.</p>}

      {orgId && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => shift(-1)} aria-label="Previous month"
              className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-neutral-600 hover:border-optio-purple hover:text-optio-purple text-sm">←</button>
            <span className="text-lg font-semibold text-neutral-900 min-w-[170px] text-center">{MONTHS[month]} {year}</span>
            <button onClick={() => shift(1)} aria-label="Next month"
              className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-neutral-600 hover:border-optio-purple hover:text-optio-purple text-sm">→</button>
            <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setOpenDay(null) }}
              className="text-sm text-optio-purple hover:underline">Today</button>
            {events === null && <span className="text-sm text-neutral-400">Loading…</span>}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-100">
              {DOW.map((d) => (
                <div key={d} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-neutral-400">
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
                        : 'text-neutral-400'}`}>
                        {day.getDate()}
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map((e) => {
                          const { time, date: startDate } = splitStamp(e.start_at)
                          return (
                            <div key={e.id}
                              className="rounded px-1.5 py-0.5 bg-optio-purple/10 text-optio-purple">
                              <span className="text-[11px] font-semibold leading-tight block truncate">{e.title}</span>
                              {!e.all_day && startDate === key && <span className="text-[10px] opacity-80">{fmtTime(time)}</span>}
                            </div>
                          )
                        })}
                        {dayEvents.length > 3 && (
                          <span className="text-[10px] text-neutral-400">+{dayEvents.length - 3} more</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {events?.length === 0 && (
            <p className="mt-3 text-sm text-neutral-400">No events on the calendar this month.</p>
          )}
        </>
      )}

      {openDay && (
        <ModalOverlay onClose={() => setOpenDay(null)} className="items-end sm:items-center">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-4">
              <h2 className="text-base font-semibold text-neutral-900">{fmtDayLong(openDay)}</h2>
              <button onClick={() => setOpenDay(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="p-4 space-y-3">
              {openDayEvents.map((e) => {
                const { time, date: startDate } = splitStamp(e.start_at)
                const when = e.all_day ? 'All day' : (startDate === openDay ? fmtTime(time) : 'Continues')
                return (
                  <div key={e.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-neutral-900">{e.title}</span>
                      {e.category && (
                        <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-optio-purple/10 text-optio-purple">{e.category}</span>
                      )}
                    </div>
                    <p className="text-sm text-neutral-500 mt-0.5">{when}{e.location ? ` · ${e.location}` : ''}</p>
                    {e.description && <p className="text-sm text-neutral-600 mt-1">{e.description}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

export default FamilyCalendarPage
