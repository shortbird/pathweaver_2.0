import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { SparklesIcon, PlusIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import SearchSelect from '../ui/SearchSelect'
import QuestDraftForm, { blankTask } from './QuestDraftForm'
import QuestAiDraftPanel from './QuestAiDraftPanel'

/**
 * The teaching material a curriculum carries: its quests.
 *
 * iCreate, 2026-08-06: "admin should attach courses/quests to curriculum so
 * they're reusable year after year and teachers have resources to use, rather
 * than requiring teachers to create their own quests."
 *
 * This could already be edited from a class, which is the wrong direction for
 * setting up a year: an admin building next year's curriculum has no sections
 * yet to edit from. Here it is edited on the durable object, and classes
 * inherit. Quests are COPIED onto a section, so a section owns its own list and
 * a change here applies to the NEXT class set up from this curriculum — the
 * copy says so rather than leaving it as a surprise.
 *
 * Quests can also be CREATED here (2026-08-12), from scratch or from material
 * the school already has. Until then the picker could only attach a quest
 * somebody had already built on a class page — the same dead end the class page
 * itself used to have, one level up.
 *
 * Courses were the other half of this panel until 2026-08-12, when iCreate said
 * they would not be attaching courses to curriculum. Nothing was lost: no
 * curriculum anywhere had a course linked. The API and the teacher-side display
 * still handle course links, so the decision is reversible; only the way to
 * create one is gone.
 */

const Empty = ({ children }) => <p className="text-sm text-neutral-400">{children}</p>

// Pickers offer the school's own quests/courses AND Optio's public library.
// Say which is which — iCreate (2026-08-12) asked whether the list was
// school-only, which means the mix wasn't visible.
const optionLabel = (o) => (o.source === 'library' ? `${o.title} · Optio library` : o.title)

export default function CurriculumResources({ orgId, curriculumId, canManage, onChanged }) {
  const [quests, setQuests] = useState([])
  const [questOptions, setQuestOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newTasks, setNewTasks] = useState([blankTask()])

  const load = useCallback(() => {
    setLoading(true)
    api.get(withOrg(`/api/sis/curriculum/${curriculumId}/resources`, orgId))
      .then((r) => setQuests(r.data?.quests || []))
      .catch(() => toast.error('Could not load what this curriculum carries'))
      .finally(() => setLoading(false))
  }, [orgId, curriculumId])

  useEffect(() => { load() }, [load])

  // The picker is admin-only, and only worth fetching for an admin.
  useEffect(() => {
    if (!canManage) return
    api.get(withOrg(`/api/sis/curriculum/${curriculumId}/assignable-quests`, orgId))
      .then((r) => setQuestOptions(r.data?.quests || [])).catch(() => setQuestOptions([]))
  }, [orgId, curriculumId, canManage, quests.length])

  const saveQuests = async (next) => {
    setBusy(true)
    try {
      await api.put(withOrg(`/api/sis/curriculum/${curriculumId}/quests`, orgId),
        { quest_ids: next.map((q) => q.id) })
      setQuests(next)
      onChanged?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the quest set')
      load()
    } finally { setBusy(false) }
  }

  const resetNew = () => {
    setNewTitle(''); setNewDesc(''); setNewTasks([blankTask()]); setShowNew(false)
  }

  const hasDraft = Boolean(newTitle.trim() || newDesc.trim() || newTasks.some((t) => t.title.trim()))

  // The generated draft opens the form rather than saving anything: the review
  // step is the point, so a quest still exists only once an admin clicks create.
  const acceptDraft = ({ title, description, tasks }) => {
    setNewTitle(title); setNewDesc(description); setNewTasks(tasks); setShowNew(true)
  }

  // The new quest is appended by the API rather than sent as part of the whole
  // set, so a create can't race a concurrent reorder into dropping somebody's
  // quest — it is the one edit here that is additive by nature.
  const createQuest = async () => {
    if (!newTitle.trim()) { toast.error('Give the quest a title'); return }
    setCreating(true)
    try {
      await api.post(withOrg(`/api/sis/curriculum/${curriculumId}/quests/create`, orgId), {
        title: newTitle.trim(),
        description: newDesc.trim(),
        tasks: newTasks.filter((t) => t.title.trim()),
      })
      toast.success('Quest created and added')
      resetNew()
      load()
      onChanged?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not create the quest')
    } finally { setCreating(false) }
  }

  if (loading) return <p className="text-sm text-neutral-400">Loading…</p>

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Quests */}
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex items-center gap-2 mb-1">
          <SparklesIcon className="w-4 h-4 text-optio-purple" />
          <h4 className="text-sm font-semibold text-neutral-800">Quests</h4>
        </div>
        <p className="text-xs text-neutral-400 mb-2">
          The set a class starts from. Classes copy these, so a change here applies to the
          next class set up from this curriculum — it never rewrites a class in progress.
        </p>
        {!quests.length ? <Empty>Nothing saved yet.</Empty> : (
          <ul className="divide-y divide-gray-50 mb-2">
            {quests.map((q) => (
              <li key={q.id} className="py-1.5 flex items-center gap-2 text-sm">
                <span className="text-neutral-800 flex-1 min-w-0 truncate">{q.title}</span>
                {canManage && (
                  <button type="button" disabled={busy}
                    aria-label={`Remove ${q.title}`}
                    onClick={() => saveQuests(quests.filter((x) => x.id !== q.id))}
                    className="text-xs text-red-500 hover:underline shrink-0">Remove</button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <>
            <SearchSelect
              value=""
              onChange={(id) => {
                const pick = questOptions.find((o) => o.quest_id === id)
                if (pick) saveQuests([...quests, { id: pick.quest_id, title: pick.title }])
              }}
              options={questOptions}
              getId={(o) => o.quest_id}
              getLabel={optionLabel}
              placeholder="Add a quest…"
            />

            {!showNew ? (
              <button type="button" onClick={() => setShowNew(true)}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-optio-purple hover:underline">
                <PlusIcon className="w-4 h-4" /> Create a new quest
              </button>
            ) : (
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                <QuestDraftForm
                  title={newTitle} setTitle={setNewTitle}
                  description={newDesc} setDescription={setNewDesc}
                  tasks={newTasks} setTasks={setNewTasks}
                  titlePlaceholder="Quest title (e.g. Watercolor Basics)"
                  descriptionPlaceholder="What is this quest about? (optional)"
                  taskHint="Preset tasks are copied to each student when they start the quest. Leave it empty and they write their own."
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={resetNew} disabled={creating}
                    className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-neutral-600 hover:bg-gray-50">
                    Cancel
                  </button>
                  <button type="button" onClick={createQuest} disabled={creating || !newTitle.trim()}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
                    {creating ? 'Creating…' : 'Create & add'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Build a quest from material the school already has. Sits beside the
          quest list rather than inside the create form because it is how most
          quests here will start — the school has the material already, and
          typing it in again is the work worth removing. */}
      {canManage ? (
        <QuestAiDraftPanel alwaysOpen hasDraft={hasDraft} onDrafted={acceptDraft} />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <Empty>Quests are set up by an administrator.</Empty>
        </div>
      )}
    </div>
  )
}
