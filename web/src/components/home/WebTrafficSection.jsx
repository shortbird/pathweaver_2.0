import React, { useMemo, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  AreaChart, Area, BarChart, Bar, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import api from '../../services/api'
import { shortDate } from './AICostChart'
import {
  BRAND, INK, AXIS_TICK, CURSOR, ACTIVE_DOT, ChartCard, RangeToggle, RowsTooltip, dayAxes, meanOf, sumOf,
} from './PlatformMetricsSection'

/**
 * Website traffic for SuperadminHome, from the GA4 property the web platform
 * and the marketing site both tag into (services/googleAnalytics.js).
 *
 * One endpoint (/api/admin/platform-metrics/analytics) returns the window's
 * daily visitors plus three ranked breakdowns; the server batches the four
 * GA reports into one call and caches the answer, so the range toggle here
 * refetches rather than slicing -- a ranked list cannot be sliced by date
 * on the client.
 *
 * The section is absent, not empty, when GA is not configured (the server
 * says so) or unreachable, like every other home source. Nothing here fires
 * until the first reply, so an unconfigured install never flashes a
 * skeleton that then vanishes; a window change keeps the previous window's
 * cards up until the new one lands.
 *
 * Every chart is single-series in the brand hue: visitors over time is an
 * area, and the three breakdowns are nominal categories, so the bars share
 * one color and length alone carries the value (no legend needed -- the
 * title names the series).
 *
 * Headlines are numbers, never names: a hostname at text-3xl overflows a
 * phone-width card and a bare "/" reads as a rendering fault. The name goes
 * in the subtitle. All four cards share one height so the grid rows align
 * whatever the row counts; ten ranked rows fit it at 18px bars.
 */
const CARD_HEIGHT = 'h-64'

/** Share of the window's sessions held by the top row, e.g. "Organic Search · 41%". */
export function topShare(rows, valueKey, total) {
  const top = Array.isArray(rows) ? rows[0] : null
  if (!top || !(Number(top[valueKey]) > 0) || !(total > 0)) return null
  return { name: top.name ?? top.host ?? top.path, pct: Math.round((Number(top[valueKey]) / total) * 100) }
}

/** Y-axis labels for paths and hosts: keep the tail, it is the distinctive part. */
export function truncateLabel(value, max = 24) {
  const s = String(value ?? '')
  return s.length > max ? `…${s.slice(-(max - 1))}` : s
}

function VisitorsChart({ rows }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="visitorsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND} stopOpacity={0.28} />
            <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {dayAxes()}
        <Tooltip
          cursor={CURSOR}
          content={(
            <RowsTooltip
              titleFormatter={shortDate}
              rows={p => [
                { label: 'Visitors', value: p.users.toLocaleString('en') },
                { label: 'Sessions', value: p.sessions.toLocaleString('en') },
              ]}
            />
          )}
        />
        <Area
          type="monotone" dataKey="users" stroke={BRAND} strokeWidth={2}
          fill="url(#visitorsFill)" dot={false}
          activeDot={ACTIVE_DOT} name="Visitors"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Ranked nominal categories: one hue, length carries the value, label on the end. */
function RankedBarChart({ rows, nameKey, valueKey, valueLabel, labelWidth = 128 }) {
  const formatCount = v => Number(v).toLocaleString('en')
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={INK.grid} />
        <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis
          type="category" dataKey={nameKey} tick={{ ...AXIS_TICK, fill: INK.label }}
          tickFormatter={v => truncateLabel(v)} axisLine={false} tickLine={false} width={labelWidth}
          interval={0}
        />
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          content={(
            <RowsTooltip
              titleFormatter={name => name}
              rows={p => [{ label: valueLabel, value: formatCount(p[valueKey]) }]}
            />
          )}
        />
        <Bar dataKey={valueKey} fill={BRAND} radius={[0, 4, 4, 0]} maxBarSize={18} name={valueLabel}>
          <LabelList dataKey={valueKey} position="right" formatter={formatCount} style={{ fontSize: 11, fill: INK.value }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function WebTrafficSection() {
  const [days, setDays] = useState(30)

  const query = useQuery({
    queryKey: ['home', 'superadmin', 'web-traffic', days],
    queryFn: async () =>
      (await api.get('/api/admin/platform-metrics/analytics', { params: { days } })).data,
    staleTime: 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  })

  const data = query.data
  const rows = useMemo(() => (Array.isArray(data?.days) ? data.days : []), [data])
  const channels = useMemo(() => (Array.isArray(data?.channels) ? data.channels : []), [data])
  const pages = useMemo(() => (Array.isArray(data?.pages) ? data.pages : []), [data])
  const sites = useMemo(() => (Array.isArray(data?.sites) ? data.sites : []), [data])

  if (query.isError || !data || data.configured === false) return null

  const totalSessions = sumOf(rows, 'sessions')
  const topChannel = topShare(channels, 'sessions', totalSessions)
  const topSite = topShare(sites, 'sessions', totalSessions)
  const topPage = pages[0]
  const shownDays = data.period_days || days

  return (
    <section aria-label="Website traffic" className="mt-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Website traffic</h2>
          <p className="text-xs text-gray-500">Google Analytics, marketing site and web platform together.</p>
        </div>
        <RangeToggle days={days} onChange={setDays} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-3">
        <ChartCard
          ariaLabel="Visitors" title="Visitors"
          headline={meanOf(rows, 'users').toLocaleString('en')}
          subtitle={`average per day over ${shownDays} days · ${totalSessions.toLocaleString('en')} sessions`}
          isLoading={false}
          height={CARD_HEIGHT}
        >
          <VisitorsChart rows={rows} />
        </ChartCard>

        <ChartCard
          ariaLabel="Where visitors come from" title="Where visitors come from"
          headline={topChannel ? `${topChannel.pct}%` : '—'}
          subtitle={topChannel
            ? `of sessions from ${topChannel.name} over ${shownDays} days`
            : `no sessions over ${shownDays} days`}
          isLoading={false}
          height={CARD_HEIGHT}
        >
          {channels.length > 0 ? (
            <RankedBarChart rows={channels} nameKey="name" valueKey="sessions" valueLabel="Sessions" />
          ) : (
            <p className="text-xs text-gray-400">No sessions in this window.</p>
          )}
        </ChartCard>

        <ChartCard
          ariaLabel="Top pages" title="Top pages"
          headline={topPage ? Number(topPage.views).toLocaleString('en') : '—'}
          subtitle={topPage
            ? `views of ${truncateLabel(topPage.path, 40)} over ${shownDays} days`
            : `no page views over ${shownDays} days`}
          isLoading={false}
          height={CARD_HEIGHT}
        >
          {pages.length > 0 ? (
            <RankedBarChart rows={pages} nameKey="path" valueKey="views" valueLabel="Views" labelWidth={150} />
          ) : (
            <p className="text-xs text-gray-400">No page views in this window.</p>
          )}
        </ChartCard>

        <ChartCard
          ariaLabel="Traffic by site" title="Traffic by site"
          headline={topSite ? `${topSite.pct}%` : '—'}
          subtitle={topSite
            ? `of sessions on ${topSite.name} over ${shownDays} days`
            : `no sessions over ${shownDays} days`}
          isLoading={false}
          height={CARD_HEIGHT}
        >
          {sites.length > 0 ? (
            <RankedBarChart rows={sites} nameKey="host" valueKey="sessions" valueLabel="Sessions" labelWidth={150} />
          ) : (
            <p className="text-xs text-gray-400">No sessions in this window.</p>
          )}
        </ChartCard>
      </div>
    </section>
  )
}
