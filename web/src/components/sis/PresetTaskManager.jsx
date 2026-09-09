import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PencilSquareIcon, TrashIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import { PILLARS, PILLAR_LABEL, blankTask, followPillar } from './QuestDraftForm'
import TaskSubjectPicker from './TaskSubjectPicker'
import { SUBJECT_LABEL } from '../../constants/diplomaSubjects'

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

/**
 * PresetTaskManager — the preset ("template") tasks on one quest, with full
 * add/edit/delete. Lived inside ClassQuestsManager until 2026-08-31, when the
 * admin curriculum page needed the same editor; `base` is the task collection
 * URL (…/quests/<id>/tasks on a class or a curriculum — same response shape).
 *
 * The server decides `editable`: false for Optio-library quests, whose tasks
 * are shared across schools and stay read-only everywhere.
 *
 * `orgId` (optional) is appended as ?organization_id — the curriculum routes
 * need it when a superadmin is viewing another org; class routes don't.
 */
export default function PresetTaskManager({ base, orgId }) {
  const q = orgId ? `?organization_id=${orgId}` : ''
  const [tasks, setTasks] = useState([])
  const [editable, setEditable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState(blankTask())
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`${base}${q}`)
      setTasks(data?.tasks || [])
      setEditable(Boolean(data?.editable))
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not load tasks')
    } finally {
      setLoading(false)
    }
  }, [base, q])

  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!draft.title.trim()) return
    setSaving(true)
    try {
      const { data } = await api.post(`${base}${q}`, draft)
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
    setEditDraft({
      title: t.title, pillar: t.pillar, xp_value: t.xp_value, description: t.description || '',
      diploma_subjects: t.diploma_subjects || [],
      subject_xp_distribution: t.subject_xp_distribution || {}
    })
  }

  const saveEdit = async (taskId) => {
    if (!editDraft?.title?.trim()) return
    setSaving(true)
    try {
      const { data } = await api.patch(`${base}/${taskId}${q}`, {
        title: editDraft.title.trim(),
        description: editDraft.description,
        pillar: editDraft.pillar,
        xp_value: Number(editDraft.xp_value) || 0,
        diploma_subjects: editDraft.diploma_subjects,
        subject_xp_distribution: editDraft.subject_xp_distribution,
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

  // iCreate, 2026-09-07 (4da3680d): "I'd also like to be able to duplicate
  // tasks." Their tasks come in sets that differ by a word, and each one was a
  // full retype of title, pillar and XP. The copy lands at the end of the list,
  // which is where the server puts it -- not next to its source, so that the
  // list the teacher is reading does not reshuffle under them.
  const duplicate = async (taskId) => {
    setSaving(true)
    try {
      const { data } = await api.post(`${base}/${taskId}/duplicate${q}`, {})
      setTasks((prev) => [...prev, data.task])
      toast.success('Task duplicated')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not duplicate the task')
    } finally {
      setSaving(false)
    }
  }

  const del = async (taskId) => {
    try {
      await api.delete(`${base}/${taskId}${q}`)
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
                      onChange={(e) => setEditDraft({ ...editDraft, ...followPillar(editDraft, e.target.value) })}>
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
                  <TaskSubjectPicker
                    subjects={editDraft.diploma_subjects}
                    distribution={editDraft.subject_xp_distribution}
                    xpValue={editDraft.xp_value} pillar={editDraft.pillar}
                    idPrefix={`preset-edit-${t.id}`}
                    onChange={(patch) => setEditDraft({ ...editDraft, ...patch })} />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate text-neutral-800">{t.title}</span>
                  <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-neutral-500">
                    {PILLAR_LABEL[t.pillar] || t.pillar} · {t.xp_value} XP{t.is_required ? ' · required' : ''}
                  </span>
                  {/* The credit the task earns, on the row rather than only in
                      the editor: a task filed under the wrong subject looks
                      exactly like a right one until you open it. */}
                  <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-optio-purple/10 text-optio-purple">
                    {(t.diploma_subjects || []).map((s) => SUBJECT_LABEL[s] || s).join(' · ') || 'No subject'}
                  </span>
                  {editable && (
                    <>
                      <button onClick={() => startEdit(t)} className="shrink-0 p-1 text-gray-400 hover:text-optio-purple"
                        aria-label={`Edit ${t.title}`}><PencilSquareIcon className="w-4 h-4" /></button>
                      <button onClick={() => duplicate(t.id)} disabled={saving}
                        className="shrink-0 p-1 text-gray-400 hover:text-optio-purple disabled:opacity-50"
                        title="Make a copy of this task at the end of the list"
                        aria-label={`Duplicate ${t.title}`}><DocumentDuplicateIcon className="w-4 h-4" /></button>
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
            <select value={draft.pillar} onChange={(e) => setDraft({ ...draft, ...followPillar(draft, e.target.value) })}
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
          <TaskSubjectPicker
            subjects={draft.diploma_subjects} distribution={draft.subject_xp_distribution}
            xpValue={draft.xp_value} pillar={draft.pillar} idPrefix="preset-new"
            onChange={(patch) => setDraft({ ...draft, ...patch })} />
        </div>
      ) : (
        <p className="text-xs text-neutral-400">
          This is an Optio-library quest — its preset tasks come with it and can't be edited here.
        </p>
      )}
    </div>
  )
}
