import React from 'react'
import { DAY_LETTER, fmt12ap } from '../../../components/sis/classFields'
import {
  EMPTY_FILTER, classMatchesRosterFilter, isFilterEmpty, rosterSelectionSummary, startTimesOf,
} from './rosterClassFilter'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * Which classes go into the Class rosters sheet.
 *
 * Tickboxes, not a multi-select: picking eight classes out of 152 by
 * ctrl-click is a trap, and one stray click cleared the lot (iCreate,
 * 2026-08-19). Search and the day / start-time / age filters narrow what is
 * SHOWN, never what is ticked (2026-09-14, 73963487 / c8affdb2) -- a class
 * picked before a filter hid it stays in the report, and the summary line
 * says so.
 */
export default function RosterClassPicker({
  classList, filter, setFilter, selectedIds, setSelectedIds,
  includeWaitlist, setIncludeWaitlist, includeArchived, setIncludeArchived,
}) {
  const setF = (patch) => setFilter((f) => ({ ...f, ...patch }))
  const shown = classList.filter((c) => classMatchesRosterFilter(c, filter))
  const shownIds = shown.map((c) => c.id)
  const allShownPicked = shownIds.length > 0 && shownIds.every((id) => selectedIds.includes(id))

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={filter.search}
          onChange={(e) => setF({ search: e.target.value })}
          placeholder="Search classes or teachers"
          aria-label="Search classes"
          className="flex-1 min-w-[160px] rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple" />
        <select value={filter.time} onChange={(e) => setF({ time: e.target.value })}
          aria-label="Start time"
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white">
          <option value="">Any time</option>
          {startTimesOf(classList).map((t) => (
            <option key={t} value={t}>{fmt12ap(t)}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-neutral-600">
          Age
          <input type="number" min={0} max={99} value={filter.age}
            onChange={(e) => setF({ age: e.target.value })}
            aria-label="Age"
            className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
        </label>
      </div>
      <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Days">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => {
          const on = filter.days.includes(d)
          return (
            <button key={d} type="button" aria-pressed={on} aria-label={DAY_NAMES[d]}
              onClick={() => setF({ days: on ? filter.days.filter((x) => x !== d) : [...filter.days, d] })}
              className={`px-2 py-0.5 rounded-full text-xs border ${on
                ? 'bg-optio-purple text-white border-optio-purple'
                : 'bg-white text-neutral-600 border-gray-300 hover:border-optio-purple'}`}>
              {DAY_LETTER[d]}
            </button>
          )
        })}
        {!isFilterEmpty(filter) && (
          <button type="button" onClick={() => setFilter(EMPTY_FILTER)}
            className="ml-1 text-xs text-neutral-500 hover:underline">
            Clear filters
          </button>
        )}
      </div>
      <div role="group" aria-label="Classes"
        className="max-h-56 overflow-y-auto border border-gray-300 rounded-lg p-2 space-y-1 bg-white">
        {!classList.length && (
          <p className="text-xs text-neutral-400">No classes to choose from.</p>
        )}
        {classList.length > 0 && !shown.length && (
          <p className="text-xs text-neutral-400">No class matches those filters.</p>
        )}
        {shown.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" className="accent-optio-purple"
              checked={selectedIds.includes(c.id)}
              onChange={(e) => setSelectedIds((ids) => (
                e.target.checked ? [...ids, c.id] : ids.filter((id) => id !== c.id)))} />
            <span className="truncate">{c.name}</span>
            {c.status === 'archived' && (
              <span className="text-xs text-neutral-400 shrink-0">archived</span>
            )}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button"
          disabled={!shownIds.length || allShownPicked}
          onClick={() => setSelectedIds((ids) => [...new Set([...ids, ...shownIds])])}
          className="text-xs text-optio-purple hover:underline disabled:text-neutral-400 disabled:no-underline">
          {isFilterEmpty(filter) ? 'Select all' : `Select all shown (${shownIds.length})`}
        </button>
        {selectedIds.length > 0 && (
          <button type="button" onClick={() => setSelectedIds([])}
            className="text-xs text-neutral-500 hover:underline">
            Clear
          </button>
        )}
        <label className="flex items-center gap-1.5 text-sm text-neutral-600">
          <input type="checkbox" aria-label="Include waitlisted students"
            className="accent-optio-purple"
            checked={includeWaitlist}
            onChange={(e) => setIncludeWaitlist(e.target.checked)} />
          Include waitlist
        </label>
        <label className="flex items-center gap-1.5 text-sm text-neutral-600">
          <input type="checkbox" aria-label="Include archived classes in the list"
            className="accent-optio-purple"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)} />
          Include archived
        </label>
      </div>
      <p className="text-xs text-neutral-500">
        {selectedIds.length ? rosterSelectionSummary(selectedIds, shownIds) : 'Choose one or more classes.'}
      </p>
    </div>
  )
}
