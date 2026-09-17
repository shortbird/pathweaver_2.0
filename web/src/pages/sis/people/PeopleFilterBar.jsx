import React from 'react'
import { PaymentFilterSelect } from '../PaymentMethodPills'
import { roleChipOptions, statusOptions, familyOptions, RECENT_DAYS } from './peopleFilters'

const chip = (active) => `px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
  active ? 'bg-optio-purple text-white border-optio-purple'
    : 'bg-white text-neutral-600 border-gray-200 hover:bg-neutral-50'}`

const select = 'rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-optio-purple'

/**
 * The filter bar over the one People table. Every option is built from the
 * rows, with a count, and an option nobody matches is not offered: the bar
 * describes this school, not every school.
 */
const PeopleFilterBar = ({ rows, filters, onChange }) => {
  const set = (patch) => onChange({ ...filters, ...patch })
  const roles = roleChipOptions(rows, filters)
  const statuses = statusOptions(rows, filters)
  const families = familyOptions(rows, filters)
  const everyone = rows.length

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search by name, email, phone, or family…"
          aria-label="Search people"
          className="flex-1 min-w-[220px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
        />
        {statuses.length > 0 && (
          <select value={filters.status} onChange={(e) => set({ status: e.target.value })}
            aria-label="Status" className={select}>
            <option value="">Any status</option>
            {statuses.map((s) => (
              <option key={s.key} value={s.key}>{s.label} ({s.count})</option>
            ))}
          </select>
        )}
        {families.length > 0 && (
          <select value={filters.family} onChange={(e) => set({ family: e.target.value })}
            aria-label="Family" className={select}>
            <option value="">Any family</option>
            {families.map((o) => (
              <option key={o.key} value={o.key}>{o.label} ({o.count})</option>
            ))}
          </select>
        )}
        <PaymentFilterSelect rows={rows} value={filters.pay} onChange={(v) => set({ pay: v })} className="py-1.5" />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Role">
          <button type="button" onClick={() => set({ role: '' })} aria-pressed={!filters.role}
            className={chip(!filters.role)}>
            Everyone ({everyone})
          </button>
          {roles.map((r) => (
            <button key={r.key} type="button" onClick={() => set({ role: filters.role === r.key ? '' : r.key })}
              aria-pressed={filters.role === r.key} className={chip(filters.role === r.key)}>
              {r.label} ({r.count})
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-600 select-none">
          <input type="checkbox" checked={filters.recent}
            onChange={(e) => set({ recent: e.target.checked })}
            className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
          Joined in the last {RECENT_DAYS} days
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-600 select-none">
          <input type="checkbox" checked={!filters.showFormer}
            onChange={(e) => set({ showFormer: !e.target.checked })}
            className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
          Hide withdrawn, graduated &amp; archived
        </label>
      </div>
    </div>
  )
}

export default PeopleFilterBar
