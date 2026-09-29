import React, { useEffect, useState } from 'react'

import { Modal } from '../../ui/Modal'
import XpSizeInput from '../XpSizeInput'
import { formatSubject } from './SubjectSplitEditor'
import { useXpCalibration, useXpCalibrationAction } from '../../../hooks/api/useXpCalibration'

/**
 * How the AI credit reviewer sizes XP and splits subjects, edited in a popup
 * from the grader's AI card ("Tune AI XP") -- next to the lines it changes, so
 * a reviewer who disagrees fixes the cause without leaving the submission.
 *
 * Three parts, in the order they need attention:
 * - Waiting for you: approvals that disagreed with the AI's XP or subjects,
 *   queued as suggested examples (backend calibration_capture.py). None reach
 *   the AI until approved here, because some overrides are about one student.
 * - The XP scale: plain text, one line per size.
 * - Worked examples: the cases the AI matches similar work to.
 *
 * Everything applies to the next AI review -- no deploy. The rules that
 * protect a student (never raise a claim, never below 25) are in the backend
 * prompt and are not editable here.
 */
const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm'
const blankExample = () => ({ work: '', xp: 25, note: '' })

const errorText = (err, fallback) =>
  err?.response?.data?.error?.message || err?.response?.data?.error || fallback

const titleCase = (text) => text.replace(/\b\w/g, c => c.toUpperCase())

export const formatSplit = (split) =>
  Object.entries(split || {})
    .map(([k, pct]) => `${titleCase(formatSubject(k))} ${pct}%`)
    .join(', ')

export function XpCalibrationPanel() {
  const { data, isLoading, error: loadError } = useXpCalibration()
  const action = useXpCalibrationAction()
  const [error, setError] = useState(null)
  const [guide, setGuide] = useState('')
  const [form, setForm] = useState(blankExample)

  const savedGuide = data?.guide?.content || ''
  useEffect(() => { setGuide(savedGuide) }, [savedGuide])

  const run = async (op, failure) => {
    setError(null)
    try {
      return await action.mutateAsync(op)
    } catch (err) {
      setError(errorText(err, failure))
      return null
    }
  }

  const addExample = async () => {
    const done = await run({
      kind: 'add',
      example: { work: form.work.trim(), xp: form.xp, note: form.note.trim() },
    }, 'Could not add the example')
    if (done) setForm(blankExample())
  }

  const examples = data?.examples || []
  const suggested = examples.filter(e => e.status === 'suggested')
  const kept = examples.filter(e => e.status !== 'suggested')
  const activeCount = kept.filter(e => e.status === 'active').length
  const canAdd = form.work.trim().length >= 3

  const edit = (ex, changes, failure = 'Could not save the example') =>
    run({ kind: 'edit', id: ex.id, changes }, failure)
  const remove = (ex) => run({ kind: 'remove', id: ex.id }, 'Could not remove the example')

  if (isLoading) return <p className="text-sm text-gray-500">Loading...</p>

  return (
    <div className="space-y-6">
      {(error || loadError) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex justify-between">
          <span>{error || errorText(loadError, 'Could not load the XP calibration')}</span>
          {error && <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">Dismiss</button>}
        </div>
      )}

      {suggested.length > 0 && (
        <section aria-labelledby="xp-cal-queue">
          <h3 id="xp-cal-queue" className="text-base font-semibold mb-1">
            Waiting for you ({suggested.length})
          </h3>
          <p className="text-sm text-gray-500 mb-3">
            You approved these at a different XP or subject split than the AI suggested.
            Approve one to teach the AI. Dismiss one-off cases.
          </p>
          <ul className="divide-y rounded-lg border">
            {suggested.map(ex => (
              <ExampleRow
                key={ex.id}
                example={ex}
                busy={action.isPending}
                onEdit={(changes) => edit(ex, changes)}
                onApprove={() => edit(ex, { status: 'active' }, 'Could not approve the example')}
                onRemove={() => remove(ex)}
              />
            ))}
          </ul>
        </section>
      )}

      <section className={suggested.length ? 'border-t pt-6' : ''}>
        <h3 className="text-base font-semibold mb-1">XP scale</h3>
        <p className="text-sm text-gray-500 mb-4">
          The AI credit reviewer sizes each submission against this scale, then compares
          the size to the XP the student claimed. Changes apply to the next review. The AI
          can never raise a student&apos;s XP or go below 25, whatever this says.
        </p>
        <textarea
          aria-label="XP scale"
          value={guide}
          onChange={e => setGuide(e.target.value)}
          rows={10}
          className={`${inputClass} font-mono`}
        />
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <button
            onClick={() => run({ kind: 'save-guide', content: guide }, 'Could not save the scale')}
            disabled={action.isPending || !guide.trim() || guide === savedGuide}
            className="btn-primary px-4 py-2 rounded-lg disabled:opacity-40"
          >
            Save scale
          </button>
          {data?.guide?.modified && (
            <button
              onClick={() => run({ kind: 'reset-guide' }, 'Could not reset the scale')}
              disabled={action.isPending}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Reset to default
            </button>
          )}
          <span className="text-xs text-gray-500">
            {data?.guide?.modified ? 'Edited from the default.' : 'The built-in default.'}
          </span>
        </div>
      </section>

      <section className="border-t pt-6">
        <h3 className="text-base font-semibold mb-1">Worked examples</h3>
        <p className="text-sm text-gray-500 mb-4">
          Real cases with the XP and subjects they are worth. The AI matches similar work to
          them. The newest 40 active examples go into each review ({activeCount} active now).
          To save one with its subjects, use Save as AI example on a submission.
        </p>

        <div className="grid gap-2 grid-cols-[1fr_6rem] items-start">
          <input
            aria-label="Work"
            value={form.work}
            onChange={e => setForm(f => ({ ...f, work: e.target.value }))}
            className={inputClass}
            placeholder="A two-sentence comment in an online class discussion"
            maxLength={300}
          />
          <XpSizeInput
            aria-label="XP"
            value={form.xp}
            onChange={xp => setForm(f => ({ ...f, xp }))}
            className={inputClass}
          />
          <input
            aria-label="Why (optional)"
            value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            className={`${inputClass} col-span-2`}
            placeholder="Why (optional): a short reply is a quick task"
            maxLength={300}
          />
        </div>
        <button
          onClick={addExample}
          disabled={action.isPending || !canAdd}
          className="btn-primary px-4 py-2 rounded-lg disabled:opacity-40 mt-3"
        >
          Add example
        </button>

        <ul className="mt-6 divide-y">
          {kept.length === 0 && (
            <li className="py-3 text-sm text-gray-500">No examples yet.</li>
          )}
          {kept.map(ex => (
            <ExampleRow
              key={ex.id}
              example={ex}
              busy={action.isPending}
              onEdit={(changes) => edit(ex, changes)}
              onToggle={() => edit(ex, { status: ex.status === 'active' ? 'paused' : 'active' })}
              onRemove={() => remove(ex)}
            />
          ))}
        </ul>
      </section>
    </div>
  )
}

/**
 * One example. A suggestion shows what the AI said beside what the reviewer
 * decided, and offers Approve / Dismiss; a kept example offers Pause / Resume.
 */
const ExampleRow = ({ example, busy, onEdit, onApprove, onToggle, onRemove }) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ work: example.work, xp: example.xp, note: example.note || '' })
  const isSuggestion = example.status === 'suggested'
  const paused = example.status === 'paused'

  const save = async () => {
    const done = await onEdit({ work: draft.work.trim(), xp: draft.xp, note: draft.note.trim() })
    if (done) setEditing(false)
  }

  if (editing) {
    return (
      <li className="p-3 space-y-2">
        <div className="grid gap-2 grid-cols-[1fr_6rem]">
          <input aria-label="Work" value={draft.work} maxLength={300}
            onChange={e => setDraft(d => ({ ...d, work: e.target.value }))} className={inputClass} />
          <XpSizeInput aria-label="XP" value={draft.xp}
            onChange={xp => setDraft(d => ({ ...d, xp }))} className={inputClass} />
          <input aria-label="Why (optional)" value={draft.note} maxLength={300}
            onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} className={`${inputClass} col-span-2`} />
        </div>
        <div className="flex gap-3">
          <button onClick={save} disabled={busy} className="btn-primary px-3 py-1.5 rounded-lg text-sm disabled:opacity-40">Save</button>
          <button onClick={() => setEditing(false)} className="text-sm text-gray-600 hover:text-gray-900">Cancel</button>
        </div>
      </li>
    )
  }

  const xpMoved = isSuggestion && example.ai_xp != null && example.ai_xp !== example.xp

  return (
    <li className={`${isSuggestion ? 'p-3' : 'py-3'} flex items-start gap-4 ${paused ? 'opacity-50' : ''}`}>
      <span className="shrink-0 w-16 text-sm font-semibold text-gray-900">{example.xp} XP</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900">{example.work}</p>
        {example.subjects && (
          <p className="text-xs text-gray-600 mt-0.5">{formatSplit(example.subjects)}</p>
        )}
        {isSuggestion && (example.ai_xp != null || example.ai_subjects) && (
          <p className="text-xs text-gray-500 mt-0.5">
            AI said{xpMoved ? ` ${example.ai_xp} XP` : ''}
            {xpMoved && example.ai_subjects ? ', ' : ' '}
            {example.ai_subjects ? formatSplit(example.ai_subjects) : ''}
          </p>
        )}
        {example.note && <p className="text-xs text-gray-500 mt-0.5">{example.note}</p>}
        {paused && <p className="text-xs text-gray-500 mt-0.5">Paused. The AI does not see it.</p>}
      </div>
      <div className="shrink-0 flex gap-3 text-sm">
        {isSuggestion && (
          <button onClick={onApprove} disabled={busy} className="font-medium text-optio-purple hover:text-optio-purple-dark">Approve</button>
        )}
        <button onClick={() => setEditing(true)} disabled={busy} className="text-optio-purple hover:text-optio-purple-dark">Edit</button>
        {!isSuggestion && (
          <button onClick={onToggle} disabled={busy} className="text-gray-600 hover:text-gray-900">
            {paused ? 'Resume' : 'Pause'}
          </button>
        )}
        <button onClick={onRemove} disabled={busy} className="text-red-600 hover:text-red-800">
          {isSuggestion ? 'Dismiss' : 'Remove'}
        </button>
      </div>
    </li>
  )
}

/**
 * The popup. The panel mounts only while it is open, so the grader does not
 * read the calibration for every submission it shows. An outside click does
 * not close it: a half-edited scale is too easy to lose.
 */
export default function XpCalibrationModal({ isOpen, onClose }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tune AI XP"
      size="lg"
      closeOnOverlayClick={false}
    >
      {isOpen && <XpCalibrationPanel />}
    </Modal>
  )
}
