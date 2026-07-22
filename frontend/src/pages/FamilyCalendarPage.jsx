import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../services/api'

/**
 * School Calendar — the school's events (field trips, showcases, closures) for
 * families. Read-only; staff manage events in the SIS. Shows the upcoming few
 * months as a grouped list, which reads well on both desktop and phone.
 */

const monthKey = (iso) => (iso || '').slice(0, 7)

const fmtMonth = (key) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

const fmtDay = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

const whenLabel = (e) => {
  const day = fmtDay(e.start_at)
  if (e.all_day) {
    if (e.end_at && e.end_at.slice(0, 10) !== e.start_at.slice(0, 10)) {
      return `${day} – ${fmtDay(e.end_at)}`
    }
    return day
  }
  const time = fmtTime(e.start_at) + (e.end_at ? `–${fmtTime(e.end_at)}` : '')
  return `${day} · ${time}`
}

const FamilyCalendarPage = () => {
  const [orgs, setOrgs] = useState(null)
  const [orgId, setOrgId] = useState(null)
  const [events, setEvents] = useState(null)

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
    const from = new Date()
    from.setDate(1)
    api.get(`/api/sis/parent/events?organization_id=${orgId}&from=${from.toISOString().slice(0, 10)}`)
      .then((r) => setEvents(r.data?.events || []))
      .catch(() => { toast.error('Could not load the calendar'); setEvents([]) })
  }, [orgId])

  const org = orgs?.find((o) => o.organization_id === orgId)
  const grouped = (events || []).reduce((acc, e) => {
    const key = monthKey(e.start_at)
    ;(acc[key] = acc[key] || []).push(e)
    return acc
  }, {})

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
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

      {(orgs === null || (orgId && events === null)) && <p className="text-neutral-500">Loading…</p>}
      {orgs?.length === 0 && <p className="text-neutral-500">Your account isn&apos;t linked to a school yet.</p>}
      {events?.length === 0 && <p className="text-neutral-500">No upcoming events on the calendar yet.</p>}

      {Object.entries(grouped).map(([key, items]) => (
        <div key={key} className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">{fmtMonth(key)}</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {items.map((e) => (
              <div key={e.id} className="px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-neutral-900">{e.title}</span>
                  {e.category && (
                    <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-optio-purple/10 text-optio-purple">
                      {e.category}
                    </span>
                  )}
                </div>
                <p className="text-sm text-neutral-500 mt-0.5">
                  {whenLabel(e)}
                  {e.location ? ` · ${e.location}` : ''}
                </p>
                {e.description && <p className="text-sm text-neutral-600 mt-1">{e.description}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default FamilyCalendarPage
