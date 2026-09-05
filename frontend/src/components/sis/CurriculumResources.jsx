import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  SparklesIcon, PlusIcon, ChevronDownIcon, ChevronRightIcon,
  PencilSquareIcon, TrashIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import CurriculumMaterials from './CurriculumMaterials'
import { withOrg } from '../../pages/sis/useSisOrg'
import SearchSelect from '../ui/SearchSelect'
import QuestDraftForm, { blankTask } from './QuestDraftForm'
import QuestAiDraftPanel from './QuestAiDraftPanel'
import PresetTaskManager from './PresetTaskManager'
import { useConfirm } from '../../contexts/ConfirmContext'

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

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

/**
 * One quest opened inside the curriculum: its description, its preset tasks,
 * and — for the school's own quests — the full set of controls (rename, edit
 * description, task CRUD, delete outright). iCreate, 2026-08-31: "when admin
 * creates a quest in /curriculum they need to be able to view the quests inside
 * the curriculum and also have full CRUD" — the row was title-only, so checking
 * a quest meant finding a class it was assigned to.
 */
/**
 * Which curricula carry this quest, and a way to add it to another.
 *
 * iCreate, 2026-09-01 (24d47467): "I'm creating quests for Academic Learning
 * day, but they can be used in Elementary microschool too."
 *
 * The link table has allowed one quest on many curricula since it was created;
 * nothing said so, and the only route to it was to leave this quest, open the
 * other curriculum, and find the title again in a picker of everything.
 */
function QuestCurricula({ base, orgId, curriculumId }) {
  const [state, setState] = useState(null) // {on, available}
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api.get(withOrg(`${base}/curricula`, orgId))
      .then((r) => setState({ on: r.data?.on || [], available: r.data?.available || [] }))
      .catch(() => setState({ on: [], available: [] }))
  }, [base, orgId])

  useEffect(() => { load() }, [load])

  const addTo = async (targetId) => {
    setBusy(true)
    try {
      const { data } = await api.post(withOrg(`${base}/curricula`, orgId),
        { target_curriculum_id: targetId })
      const n = data?.pushed_to_classes || 0
      toast.success(n ? `Added, and pushed to ${n} class${n === 1 ? '' : 'es'}` : 'Added')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not add it there')
    } finally { setBusy(false) }
  }

  const removeFrom = async (targetId) => {
    setBusy(true)
    try {
      await api.delete(withOrg(`${base}/curricula/${targetId}`, orgId))
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove it')
    } finally { setBusy(false) }
  }

  if (!state) return null
  // The curriculum being viewed is always in `on`; the interesting number is
  // the others, so a quest used in exactly one place stays quiet.
  const others = state.on.filter((c) => c.id !== curriculumId)
  if (!others.length && !state.available.length) return null

  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      <p className="text-xs font-medium text-neutral-500 mb-1">Also used by</p>
      {others.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 mb-1.5">
          {others.map((c) => (
            <li key={c.id}
              className="inline-flex items-center gap-1 rounded-full bg-optio-purple/10 px-2 py-0.5 text-xs text-optio-purple">
              {c.title}
              <button onClick={() => removeFrom(c.id)} disabled={busy}
                title={`Take it off ${c.title}`}
                className="text-optio-purple/60 hover:text-red-600 disabled:opacity-50">×</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-neutral-400 mb-1.5">No other curriculum.</p>
      )}
      {state.available.length > 0 && (
        <select className="text-xs border border-gray-300 rounded px-1.5 py-1"
          aria-label="Add this quest to another curriculum"
          value="" disabled={busy}
          onChange={(e) => e.target.value && addTo(e.target.value)}>
          <option value="">Add to another curriculum…</option>
          {state.available.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      )}
    </div>
  )
}

function QuestDetail({ orgId, curriculumId, quest, onRenamed, onDeleted }) {
  const confirm = useConfirm()
  const [detail, setDetail] = useState(null)   // { title, description, editable }
  const [editingInfo, setEditingInfo] = useState(false)
  const [infoDraft, setInfoDraft] = useState({ title: '', description: '' })
  const [busy, setBusy] = useState(false)
  const base = `/api/sis/curriculum/${curriculumId}/quests/${quest.id}`

  useEffect(() => {
    let active = true
    // The tasks GET carries the quest's description and editability too, so the
    // panel is one request; PresetTaskManager re-fetches the same URL for the
    // task list itself.
    api.get(withOrg(`${base}/tasks`, orgId))
      .then((r) => { if (active) setDetail({ ...(r.data?.quest || {}), editable: !!r.data?.editable }) })
      .catch(() => { if (active) setDetail({ editable: false }) })
    return () => { active = false }
  }, [base, orgId])

  const saveInfo = async () => {
    if (!infoDraft.title.trim()) { toast.error('A title is required'); return }
    setBusy(true)
    try {
      const { data } = await api.patch(withOrg(base, orgId), {
        title: infoDraft.title.trim(),
        description: infoDraft.description,
      })
      setDetail((d) => ({ ...d, ...data.quest }))
      setEditingInfo(false)
      onRenamed?.(data.quest?.title)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the quest')
    } finally {
      setBusy(false)
    }
  }

  const deleteOutright = async () => {
    if (!(await confirm(
      `Delete "${detail?.title || quest.title}" entirely? This removes it from every `
      + 'curriculum and class using it. Quests students have started can\'t be deleted.'
    ))) return
    setBusy(true)
    try {
      await api.delete(withOrg(`${base}/delete`, orgId))
      toast.success('Quest deleted')
      onDeleted?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not delete the quest')
    } finally {
      setBusy(false)
    }
  }

  if (!detail) return <p className="text-sm text-neutral-400 py-2">Loading…</p>

  return (
    <div className="mt-1 mb-2 ml-6 rounded-lg border border-gray-100 bg-neutral-50/60 p-3">
      {editingInfo ? (
        <div className="space-y-2 mb-2">
          <input value={infoDraft.title} className={inputCls}
            onChange={(e) => setInfoDraft({ ...infoDraft, title: e.target.value })} />
          <textarea value={infoDraft.description} rows={2} className={inputCls}
            placeholder="What is this quest about? (optional)"
            onChange={(e) => setInfoDraft({ ...infoDraft, description: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditingInfo(false)}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-neutral-600">
              Cancel
            </button>
            <button onClick={saveInfo} disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 mb-1">
          <p className="flex-1 text-sm text-neutral-600">
            {detail.description || <span className="text-neutral-400">No description.</span>}
          </p>
          {detail.editable && (
            <button
              onClick={() => {
                setInfoDraft({ title: detail.title || quest.title, description: detail.description || '' })
                setEditingInfo(true)
              }}
              className="shrink-0 inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-optio-purple"
              aria-label={`Edit ${detail.title || quest.title}`}>
              <PencilSquareIcon className="w-3.5 h-3.5" /> Edit details
            </button>
          )}
        </div>
      )}

      <PresetTaskManager base={`${base}/tasks`} orgId={orgId} />

      <QuestCurricula base={base} orgId={orgId} curriculumId={curriculumId} />

      {detail.editable && (
        <div className="mt-2 pt-2 border-t border-gray-100 text-right">
          <button onClick={deleteOutright} disabled={busy}
            className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline disabled:opacity-50">
            <TrashIcon className="w-3.5 h-3.5" /> Delete this quest entirely
          </button>
        </div>
      )}
    </div>
  )
}

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
  const [expandedId, setExpandedId] = useState(null) // quest whose detail is open

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
      const { data } = await api.put(withOrg(`/api/sis/curriculum/${curriculumId}/quests`, orgId),
        { quest_ids: next.map((q) => q.id) })
      setQuests(next)
      // Say where it landed. The bug this replaced was silent: an admin attached
      // a quest, was told nothing, and the students never saw it.
      const n = data?.pushed_to_classes || 0
      if (n) toast.success(`Added to ${n} class${n === 1 ? '' : 'es'}`)
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
      const created = await api.post(withOrg(`/api/sis/curriculum/${curriculumId}/quests/create`, orgId), {
        title: newTitle.trim(),
        description: newDesc.trim(),
        tasks: newTasks.filter((t) => t.title.trim()),
      })
      const n = created?.data?.pushed_to_classes || 0
      toast.success(n
        ? `Quest created and added to ${n} class${n === 1 ? '' : 'es'}`
        : 'Quest created and added')
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
          Added here, a quest goes straight onto every active class on this curriculum, where
          its students see it. Removing it here only takes it out of the library — classes keep
          what they have, with their own due dates.
        </p>
        {!quests.length ? <Empty>Nothing saved yet.</Empty> : (
          <ul className="divide-y divide-gray-50 mb-2">
            {quests.map((q) => {
              const open = expandedId === q.id
              return (
                <li key={q.id} className="py-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    {/* The row opens onto the quest itself — description, preset
                        tasks, and (for the school's own quests) full editing.
                        Admin-only: the per-quest routes behind it are too. */}
                    {canManage ? (
                      <button type="button"
                        onClick={() => setExpandedId(open ? null : q.id)}
                        aria-label={`${open ? 'Collapse' : 'Expand'} ${q.title}`}
                        className="flex items-center gap-1.5 flex-1 min-w-0 text-left text-neutral-800 hover:text-optio-purple">
                        {open
                          ? <ChevronDownIcon className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
                          : <ChevronRightIcon className="w-3.5 h-3.5 shrink-0 text-neutral-400" />}
                        <span className="truncate">{q.title}</span>
                      </button>
                    ) : (
                      <span className="text-neutral-800 flex-1 min-w-0 truncate">{q.title}</span>
                    )}
                    {canManage && (
                      <button type="button" disabled={busy}
                        aria-label={`Remove ${q.title}`}
                        onClick={() => saveQuests(quests.filter((x) => x.id !== q.id))}
                        className="text-xs text-red-500 hover:underline shrink-0">Remove</button>
                    )}
                  </div>
                  {open && (
                    <QuestDetail
                      orgId={orgId}
                      curriculumId={curriculumId}
                      quest={q}
                      onRenamed={(title) => {
                        if (!title) return
                        setQuests((prev) => prev.map((x) => (x.id === q.id ? { ...x, title } : x)))
                        onChanged?.()
                      }}
                      onDeleted={() => {
                        setExpandedId(null)
                        setQuests((prev) => prev.filter((x) => x.id !== q.id))
                        onChanged?.()
                      }}
                    />
                  )}
                </li>
              )
            })}
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

      <div className="space-y-4">
        {/* Resources: the links and documents this curriculum hands out. Beside
            the quests rather than under them because a teacher opening a
            curriculum is as likely to be sharing a video as assigning work. */}
        <CurriculumMaterials orgId={orgId} curriculumId={curriculumId} />

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
    </div>
  )
}
