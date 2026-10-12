import React, { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { RangeToggle } from './PlatformMetricsSection'

/**
 * The queues that move people forward, for SuperadminHome: credit review,
 * the CRM, and tickets. One request (admin_platform_pipelines, cached five
 * minutes server-side), three cards, each a door into the page that works
 * the queue.
 *
 * Each card leads with the number somebody has to act on, not the biggest
 * one. For credit that is the work waiting on a school: 271 completions on
 * 2026-10-12, the oldest from August, against 12 waiting on Optio -- the
 * bottleneck was never the Optio review queue.
 */

/** Days since an ISO stamp, or null. */
export function ageDays(iso, now = new Date()) {
  const t = Date.parse(iso || '')
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now - t) / 86_400_000))
}

/** a/b as a whole percent; null when there is nothing to divide by. */
export function pct(a, b) {
  const base = Number(b) || 0
  return base > 0 ? Math.round(((Number(a) || 0) / base) * 100) : null
}

function Row({ label, value, note, emphasis }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`tabular-nums font-medium ${emphasis ? 'text-red-700' : 'text-gray-900'}`}>
        {value}
        {note && <span className="text-gray-500 font-normal"> · {note}</span>}
      </dd>
    </div>
  )
}

function PipelineCard({ ariaLabel, title, headline, subtitle, to, linkLabel, children }) {
  return (
    <section aria-label={ariaLabel} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <p className="text-3xl font-bold text-gray-900 mt-1 tabular-nums">{headline}</p>
      <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
      <dl className="mt-4 space-y-1.5 text-sm flex-1">{children}</dl>
      <Link to={to} className="mt-4 text-sm font-semibold text-optio-purple hover:underline">{linkLabel} →</Link>
    </section>
  )
}

const n = v => (Number(v) || 0).toLocaleString('en')

export default function PipelinesSection() {
  const [days, setDays] = useState(30)
  const query = useQuery({
    queryKey: ['home', 'superadmin', 'pipelines', days],
    queryFn: async () =>
      (await api.get('/api/admin/platform-metrics/pipelines', { params: { days } })).data,
    staleTime: 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  })

  if (query.isError || !query.data) return null
  const { credit = {}, crm = {}, tickets = {} } = query.data
  const schoolAge = ageDays(credit.waiting_school_oldest)
  const optioAge = ageDays(credit.waiting_optio_oldest)
  const ticketAge = ageDays(tickets.oldest_open)

  return (
    <section aria-label="Pipelines" className="mt-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-base font-semibold text-gray-900">Pipelines</h2>
        <RangeToggle days={days} onChange={setDays} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mt-3">
        <PipelineCard
          ariaLabel="Credit review" title="Credit review"
          headline={n(credit.waiting_school)}
          subtitle={schoolAge != null
            ? `waiting on a school's approval, oldest ${schoolAge} days`
            : 'waiting on a school’s approval'}
          to="/credit-dashboard" linkLabel="Credit review"
        >
          <Row label="Waiting on Optio" value={n(credit.waiting_optio)}
            note={optioAge != null ? `oldest ${optioAge}d` : null} emphasis={optioAge != null && optioAge > 7} />
          <Row label={`Requested (${days}d)`} value={n(credit.requested)} />
          <Row label={`Approved (${days}d)`} value={n(credit.approved)} />
          <Row label={`Sent back to grow (${days}d)`} value={n(credit.sent_back)} />
        </PipelineCard>

        <PipelineCard
          ariaLabel="Leads and email" title="Leads and email"
          headline={n(crm.converted)}
          subtitle={`leads became families over ${days} days, of ${n(crm.leads)} new leads`}
          to="/admin/crm" linkLabel="CRM"
        >
          <Row label="In a funnel now" value={n(crm.in_funnels)} />
          <Row label="Emails delivered" value={n(crm.delivered)} />
          <Row label="Opened" value={n(crm.opened)}
            note={pct(crm.opened, crm.delivered) != null ? `${pct(crm.opened, crm.delivered)}%` : null} />
          <Row label="Clicked" value={n(crm.clicked)}
            note={pct(crm.clicked, crm.delivered) != null ? `${pct(crm.clicked, crm.delivered)}%` : null} />
          <Row label="Bounced or reported" value={n(crm.bounced)} emphasis={(crm.bounced || 0) > 0} />
        </PipelineCard>

        <PipelineCard
          ariaLabel="Tickets" title="Tickets"
          headline={n(tickets.open)}
          subtitle={ticketAge != null ? `open, oldest ${ticketAge} days` : 'open'}
          to="/admin/tickets" linkLabel="Tickets"
        >
          <Row label="Open over a week" value={n(tickets.open_over_7d)} emphasis={(tickets.open_over_7d || 0) > 0} />
          <Row label={`Opened (${days}d)`} value={n(tickets.opened)} />
          <Row label={`Resolved (${days}d)`} value={n(tickets.resolved)} />
          <Row label="Median time to resolve"
            value={tickets.median_hours_to_resolve != null ? `${tickets.median_hours_to_resolve}h` : '—'} />
        </PipelineCard>
      </div>
    </section>
  )
}
