import React, { useMemo, useRef, useState } from 'react'

/**
 * SearchSelect — a single-select combobox that filters options as the user types.
 *
 * Platform rule: prefer this over a native <select> whenever the option list can
 * grow long (families, people, classes, students, etc.). Short fixed enums
 * (status, relationship, grade) can stay as plain <select>s.
 *
 * Props:
 *   value        selected option id ('' when none)
 *   onChange     (id) => void  — called with the chosen id, or '' when cleared
 *   options      array of option objects
 *   getId        (o) => id
 *   getLabel     (o) => string  (also what's filtered on)
 *   placeholder  input placeholder
 *   limit        max results shown while filtering (default 50)
 *   emptyLabel   when set, the list opens with an explicit "none" choice that
 *                clears the value (e.g. "No teacher yet"). Without it the only
 *                ways to clear are the × and typing over the value, which reads
 *                as "this field is required" — exactly the complaint that put
 *                this prop here (iCreate, 2026-08-11: "I want to NOT assign a
 *                teacher, but that's not an option").
 */
const baseInput = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const SearchSelect = ({ value, onChange, options = [], getId, getLabel, placeholder = 'Search…', limit = 50, className = '', emptyLabel = '' }) => {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)

  const selected = useMemo(() => options.find((o) => getId(o) === value), [options, value, getId])
  const display = open ? query : (selected ? getLabel(selected) : '')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? options.filter((o) => (getLabel(o) || '').toLowerCase().includes(q)) : options
    return list.slice(0, limit)
  }, [options, query, getLabel, limit])

  const choose = (id) => {
    onChange(id)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }
  const pick = (o) => choose(getId(o))

  // Only offered on an unfiltered list — once someone types a name they are
  // searching for a person, and "none" among the results is just noise.
  const showEmpty = !!emptyLabel && !query.trim()

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        value={display}
        placeholder={placeholder}
        onFocus={() => { setQuery(''); setOpen(true) }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (value) onChange('') }}
        className={baseInput}
      />
      {value && !open && (
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onChange('') }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 text-sm"
          aria-label="Clear"
        >
          ×
        </button>
      )}
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1">
            {showEmpty && (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); choose('') }}
                className={`block w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 ${value ? 'text-neutral-500' : 'text-optio-purple font-medium'}`}
              >
                {emptyLabel}
              </button>
            )}
            {filtered.length === 0 && !showEmpty ? (
              <div className="px-3 py-2 text-sm text-neutral-400">No matches</div>
            ) : filtered.map((o) => (
              <button
                key={getId(o)}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(o) }}
                className={`block w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 ${getId(o) === value ? 'text-optio-purple font-medium' : 'text-neutral-700'}`}
              >
                {getLabel(o)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default SearchSelect
