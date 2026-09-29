import React, { useState } from 'react'

import { useXpCalibrationAction } from '../../../hooks/api/useXpCalibration'
import XpSizeInput from '../XpSizeInput'
import { isXpSize, snapXp } from '../xpSizes'
import { formatSplit } from './XpCalibrationPanel'

/**
 * "Save as example" under the grader's XP field: turns the reviewer's call on
 * this submission into a worked example the AI credit reviewer sizes future
 * work by (the grader's Tune AI XP popup). The point is the moment of disagreement --
 * the AI said 100 XP fits, the reviewer knows a two-sentence comment is 25 --
 * so the correction teaches the next review instead of being made again.
 *
 * The description is prefilled with the task title, but what the AI needs is a
 * description of the WORK ("a two-sentence discussion comment"), which the
 * reviewer writes. No student name belongs in it: it goes into every prompt.
 * The subject split on screen is saved with it, so the AI learns both.
 */
const SaveXpExample = ({ completionId, taskTitle, xp, subjects }) => {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)

  if (open) {
    return (
      <ExampleForm
        completionId={completionId}
        initial={{ work: taskTitle || '', xp: isXpSize(xp) ? xp : (snapXp(xp) ?? 25), note: '' }}
        subjects={subjects}
        onDone={() => { setOpen(false); setSaved(true) }}
        onCancel={() => setOpen(false)}
      />
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        type="button"
        onClick={() => { setSaved(false); setOpen(true) }}
        className="font-medium text-optio-purple hover:text-optio-purple-dark min-h-[32px] md:min-h-0 touch-manipulation"
      >
        Save as AI example
      </button>
      {saved && <span className="text-gray-500">Saved. The next AI review uses it.</span>}
    </div>
  )
}

// Its own component so the mutation hook mounts only when the form is open:
// the closed button renders anywhere, with or without a query client.
const ExampleForm = ({ completionId, initial, subjects, onDone, onCancel }) => {
  const action = useXpCalibrationAction()
  const [error, setError] = useState(null)
  const [form, setForm] = useState(initial)

  const save = async () => {
    setError(null)
    try {
      await action.mutateAsync({
        kind: 'add',
        example: {
          work: form.work.trim(),
          xp: form.xp,
          note: form.note.trim(),
          subjects: hasSubjects ? subjects : undefined,
          completion_id: completionId,
        },
      })
      onDone()
    } catch (err) {
      setError(err?.response?.data?.error?.message || 'Could not save the example')
    }
  }

  const hasSubjects = Object.values(subjects || {}).some(v => parseInt(v, 10) > 0)
  const canSave = form.work.trim().length >= 3 && isXpSize(form.xp)
  const input = 'w-full text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple px-3 py-2'

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
      <p className="text-xs text-gray-600">
        Describe the work, not the student. The AI matches future work to this.
      </p>
      <div className="grid gap-2 grid-cols-[1fr_5.5rem]">
        <input
          aria-label="Work"
          value={form.work}
          onChange={e => setForm(f => ({ ...f, work: e.target.value }))}
          placeholder="A two-sentence comment in an online class discussion"
          maxLength={300}
          className={input}
        />
        <XpSizeInput
          aria-label="Example XP"
          value={form.xp}
          onChange={n => setForm(f => ({ ...f, xp: n }))}
          className={input}
        />
        <input
          aria-label="Why (optional)"
          value={form.note}
          onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
          placeholder="Why (optional)"
          maxLength={300}
          className={`${input} col-span-2`}
        />
      </div>
      {hasSubjects && (
        <p className="text-xs text-gray-600">Subjects saved with it: {formatSplit(toPercent(subjects))}</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!canSave || action.isPending}
          className="btn-primary px-3 py-1.5 rounded-lg text-xs disabled:opacity-40"
        >
          Save example
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-gray-600 hover:text-gray-900">
          Cancel
        </button>
      </div>
    </div>
  )
}

export default SaveXpExample

// For display only; the server stores its own percentages (subject_mix.to_percent).
const toPercent = (split) => {
  const entries = Object.entries(split || {}).map(([k, v]) => [k, parseInt(v, 10) || 0]).filter(([, v]) => v > 0)
  const total = entries.reduce((t, [, v]) => t + v, 0)
  return Object.fromEntries(entries.map(([k, v]) => [k, Math.round((v * 100) / total)]))
}
