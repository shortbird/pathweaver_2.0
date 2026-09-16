import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import { CheckCircleIcon, LinkIcon, ArrowTopRightOnSquareIcon, TrashIcon } from '@heroicons/react/24/outline'
import SearchSelect from '../ui/SearchSelect'
import { useSisStaff } from '../../hooks/api/useSisStaff'
import { useSaveTrainingLink, useSetTrainingLinkDone } from '../../hooks/api/useTrainingLinks'

/**
 * Training links — training that is a video or a document rather than a quest.
 *
 * The Training page was quests only. iCreate, 2026-09-15: "I still dont' have
 * a way to add resources to the teacher training. I need to get some
 * trainings up asap!" — and Marika, the same day, asking for "the ability to
 * add training as links and not just as new quests". A recorded training on
 * Loom or a district PDF has no tasks to invent, so it is a link: open it,
 * then press done. An admin sees who has, in the same report as the quests.
 *
 * Two pieces, both rendered by StaffTrainingPage:
 *   TrainingLinkForm  add or edit one (title, link, category, required, who).
 *   TrainingLinkRow   one row in the list, beside the quest rows.
 *
 * Targeting mirrors the Resources page: roles answer "which kind of staff",
 * named people answer "which person", and the two are ORed. That is the
 * ticket's second ask — "some trainings are general and others are specific
 * to certain teachers or staff".
 */

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent'

const STAFF_ROLE_OPTIONS = [['org_admin', 'Admins'], ['campus_coordinator', 'Coordinators'], ['advisor', 'Teachers']]

export const TrainingLinkForm = ({ orgId, link = null, onSaved, onCancel }) => {
  const [title, setTitle] = useState(link?.title || '')
  const [url, setUrl] = useState(link?.url || '')
  const [description, setDescription] = useState(link?.description || '')
  const [category, setCategory] = useState(link?.category || '')
  const [required, setRequired] = useState(!!link?.is_required)
  const [roles, setRoles] = useState(link?.visible_to_roles || [])
  const [people, setPeople] = useState(link?.visible_to_user_ids || [])
  // Who a link can be aimed at by name. The form is admin-only, so this read
  // never runs for a teacher (who would 403 on it).
  const { data: staff = [] } = useSisStaff(orgId)
  const save = useSaveTrainingLink(orgId)
  const busy = save.isPending

  const toggleRole = (value) => setRoles((rs) =>
    rs.includes(value) ? rs.filter((r) => r !== value) : [...rs, value])
  const nameOf = (id) => staff.find((p) => p.id === id)?.name || 'Someone'

  const submit = async () => {
    if (!title.trim()) { toast.error('Give the training a title'); return }
    if (!url.trim()) { toast.error('Paste the link to the training'); return }
    const body = {
      title: title.trim(), url: url.trim(), description: description.trim(),
      category: category.trim(), is_required: required,
      visible_to_roles: roles, visible_to_user_ids: people,
    }
    try {
      await save.mutateAsync({ linkId: link?.id, body })
      toast.success(link ? 'Changes saved' : 'Added to training')
      onSaved()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the link')
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass}
          placeholder="Title (e.g. Whole Brain Teaching, part 1)" aria-label="Training title" autoFocus />
        <input value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass}
          placeholder="https://… (a video, a document, a slide deck)" aria-label="Training link" />
      </div>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
        className={inputClass} aria-label="What this training covers"
        placeholder="What it covers, and what to do with it (optional)" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}
          placeholder="Category (e.g. Onboarding, Classroom management)" aria-label="Category" />
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Required for everyone it goes to
        </label>
      </div>
      <div className="border-t border-gray-200 pt-3 text-xs text-neutral-500 space-y-3">
        <div>
          <span className="block mb-1">Which staff roles <span className="text-neutral-400">(none ticked = all staff)</span></span>
          <div className="flex items-center gap-3">
            {STAFF_ROLE_OPTIONS.map(([value, label]) => (
              <label key={value} className="flex items-center gap-1.5 text-sm text-neutral-700">
                <input type="checkbox" checked={roles.includes(value)} onChange={() => toggleRole(value)} />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <span className="block mb-1">
            And these people <span className="text-neutral-400">(as well as the roles above)</span>
          </span>
          {people.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {people.map((id) => (
                <span key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-optio-purple/10 px-2 py-0.5 text-optio-purple">
                  {nameOf(id)}
                  <button type="button" aria-label={`Remove ${nameOf(id)}`}
                    onClick={() => setPeople(people.filter((x) => x !== id))}
                    className="text-optio-purple/60 hover:text-red-600">×</button>
                </span>
              ))}
            </div>
          )}
          <SearchSelect
            value=""
            onChange={(id) => { if (id && !people.includes(id)) setPeople([...people, id]) }}
            options={staff.filter((p) => !people.includes(p.id))}
            getId={(p) => p.id} getLabel={(p) => p.name}
            placeholder="Search staff…"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-sm text-neutral-600 hover:bg-gray-100">Cancel</button>
        <button type="button" onClick={submit} disabled={busy || !title.trim() || !url.trim()}
          className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
          {busy ? 'Saving…' : link ? 'Save changes' : 'Add link'}
        </button>
      </div>
    </div>
  )
}

/**
 * One link in the training list. Open it in a new tab; press done when it is
 * watched or read. The done button is a toggle, because the wrong row gets
 * pressed sometimes and a mark nobody can undo is a report nobody trusts.
 */
export const TrainingLinkRow = ({ link, orgId, admin, onEdit, onRemove }) => {
  const setDone = useSetTrainingLinkDone(orgId)
  const busy = setDone.isPending
  const done = !!link.my_done

  const toggleDone = async () => {
    try {
      await setDone.mutateAsync({ linkId: link.id, done: !done })
      toast.success(done ? 'Marked as not done' : `"${link.title}" marked done`)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update it')
    }
  }

  return (
    <div className="p-4 flex items-start gap-3">
      {done
        ? <CheckCircleIcon className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
        : <LinkIcon className="w-5 h-5 text-optio-purple shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-neutral-900">{link.title}</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-neutral-500">Link</span>
          {link.is_required && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-optio-purple/10 text-optio-purple">Required</span>
          )}
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${
            done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-neutral-500'}`}>
            {done ? 'Done' : 'Not done'}
          </span>
        </div>
        {link.description && (
          <p className="text-sm text-neutral-500 mt-0.5 whitespace-pre-wrap line-clamp-3">{link.description}</p>
        )}
        <div className="flex items-center gap-4 mt-1">
          <a href={link.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-optio-purple hover:underline">
            Open <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
          </a>
          <button type="button" onClick={toggleDone} disabled={busy}
            className="text-sm text-neutral-600 hover:text-optio-purple hover:underline disabled:opacity-50">
            {done ? 'Mark as not done' : 'Mark as done'}
          </button>
        </div>
      </div>
      {admin && (
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onEdit}
            className="px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-medium text-neutral-700 hover:bg-gray-50">
            Edit
          </button>
          <button type="button" onClick={onRemove} className="p-1.5 text-gray-400 hover:text-red-500"
            aria-label={`Remove ${link.title}`}>
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
