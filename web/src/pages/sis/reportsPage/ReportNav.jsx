import React from 'react'
import { GROUPS } from './catalog'

/**
 * The list of reports, grouped. A sidebar from md up; a single select below
 * that, because fifteen stacked rows above the report would push the report
 * itself off a phone screen.
 */
export default function ReportNav({ reports, activeKey, onPick }) {
  const groups = GROUPS
    .map((g) => ({ ...g, items: reports.filter((r) => r.group === g.key) }))
    .filter((g) => g.items.length)

  return (
    <>
      <label className="md:hidden block">
        <span className="sr-only">Report</span>
        <select value={activeKey} onChange={(e) => onPick(e.target.value)}
          aria-label="Report"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
          {groups.map((g) => (
            <optgroup key={g.key} label={g.label}>
              {g.items.map((r) => <option key={r.key} value={r.key}>{r.title}</option>)}
            </optgroup>
          ))}
        </select>
      </label>

      <nav aria-label="Reports" className="hidden md:block space-y-5">
        {groups.map((g) => (
          <div key={g.key}>
            <div className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              {g.label}
            </div>
            <ul className="space-y-0.5">
              {g.items.map((r) => {
                const active = r.key === activeKey
                return (
                  <li key={r.key}>
                    <button type="button" onClick={() => onPick(r.key)}
                      aria-current={active ? 'page' : undefined}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${active
                        ? 'bg-optio-purple/10 text-optio-purple font-semibold'
                        : 'text-neutral-700 hover:bg-gray-100'}`}>
                      {r.title}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  )
}
