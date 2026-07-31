import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  PlusIcon, TrashIcon, AcademicCapIcon, ChevronDownIcon, ChevronRightIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'

/**
 * ClassQuestsManager — the teacher's Quests tab for one SIS class.
 *
 * Assign existing quests (the school's own or the Optio library) or create a new
 * quest with preset "template" tasks that every enrolled student receives when
 * they start it. Preset tasks are editable only on the school's own quests.
 * Talks to /api/sis/classes/:classId/quests* (moderator-gated backend).
 */

const PILLARS = [
  ['art', 'Arts & Creativity'],
  ['stem', 'STEM'],
  ['communication', 'Communication'],
  ['wellness', 'Life & Wellness'],
  ['civics', 'Society & Culture'],
]
const PILLAR_LABEL = Object.fromEntries(PILLARS)

const blankTask = () => ({ title: '', pillar: 'art', xp_value: 100, is_required: true })

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

// ── Inline editor for a list of preset tasks (used when creating a quest) ──────
function TaskRows({ tasks, setTasks }) {
  const update = (i, patch) => setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
  const remove = (i) => setTasks((prev) => prev.filter((_, idx) => idx !== i))
  return (
    <div className="space-y-2">
      {tasks.map((t, i) => (
        <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2">
          <input value={t.title} onChange={(e) => update(i, { title: e.target.value })}
            placeholder={`Task ${i + 1} — what should the student do?`} className={inputCls} />
          <div className="flex flex-wrap items-center gap-2">
            <select value={t.pillar} onChange={(e) => update(i, { pillar: e.target.value })}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              {PILLARS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <label className="flex items-center gap-1 text-sm text-neutral-600">
              XP
              <input type="number" min={25} step={25} value={t.xp_value}
                onChange={(e) => update(i, { xp_value: e.target.value })}
                className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-neutral-600">
              <input type="checkbox" checked={t.is_required}
                onChange={(e) => update(i, { is_required: e.target.checked })} />
              Required
            </label>
            <button type="button" onClick={() => remove(i)}
              className="ml-auto p-1 text-gray-400 hover:text-red-500" aria-label="Remove task">
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setTasks((prev) => [...prev, blankTask()])}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-optio-purple hover:underline">
        <PlusIcon className="w-4 h-4" /> Add a preset task
      </button>
    </div>
  )
}

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
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not add the task')
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
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0 truncate text-neutral-800">{t.title}</span>
              <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-neutral-500">
                {PILLAR_LABEL[t.pillar] || t.pillar} · {t.xp_value} XP{t.is_required ? ' · required' : ''}
              </span>
              {editable && (
                <button onClick={() => del(t.id)} className="shrink-0 p-1 text-gray-400 hover:text-red-500"
                  aria-label="Remove task"><TrashIcon className="w-4 h-4" /></button>
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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/api/sis/classes/${classId}/quests`)
      setQuests(data?.quests || [])
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
  // class and leaves it in the school's library; delete removes it entirely.
  const unassign = async (q) => {
    if (!window.confirm(
      `Take "${q.title}" off this class?\n\nThe quest stays in your school's library and you can assign it again later.`)) return
    try {
      await api.delete(`/api/sis/classes/${classId}/quests/${q.quest_id}`)
      setQuests((prev) => prev.filter((x) => x.quest_id !== q.quest_id))
      toast.success('Removed from this class')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove the quest')
    }
  }

  const destroy = async (q) => {
    if (!window.confirm(
      `Delete "${q.title}" for good?\n\nThis removes it from your school's library, not just this class. It can't be undone.`)) return
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
    if (!window.confirm(
      `Delete "${q.title}" for good?\n\nThis removes it from your school's library. It can't be undone.`)) return
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
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Quest title (e.g. Watercolor Basics)" className={inputCls} />
              <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2}
                placeholder="What is this quest about? (optional)" className={inputCls} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Preset tasks (optional)</p>
                <TaskRows tasks={newTasks} setTasks={setNewTasks} />
              </div>
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
