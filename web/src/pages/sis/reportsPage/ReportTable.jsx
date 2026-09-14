import React from 'react'

/**
 * The generic report output: an optional column picker, then a table whose
 * headers carry a tiered sort. Every report that is a list of rows renders
 * through this; the roster-shaped ones (day, block) have their own views.
 *
 * "On class report, please make it sortable like Classes under academics …
 * It's the tiered sort!" (iCreate, 2026-08-24). Click a column to sort by it;
 * click another to add a deeper level; click again to flip, then remove.
 */
export default function ReportTable({
  report, rows, sort, onSort, onClearSort, onToggleColumn, lockedColumn, statusCol,
}) {
  return (
    <>
      {report.fields && (
        <fieldset className="no-print mb-4 rounded-lg border border-gray-200 bg-neutral-50/60 px-3 py-2">
          <legend className="sr-only">Columns</legend>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">Columns</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5">
            {report.fields.map((f) => (
              <label key={f.key} className="flex items-start gap-2 text-sm text-neutral-700 cursor-pointer">
                <input
                  type="checkbox"
                  aria-label={f.label}
                  className="mt-0.5 accent-optio-purple shrink-0"
                  checked={report.selected.includes(f.key)}
                  disabled={lockedColumn(f.key)}
                  title={lockedColumn(f.key) ? 'Needed while waitlisted students are included' : undefined}
                  onChange={() => onToggleColumn(f.key)}
                />
                <span className="leading-tight">
                  <span className="block font-medium text-neutral-800">{f.label}</span>
                  {f.hint && <span className="block text-[11px] text-neutral-500">{f.hint}</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {rows.length === 0 ? (
        <p className="text-neutral-500">No matching records.</p>
      ) : (
        <div className="overflow-x-auto">
          {sort.length > 1 && (
            <div className="flex items-center gap-2 pb-2 text-xs text-neutral-500">
              <span>
                Sorted by {sort.map((s, i) => `${i + 1}. ${report.columns[s.col]}${s.dir === 'desc' ? ' ↓' : ' ↑'}`).join(', ')}
              </span>
              <button type="button" onClick={onClearSort} className="text-optio-purple hover:underline">Clear</button>
              <span className="text-neutral-300 hidden sm:inline">
                · Click a column to add a deeper level; click again to flip or remove it.
              </span>
            </div>
          )}
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-200">
                {report.columns.map((c, j) => {
                  const idx = sort.findIndex((s) => s.col === j)
                  const entry = idx === -1 ? null : sort[idx]
                  return (
                    <th key={c} className="py-2 pr-4 font-semibold text-neutral-700">
                      <button type="button" onClick={() => onSort(j)}
                        className="inline-flex items-center gap-1 hover:text-optio-purple">
                        {c}
                        <span className={`text-[10px] ${entry ? 'text-optio-purple' : 'text-neutral-400'}`}>
                          {entry ? (entry.dir === 'asc' ? '▲' : '▼') : '↕'}
                          {entry && sort.length > 1 ? <span className="font-bold ml-0.5">{idx + 1}</span> : null}
                        </span>
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const waiting = statusCol >= 0 && row[statusCol] && row[statusCol] !== 'Enrolled'
                return (
                  <tr key={i} className={`border-b border-gray-100 align-top ${waiting ? 'bg-amber-50' : ''}`}>
                    {row.map((cell, j) => (
                      <td key={j} className="py-2 pr-4 text-neutral-800">
                        {j === statusCol && waiting ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{cell}</span>
                        ) : (cell || '')}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
