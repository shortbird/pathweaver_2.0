import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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
 *
 * The menu is portaled to <body> and positioned from the input's viewport rect.
 * Most callers sit inside a modal whose body is `overflow-y-auto`, which clips
 * an in-flow absolute menu down to a sliver — and the sliver was unreachable,
 * because closing used to be a viewport-wide catcher div that swallowed the
 * modal's own scrollbar (iCreate, 2026-08-26: "there is a place to scroll ...
 * but it won't actually scroll but rather closes you out").
 */
const baseInput = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const MENU_MAX_HEIGHT = 224 // matches max-h-56
const VIEWPORT_GUTTER = 8

const SearchSelect = ({ value, onChange, options = [], getId, getLabel, placeholder = 'Search…', limit = 50, className = '', emptyLabel = '' }) => {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState(null)
  const inputRef = useRef(null)
  const menuRef = useRef(null)

  const selected = useMemo(() => options.find((o) => getId(o) === value), [options, value, getId])
  const display = open ? query : (selected ? getLabel(selected) : '')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? options.filter((o) => (getLabel(o) || '').toLowerCase().includes(q)) : options
    return list.slice(0, limit)
  }, [options, query, getLabel, limit])

  // Position from the input's viewport rect, flipping above when the space
  // below can't hold the list. Fixed coordinates keep the menu out of every
  // scroll container between here and <body>.
  const positionMenu = useCallback(() => {
    const rect = inputRef.current?.getBoundingClientRect()
    if (!rect) return
    const below = window.innerHeight - rect.bottom - VIEWPORT_GUTTER
    const above = rect.top - VIEWPORT_GUTTER
    const flip = below < Math.min(MENU_MAX_HEIGHT, above)
    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(120, Math.min(MENU_MAX_HEIGHT, flip ? above : below)),
      ...(flip ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) { setMenuStyle(null); return }
    positionMenu()
  }, [open, positionMenu])

  useEffect(() => {
    if (!open) return undefined
    // Capture phase so scrolling an ancestor container repositions the menu too.
    const onScroll = () => positionMenu()
    const onResize = () => positionMenu()
    // Close on a press outside the input and the menu. Anchored to the elements
    // themselves rather than a catcher overlay, so scrollbars stay usable.
    const onPointerDown = (e) => {
      if (inputRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKeyDown = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, positionMenu])

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

  const menu = open && menuStyle ? createPortal(
    <div
      ref={menuRef}
      style={menuStyle}
      data-testid="search-select-menu"
      className="z-[60] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1"
    >
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
    </div>,
    document.body
  ) : null

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
      {menu}
    </div>
  )
}

export default SearchSelect
