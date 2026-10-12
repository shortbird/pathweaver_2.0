import React, { useMemo, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { timeAgo } from '../../utils/timeFormat'
import { RangeToggle } from './PlatformMetricsSection'

/**
 * Activity by organization, for SuperadminHome.
 *
 * The DAU line above it says whether the platform is busy; this says which
 * school is. One row per organization from admin_org_activity (counted in
 * Postgres, cached five minutes server-side), plus a "No organization" row
 * for platform families. The range toggle refetches: every column is a
 * window count and the previous window comes with it, so each row can say
 * whether it is rising or falling.
 *
 * The flag is the point of the card. On 2026-10-12 it would have named
 * Williamsburg (47 members, 1 active) and The Treehouse (41 members, no task
 * in a month) -- schools that looked fine on the platform total. A school is
 * flagged when, with people in it, few of them show up, its students stopped
 * finishing work, or its activity halved against the last window.
 *
 * Columns earn their place by answering "should I reach out?" (Tanner,
 * 2026-10-12: the first cut was too dense). So: how many people are active
 * and what share of the school that is, how that moved against the last
 * window, whether work is still being finished, and when anyone was last
 * seen. Messages, quiet students and SIS alerts were cut from the table; the
 * School Dashboard shows the school its own quiet students. The default sort
 * puts the biggest drop first.
 */

export const LOW_ACTIVE_SHARE = 0.2
const MIN_MEMBERS_TO_JUDGE = 5

/** Why a row needs a look, as short phrases; [] when it does not. */
export function attentionReasons(row) {
  const members = Number(row?.members) || 0
  if (members < MIN_MEMBERS_TO_JUDGE) return []
  const reasons = []
  const active = Number(row.active_users) || 0
  if (active / members < LOW_ACTIVE_SHARE) reasons.push('few people active')
  if ((Number(row.students) || 0) > 0 && (Number(row.tasks) || 0) === 0) reasons.push('no tasks done')
  const prev = Number(row.active_users_prev) || 0
  if (prev >= MIN_MEMBERS_TO_JUDGE && active <= prev / 2) reasons.push('activity halved')
  return reasons
}

/** Change against the previous window: { dir: 'up'|'down'|'flat', pct } or null. */
export function trend(now, prev) {
  const a = Number(now) || 0
  const b = Number(prev) || 0
  if (a === 0 && b === 0) return null
  if (b === 0) return { dir: 'up', pct: null }
  const pct = Math.round(((a - b) / b) * 100)
  if (Math.abs(pct) < 10) return { dir: 'flat', pct }
  return { dir: pct > 0 ? 'up' : 'down', pct }
}

function Trend({ now, prev }) {
  const t = trend(now, prev)
  if (!t || t.dir === 'flat') return null
  const up = t.dir === 'up'
  return (
    <span
      className={`ml-1 text-[11px] font-medium ${up ? 'text-green-700' : 'text-red-700'}`}
      title={`Previous window: ${Number(prev || 0).toLocaleString('en')}`}
    >
      {up ? '▲' : '▼'}{t.pct == null ? '' : ` ${Math.abs(t.pct)}%`}
    </span>
  )
}

/** The change column: the reach-out signal, so it reads in words-and-arrow, not color alone. */
function Change({ row }) {
  const pct = activeChange(row)
  if (pct == null) return <span className="text-gray-400">—</span>
  if (Math.abs(pct) < 10) return <span className="text-gray-500">steady</span>
  const up = pct > 0
  return (
    <span className={`font-medium ${up ? 'text-green-700' : 'text-red-700'}`}
      title={`${Number(row.active_users_prev).toLocaleString('en')} active in the period before`}>
      {up ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  )
}

/** The active share as a thin bar: length carries the value, the number sits beside it. */
function ShareBar({ active, members }) {
  const share = members > 0 ? Math.min(active / members, 1) : 0
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-14 h-1.5 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
        <span className="block h-full rounded-full bg-optio-purple" style={{ width: `${share * 100}%` }} />
      </span>
      <span className="tabular-nums text-gray-500 text-xs">{Math.round(share * 100)}%</span>
    </span>
  )
}

const COLUMNS = [
  { key: 'name', label: 'Organization (members)', numeric: false },
  { key: 'share', label: 'Active people', numeric: true },
  { key: 'change', label: 'vs. last period', numeric: true },
  { key: 'tasks', label: 'Tasks done', numeric: true },
  { key: 'last_seen', label: 'Last seen', numeric: false },
]

/** Percent change in active people against the previous window; null when there is no base. */
export function activeChange(row) {
  const prev = Number(row?.active_users_prev) || 0
  if (prev === 0) return null
  return Math.round((((Number(row.active_users) || 0) - prev) / prev) * 100)
}

function sortValue(row, key) {
  if (key === 'share') return row.members > 0 ? row.active_users / row.members : null
  if (key === 'change') return activeChange(row)
  if (key === 'last_seen') return row.last_seen ? Date.parse(row.last_seen) : null
  if (key === 'name') return String(row.name || '').toLowerCase()
  return Number(row[key]) || 0
}

/** Sorts by `key`; a row with nothing to compare (no members, no last window) goes last either way. */
export function sortRows(rows, { key, dir }) {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key)
    const vb = sortValue(b, key)
    if (va == null && vb != null) return 1
    if (vb == null && va != null) return -1
    if (va < vb) return -1 * sign
    if (va > vb) return 1 * sign
    return String(a.name).localeCompare(String(b.name))
  })
}

export default function OrgActivitySection() {
  const [days, setDays] = useState(30)
  const [sort, setSort] = useState({ key: 'change', dir: 'asc' })
  const [onlyFlagged, setOnlyFlagged] = useState(false)

  const query = useQuery({
    queryKey: ['home', 'superadmin', 'org-activity', days],
    queryFn: async () =>
      (await api.get('/api/admin/platform-metrics/orgs', { params: { days } })).data,
    staleTime: 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  })

  const rows = useMemo(() => {
    const list = Array.isArray(query.data?.orgs) ? query.data.orgs : []
    return list.map(r => ({ ...r, reasons: attentionReasons(r) }))
  }, [query.data])
  const flagged = rows.filter(r => r.reasons.length > 0)
  const visible = useMemo(
    () => sortRows(onlyFlagged ? flagged : rows, sort),
    [rows, flagged, onlyFlagged, sort],
  )

  if (query.isError) return null

  const toggleSort = key => setSort(prev => (
    prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'name' ? 'asc' : 'desc' }
  ))

  return (
    <section aria-label="Activity by organization" className="mt-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Activity by organization</h2>
          <p className="text-xs text-gray-500">
            People who used Optio in the last {days} days, against the {days} days before.
          </p>
        </div>
        <RangeToggle days={days} onChange={setDays} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mt-3">
        <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3 border-b border-gray-100">
          <p className="text-sm text-gray-700">
            {query.isLoading ? 'Loading…' : (
              flagged.length > 0
                ? <><span className="font-semibold text-red-700">{flagged.length}</span> of {rows.length} need a look</>
                : `All ${rows.length} organizations look healthy`
            )}
          </p>
          {flagged.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox" checked={onlyFlagged}
                onChange={e => setOnlyFlagged(e.target.checked)}
                className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
              />
              Only those needing a look
            </label>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                {COLUMNS.map(c => (
                  <th key={c.key} scope="col" className={`px-5 py-2 font-medium whitespace-nowrap ${c.key === 'name' ? '' : 'text-right'}`}>
                    <button
                      type="button" onClick={() => toggleSort(c.key)}
                      className="hover:text-gray-900"
                      aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      {c.label}{sort.key === c.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map(r => {
                const to = r.organization_id ? `/admin/organizations/${r.organization_id}` : '/admin/users'
                const members = Number(r.members) || 0
                return (
                  <tr key={r.organization_id || 'none'} className="hover:bg-gray-50">
                    <td className="px-5 py-2">
                      <span className="flex items-center gap-2 flex-wrap">
                        <Link to={to} className="font-medium text-gray-900 hover:text-optio-purple">
                          {String(r.name || '').trim()}
                        </Link>
                        <span className="text-xs text-gray-400">{members.toLocaleString('en')}</span>
                        {r.reasons.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                            <span aria-hidden="true">!</span> {r.reasons.join(', ')}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-5 py-2 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-3">
                        <span className="tabular-nums text-gray-900">
                          {Number(r.active_users).toLocaleString('en')}
                          <span className="text-gray-400"> of {members.toLocaleString('en')}</span>
                        </span>
                        <ShareBar active={Number(r.active_users) || 0} members={members} />
                      </span>
                    </td>
                    <td className="px-5 py-2 text-right whitespace-nowrap tabular-nums">
                      <Change row={r} />
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums whitespace-nowrap">
                      {Number(r.tasks).toLocaleString('en')}
                      <Trend now={r.tasks} prev={r.tasks_prev} />
                    </td>
                    <td className="px-5 py-2 text-right text-gray-500 whitespace-nowrap">
                      {r.last_seen ? timeAgo(r.last_seen) : 'Never'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
