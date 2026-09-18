import React, { useMemo, useState } from 'react'
import { Input } from '../../ui/Input'

/**
 * Choosing several people from the school: a box to narrow the list by
 * typing, and a checkbox per person (M14c).
 *
 * SearchSelect is the platform rule for picking ONE person from a long list.
 * Three SIS dialogs needed several at once -- a message to a group of staff,
 * a task for some teachers and some families, a training for the people who
 * have not started it -- and each rebuilt the same search-box-over-a-
 * checklist with its own query filter and its own empty states
 * (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, L5). This is that widget
 * once. The caller owns the selection (a Set or an array of ids) and says
 * what a row shows under and beside the name; the picker owns the typing.
 *
 * Props:
 *   people, selected, onToggle(id)     the list, the chosen ids, the tick
 *   getId, getLabel, getSearchText     how to read a person (defaults: id,
 *                                      name, name + email)
 *   renderMeta(p), renderTrailing(p)   under the name; at the right edge
 *   actions                            a node beside the search box
 *                                      ("Select not started")
 *   placeholder, searchLabel           the box's copy and its aria-label
 *   emptyLabel, noMatchLabel(query)    nobody at all; nobody for this query
 *   maxHeight                          the list's Tailwind max-h class
 */
export default function PeoplePicker({
  people = [], selected, onToggle,
  getId = (p) => p.id,
  getLabel = (p) => p.name || 'Unnamed',
  getSearchText = null,
  renderMeta = null, renderTrailing = null, actions = null,
  placeholder = 'Search by name', searchLabel = 'Search people',
  emptyLabel = 'Nobody here yet.',
  noMatchLabel = (q) => `Nobody matches "${q}".`,
  maxHeight = 'max-h-52',
}) {
  const [query, setQuery] = useState('')
  const isSelected = (id) => (selected instanceof Set ? selected.has(id) : (selected || []).includes(id))
  const textOf = getSearchText || ((p) => `${getLabel(p)} ${p.email || ''}`)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return people
    return people.filter((p) => textOf(p).toLowerCase().includes(q))
  }, [people, query, textOf])

  if (!people.length) return <p className="text-sm text-neutral-500 py-2">{emptyLabel}</p>

  return (
    <div>
      <div className="flex items-center gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder} aria-label={searchLabel} className="text-sm" />
        {actions}
      </div>
      {!shown.length ? (
        <p className="text-sm text-neutral-500 mt-2">{noMatchLabel(query.trim())}</p>
      ) : (
        <ul className={`mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-y-auto ${maxHeight}`}>
          {shown.map((p) => {
            const id = getId(p)
            const label = getLabel(p)
            return (
              <li key={id}>
                <label className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={isSelected(id)} onChange={() => onToggle(id)}
                    aria-label={`Select ${label}`}
                    className="h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-neutral-900 truncate">{label}</span>
                    {renderMeta?.(p)}
                  </span>
                  {renderTrailing?.(p)}
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
