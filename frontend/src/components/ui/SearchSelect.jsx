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
 */
const baseInput = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const SearchSelect = ({ value, onChange, options = [], getId, getLabel, placeholder = 'Search…', limit = 50, className = '' }) => {
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

  const pick = (o) => {
    onChange(getId(o))
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

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
            {filtered.length === 0 ? (
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
