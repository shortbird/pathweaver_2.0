import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { PageLoader } from '../../../components/ui'
import { useConfirm } from '../../../contexts/ConfirmContext'
import {
  getDirectory,
  listEmailLists,
  createEmailList,
  updateEmailList,
  deleteEmailList,
} from './crmApi'
import {
  ROLE_OPTIONS,
  NO_ORG,
  GMAIL_BATCH,
  emptyFilters,
  normalizeFilters,
  matchesFilters,
  resolveList,
  emailString,
  batches,
  presets,
} from './emailListRules'

const ROLE_LABEL = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.id, r.label.replace(/s$/, '')]))

const blankList = (filters = emptyFilters(), name = '') => ({
  id: null,
  name,
  description: '',
  filters: normalizeFilters(filters),
  include_ids: [],
  exclude_ids: [],
})

const inputClass =
  'w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-optio-purple text-base'
const primaryButton =
  'px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]'
const secondaryButton =
  'px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]'

const Chip = ({ label, onRemove }) => (
  <span className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-optio-purple/10 text-optio-purple text-sm">
    {label}
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove ${label}`}
      className="w-6 h-6 rounded-full hover:bg-optio-purple/20 leading-none"
    >
      ×
    </button>
  </span>
)

const copy = async (people) => {
  try {
    await navigator.clipboard.writeText(emailString(people))
    toast.success(`Copied ${people.length} emails. Paste them into BCC in Gmail.`)
  } catch {
    toast.error('Could not copy. Your browser blocked the clipboard.')
  }
}

/**
 * Email lists: pick a group of Optio users, copy their emails, paste them
 * into BCC on a Gmail draft. Nothing here sends. A saved list keeps its
 * filter, so "Academy parents in Robotics" stays current as families
 * enroll; ticks and "Add someone" are stored as hand edits on top of it.
 * The rules live in emailListRules.js.
 */
const EmailLists = () => {
  const confirm = useConfirm()
  const [searchParams, setSearchParams] = useSearchParams()
  const [directory, setDirectory] = useState(null)
  const [lists, setLists] = useState([])
  const [current, setCurrent] = useState(blankList())
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tableSearch, setTableSearch] = useState('')
  const [addSearch, setAddSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([getDirectory(), listEmailLists()])
      .then(([dir, saved]) => {
        if (cancelled) return
        setDirectory(dir.data)
        setLists(saved.data.lists || [])
      })
      .catch((error) => {
        if (!cancelled) toast.error(error.response?.data?.error || 'Failed to load the directory')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Open the list named in ?list= once the saved lists arrive.
  const listParam = searchParams.get('list')
  useEffect(() => {
    if (!listParam || current.id === listParam) return
    const found = lists.find((l) => l.id === listParam)
    if (found) {
      setCurrent({ ...blankList(), ...found, filters: normalizeFilters(found.filters) })
      setDirty(false)
    }
  }, [listParam, lists, current.id])

  const people = directory?.people || []
  const organizations = directory?.organizations || []
  const orgName = useMemo(() => Object.fromEntries(organizations.map((o) => [o.id, o.name])), [organizations])
  const classesById = useMemo(
    () => Object.fromEntries((directory?.classes || []).map((c) => [c.id, c])),
    [directory]
  )

  const { recipients, leftOut } = useMemo(() => resolveList(people, current), [people, current])
  const recipientIds = useMemo(() => new Set(recipients.map((p) => p.id)), [recipients])

  // Everyone the list touches: caught by the filter, added, or ticked off.
  const rows = useMemo(() => {
    const include = new Set(current.include_ids)
    const exclude = new Set(current.exclude_ids)
    const term = tableSearch.trim().toLowerCase()
    return people.filter((p) => {
      const touched =
        recipientIds.has(p.id) || include.has(p.id) || (exclude.has(p.id) && matchesFilters(p, current.filters))
      if (!touched) return false
      return !term || p.name.toLowerCase().includes(term) || p.email.toLowerCase().includes(term)
    })
  }, [people, current, recipientIds, tableSearch])

  const addMatches = useMemo(() => {
    const term = addSearch.trim().toLowerCase()
    if (term.length < 2) return []
    return people
      .filter((p) => !recipientIds.has(p.id))
      .filter((p) => p.name.toLowerCase().includes(term) || p.email.toLowerCase().includes(term))
      .slice(0, 8)
  }, [people, recipientIds, addSearch])

  const edit = (patch) => {
    setCurrent((c) => ({ ...c, ...patch }))
    setDirty(true)
  }
  const editFilters = (patch) => edit({ filters: { ...current.filters, ...patch } })

  const toggleIn = (key, value) => {
    const values = current.filters[key]
    editFilters({ [key]: values.includes(value) ? values.filter((v) => v !== value) : [...values, value] })
  }

  const setTicked = (person, ticked) => {
    const include = current.include_ids.filter((id) => id !== person.id)
    const exclude = current.exclude_ids.filter((id) => id !== person.id)
    if (ticked) {
      if (!matchesFilters(person, current.filters)) include.push(person.id)
    } else if (matchesFilters(person, current.filters)) {
      exclude.push(person.id)
    }
    edit({ include_ids: include, exclude_ids: exclude })
  }

  const open = async (next) => {
    if (dirty && !(await confirm({ title: 'Discard changes?', body: 'This list has unsaved changes.', confirmLabel: 'Discard' }))) {
      return
    }
    setCurrent(next)
    setDirty(false)
    setTableSearch('')
    setSearchParams(next.id ? { list: next.id } : {}, { replace: true })
  }

  const save = async (asNew = false) => {
    if (!current.name.trim()) {
      toast.error('Give the list a name first')
      return
    }
    const payload = {
      name: current.name,
      description: current.description,
      filters: current.filters,
      include_ids: current.include_ids,
      exclude_ids: current.exclude_ids,
    }
    setSaving(true)
    try {
      const response =
        current.id && !asNew ? await updateEmailList(current.id, payload) : await createEmailList(payload)
      const saved = response.data.list
      setLists((ls) => [...ls.filter((l) => l.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)))
      setCurrent({ ...blankList(), ...saved, filters: normalizeFilters(saved.filters) })
      setDirty(false)
      setSearchParams({ list: saved.id }, { replace: true })
      toast.success('List saved')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save the list')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!(await confirm({ title: `Delete "${current.name}"?`, body: 'The people stay. Only the saved list goes.', confirmLabel: 'Delete list' }))) {
      return
    }
    try {
      await deleteEmailList(current.id)
      setLists((ls) => ls.filter((l) => l.id !== current.id))
      setCurrent(blankList())
      setDirty(false)
      setSearchParams({}, { replace: true })
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete the list')
    }
  }

  if (!directory) return <PageLoader />

  const chosenOrgs = current.filters.org_ids.filter((id) => id !== NO_ORG)
  const classOptions = (directory.classes || []).filter(
    (c) => chosenOrgs.includes(c.organization_id) && !current.filters.class_ids.includes(c.id)
  )
  const leftOutText = [
    leftOut.suppressed.length && `${leftOut.suppressed.length} unsubscribed`,
    leftOut.test.length && `${leftOut.test.length} test accounts`,
    leftOut.deleting.length && `${leftOut.deleting.length} being deleted`,
  ].filter(Boolean)

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Email lists</h2>
        <p className="text-sm text-gray-500">
          Pick who should get an email, copy the addresses, and paste them into BCC in Gmail. Nothing sends from here.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        <aside className="space-y-6">
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Saved lists</h3>
            {lists.length === 0 && <p className="text-sm text-gray-500">None yet.</p>}
            <ul className="space-y-1">
              {lists.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => open({ ...blankList(), ...l, filters: normalizeFilters(l.filters) })}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm min-h-[44px] ${
                      current.id === l.id ? 'bg-optio-purple/10 text-optio-purple font-medium' : 'hover:bg-gray-100'
                    }`}
                  >
                    {l.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Start from</h3>
            <ul className="space-y-1">
              {presets(organizations).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => open(blankList(p.filters, p.label))}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-100 min-h-[44px]"
                  >
                    {p.label}
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => open(blankList())}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-100 min-h-[44px]"
                >
                  Blank list
                </button>
              </li>
            </ul>
          </div>
        </aside>

        <div className="space-y-6 min-w-0">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <label htmlFor="list-name" className="sr-only">
                List name
              </label>
              <input
                id="list-name"
                value={current.name}
                onChange={(e) => edit({ name: e.target.value })}
                placeholder="List name, e.g. Academy parents in Robotics"
                className={inputClass}
              />
              <div className="flex gap-2 flex-shrink-0">
                <button type="button" onClick={() => save(false)} disabled={saving || (!dirty && current.id)} className={primaryButton}>
                  {current.id ? 'Save' : 'Save list'}
                </button>
                {current.id && (
                  <>
                    <button type="button" onClick={() => save(true)} disabled={saving} className={secondaryButton}>
                      Save as new
                    </button>
                    <button type="button" onClick={remove} className="px-3 text-sm font-medium text-red-600 hover:underline min-h-[44px]">
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            <fieldset>
              <legend className="text-sm font-medium text-gray-700 mb-2">Roles (any of)</legend>
              <div className="flex flex-wrap gap-2">
                {ROLE_OPTIONS.map((r) => {
                  const on = current.filters.roles.includes(r.id)
                  return (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleIn('roles', r.id)}
                      className={`px-3 py-1.5 rounded-full text-sm border min-h-[36px] ${
                        on ? 'bg-optio-purple text-white border-optio-purple' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {r.label}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <div>
              <label htmlFor="list-org" className="block text-sm font-medium text-gray-700 mb-2">
                Schools (any of; none chosen means every school)
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {current.filters.org_ids.map((id) => (
                  <Chip
                    key={id}
                    label={id === NO_ORG ? 'No school (platform users)' : orgName[id] || 'Unknown school'}
                    onRemove={() =>
                      editFilters({
                        org_ids: current.filters.org_ids.filter((o) => o !== id),
                        // A class filter outlives its school otherwise, and matches nobody.
                        class_ids: current.filters.class_ids.filter((c) => classesById[c]?.organization_id !== id),
                      })
                    }
                  />
                ))}
              </div>
              <select
                id="list-org"
                value=""
                onChange={(e) => e.target.value && toggleIn('org_ids', e.target.value)}
                className={inputClass}
              >
                <option value="">Add a school...</option>
                {!current.filters.org_ids.includes(NO_ORG) && <option value={NO_ORG}>No school (platform users)</option>}
                {organizations
                  .filter((o) => !current.filters.org_ids.includes(o.id))
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
              </select>
            </div>

            {chosenOrgs.length > 0 && (
              <div>
                <label htmlFor="list-class" className="block text-sm font-medium text-gray-700 mb-2">
                  Classes (students in them, and their parents)
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {current.filters.class_ids.map((id) => (
                    <Chip
                      key={id}
                      label={classesById[id]?.name || 'Unknown class'}
                      onRemove={() => toggleIn('class_ids', id)}
                    />
                  ))}
                </div>
                <select
                  id="list-class"
                  value=""
                  onChange={(e) => e.target.value && toggleIn('class_ids', e.target.value)}
                  className={inputClass}
                >
                  <option value="">Add a class...</option>
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {chosenOrgs.length > 1 ? ` (${orgName[c.organization_id] || ''})` : ''}
                      {c.status && c.status !== 'active' ? ` [${c.status}]` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-700">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={current.filters.include_test}
                  onChange={(e) => editFilters({ include_test: e.target.checked })}
                />
                Include test accounts
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={current.filters.include_suppressed}
                  onChange={(e) => editFilters({ include_suppressed: e.target.checked })}
                />
                Include people who unsubscribed
              </label>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <p className="text-lg font-semibold">
                {recipients.length} {recipients.length === 1 ? 'recipient' : 'recipients'}
              </p>
              {leftOutText.length > 0 && <p className="text-sm text-gray-500">Left out: {leftOutText.join(', ')}</p>}
              {recipients.length > GMAIL_BATCH && (
                <p className="text-sm text-amber-700">
                  Gmail takes at most {GMAIL_BATCH} recipients per email, so copy one batch per draft.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {recipients.length <= GMAIL_BATCH ? (
                <button type="button" onClick={() => copy(recipients)} disabled={!recipients.length} className={primaryButton}>
                  Copy emails
                </button>
              ) : (
                batches(recipients).map((batch, i) => (
                  <button key={i} type="button" onClick={() => copy(batch)} className={primaryButton}>
                    Copy {i * GMAIL_BATCH + 1}-{i * GMAIL_BATCH + batch.length}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <label htmlFor="list-add" className="block text-sm font-medium text-gray-700 mb-2">
              Add someone the filter misses
            </label>
            <input
              id="list-add"
              type="search"
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              placeholder="Search anyone by name or email..."
              className={inputClass}
            />
            {addMatches.length > 0 && (
              <ul className="mt-2 divide-y divide-gray-100">
                {addMatches.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="text-sm font-medium text-gray-900">{p.name}</span>{' '}
                      <span className="text-sm text-gray-500 break-all">{p.email}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setTicked(p, true)
                        setAddSearch('')
                      }}
                      className="text-sm font-medium text-optio-purple hover:underline min-h-[44px] flex-shrink-0"
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <label htmlFor="list-filter" className="sr-only">
                Search this list
              </label>
              <input
                id="list-filter"
                type="search"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Search this list..."
                className={inputClass}
              />
            </div>
            {rows.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 text-center">
                Choose a role, a school or a class above, or add someone by hand.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 w-10">
                        <span className="sr-only">On the list</span>
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Person</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Roles</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">School</th>
                      <th className="px-3 pr-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Children</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rows.map((p) => {
                      const on = recipientIds.has(p.id)
                      return (
                        <tr key={p.id} className={on ? '' : 'bg-gray-50 text-gray-400'}>
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={on || current.include_ids.includes(p.id)}
                              onChange={(e) => setTicked(p, e.target.checked)}
                              aria-label={`${p.name} on the list`}
                            />
                          </td>
                          <td className="px-3 py-3 text-sm">
                            <div className={on ? 'font-medium text-gray-900' : ''}>{p.name}</div>
                            <div className="break-all">{p.email}</div>
                            {current.include_ids.includes(p.id) && <div className="text-xs text-optio-purple">Added by hand</div>}
                          </td>
                          <td className="px-3 py-3 text-sm">{p.roles.map((r) => ROLE_LABEL[r] || r).join(', ')}</td>
                          <td className="px-3 py-3 text-sm">{p.organization_id ? orgName[p.organization_id] : '-'}</td>
                          <td className="px-3 pr-4 py-3 text-sm">{p.children.join(', ')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default EmailLists
