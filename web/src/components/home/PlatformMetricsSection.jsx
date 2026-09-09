import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import api from '../../services/api'
import { formatCost, shortDate } from './AICostChart'

/**
 * Platform-health charts for SuperadminHome, below the AI cost chart.
 *
 * One RPC-backed endpoint (/api/admin/platform-metrics/daily) feeds every
 * time-series card in a single request: the server zero-fills days and
 * aggregates in Postgres, so nothing here re-implements the AI chart's
 * zeroFillDays and nothing can hit PostgREST's row cap. Cost-by-service uses
 * its existing endpoint. All cards degrade silently like the stat tiles: an
 * errored source renders nothing, never an error wall.
 *
 * Colors: single-series charts wear the brand purple; the learning-activity
 * lines use a 3-slot categorical palette (purple/green/orange) validated with
 * the dataviz palette checker against white — CVD separation, normal-vision
 * floor, and >=3:1 contrast all pass, so no chart leans on color alone beyond
 * its legend. Auth health wears status colors (success/failure semantics),
 * with fixed stacking order and a glyph legend as the required non-color
 * channel.
 */

const BRAND = '#6D469B' // optio-purple
const SERIES = {
  completions: '#6D469B', // brand purple
  evidence: '#12a06e',    // green, darkened to clear 3:1 on white
  starts: '#eb6834',      // orange
}
const STATUS = { good: '#0ca30c', critical: '#d03b3b' }

const RANGES = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
]

/** Last n rows of the server's ascending, zero-filled 90-day series. */
export function sliceWindow(rows, n) {
  if (!Array.isArray(rows)) return []
  return rows.slice(-n)
}

/** Mean of a numeric field, rounded — the honest headline for DAU. */
export function meanOf(rows, key) {
  if (!Array.isArray(rows) || rows.length === 0) return 0
  const sum = rows.reduce((s, r) => s + (Number(r?.[key]) || 0), 0)
  return Math.round(sum / rows.length)
}

export function sumOf(rows, key) {
  if (!Array.isArray(rows)) return 0
  return rows.reduce((s, r) => s + (Number(r?.[key]) || 0), 0)
}

/** "12% of 316" — failure share of attempts; null when nothing was attempted. */
export function failureShare(rows, okKey, failKey) {
  const ok = sumOf(rows, okKey)
  const failed = sumOf(rows, failKey)
  const attempts = ok + failed
  if (attempts === 0) return null
  return { attempts, failed, pct: Math.round((failed / attempts) * 100) }
}

/**
 * Daily rows -> Monday-start weekly dollar buckets, ascending. SIS payments
 * are too sparse for daily bars (a few per week), so the money chart is weekly.
 */
export function bucketWeeks(rows) {
  const weeks = new Map()
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r.day !== 'string') continue
    const d = new Date(`${r.day.slice(0, 10)}T00:00:00Z`)
    if (Number.isNaN(d.getTime())) continue
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
    const key = d.toISOString().slice(0, 10)
    weeks.set(key, (weeks.get(key) || 0) + (Number(r.sis_payment_cents) || 0))
  }
  return [...weeks.entries()]
    .map(([week, cents]) => ({ week, dollars: cents / 100 }))
    .sort((a, b) => (a.week < b.week ? -1 : 1))
}

/** Top services by cost with the tail folded into "Other" — never more hues. */
export function topServices(services, limit = 6) {
  const rows = (Array.isArray(services) ? services : [])
    .filter(s => s && typeof s.service_name === 'string')
    .map(s => ({
      name: s.service_name,
      cost: Number(s.total_cost_usd) || 0,
      requests: Number(s.requests) || 0,
    }))
  if (rows.length <= limit) return rows
  const tail = rows.slice(limit) // endpoint sorts by cost desc
  return [...rows.slice(0, limit), {
    name: 'Other',
    cost: tail.reduce((s, r) => s + r.cost, 0),
    requests: tail.reduce((s, r) => s + r.requests, 0),
  }]
}

export function formatDollars(value) {
  return `$${Math.round(Number(value) || 0).toLocaleString('en')}`
}

const AXIS_TICK = { fontSize: 11, fill: '#9CA3AF' }
const CURSOR = { stroke: '#D1D5DB', strokeWidth: 1 }

function TooltipShell({ title, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-xs">
      <p className="font-semibold text-gray-900">{title}</p>
      {children}
    </div>
  )
}

/** rows: [{label, value, swatch?}] — values wear ink, identity wears the chip. */
function RowsTooltip({ active, payload, label, titleFormatter, rows }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <TooltipShell title={titleFormatter(label ?? point.day)}>
      {rows(point).map(({ label: rowLabel, value, swatch }) => (
        <p key={rowLabel} className="text-gray-700 mt-1 flex items-center gap-1.5">
          {swatch && (
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: swatch }} />
          )}
          <span className="text-gray-500">{rowLabel}</span>
          <span className="font-medium">{value}</span>
        </p>
      ))}
    </TooltipShell>
  )
}

function LegendChips({ items }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
      {items.map(({ label, color, glyph }) => (
        <span key={label} className="flex items-center gap-1.5 text-xs text-gray-600">
          <span
            className="w-2.5 h-2.5 rounded-sm inline-flex items-center justify-center text-[8px] leading-none text-white"
            style={{ backgroundColor: color }}
          >
            {glyph || ''}
          </span>
          {label}
        </span>
      ))}
    </div>
  )
}

function ChartCard({ ariaLabel, title, headline, subtitle, isLoading, legend, children, height = 'h-40' }) {
  return (
    <section aria-label={ariaLabel} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {isLoading ? (
        <div className="animate-pulse mt-2 h-8 w-24 bg-gray-100 rounded" />
      ) : (
        <>
          <p className="text-3xl font-bold text-gray-900 mt-1 tabular-nums">{headline}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </>
      )}
      {legend}
      <div className={`${height} mt-4`}>
        {isLoading ? (
          <div className="animate-pulse h-full w-full bg-gray-50 rounded" />
        ) : children}
      </div>
    </section>
  )
}

/* Shared axes: recessive horizontal-only grid, no axis lines, gray ticks. */
function dayAxes(yProps = {}) {
  return (
    <>
      <CartesianGrid vertical={false} stroke="#F3F4F6" />
      <XAxis
        dataKey="day" tickFormatter={shortDate} tick={AXIS_TICK}
        axisLine={false} tickLine={false} minTickGap={28}
      />
      <YAxis
        tick={AXIS_TICK} axisLine={false} tickLine={false}
        width={40} allowDecimals={false} {...yProps}
      />
    </>
  )
}

function DauChart({ rows }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="dauFill" x1="0" y1="0" x2="0" y2="1">
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
              rows={p => [{ label: 'Active users', value: p.dau.toLocaleString('en') }]}
            />
          )}
        />
        <Area
          type="monotone" dataKey="dau" stroke={BRAND} strokeWidth={2}
          fill="url(#dauFill)" dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: '#FFFFFF' }} name="Active users"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function SignupsChart({ rows }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        {dayAxes()}
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          content={(
            <RowsTooltip
              titleFormatter={shortDate}
              rows={p => [{ label: 'Signups', value: p.signups.toLocaleString('en') }]}
            />
          )}
        />
        <Bar dataKey="signups" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={24} name="Signups" />
      </BarChart>
    </ResponsiveContainer>
  )
}

/**
 * Success/failure stacked bars. Color alone must not carry good/bad (the
 * red/green pair collapses under deuteranopia), so the stacking order is
 * fixed — successes always sit on the baseline, failures always on top — and
 * the legend pairs each color with a glyph.
 */
function AuthStackChart({ rows, okKey, failKey, okLabel, failLabel }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        {dayAxes({ width: 34 })}
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          content={(
            <RowsTooltip
              titleFormatter={shortDate}
              rows={p => [
                { label: okLabel, value: p[okKey].toLocaleString('en'), swatch: STATUS.good },
                { label: failLabel, value: p[failKey].toLocaleString('en'), swatch: STATUS.critical },
              ]}
            />
          )}
        />
        <Bar
          dataKey={okKey} stackId="auth" fill={STATUS.good} maxBarSize={24}
          stroke="#FFFFFF" strokeWidth={1} name={okLabel}
        />
        <Bar
          dataKey={failKey} stackId="auth" fill={STATUS.critical} maxBarSize={24}
          stroke="#FFFFFF" strokeWidth={1} radius={[2, 2, 0, 0]} name={failLabel}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

function LearningActivityChart({ rows }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        {dayAxes()}
        <Tooltip
          cursor={CURSOR}
          content={(
            <RowsTooltip
              titleFormatter={shortDate}
              rows={p => [
                { label: 'Tasks completed', value: p.task_completions.toLocaleString('en'), swatch: SERIES.completions },
                { label: 'Evidence uploads', value: p.evidence_uploads.toLocaleString('en'), swatch: SERIES.evidence },
                { label: 'Quests started', value: p.quest_starts.toLocaleString('en'), swatch: SERIES.starts },
              ]}
            />
          )}
        />
        <Line type="monotone" dataKey="task_completions" stroke={SERIES.completions} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#FFFFFF' }} name="Tasks completed" />
        <Line type="monotone" dataKey="evidence_uploads" stroke={SERIES.evidence} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#FFFFFF' }} name="Evidence uploads" />
        <Line type="monotone" dataKey="quest_starts" stroke={SERIES.starts} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#FFFFFF' }} name="Quests started" />
      </LineChart>
    </ResponsiveContainer>
  )
}

/** Nominal categories: every bar wears the same brand hue; length carries the value. */
function CostByServiceChart({ rows }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke="#F3F4F6" />
        <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={formatCost} />
        <YAxis
          type="category" dataKey="name" tick={{ ...AXIS_TICK, fill: '#4B5563' }}
          axisLine={false} tickLine={false} width={128}
        />
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          content={(
            <RowsTooltip
              titleFormatter={name => name}
              rows={p => [
                { label: 'Cost', value: formatCost(p.cost) },
                { label: 'Calls', value: p.requests.toLocaleString('en') },
              ]}
            />
          )}
        />
        <Bar dataKey="cost" fill={BRAND} radius={[0, 4, 4, 0]} maxBarSize={18} name="Cost">
          <LabelList dataKey="cost" position="right" formatter={formatCost} style={{ fontSize: 11, fill: '#6B7280' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function SisRevenueChart({ rows }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#F3F4F6" />
        <XAxis
          dataKey="week" tickFormatter={shortDate} tick={AXIS_TICK}
          axisLine={false} tickLine={false} minTickGap={28}
        />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={formatDollars} />
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          content={(
            <RowsTooltip
              titleFormatter={week => `Week of ${shortDate(week)}`}
              rows={p => [{ label: 'Collected', value: formatDollars(p.dollars) }]}
            />
          )}
        />
        <Bar dataKey="dollars" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={32} name="Collected" />
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function PlatformMetricsSection() {
  const [days, setDays] = useState(30)

  // Always fetch the full window once; the range toggle slices client-side.
  const metricsQuery = useQuery({
    queryKey: ['home', 'superadmin', 'platform-metrics'],
    queryFn: async () =>
      (await api.get('/api/admin/platform-metrics/daily', { params: { days: 90 } })).data,
    staleTime: 60_000,
    retry: false,
  })

  const serviceQuery = useQuery({
    queryKey: ['home', 'superadmin', 'ai-cost-by-service', days],
    queryFn: async () =>
      (await api.get('/api/admin/ai/costs/by-service', { params: { days } })).data,
    staleTime: 60_000,
    retry: false,
  })

  const windowRows = useMemo(
    () => sliceWindow(metricsQuery.data?.days, days),
    [metricsQuery.data, days]
  )
  const weekly = useMemo(() => bucketWeeks(metricsQuery.data?.days), [metricsQuery.data])
  const services = useMemo(() => topServices(serviceQuery.data?.services), [serviceQuery.data])

  const logins = failureShare(windowRows, 'login_success', 'login_failed')
  const registrations = failureShare(windowRows, 'reg_success', 'reg_failed')
  const revenue90 = weekly.reduce((s, w) => s + w.dollars, 0)

  const metricsUp = !metricsQuery.isError
  const servicesUp = !serviceQuery.isError
  if (!metricsUp && !servicesUp) return null

  const loading = metricsQuery.isLoading

  return (
    <section aria-label="Platform health" className="mt-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-base font-semibold text-gray-900">Platform health</h2>
        <div className="flex gap-1" role="group" aria-label="Time range">
          {RANGES.map(r => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              aria-pressed={days === r.days}
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                days === r.days
                  ? 'bg-optio-purple text-white border-optio-purple'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-optio-purple/60'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-3">
        {metricsUp && (
          <ChartCard
            ariaLabel="Daily active users" title="Daily active users"
            headline={meanOf(windowRows, 'dau').toLocaleString('en')}
            subtitle={`average per day over ${days} days`}
            isLoading={loading}
          >
            <DauChart rows={windowRows} />
          </ChartCard>
        )}

        {metricsUp && (
          <ChartCard
            ariaLabel="Signups" title="Signups"
            headline={sumOf(windowRows, 'signups').toLocaleString('en')}
            subtitle={`new accounts over ${days} days`}
            isLoading={loading}
          >
            <SignupsChart rows={windowRows} />
          </ChartCard>
        )}

        {metricsUp && (
          <ChartCard
            ariaLabel="Learning activity" title="Learning activity"
            headline={sumOf(windowRows, 'task_completions').toLocaleString('en')}
            subtitle={`tasks completed over ${days} days`}
            isLoading={loading}
            legend={(
              <LegendChips items={[
                { label: 'Tasks completed', color: SERIES.completions },
                { label: 'Evidence uploads', color: SERIES.evidence },
                { label: 'Quests started', color: SERIES.starts },
              ]} />
            )}
          >
            <LearningActivityChart rows={windowRows} />
          </ChartCard>
        )}

        {metricsUp && (
          <ChartCard
            ariaLabel="Sign-in and registration health" title="Sign-in & registration health"
            headline={logins ? `${logins.pct}%` : '—'}
            subtitle={[
              logins && `${logins.failed.toLocaleString('en')} of ${logins.attempts.toLocaleString('en')} sign-ins failed`,
              registrations && `registrations: ${registrations.failed.toLocaleString('en')} of ${registrations.attempts.toLocaleString('en')} failed`,
            ].filter(Boolean).join(' · ') || `no attempts in ${days} days`}
            isLoading={loading}
            legend={(
              <LegendChips items={[
                { label: 'Succeeded', color: STATUS.good, glyph: '✓' },
                { label: 'Failed', color: STATUS.critical, glyph: '✕' },
              ]} />
            )}
            height="h-40"
          >
            <div className="grid grid-cols-2 gap-3 h-full">
              <div className="flex flex-col min-h-0">
                <p className="text-[11px] text-gray-500 mb-1">Sign-ins</p>
                <div className="flex-1 min-h-0">
                  <AuthStackChart
                    rows={windowRows} okKey="login_success" failKey="login_failed"
                    okLabel="Succeeded" failLabel="Failed"
                  />
                </div>
              </div>
              <div className="flex flex-col min-h-0">
                <p className="text-[11px] text-gray-500 mb-1">Registrations</p>
                <div className="flex-1 min-h-0">
                  <AuthStackChart
                    rows={windowRows} okKey="reg_success" failKey="reg_failed"
                    okLabel="Succeeded" failLabel="Failed"
                  />
                </div>
              </div>
            </div>
          </ChartCard>
        )}

        {servicesUp && (
          <ChartCard
            ariaLabel="AI cost by service" title="AI cost by service"
            headline={formatCost(services.reduce((s, r) => s + r.cost, 0))}
            subtitle={`over ${days} days`}
            isLoading={serviceQuery.isLoading}
          >
            {services.length > 0 ? (
              <CostByServiceChart rows={services} />
            ) : (
              <p className="text-xs text-gray-400">No AI calls logged in this window.</p>
            )}
          </ChartCard>
        )}

        {metricsUp && (
          <ChartCard
            ariaLabel="SIS payments collected" title="SIS payments collected"
            headline={formatDollars(revenue90)}
            subtitle="weekly, last 90 days"
            isLoading={loading}
          >
            <SisRevenueChart rows={weekly} />
          </ChartCard>
        )}
      </div>
    </section>
  )
}
