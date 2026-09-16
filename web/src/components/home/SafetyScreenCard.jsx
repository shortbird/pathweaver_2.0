import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getScreenStats } from '../../services/moderationAPI'
import { formatCost } from './AICostChart'

/**
 * The safety screen's tracker, for SuperadminHome.
 *
 * Every text a student writes to other students -- a class chat message, a
 * friend message, a comment on a friend's work -- passes the screen
 * (backend/services/peer_text_screen_service.py). This card answers the
 * three questions a superadmin has about it: is it running (screened, and
 * model calls that failed), what is it catching (held), and is it keeping up
 * (waiting = posted while the model was down and not yet swept). Cost is the
 * model's own bill for the window, from ai_usage_logs.
 *
 * Degrades silently like the other home tiles: on error it renders nothing.
 */

const RANGES = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
]

const SURFACES = [
  { key: 'group_message', label: 'Class chat' },
  { key: 'message', label: 'Direct messages' },
  { key: 'peer_comment', label: 'Friend comments' },
  // Pictures a student uploaded on their own (evidence, avatars, feed).
  // Nothing is "screened" as a row here; a hold is the only trace.
  { key: 'upload', label: 'Uploads' },
]

/**
 * One surface's numbers. "Screened" counts every text the screen judged in
 * the window: the rows it let through (clear, pending, or hidden later) plus
 * the ones it refused, which never became rows. "Held" is what it stopped,
 * before or after posting. "Waiting" is the all-time pending backlog.
 */
export function surfaceTotals(stats) {
  const s = stats || {}
  const rows = Number(s.screened) || 0
  const refused = Number(s.refused) || 0
  const hiddenLater = Number(s.hidden_later) || 0
  return {
    screened: rows + refused,
    held: refused + hiddenLater,
    waiting: Number(s.pending) || 0,
    byAdults: Number(s.by_adults) || 0,
  }
}

export function grandTotals(surfaces) {
  const out = { screened: 0, held: 0, waiting: 0, byAdults: 0 }
  for (const { key } of SURFACES) {
    const t = surfaceTotals(surfaces?.[key])
    out.screened += t.screened
    out.held += t.held
    out.waiting += t.waiting
    out.byAdults += t.byAdults
  }
  return out
}

/** 96,400 -> "96K"; small counts stay exact. */
export function compactCount(n) {
  const v = Number(n) || 0
  if (v >= 10000) {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
  }
  return v.toLocaleString('en')
}

export default function SafetyScreenCard() {
  const [days, setDays] = useState(7)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['home', 'superadmin', 'screen-stats', days],
    queryFn: () => getScreenStats(days),
    staleTime: 60_000,
    retry: false,
  })

  if (isError) return null

  const totals = grandTotals(data?.surfaces)
  const model = data?.model || {}
  const tokens = (Number(model.input_tokens) || 0) + (Number(model.output_tokens) || 0)
  const failed = Number(model.failed_calls) || 0
  const csam = data?.csam || {}
  const reviews = data?.reviews || {}
  // 'off' until a PhotoDNA key exists: a zero under matches means nothing then.
  const hashMatchOff = !data?.csam_provider || data.csam_provider === 'off'
  const csamMatches = Number(csam.matches) || 0
  const csamUnreported = Number(csam.unreported) || 0

  return (
    <section aria-label="Safety screen" className="mt-8">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Safety screen</h2>
            {isLoading ? (
              <div className="animate-pulse mt-2 h-8 w-40 bg-gray-100 rounded" />
            ) : (
              <>
                <p className="text-3xl font-bold text-gray-900 mt-1 tabular-nums">
                  {compactCount(totals.screened)}
                  <span className="text-base font-medium text-gray-500"> screened</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  <span className={totals.held > 0 ? 'text-amber-700 font-semibold' : ''}>
                    {compactCount(totals.held)} held
                  </span>
                  {totals.byAdults > 0 && (
                    <span className="text-red-700 font-semibold"> ({compactCount(totals.byAdults)} by adults)</span>
                  )}
                  {' · '}
                  <span className={totals.waiting > 0 ? 'text-red-700 font-semibold' : ''}>
                    {compactCount(totals.waiting)} waiting
                  </span>
                  {' · '}
                  {formatCost(model.cost_usd)} model cost over {days} days
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

        {!isLoading && (
          <table className="w-full mt-4 text-sm" data-testid="safety-screen-table">
            <thead>
              <tr className="text-xs text-gray-500">
                <th scope="col" className="text-left font-medium pb-1">Surface</th>
                <th scope="col" className="text-right font-medium pb-1">Screened</th>
                <th scope="col" className="text-right font-medium pb-1">Held</th>
                <th scope="col" className="text-right font-medium pb-1">Waiting</th>
              </tr>
            </thead>
            <tbody>
              {SURFACES.map(({ key, label }) => {
                const t = surfaceTotals(data?.surfaces?.[key])
                return (
                  <tr key={key} className="border-t border-gray-100">
                    <th scope="row" className="text-left font-normal text-gray-700 py-1.5">{label}</th>
                    <td className="text-right tabular-nums text-gray-900 py-1.5">{compactCount(t.screened)}</td>
                    <td className={`text-right tabular-nums py-1.5 ${t.held > 0 ? 'text-amber-700 font-semibold' : 'text-gray-900'}`}>
                      {compactCount(t.held)}
                    </td>
                    <td className={`text-right tabular-nums py-1.5 ${t.waiting > 0 ? 'text-red-700 font-semibold' : 'text-gray-900'}`}>
                      {compactCount(t.waiting)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {!isLoading && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 mt-4 text-xs" data-testid="safety-screen-layers">
            <dt className="text-gray-500">Known-CSAM hash match</dt>
            <dd className={`text-right tabular-nums ${csamMatches > 0 ? 'text-red-700 font-bold' : hashMatchOff ? 'text-amber-700 font-semibold' : 'text-gray-900'}`}>
              {hashMatchOff
                ? 'off (no provider key)'
                : `${compactCount(csamMatches)} match${csamMatches === 1 ? '' : 'es'}${csamUnreported > 0 ? `, ${compactCount(csamUnreported)} unreported` : ''}`}
            </dd>
            <dt className="text-gray-500">Nightly conversation review</dt>
            <dd className={`text-right tabular-nums ${Number(reviews.flagged) > 0 ? 'text-amber-700 font-semibold' : 'text-gray-900'}`}>
              {compactCount(reviews.reviewed)} read, {compactCount(reviews.flagged)} flagged
            </dd>
          </dl>
        )}

        <div className="flex items-center justify-between gap-4 flex-wrap mt-3">
          <p className="text-[11px] text-gray-400">
            {isLoading ? '' : (
              <>
                {compactCount(model.calls)} model call{Number(model.calls) === 1 ? '' : 's'}
                {tokens > 0 && ` · ${compactCount(tokens)} tokens`}
                {failed > 0 && (
                  <span className="text-red-700 font-semibold"> · {compactCount(failed)} failed</span>
                )}
                {'. Waiting texts posted while the model was down; the ten-minute sweep screens them.'}
              </>
            )}
          </p>
          <Link
            to="/admin/moderation?tab=holds"
            className="text-xs font-semibold text-optio-purple hover:underline"
          >
            Review holds
          </Link>
        </div>
      </div>
    </section>
  )
}
