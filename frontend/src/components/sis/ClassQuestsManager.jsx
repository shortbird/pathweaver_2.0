import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  PlusIcon, TrashIcon, AcademicCapIcon, ChevronDownIcon, ChevronRightIcon,
  PencilSquareIcon, CalendarDaysIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import QuestDraftForm, { PILLARS, PILLAR_LABEL, blankTask } from './QuestDraftForm'
import QuestAiDraftPanel from './QuestAiDraftPanel'
import { useConfirm } from '../../contexts/ConfirmContext'

/**
 * ClassQuestsManager — the teacher's Quests tab for one SIS class.
 *
 * Assign existing quests (the school's own or the Optio library) or create a new
 * quest with preset "template" tasks that every enrolled student receives when
 * they start it. Preset tasks are editable only on the school's own quests.
 * Talks to /api/sis/classes/:classId/quests* (moderator-gated backend).
 */

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

// ── Manage preset tasks on an already-assigned, school-owned quest ────────────
function PresetTaskManager({ classId, questId }) {
  const [tasks, setTasks] = useState([])
  const [editable, setEditable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState(blankTask())
  const [saving, setSaving] = useState(false)

  const base = `/api/sis/classes/${classId}/quests/${questId}/tasks`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get(base)
      setTasks(data?.tasks || [])
      setEditable(Boolean(data?.editable))
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not load tasks')
    } finally {
      setLoading(false)
    }
  }, [base])

  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!draft.title.trim()) return
    setSaving(true)
    try {
      const { data } = await api.post(base, draft)
      setTasks((prev) => [...prev, data.task])
      setDraft(blankTask())
      toast.success('Task added and sent to every student on this quest')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not add the task')
    } finally {
      setSaving(false)
    }
  }

  // Editing in place, rather than delete-and-retype: deleting a task takes any
  // student work attached to it, so "fix the XP" must not mean "start over"
  // (Gryffin, 2026-08-27).
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(null)

  const startEdit = (t) => {
    setEditingId(t.id)
    setEditDraft({ title: t.title, pillar: t.pillar, xp_value: t.xp_value, description: t.description || '' })
  }

  const saveEdit = async (taskId) => {
    if (!editDraft?.title?.trim()) return
    setSaving(true)
    try {
      const { data } = await api.patch(`${base}/${taskId}`, {
        title: editDraft.title.trim(),
        description: editDraft.description,
        pillar: editDraft.pillar,
        xp_value: Number(editDraft.xp_value) || 0,
      })
      setTasks((prev) => prev.map((t) => (t.id === taskId ? data.task : t)))
      setEditingId(null)
      toast.success('Task updated for every student on this quest')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the task')
    } finally {
      setSaving(false)
    }
  }

  const del = async (taskId) => {
    try {
      await api.delete(`${base}/${taskId}`)
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove the task')
    }
  }

  if (loading) return <p className="text-sm text-neutral-400 py-2">Loading tasks…</p>

  return (
    <div className="pt-2">
      {tasks.length === 0 && (
        <p className="text-sm text-neutral-500 mb-2">No preset tasks yet. Students would build their own.</p>
      )}
      {tasks.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {tasks.map((t) => (
            <li key={t.id} className="text-sm">
              {editingId === t.id ? (
                <div className="rounded-lg border border-optio-purple/40 p-3 space-y-2">
                  <input value={editDraft.title} className={inputCls}
                    onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })} />
                  <textarea value={editDraft.description} rows={2} className={inputCls}
                    placeholder="Instructions for this task (optional)"
                    onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })} />
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={editDraft.pillar} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                      onChange={(e) => setEditDraft({ ...editDraft, pillar: e.target.value })}>
                      {PILLARS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                    <input type="number" min="0" value={editDraft.xp_value}
                      className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                      onChange={(e) => setEditDraft({ ...editDraft, xp_value: e.target.value })} />
                    <span className="text-xs text-neutral-500">XP</span>
                    <button onClick={() => saveEdit(t.id)} disabled={saving}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm disabled:opacity-50">
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-neutral-600">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate text-neutral-800">{t.title}</span>
                  <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-neutral-500">
                    {PILLAR_LABEL[t.pillar] || t.pillar} · {t.xp_value} XP{t.is_required ? ' · required' : ''}
                  </span>
                  {editable && (
                    <>
                      <button onClick={() => startEdit(t)} className="shrink-0 p-1 text-gray-400 hover:text-optio-purple"
                        aria-label={`Edit ${t.title}`}><PencilSquareIcon className="w-4 h-4" /></button>
                      <button onClick={() => del(t.id)} className="shrink-0 p-1 text-gray-400 hover:text-red-500"
                        aria-label="Remove task"><TrashIcon className="w-4 h-4" /></button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable ? (
        <div className="rounded-lg border border-gray-200 p-3 space-y-2">
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Add a preset task…" className={inputCls} />
          <div className="flex flex-wrap items-center gap-2">
            <select value={draft.pillar} onChange={(e) => setDraft({ ...draft, pillar: e.target.value })}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              {PILLARS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <label className="flex items-center gap-1 text-sm text-neutral-600">
              XP
              <input type="number" min={25} step={25} value={draft.xp_value}
                onChange={(e) => setDraft({ ...draft, xp_value: e.target.value })}
                className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-neutral-600">
              <input type="checkbox" checked={draft.is_required}
                onChange={(e) => setDraft({ ...draft, is_required: e.target.checked })} />
              Required
            </label>
            <button onClick={add} disabled={saving || !draft.title.trim()}
              className="ml-auto px-3 py-1.5 rounded-lg bg-optio-purple text-white text-sm font-semibold disabled:opacity-50">
              {saving ? 'Adding…' : 'Add task'}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-neutral-400">
          This is an Optio-library quest — its preset tasks come with it and can't be edited here.
        </p>
      )}
    </div>
  )
}

export default function ClassQuestsManager({ classId }) {
  const confirm = useConfirm()
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  // Assign panel state
  const [mode, setMode] = useState(null) // null | 'existing' | 'new'
  const [search, setSearch] = useState('')
  const [available, setAvailable] = useState([])
  const [searching, setSearching] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newTasks, setNewTasks] = useState([blankTask()])
  const [creating, setCreating] = useState(false)
  // Curriculum attached to this class, each with its saved quest set.
  const [curricula, setCurricula] = useState([])
  const [syncing, setSyncing] = useState(null) // curriculum id mid-copy/save

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [q, c] = await Promise.all([
        api.get(`/api/sis/classes/${classId}/quests`),
        // Never fatal: a class with no curriculum attached simply has nothing
        // to inherit, and that must not break the quest list.
        api.get(`/api/sis/classes/${classId}/curriculum-quests`).catch(() => ({ data: {} })),
      ])
      setQuests(q.data?.quests || [])
      setCurricula(c.data?.curricula || [])
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not load class quests')
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => { load() }, [load])

  const loadAvailable = useCallback(async (q) => {
    setSearching(true)
    try {
      const { data } = await api.get(`/api/sis/classes/${classId}/assignable-quests`, { params: { search: q } })
      setAvailable(data?.quests || [])
    } catch {
      setAvailable([])
    } finally {
      setSearching(false)
    }
  }, [classId])

  useEffect(() => {
    if (mode !== 'existing') return
    const t = setTimeout(() => loadAvailable(search), 250)
    return () => clearTimeout(t)
  }, [mode, search, loadAvailable])

  // Seed this section from a curriculum's saved set. Additive — quests already
  // here keep their dates.
  const copyFromCurriculum = async (c) => {
    setSyncing(c.curriculum_id)
    try {
      const { data } = await api.post(`/api/sis/classes/${classId}/quests/from-curriculum`,
        { curriculum_id: c.curriculum_id })
      const n = data?.added || 0
      toast.success(n ? `Added ${n} quest${n === 1 ? '' : 's'} from ${c.title}`
        : 'Everything from that curriculum is already on this class')
      if (data?.skipped_unavailable) {
        toast(`${data.skipped_unavailable} saved quest${data.skipped_unavailable === 1 ? ' is' : 's are'} no longer available`)
      }
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not add the curriculum quests')
    } finally {
      setSyncing(null)
    }
  }

  // Save this section's list back, so next year's section starts from it.
  const saveToCurriculum = async (c) => {
    if (!(await confirm(
      `Save this class's ${quests.length} quest${quests.length === 1 ? '' : 's'} to "${c.title}"?\n\n`
      + 'This replaces the curriculum\'s saved set. Classes that already copied from it keep what they have — '
      + 'the change applies next time a class is set up from this curriculum.'
    ))) return
    setSyncing(c.curriculum_id)
    try {
      const { data } = await api.post(`/api/sis/classes/${classId}/quests/to-curriculum`,
        { curriculum_id: c.curriculum_id })
      toast.success(`Saved ${data?.saved ?? 0} quest${data?.saved === 1 ? '' : 's'} to ${c.title}`)
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save to the curriculum')
    } finally {
      setSyncing(null)
    }
  }

  const assignExisting = async (questId) => {
    try {
      await api.post(`/api/sis/classes/${classId}/quests`, { quest_id: questId })
      toast.success('Quest assigned')
      setMode(null); setSearch('')
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not assign the quest')
    }
  }

  const createNew = async () => {
    if (!newTitle.trim()) { toast.error('Give the quest a title'); return }
    setCreating(true)
    try {
      const tasks = newTasks.filter((t) => t.title.trim())
      await api.post(`/api/sis/classes/${classId}/quests/create`, {
        title: newTitle.trim(), description: newDesc.trim(), tasks,
      })
      toast.success('Quest created and assigned')
      setMode(null); setNewTitle(''); setNewDesc(''); setNewTasks([blankTask()])
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not create the quest')
    } finally {
      setCreating(false)
    }
  }

  // Two different things, kept visibly apart: unassign takes the quest off this
  // Due dates live on class_quests, so they are per-class: the same quest can be
  // due on different days for two sections. The column and the student-facing
  // badges existed already; nothing could write it from here (Gryffin,
  // 2026-08-27: "How do we add due dates to any tasks that we assign?").
  const [dueEditing, setDueEditing] = useState(null)
  const [dueValue, setDueValue] = useState('')

  const saveDue = async (questId, value) => {
    try {
      await api.patch(`/api/sis/classes/${classId}/quests/${questId}`, {
        due_date: value ? new Date(value).toISOString() : null,
      })
      setQuests((prev) => prev.map((q) => (
        q.quest_id === questId
          ? { ...q, due_date: value ? new Date(value).toISOString() : null }
          : q)))
      setDueEditing(null)
      toast.success(value ? 'Due date set' : 'Due date cleared')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the due date')
    }
  }

  // class and leaves it in the school's library; delete removes it entirely.
  const unassign = async (q) => {
    if (!(await confirm(
      `Take "${q.title}" off this class?\n\nThe quest stays in your school's library and you can assign it again later.`))) return
    try {
      await api.delete(`/api/sis/classes/${classId}/quests/${q.quest_id}`)
      setQuests((prev) => prev.filter((x) => x.quest_id !== q.quest_id))
      toast.success('Removed from this class')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove the quest')
    }
  }

  const destroy = async (q) => {
    if (!(await confirm(
      `Delete "${q.title}" for good?\n\nThis removes it from your school's library, not just this class. It can't be undone.`))) return
    try {
      await api.delete(`/api/sis/classes/${classId}/quests/${q.quest_id}/delete`)
      setQuests((prev) => prev.filter((x) => x.quest_id !== q.quest_id))
      toast.success('Quest deleted')
    } catch (err) {
      // 409 = students have started it. The message explains what to do instead.
      toast.error(err?.response?.data?.error || 'Could not delete the quest')
    }
  }

  // Same delete, reached from the assign picker — for a quest that isn't on any
  // class (a teacher's abandoned draft from last year, iCreate 2026-07-30).
  const destroyUnassigned = async (q) => {
    if (!(await confirm(
      `Delete "${q.title}" for good?\n\nThis removes it from your school's library. It can't be undone.`))) return
    try {
      await api.delete(`/api/sis/classes/${classId}/quests/${q.quest_id}/delete`)
      setAvailable((prev) => prev.filter((x) => x.quest_id !== q.quest_id))
      toast.success('Quest deleted')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not delete the quest')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-neutral-500">
          Quests you assign show up for enrolled students as “assigned to you.” When a student starts one,
          any preset tasks are added to their quest automatically.
        </p>
        {!mode && (
          <button onClick={() => setMode('existing')}
            className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold">
            <PlusIcon className="w-4 h-4" /> Assign a quest
          </button>
        )}
      </div>

      {/* The curriculum round trip. Only rendered when a curriculum is actually
          attached — the point is to make the reusable set obvious where the
          teacher is already working, not to add a permanent empty panel. */}
      {curricula.map((c) => (
        <div key={c.curriculum_id}
          className="rounded-xl border border-optio-purple/20 bg-optio-purple/5 p-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <AcademicCapIcon className="w-5 h-5 text-optio-purple shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-900 truncate">{c.title}</p>
            <p className="text-xs text-neutral-500">
              {c.quests.length === 0
                ? 'No quests saved to this curriculum yet — save this class\u2019s list to reuse it next year.'
                : c.missing_count > 0
                  ? `${c.missing_count} of ${c.quests.length} saved quest${c.quests.length === 1 ? '' : 's'} not on this class yet`
                  : `All ${c.quests.length} saved quest${c.quests.length === 1 ? '' : 's'} are on this class`}
            </p>
          </div>
          {c.missing_count > 0 && (
            <button type="button" disabled={syncing === c.curriculum_id}
              onClick={() => copyFromCurriculum(c)}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-optio-purple/40 text-sm font-medium text-optio-purple hover:bg-optio-purple/10 disabled:opacity-50">
              {syncing === c.curriculum_id ? 'Adding\u2026' : `Add ${c.missing_count} to this class`}
            </button>
          )}
          {quests.length > 0 && (
            <button type="button" disabled={syncing === c.curriculum_id}
              onClick={() => saveToCurriculum(c)}
              title="Replaces the curriculum's saved set with this class's quests"
              className="shrink-0 text-sm font-medium text-optio-purple hover:underline disabled:opacity-50">
              {syncing === c.curriculum_id ? '\u2026' : 'Save this class\u2019s quests to the curriculum'}
            </button>
          )}
        </div>
      ))}

      {/* Assign panel */}
      {mode && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex gap-1 border-b border-gray-200 mb-4">
            {[['existing', 'Assign existing'], ['new', 'Create new']].map(([k, label]) => (
              <button key={k} onClick={() => setMode(k)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                  mode === k ? 'border-optio-purple text-optio-purple' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}>
                {label}
              </button>
            ))}
            <button onClick={() => setMode(null)} className="ml-auto text-sm text-neutral-400 hover:text-neutral-700">Cancel</button>
          </div>

          {mode === 'existing' && (
            <div>
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search quests to assign…" className={`${inputCls} mb-3`} />
              {searching && <p className="text-sm text-neutral-400">Searching…</p>}
              {!searching && available.length === 0 && (
                <p className="text-sm text-neutral-500">No quests found. Try “Create new” instead.</p>
              )}
              <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {available.map((q) => (
                  <li key={q.quest_id} className="py-2.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-800 truncate">{q.title}</p>
                      <p className="text-xs text-neutral-400">
                        {q.source === 'organization' ? 'Your school' : 'Optio library'}
                        {q.template_task_count ? ` · ${q.template_task_count} preset task${q.template_task_count === 1 ? '' : 's'}` : ' · no preset tasks'}
                      </p>
                    </div>
                    {/* A quest created by mistake and never assigned had no way
                        out: delete only existed on assigned quests. It's the
                        school's own quest, so it can be deleted from here too
                        (the API still refuses if a student has started it). */}
                    {q.source === 'organization' && (
                      <button onClick={() => destroyUnassigned(q)}
                        className="shrink-0 text-sm text-neutral-400 hover:text-red-500 hover:underline"
                        title="Delete it from your school's library for good">
                        Delete
                      </button>
                    )}
                    <button onClick={() => assignExisting(q.quest_id)}
                      className="shrink-0 px-3 py-1.5 rounded-lg border border-optio-purple/40 text-optio-purple text-sm font-semibold hover:bg-optio-purple/5">
                      Assign
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mode === 'new' && (
            <div className="space-y-3">
              {/* Teachers get the same AI head start admins get in the
                  curriculum library — this is the screen where most quests are
                  actually written. */}
              <QuestAiDraftPanel
                hasDraft={Boolean(newTitle.trim() || newDesc.trim() || newTasks.some((t) => t.title.trim()))}
                onDrafted={({ title, description, tasks }) => {
                  setNewTitle(title); setNewDesc(description); setNewTasks(tasks)
                }}
              />
              <QuestDraftForm
                title={newTitle} setTitle={setNewTitle}
                description={newDesc} setDescription={setNewDesc}
                tasks={newTasks} setTasks={setNewTasks}
                titlePlaceholder="Quest title (e.g. Watercolor Basics)"
                descriptionPlaceholder="What is this quest about? (optional)"
                taskHint="Preset tasks are copied to each student when they start the quest. Leave it empty and they write their own."
              />
              <div className="flex justify-end">
                <button onClick={createNew} disabled={creating || !newTitle.trim()}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
                  {creating ? 'Creating…' : 'Create & assign'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Assigned quests */}
      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : quests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
          <AcademicCapIcon className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
          <p className="text-sm text-neutral-500">No quests assigned yet. Assign one to give your class something to work on.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {quests.map((q) => {
            const open = expanded === q.quest_id
            return (
              <li key={q.quest_id} className="bg-white rounded-xl border border-gray-200">
                <div className="flex items-center gap-3 p-4">
                  <button onClick={() => setExpanded(open ? null : q.quest_id)}
                    className="shrink-0 text-neutral-400 hover:text-neutral-700" aria-label="Toggle tasks">
                    {open ? <ChevronDownIcon className="w-5 h-5" /> : <ChevronRightIcon className="w-5 h-5" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 truncate">{q.title}</p>
                    <p className="text-xs text-neutral-400">
                      {q.template_task_count
                        ? `${q.template_task_count} preset task${q.template_task_count === 1 ? '' : 's'}`
                        : 'No preset tasks'}
                      {!q.editable_tasks ? ' · Optio library' : ''}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {q.due_date && dueEditing !== q.quest_id && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-700 whitespace-nowrap">
                        Due {new Date(q.due_date).toLocaleDateString()}
                      </span>
                    )}
                    {dueEditing === q.quest_id ? (
                      <div className="flex items-center gap-1.5">
                        <input type="date" value={dueValue} autoFocus
                          onChange={(e) => setDueValue(e.target.value)}
                          className="rounded-lg border border-gray-300 px-2 py-1 text-sm" />
                        <button onClick={() => saveDue(q.quest_id, dueValue)}
                          className="px-2 py-1 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-xs">
                          Save
                        </button>
                        {q.due_date && (
                          <button onClick={() => saveDue(q.quest_id, '')}
                            className="px-2 py-1 rounded-lg border border-gray-300 text-xs text-neutral-600">
                            Clear
                          </button>
                        )}
                        <button onClick={() => setDueEditing(null)}
                          className="px-2 py-1 text-xs text-neutral-500 hover:text-neutral-700">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setDueValue(q.due_date ? new Date(q.due_date).toISOString().slice(0, 10) : '')
                          setDueEditing(q.quest_id)
                        }}
                        className="px-2 py-1 flex items-center gap-1 text-xs text-neutral-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg whitespace-nowrap">
                        <CalendarDaysIcon className="w-4 h-4" />
                        {q.due_date ? 'Change due date' : 'Set due date'}
                      </button>
                    )}
                    <button onClick={() => unassign(q)}
                      title="Take it off this class — the quest stays in your library"
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-neutral-600 text-sm font-medium hover:bg-gray-50">
                      Unassign
                    </button>
                    {/* Only the school's own quests can be deleted; library
                        quests are shared with other schools. */}
                    {q.editable_tasks && (
                      <button onClick={() => destroy(q)}
                        title="Delete it from your school's library for good"
                        className="p-1.5 text-gray-400 hover:text-red-500"
                        aria-label={`Delete ${q.title}`}>
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                {open && (
                  <div className="border-t border-gray-100 px-4 pb-4">
                    <PresetTaskManager classId={classId} questId={q.quest_id} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
