import React from 'react'
import { ANSWER_SORTS, EMPTY_ANSWER_FILTERS, NONE, answerFilterOptions, hasActiveFilters } from './answerFilterRules'

/**
 * Filter and sort the Registration answers report without re-running it.
 * iCreate ticket 50616794 (see answerFilterRules.js for the rules).
 */
const selectCls = 'border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white'

const Field = ({ label, children }) => (
  <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
    {label}
    {children}
  </label>
)

export default function AnswerFilters({ rows, filters, setFilters, shown, sortKey, onSort }) {
  const opts = answerFilterOptions(rows)
  const set = (key) => (e) => setFilters({ ...filters, [key]: e.target.value })
  const total = (rows || []).length

  return (
    <fieldset className="no-print mb-4 rounded-lg border border-gray-200 bg-neutral-50/60 px-3 py-3">
      <legend className="sr-only">Filter families</legend>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <Field label="Answer">
          <select aria-label="Filter by answer" value={filters.answer} onChange={set('answer')} className={selectCls}>
            <option value="">Any answer</option>
            {opts.answers.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="City">
          <select aria-label="Filter by city" value={filters.city} onChange={set('city')} className={selectCls}>
            <option value="">Any city</option>
            {opts.cities.map((c) => <option key={c} value={c}>{c}</option>)}
            {opts.noCity && <option value={NONE}>No city on file</option>}
          </select>
        </Field>
        <Field label="Form of payment (their answer)">
          <select aria-label="Filter by form of payment" value={filters.payment} onChange={set('payment')} className={selectCls}>
            <option value="">Any</option>
            {opts.payments.map((p) => <option key={p} value={p}>{p}</option>)}
            {opts.noPayment && <option value={NONE}>Did not say</option>}
          </select>
        </Field>
        <Field label="Days per week">
          <select aria-label="Filter by days per week" value={filters.days} onChange={set('days')} className={selectCls}>
            <option value="">Any</option>
            {opts.days.map((d) => (
              <option key={d} value={String(d)}>
                {d === 0 ? 'No scheduled classes' : `${d} day${d === 1 ? '' : 's'}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Child age">
          <span className="flex items-center gap-1.5">
            <input type="number" min="0" max="25" inputMode="numeric" aria-label="Youngest age"
              placeholder="from" value={filters.ageMin} onChange={set('ageMin')}
              className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            <span className="text-neutral-400">to</span>
            <input type="number" min="0" max="25" inputMode="numeric" aria-label="Oldest age"
              placeholder="to" value={filters.ageMax} onChange={set('ageMax')}
              className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </span>
        </Field>
        <Field label="Sort by">
          <select aria-label="Sort families by" value={sortKey} onChange={(e) => onSort(e.target.value)} className={selectCls}>
            {sortKey === '' && <option value="">Custom (column headers)</option>}
            {ANSWER_SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-neutral-500 flex-wrap">
        <span>Showing {shown} of {total}</span>
        {hasActiveFilters(filters) && (
          <button type="button" onClick={() => setFilters(EMPTY_ANSWER_FILTERS)}
            className="text-optio-purple hover:underline">Clear filters</button>
        )}
        <span className="text-neutral-400">
          Age and days per week are checked child by child: both must fit the same child.
          Days per week counts the weekdays a child&apos;s classes meet.
        </span>
      </div>
    </fieldset>
  )
}
