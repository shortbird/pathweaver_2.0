import React, { memo, useMemo, useState } from 'react'
import { MagnifyingGlassIcon, PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { EmptyState, Spinner } from '../ui'

/**
 * AttachmentList — one list of things attached to a user, with a type-to-filter
 * add drawer.
 *
 * The user-details modal had this interaction built twice (people connections
 * and course enrollments): same row, same checkbox, same search box, same
 * add/cancel footer, in two files, drifting apart. Both now render through
 * here, so they behave identically and pick up fixes once.
 *
 * Multi-select is why this isn't `ui/SearchSelect` — the add flows genuinely
 * attach several things at once ("Add (3)"). The platform rule that put
 * SearchSelect everywhere is about type-to-filter over a native dropdown, which
 * this keeps.
 *
 * Props:
 *   title       section heading
 *   items       [{ id, pill, name, sub, meta }] — pill is optional text
 *   onRemove    (item) => void
 *   addActions  [{ key, label }] — one add button each; the key is handed back
 *               to loadOptions/onAdd so one list can add several kinds of thing
 *   loadOptions async (key) => [{ id, name, sub }]  (called when the drawer opens)
 *   onAdd       async (key, ids) => void
 *   emptyTitle / emptyHint  empty-state copy
 */
const AttachmentList = ({
  title,
  items = [],
  onRemove,
  addActions = [],
  loadOptions,
  onAdd,
  emptyTitle = 'Nothing yet',
  emptyHint,
  emptyIcon,
}) => {
  const [openKey, setOpenKey] = useState(null)
  const [options, setOptions] = useState([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState([])
  const [saving, setSaving] = useState(false)

  const openDrawer = async (key) => {
    setOpenKey(key)
    setQuery('')
    setSelected([])
    setOptions([])
    setOptionsLoading(true)
    try {
      setOptions(await loadOptions(key))
    } finally {
      setOptionsLoading(false)
    }
  }

  const closeDrawer = () => {
    setOpenKey(null)
    setSelected([])
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) => o.name?.toLowerCase().includes(q) || o.sub?.toLowerCase().includes(q)
    )
  }, [options, query])

  const toggle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const submit = async () => {
    if (!selected.length) return
    setSaving(true)
    try {
      await onAdd(openKey, selected)
      closeDrawer()
    } finally {
      setSaving(false)
    }
  }

  const activeAction = addActions.find((a) => a.key === openKey)

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">
          {title}
          {items.length > 0 && <span className="ml-2 font-normal text-gray-500">{items.length}</span>}
        </h3>
        <div className="flex flex-wrap gap-2 justify-end">
          {addActions.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={() => openDrawer(action.key)}
              className="btn-quiet !px-3 !py-1.5 text-sm"
            >
              <PlusIcon className="w-4 h-4" />
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState plain className="!py-8" icon={emptyIcon} title={emptyTitle} hint={emptyHint} />
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 p-3 hover:bg-gray-50">
              <div className="flex items-center gap-3 min-w-0">
                {item.pill && (
                  <span className="inline-flex items-center flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {item.pill}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                  {item.sub && <p className="text-xs text-gray-500 truncate">{item.sub}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {item.meta && <span className="hidden sm:block text-xs text-gray-500">{item.meta}</span>}
                <button
                  type="button"
                  onClick={() => onRemove(item)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  aria-label={`Remove ${item.name}`}
                  title={`Remove ${item.name}`}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {openKey !== null && (
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/60 space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-semibold text-gray-900">{activeAction?.label || 'Add'}</h4>
            <button
              type="button"
              onClick={closeDrawer}
              className="p-1 text-gray-500 hover:bg-gray-200 rounded transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              aria-label="Search"
              className="input-field !py-2 !pl-9 text-sm"
            />
          </div>

          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg bg-white">
            {optionsLoading ? (
              <div className="flex justify-center py-6">
                <Spinner size="sm" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-center py-6 text-sm text-gray-500">
                {options.length === 0 ? 'Nothing available to add' : 'No matches'}
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {filtered.map((o) => {
                  const isSelected = selected.includes(o.id)
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggle(o.id)}
                      aria-pressed={isSelected}
                      className={`w-full text-left p-2.5 flex items-center gap-2.5 transition-colors ${
                        isSelected ? 'bg-optio-purple/5' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-optio-purple border-optio-purple' : 'border-gray-300'
                        }`}
                      >
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900 truncate">{o.name}</span>
                        {o.sub && <span className="block text-xs text-gray-500 truncate">{o.sub}</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeDrawer} className="btn-quiet !py-1.5 text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!selected.length || saving}
              className="btn-primary !px-4 !py-1.5 text-sm"
            >
              {saving ? 'Adding...' : `Add${selected.length ? ` (${selected.length})` : ''}`}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export default memo(AttachmentList)
