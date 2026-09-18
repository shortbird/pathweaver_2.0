import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { buildSearchIndex, searchFeatures } from '../../pages/sis/sisSearchIndex'

/**
 * The header search: type what you are looking for, land on it.
 *
 * It searches the CONSOLE, not the school's data -- pages, tabs, reports and
 * settings cards (pages/sis/sisSearchIndex.js), not students or families. The
 * People page has its own search for those. After the 2026-09-17 merges most
 * of what staff do lives on a tab the sidebar no longer names, and "where did
 * announcements go" is a question this answers in one keystroke.
 *
 * Keyboard: arrows move, Enter opens, Escape clears. Ctrl+K (Cmd+K on a Mac)
 * focuses it from anywhere on the page. Below `sm` the header has no room for
 * an input beside the menu button, wordmark and bell, so a magnifier button
 * opens the same field on its own row under the header.
 *
 * `ctx` is navContextFor(user, activeOrg): the reader's tiers and the org's
 * modules, so what is offered is what they can open.
 */
const SisSearch = ({ ctx }) => {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  // Small screens only: whether the field is showing at all.
  const [mobileOpen, setMobileOpen] = useState(false)
  const inputRef = useRef(null)
  const rootRef = useRef(null)

  const index = useMemo(() => buildSearchIndex(ctx), [ctx])
  const results = useMemo(() => searchFeatures(index, query), [index, query])
  const showList = open && query.trim().length > 0

  // A new query starts the highlight at the top.
  const type = (value) => { setQuery(value); setActive(0); setOpen(true) }

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key || '').toLowerCase() === 'k') {
        e.preventDefault()
        setMobileOpen(true)
        // The field may be hidden at this width until the state above lands.
        requestAnimationFrame(() => inputRef.current?.focus())
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // Close on a press outside. Anchored to the element, not an overlay, so the
  // rest of the header (the bell, the org picker) keeps working underneath.
  useEffect(() => {
    if (!open && !mobileOpen) return undefined
    const onPointerDown = (e) => {
      if (rootRef.current?.contains(e.target)) return
      setOpen(false)
      setMobileOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, mobileOpen])

  const reset = () => {
    setQuery('')
    setOpen(false)
    setMobileOpen(false)
    inputRef.current?.blur()
  }

  const go = (entry) => {
    if (!entry) return
    reset()
    navigate(entry.to)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (query) type(''); else reset()
      return
    }
    if (!showList || results.length === 0) {
      if (e.key === 'Enter') e.preventDefault()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(results[active])
    }
  }

  const listId = 'sis-search-results'

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => { setMobileOpen(true); requestAnimationFrame(() => inputRef.current?.focus()) }}
        aria-label="Search the console"
        className={`sm:hidden p-2 rounded-lg text-neutral-600 hover:bg-neutral-100 ${mobileOpen ? 'invisible' : ''}`}
      >
        <MagnifyingGlassIcon className="w-6 h-6" />
      </button>
      {/* One field, two homes: inline at sm and up; its own row under the
          header on a phone. The results list drops under the field either way. */}
      <div className={`${mobileOpen ? 'fixed left-0 right-0 top-14 z-30 border-b border-gray-200 bg-white p-2' : 'hidden'} sm:static sm:block sm:border-0 sm:bg-transparent sm:p-0`}>
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Search the console"
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            value={query}
            placeholder="Find a page"
            onChange={(e) => type(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            className="w-full sm:w-44 sm:focus:w-72 transition-[width] rounded-lg border border-gray-300 bg-white pl-8 pr-8 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-optio-purple"
          />
          {(query || mobileOpen) && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); if (query) { type(''); inputRef.current?.focus() } else reset() }}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-neutral-400 hover:text-neutral-600"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
        {showList && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Pages"
            className="absolute left-2 right-2 sm:left-0 sm:right-auto sm:w-72 mt-1 max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1 z-40"
          >
            {results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-neutral-400">No pages match</li>
            ) : results.map((entry, i) => (
              <li
                key={entry.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); go(entry) }}
                className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-[#F3EFF4]' : ''}`}
              >
                <div className={`text-sm ${i === active ? 'text-optio-purple font-semibold' : 'text-neutral-800 font-medium'}`}>{entry.name}</div>
                {entry.hint && <div className="text-xs text-neutral-500">{entry.hint}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default SisSearch
