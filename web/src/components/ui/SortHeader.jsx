import React from 'react'

/**
 * A sortable column header: the `<th>`, the button, the arrow, the aria.
 *
 * Six tables carried their own copy with five different sort-state models
 * (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, L3); this is the header
 * once, over the two models that survive:
 *
 *   sort = { key, dir }            one column at a time (most tables)
 *   sort = [{ key, dir }, ...]     ordered tiebreakers (the classes table:
 *                                  freeze day, then sort within it by time);
 *                                  the level shows as a small number
 *
 * `onSort(col)` is the caller's toggle -- what a click means (flip the
 * direction, add a tiebreaker, reset) is the table's business. An inactive
 * column shows a faint up-down glyph so it reads as sortable; `hint` names
 * the column for the aria-label when the visible label would not.
 */
export default function SortHeader({
  label, col, sort, onSort, hint = null, className = '', buttonClassName = '', children,
}) {
  const levels = Array.isArray(sort) ? sort : (sort?.key ? [sort] : [])
  const idx = levels.findIndex((s) => s.key === col)
  const active = idx !== -1
  const dir = active ? levels[idx].dir : null
  const text = label ?? children
  return (
    <th className={`px-4 py-3 font-medium ${className}`}>
      <button type="button" onClick={() => onSort(col)}
        aria-label={hint ? `Sort by ${hint}` : undefined}
        aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`inline-flex items-center gap-1 hover:text-optio-purple ${active ? 'text-optio-purple' : ''} ${buttonClassName}`}>
        {text}
        <span aria-hidden="true" className={`text-xs ${active ? '' : 'text-neutral-300'}`}>
          {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
        {active && levels.length > 1 && <span className="text-[10px] font-bold">{idx + 1}</span>}
      </button>
    </th>
  )
}
