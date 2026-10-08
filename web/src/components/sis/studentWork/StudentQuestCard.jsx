import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../../contexts/ConfirmContext'
import Button from '../../ui/Button'
import { INPUT_CLASS, INLINE_INPUT_CLASS } from '../../ui/Input'
import { studentWorkApi } from '../../../hooks/api/useStudentWork'

/**
 * One quest on a student's page: where it came from, how far they are, every
 * task (done or not, with its submission one click away), and what a teacher
 * can do about it for this one student -- write them a task, take back a task
 * someone added, and, on a quest given to them by name, change its due date
 * or take it back.
 *
 * A quest that reaches them through a class is the class's to change; this
 * card only adds tasks to it.
 */

export const dueInput = (iso) => (iso ? iso.slice(0, 10) : '')

export const dueLabel = (iso) => {
  if (!iso) return null
  const day = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const label = day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return day < today ? { text: `Was due ${label}`, late: true } : { text: `Due ${label}`, late: false }
}

export default function StudentQuestCard({ orgId, student, quest: q, onChanged, defaultOpen = false }) {
  const confirm = useConfirm()
  const first = (student.name || '').split(' ')[0] || 'this student'
  const [open, setOpen] = useState(defaultOpen)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ title: '', description: '', xp_value: 50 })
  const [openTaskId, setOpenTaskId] = useState(null)
  const individual = q.individual
  const due = dueLabel(individual?.due_date)
  const active = !q.completed_at && !q.set_aside

  const run = async (fn, ok) => {
    setBusy(true)
    try {
      await fn()
      if (ok) toast.success(ok)
      await onChanged?.()
      return true
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Something went wrong. Try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const changeDue = (value) => run(
    () => studentWorkApi.setDueDate(orgId, student.id, q.quest_id, value),
    value ? 'Due date saved' : 'Due date cleared')

  const takeBack = async () => {
    const also = q.classes.length
      ? ` ${first} still has it through ${q.classes.join(', ')}.`
      : q.tasks_done ? ` ${first} has started it, so their work stays in their account.` : ''
    if (!(await confirm(`Take “${q.title}” back from ${first}?${also}`))) return
    await run(() => studentWorkApi.takeBack(orgId, student.id, q.quest_id), `Took “${q.title}” back`)
  }

  const addTask = async (e) => {
    e.preventDefault()
    if (!draft.title.trim()) return
    const ok = await run(() => studentWorkApi.addTask(orgId, student.id, q.quest_id, {
      title: draft.title.trim(),
      description: draft.description.trim(),
      xp_value: Number(draft.xp_value) || 50,
    }), `Added a task for ${first}`)
    if (ok) {
      setDraft({ title: '', description: '', xp_value: 50 })
      setAdding(false)
      setOpen(true)
    }
  }

  const removeTask = async (t) => {
    if (!(await confirm(`Remove “${t.title}” from ${first}’s quest?`))) return
    await run(() => studentWorkApi.removeTask(orgId, student.id, t.id), 'Task removed')
  }

  const source = [
    individual && `Assigned by ${individual.assigned_by_name || 'a teacher'}`,
    q.classes.length && `Class: ${q.classes.join(', ')}`,
    !individual && !q.classes.length && 'Started on their own',
  ].filter(Boolean).join(' · ')

  return (
    <article className="rounded-xl border border-gray-200 bg-white" aria-label={q.title}>
      <div className="p-4 flex items-start gap-3">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
          className="flex-1 min-w-0 text-left">
          <span className="block font-semibold text-neutral-900">{q.title}</span>
          <span className="block text-xs text-neutral-500 mt-0.5">{source}</span>
          <span className="block text-sm text-neutral-600 mt-1">
            {q.tasks_total
              ? `${q.tasks_done} of ${q.tasks_total} tasks done${q.xp_earned ? ` · ${q.xp_earned} XP` : ''}`
              : q.started ? 'No tasks yet' : 'Not started'}
            {q.completed_at && ' · Finished'}
            {q.set_aside && ' · Set aside'}
          </span>
        </button>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {due && active && (
            <span className={`text-[11px] px-1.5 py-0.5 rounded ${
              due.late ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
              {due.text}
            </span>
          )}
          <span className="text-xs text-neutral-400">{open ? 'Hide tasks' : 'Show tasks'}</span>
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
          {!q.tasks.length && <p className="text-sm text-neutral-400">No tasks on this quest yet.</p>}
          <ul className="space-y-1">
            {q.tasks.map((t) => (
              <li key={t.id} className="text-sm">
                <div className="flex items-start gap-2">
                  <span className={t.done ? 'text-green-600' : 'text-neutral-300'} aria-hidden="true">
                    {t.done ? '✓' : '○'}
                  </span>
                  <span className="sr-only">{t.done ? 'Done:' : 'Not done:'}</span>
                  {t.done && t.completion_id ? (
                    <Link to={`/classes?tab=submissions&completion_id=${t.completion_id}`}
                      className="text-neutral-500 line-through hover:text-optio-purple hover:no-underline"
                      title="See the submission">
                      {t.title}
                    </Link>
                  ) : (
                    <span className={t.done ? 'text-neutral-500 line-through' : 'text-neutral-700'}>{t.title}</span>
                  )}
                  {t.added_by_name && (
                    <span className="text-[11px] text-neutral-400 whitespace-nowrap">added by {t.added_by_name}</span>
                  )}
                  <span className="ml-auto flex items-center gap-3 shrink-0">
                    {t.description && (
                      <button type="button" onClick={() => setOpenTaskId(openTaskId === t.id ? null : t.id)}
                        aria-expanded={openTaskId === t.id}
                        className="text-xs text-neutral-400 hover:text-optio-purple">
                        {openTaskId === t.id ? 'Hide' : 'Details'}
                      </button>
                    )}
                    {t.removable && (
                      <button type="button" onClick={() => removeTask(t)} disabled={busy}
                        className="text-xs text-neutral-400 hover:text-red-600 disabled:opacity-40">
                        Remove
                      </button>
                    )}
                  </span>
                </div>
                {openTaskId === t.id && t.description && (
                  <p className="ml-6 mt-0.5 mb-1 text-xs text-neutral-600 whitespace-pre-wrap">{t.description}</p>
                )}
              </li>
            ))}
          </ul>

          {active && (adding ? (
            <form onSubmit={addTask} className="rounded-lg bg-gray-50 p-3 space-y-2" aria-label="New task">
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder={`A task just for ${first}`} aria-label="Task title" autoFocus
                className={INPUT_CLASS} maxLength={200} />
              <textarea value={draft.description} rows={2}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="What should they do? (optional)" aria-label="Task description"
                className={INPUT_CLASS} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm text-neutral-600 flex items-center gap-2">
                  XP
                  <input type="number" min={1} max={200} value={draft.xp_value}
                    onChange={(e) => setDraft({ ...draft, xp_value: e.target.value })}
                    className={`${INLINE_INPUT_CLASS} w-24`} aria-label="XP" />
                </label>
                <span className="flex gap-2">
                  <Button size="xs" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
                  <Button size="xs" type="submit" disabled={busy || !draft.title.trim()}>Add task</Button>
                </span>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => setAdding(true)}
              className="text-sm font-medium text-optio-purple hover:underline">
              + Add a task for {first}
            </button>
          ))}

          {individual && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100">
              {active ? (
                <label className="text-sm text-neutral-600 flex items-center gap-2">
                  Due
                  <input type="date" defaultValue={dueInput(individual.due_date)} disabled={busy}
                    onChange={(e) => changeDue(e.target.value)}
                    className={INLINE_INPUT_CLASS} aria-label={`Due date for ${q.title}`} />
                </label>
              ) : <span />}
              <button type="button" onClick={takeBack} disabled={busy}
                className="text-sm text-neutral-500 hover:text-red-600 hover:underline disabled:opacity-40">
                Take this quest back
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  )
}
