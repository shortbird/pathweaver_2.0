import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import api from '../../services/api'

/**
 * AI API cost over time, for SuperadminHome.
 *
 * Reads the existing /api/admin/ai/costs/trends endpoint (superadmin-gated,
 * paged with fetch_all_rows so it doesn't truncate at PostgREST's 1000-row cap).
 *
 * Single series -> area chart in one hue, no legend: the title names it. Days
 * with no AI calls are zero-filled rather than skipped, so a flat stretch reads
 * as "nothing was spent" instead of looking like missing data.
 *
 * Degrades silently like the other home tiles: on error it renders nothing
 * rather than an error wall.
 */

// The endpoint caps at 90 days.
const RANGES = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
]

const SERIES_COLOR = '#6D469B' // optio-purple

/** Costs here run to fractions of a cent, so precision scales with magnitude. */
export function formatCost(value) {
  const n = Number(value) || 0
  if (n === 0) return '$0'
  if (n < 0.01) return `$${n.toFixed(4)}`
  if (n < 1) return `$${n.toFixed(3)}`
  return `$${n.toFixed(2)}`
}

/**
 * One point per calendar day across the whole window, ascending.
 *
 * The API omits days with no activity entirely. Feeding those gaps straight to
 * a time axis would draw a straight line between distant dates and silently
 * misstate when spend actually happened.
 */
export function zeroFillDays(trends, days, today = new Date()) {
  const byDate = new Map(
    (Array.isArray(trends) ? trends : [])
      .filter(t => t && typeof t.date === 'string')
      .map(t => [t.date.slice(0, 10), t])
  )

  const out = []
  const end = new Date(Date.UTC(
    today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()
  ))
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end)
    d.setUTCDate(d.getUTCDate() - i)
    const key = d.toISOString().slice(0, 10)
    const hit = byDate.get(key)
    out.push({
      date: key,
      cost: Number(hit?.cost_usd) || 0,
      requests: Number(hit?.requests) || 0,
      tokens: Number(hit?.tokens) || 0,
    })
  }
  return out
}

/** "Aug 13" — short enough for a dense axis. */
function shortDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function CostTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-xs">
      <p className="font-semibold text-gray-900">{shortDate(point.date)}</p>
      <p className="text-gray-700 mt-1">{formatCost(point.cost)}</p>
      <p className="text-gray-500">
        {point.requests.toLocaleString('en')} call{point.requests === 1 ? '' : 's'}
        {point.tokens > 0 && ` · ${point.tokens.toLocaleString('en')} tokens`}
      </p>
    </div>
  )
}

export default function AICostChart() {
  const [days, setDays] = useState(30)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['home', 'superadmin', 'ai-costs', days],
    queryFn: async () => (await api.get('/api/admin/ai/costs/trends', {
      params: { days },
    })).data,
    staleTime: 60_000,
    retry: false,
  })

  const series = useMemo(
    () => zeroFillDays(data?.trends, days),
    [data, days]
  )
  const total = useMemo(
    () => series.reduce((sum, p) => sum + p.cost, 0),
    [series]
  )
  const totalCalls = useMemo(
    () => series.reduce((sum, p) => sum + p.requests, 0),
    [series]
  )

  // Same silent-degrade contract as the stat tiles: an outage leaves the rest
  // of the home intact rather than showing an error.
  if (isError) return null

  return (
    <section aria-label="AI API cost" className="mt-8">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">AI API cost</h2>
            {isLoading ? (
              <div className="animate-pulse mt-2 h-8 w-24 bg-gray-100 rounded" />
            ) : (
              <>
                <p className="text-3xl font-bold text-gray-900 mt-1 tabular-nums">
                  {formatCost(total)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {totalCalls.toLocaleString('en')} logged call
                  {totalCalls === 1 ? '' : 's'} over {days} days
                </p>
              </>
            )}
          </div>

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

        <div className="h-48 mt-4" data-testid="ai-cost-chart">
          {isLoading ? (
            <div className="animate-pulse h-full w-full bg-gray-50 rounded" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="aiCostFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES_COLOR} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={SERIES_COLOR} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                {/* Recessive grid: horizontal only, so the line stays the subject. */}
                <CartesianGrid vertical={false} stroke="#F3F4F6" />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  tick={{ fontSize: 11, fill: '#9CA3AF' }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis
                  tickFormatter={formatCost}
                  tick={{ fontSize: 11, fill: '#9CA3AF' }}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                />
                <Tooltip content={<CostTooltip />} cursor={{ stroke: '#D1D5DB', strokeWidth: 1 }} />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke={SERIES_COLOR}
                  strokeWidth={2}
                  fill="url(#aiCostFill)"
                  // Dots only appear on hover; one per day would be noise.
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: '#FFFFFF' }}
                  name="Cost"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <p className="text-[11px] text-gray-400 mt-3">
          Costs are estimates from logged token usage. Calls made before
          13 Aug 2026 undercount: most generation paths were not instrumented
          until then.
        </p>
      </div>
    </section>
  )
}
