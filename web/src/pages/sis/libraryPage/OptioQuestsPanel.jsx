import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ArrowTopRightOnSquareIcon, GlobeAltIcon } from '@heroicons/react/24/outline'
import { useSisOrg } from '../useSisOrg'
import {
  useOptioQuests, useSetOptioQuestAccess, useSetQuestVisibility,
} from '../../../hooks/api/useSisOptioQuests'
import { useConfirm } from '../../../contexts/ConfirmContext'
import { getLearningOrigin } from '../../../utils/appSurface'
import { Input } from '../../../components/ui/Input'
import EmptyState from '../../../components/ui/EmptyState'
import Button from '../../../components/ui/Button'

/**
 * OptioQuestsPanel -- the shared Optio quest library as this school sees it,
 * and how much of it the school lets in.
 *
 * Came over from the web org console's quest settings (QuestsTab +
 * QuestVisibilityManager) on 2026-10-15, when every org became an SIS org and
 * the console was set to go. The school's own quests are the Quests view
 * beside this one; this view is only the library they did not write.
 *
 * The setting is organizations.quest_visibility_policy, and every SIS assign
 * door follows it (services/org_quest_visibility.py):
 *
 *   all_optio     Every Optio quest
 *   curated       Only the ones we choose: grant them here, one or many
 *   private_only  None: the school's own quests only
 *
 * Front office only (ADMIN_ROLES), like the rest of Library > Quests.
 */

export const POLICIES = [
  ['all_optio', 'Every Optio quest',
    'Your teachers can assign any quest from the Optio library, and your students can find them.'],
  ['curated', 'Only the ones we choose',
    'Choose quests from the list below. Only those reach your school.'],
  ['private_only', 'None, only our own quests',
    'Your school uses only the quests it made. The Optio library stays out of every picker.'],
]

const SHOW = [
  ['all', 'All'],
  ['available', 'Available'],
  ['unavailable', 'Not available'],
]

const TYPES = [
  ['', 'Quests and courses'],
  ['optio', 'Quests'],
  ['course', 'Courses'],
]

const questHref = (id) => `${getLearningOrigin()}/quests/${id}`

function PolicyPicker({ policy, onPick, disabled }) {
  return (
    <fieldset className="grid grid-cols-1 md:grid-cols-3 gap-3" disabled={disabled}>
      <legend className="sr-only">Which Optio quests your school uses</legend>
      {POLICIES.map(([key, label, hint]) => (
        <label key={key}
          className={`rounded-xl border p-4 cursor-pointer transition-colors ${
            policy === key ? 'border-optio-purple bg-optio-purple/5' : 'border-gray-200 bg-white hover:border-optio-purple/60'
          }`}>
          <span className="flex items-center gap-2">
            <input type="radio" name="quest-policy" value={key} checked={policy === key}
              onChange={() => onPick(key)} className="accent-optio-purple"
              aria-label={label} aria-describedby={`quest-policy-${key}`} />
            <span className="text-sm font-semibold text-neutral-900">{label}</span>
          </span>
          <span id={`quest-policy-${key}`} className="block text-xs text-neutral-500 mt-1">{hint}</span>
        </label>
      ))}
    </fieldset>
  )
}

export default function OptioQuestsPanel() {
  const { orgId } = useSisOrg()
  const confirm = useConfirm()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [show, setShow] = useState('all')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(() => new Set())

  // One request per pause in typing, not per keystroke: this list is paged
  // on the server, so the filter has to be.
  // A new filter starts on page 1 with nothing selected.
  const refilter = (setter) => (value) => {
    setter(value)
    setPage(1)
    setSelected(new Set())
  }
  const setSearchFilter = refilter(setSearch)
  const setTypeFilter = refilter(setType)
  const setShowFilter = refilter(setShow)
  useEffect(() => {
    const next = searchInput.trim()
    if (next === search) return undefined
    const t = setTimeout(() => setSearchFilter(next), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isError, error } = useOptioQuests(orgId, { search, type, show, page })
  const setPolicy = useSetQuestVisibility(orgId)
  const setAccess = useSetOptioQuestAccess(orgId)

  const policy = data?.policy
  const curated = policy === 'curated'
  const quests = useMemo(() => data?.quests || [], [data])
  const total = data?.total || 0
  const pages = Math.max(1, Math.ceil(total / (data?.per_page || 25)))

  const pickPolicy = async (next) => {
    if (next === policy) return
    const label = POLICIES.find(([k]) => k === next)?.[1]
    if (!(await confirm({
      title: `Change to “${label}”?`,
      body: 'This changes which Optio quests every teacher at your school can assign. '
        + 'Students keep the quests they already have.',
      confirmLabel: 'Change it',
      cancelLabel: 'Keep it',
    }))) return
    try {
      await setPolicy.mutateAsync(next)
      toast.success(`Optio quests: ${label}`)
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not change the setting')
    }
  }

  const setAvailable = async (questIds, available) => {
    try {
      await setAccess.mutateAsync({ questIds, available })
      const n = questIds.length
      toast.success(available
        ? `${n === 1 ? 'Quest' : `${n} quests`} now available`
        : `${n === 1 ? 'Quest' : `${n} quests`} no longer available`)
      setSelected(new Set())
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not change that')
    }
  }

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const allOnPage = quests.length > 0 && quests.every((q) => selected.has(q.id))
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(quests.map((q) => q.id)))

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-sm font-semibold text-neutral-900">Which Optio quests your school uses</h2>
        <p className="text-xs text-neutral-500 mt-0.5 mb-3">
          The Optio library is shared by every school. This decides how much of it your teachers can assign.
        </p>
        {policy
          ? <PolicyPicker policy={policy} onPick={pickPolicy} disabled={setPolicy.isPending} />
          : isLoading && <p className="text-neutral-500 text-sm">Loading…</p>}
        {curated && (
          <p className="text-xs text-neutral-500 mt-2">
            {data.granted_count} {data.granted_count === 1 ? 'quest' : 'quests'} chosen.
          </p>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="flex-1 min-w-[14rem] max-w-md">
            <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search the Optio library…" aria-label="Search the Optio library" />
          </div>
          <select value={type} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Kind"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
            {TYPES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <div role="group" aria-label="Which quests" className="flex rounded-lg border border-gray-200 bg-white p-0.5">
            {SHOW.map(([key, label]) => (
              <button key={key} type="button" onClick={() => setShowFilter(key)} aria-pressed={show === key}
                className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                  show === key ? 'bg-optio-purple text-white' : 'text-neutral-600 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {curated && selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3 rounded-lg bg-optio-purple/5 px-3 py-2 text-sm">
            <span className="text-neutral-700">{selected.size} selected</span>
            <Button size="xs" variant="secondary" disabled={setAccess.isPending}
              onClick={() => setAvailable([...selected], true)}>Make available</Button>
            <Button size="xs" variant="secondary" disabled={setAccess.isPending}
              onClick={() => setAvailable([...selected], false)}>Make unavailable</Button>
          </div>
        )}

        {isError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4" role="alert">
            {error?.response?.data?.error || 'Could not load the Optio library.'}
          </div>
        )}

        {!isLoading && !isError && quests.length === 0 && (
          <EmptyState icon={GlobeAltIcon} title="No Optio quests match"
            hint={search ? 'Try another search.' : 'Change the filters to see more.'} />
        )}

        {quests.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[40rem]">
              <thead className="bg-neutral-50 text-neutral-500 text-left">
                <tr>
                  {curated && (
                    <th className="px-3 py-3 w-10">
                      <input type="checkbox" checked={allOnPage} onChange={toggleAll}
                        aria-label="Select every quest on this page" className="accent-optio-purple" />
                    </th>
                  )}
                  <th className="px-4 py-3 font-medium">Quest</th>
                  <th className="px-3 py-3 font-medium w-28">Kind</th>
                  <th className="px-3 py-3 font-medium w-36">At your school</th>
                  {curated && <th className="px-3 py-3 w-40" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {quests.map((q) => (
                  <tr key={q.id} className="align-top">
                    {curated && (
                      <td className="px-3 py-3">
                        <input type="checkbox" checked={selected.has(q.id)} onChange={() => toggle(q.id)}
                          aria-label={`Select ${q.title}`} className="accent-optio-purple" />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <a href={questHref(q.id)} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-neutral-900 hover:text-optio-purple">
                        {q.title}
                        <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 text-neutral-400" aria-hidden="true" />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                      {q.description && (
                        <div className="text-xs text-neutral-500 line-clamp-2 mt-0.5">{q.description}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-neutral-700">{q.quest_type === 'course' ? 'Course' : 'Quest'}</td>
                    <td className="px-3 py-3">
                      {q.available
                        ? <span className="inline-block rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">Available</span>
                        : <span className="inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">Not available</span>}
                    </td>
                    {curated && (
                      <td className="px-3 py-3 text-right">
                        <button type="button" disabled={setAccess.isPending}
                          onClick={() => setAvailable([q.id], !q.granted)}
                          className="text-sm font-medium text-optio-purple hover:underline disabled:opacity-50">
                          {q.granted ? 'Make unavailable' : 'Make available'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-neutral-500">
              <span>{total} {total === 1 ? 'quest' : 'quests'}</span>
              {pages > 1 && (
                <div className="flex items-center gap-2">
                  <button type="button" className="btn-quiet !px-3 !py-1 text-xs" disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}>Previous</button>
                  <span>Page {page} of {pages}</span>
                  <button type="button" className="btn-quiet !px-3 !py-1 text-xs" disabled={page >= pages}
                    onClick={() => setPage((p) => p + 1)}>Next</button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
